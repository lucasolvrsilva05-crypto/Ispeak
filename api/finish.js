// Encerra a conversa: avalia, calcula nota, XP, competências e nível no servidor, e grava só o resumo.
// A transcrição chega aqui, é usada para avaliar e é descartada (não é gravada em lugar nenhum).
import { handler, requireUser, db, body, verify, cleanMessages, openai, EVAL_MODEL, httpError } from '../lib/server.js';
import { evaluatorPrompt, evaluatorSchema, transcriptText } from '../lib/prompts.js';
import { getLevel, nextLevel, RULES } from '../lib/curriculum.js';
import { countWords, speakingMinutes, computeScore, computeXp, updateStreak, mergeMastery, localDay, validLevel } from '../lib/scoring.js';
import { loadState, publicState } from '../lib/state.js';

export const config = { maxDuration: 60 };

const MIN_WORDS = 12;

function sessionResult(s) {
  return {
    kind: s.kind, score: s.score, xp: s.xp, minutes: Number(s.minutes), passed: s.passed,
    indices: s.score == null ? null : { gramatica: s.idx_gramatica, vocabulario: s.idx_vocabulario, compreensao: s.idx_compreensao, interacao: s.idx_interacao },
    resumo: s.summary, acertos: s.acertos || [], melhorias: s.melhorias || [], palavras: s.palavras || [], foco_proximo: s.foco_proximo,
  };
}

export default handler(async (req, res) => {
  const u = await requireUser(req);
  const { token, messages } = body(req);
  const ctx = verify(token, u.id);
  const msgs = cleanMessages(messages);

  // "Reserva" a sessão: só uma chamada consegue encerrar (evita avaliar duas vezes).
  const claimed = await db(`sessions?id=eq.${ctx.sid}&user_id=eq.${u.id}&ended_at=is.null`, {
    method: 'PATCH', prefer: 'return=representation', body: { ended_at: new Date().toISOString() },
  });
  if (!claimed.length) {
    const [s] = await db(`sessions?id=eq.${ctx.sid}&user_id=eq.${u.id}&select=*`);
    if (!s) throw httpError(404, 'Conversa não encontrada.');
    const st = await loadState(u.id);
    return res.json({ ...sessionResult(s), repetido: true, estado: publicState(st) });
  }
  const sess = claimed[0];
  const elapsedMin = (Date.now() - Date.parse(sess.started_at)) / 60000;
  const words = countWords(msgs.filter(x => x.role === 'aluno').map(x => x.text).join(' '));
  const minutes = Math.min(speakingMinutes(words), Math.round(elapsedMin * 10) / 10);

  if (words < MIN_WORDS) {
    await db(`sessions?id=eq.${sess.id}`, { method: 'PATCH', body: { student_words: words, minutes } });
    const st = await loadState(u.id);
    return res.json({ curta: true, kind: sess.kind, estado: publicState(st) });
  }

  const release = () => db(`sessions?id=eq.${sess.id}`, { method: 'PATCH', body: { ended_at: null } }).catch(() => {});
  let ev;
  try {
    const r = await openai('chat/completions', {
      model: EVAL_MODEL(),
      reasoning_effort: 'low',
      response_format: { type: 'json_schema', json_schema: evaluatorSchema() },
      messages: [
        { role: 'system', content: evaluatorPrompt(ctx.plan) },
        { role: 'user', content: transcriptText(msgs) },
      ],
    });
    ev = JSON.parse(r.choices[0].message.content);
  } catch (e) {
    await release(); // libera a sessão para o aluno tentar encerrar de novo
    throw e.status ? e : httpError(502, 'Não consegui avaliar a conversa. Tente encerrar de novo.');
  }

  const st0 = await loadState(u.id);
  const p = st0.profile;
  const sc = computeScore(ev.indices);
  const today = localDay();
  const streak = updateStreak(p.last_day, p.streak, today);
  const xp = computeXp({ minutes, score: sc.score, mission: sess.kind === 'normal' && ev.missao_cumprida, streak: streak.streak, firstToday: streak.firstToday });

  const upd = { xp: p.xp + xp.total, streak: streak.streak, last_day: today };
  let passed = null, levelUp = null;

  if (sess.kind === 'placement') {
    const lv = validLevel(ev.nivel_sugerido) || 'PRE_A1';
    upd.level = lv; upd.placed = true;
    upd.xp = Math.max(upd.xp, getLevel(lv).xp);
  } else if (sess.kind === 'evaluation' && sess.level === p.level) {
    passed = sc.score >= RULES.evalPass;
    const nxt = nextLevel(p.level);
    if (passed && nxt) { upd.level = nxt.id; upd.eval_cooldown = 0; levelUp = nxt.id; }
    else upd.eval_cooldown = RULES.evalCooldown;
  } else {
    upd.eval_cooldown = Math.max(0, (p.eval_cooldown || 0) - 1);
  }

  // competências do nível em que a conversa aconteceu (nivelamento não conta)
  if (sess.kind !== 'placement') {
    const valid = new Set(getLevel(sess.level).modulos.map(x => x.code));
    const have = Object.fromEntries(st0.comps.map(c => [c.code, c]));
    const rows = (ev.competencias || [])
      .filter(c => valid.has(c.codigo))
      .map(c => {
        const m = mergeMastery(have[c.codigo]?.evidences, c.dominio);
        return { user_id: u.id, code: c.codigo, level: sess.level, mastery: m.mastery, evidences: m.evidences, updated_at: new Date().toISOString() };
      });
    if (rows.length) await db('competencies?on_conflict=user_id,code', { method: 'POST', prefer: 'resolution=merge-duplicates', body: rows });
  }
  const tags = (ev.erros_tags || []).slice(0, 8);
  if (tags.length) await db('rpc/ispeak_bump_errors', { method: 'POST', body: { p_user: u.id, p_tags: tags } });

  // grava o resultado da sessão primeiro; o perfil (XP/nível) só depois, para nunca contar XP em dobro
  const [saved] = await db(`sessions?id=eq.${sess.id}`, {
    method: 'PATCH', prefer: 'return=representation',
    body: {
      score: sc.score, idx_gramatica: sc.gramatica, idx_vocabulario: sc.vocabulario, idx_compreensao: sc.compreensao, idx_interacao: sc.interacao,
      xp: xp.total, student_words: words, minutes, passed,
      summary: String(ev.resumo || '').slice(0, 1200),
      acertos: (ev.acertos || []).slice(0, 3),
      melhorias: (ev.melhorias || []).slice(0, 3),
      palavras: (ev.palavras_novas || []).slice(0, 5),
      foco_proximo: String(ev.foco_proximo || '').slice(0, 300),
    },
  }).catch(async e => { await release(); throw e; });
  await db(`profiles?id=eq.${u.id}`, { method: 'PATCH', body: upd });

  const st = await loadState(u.id);
  res.json({
    ...sessionResult(saved),
    xpParts: xp.parts,
    missao: sess.kind === 'normal' ? !!ev.missao_cumprida : null,
    levelUp,
    nivelInicial: sess.kind === 'placement' ? upd.level : null,
    estado: publicState(st),
  });
});

