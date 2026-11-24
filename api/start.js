// Começa uma conversa: escolhe tipo, tema, missão e foco; grava a sessão e devolve o contexto assinado.
import { handler, requireUser, db, body, sign, httpError } from '../lib/server.js';
import { getLevel, THEMES } from '../lib/curriculum.js';
import { promotionStatus, localDay } from '../lib/scoring.js';
import { loadState } from '../lib/state.js';

const DAILY_LIMIT = () => Number(process.env.DAILY_SESSION_LIMIT || 20);

export function planFocus(level, compMap, tema) {
  const mods = getLevel(level).modulos;
  const pool = tema && tema !== 'livre' ? mods.filter(x => x.tema === tema) : mods;
  const list = (pool.length ? pool : mods)
    .map((x, i) => ({ x, i, d: compMap[x.code] ?? -1 }))   // nunca praticada vem primeiro
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(o => o.x);
  return list.slice(0, 2);
}

export default handler(async (req, res) => {
  const u = await requireUser(req);
  const { kind: want = 'normal', tema: wantTema = 'livre' } = body(req);
  const st = await loadState(u.id);
  if (!st) throw httpError(404, 'Perfil não encontrado.');
  const p = st.profile;

  // limite diário (protege o custo)
  const since = new Date(localDay() + 'T00:00:00-03:00').toISOString();
  const today = await db(`sessions?user_id=eq.${u.id}&started_at=gte.${encodeURIComponent(since)}&select=id&limit=${DAILY_LIMIT() + 1}`);
  if (today.length >= DAILY_LIMIT()) throw httpError(429, `Você já fez ${DAILY_LIMIT()} conversas hoje. Volte amanhã!`);

  let kind = p.placed ? (want === 'evaluation' ? 'evaluation' : 'normal') : 'placement';
  if (kind === 'evaluation' && !promotionStatus(p, st.compMap).canEvaluate) throw httpError(403, 'A prova deste nível ainda não está liberada.');

  const tema = THEMES.includes(wantTema) ? wantTema : 'livre';
  const foco = kind === 'normal' ? planFocus(p.level, st.compMap, tema) : [];
  const missao = kind === 'normal' ? foco[0]?.tarefa : kind === 'placement' ? 'mostrar até onde consegue conversar em inglês' : `passar na prova do nível ${getLevel(p.level).nome}`;
  const temaFinal = kind === 'normal' ? (tema !== 'livre' ? tema : foco[0]?.tema) : kind === 'placement' ? 'nivelamento' : 'prova de nível';

  const recent = await db(`sessions?user_id=eq.${u.id}&summary=not.is.null&select=summary,foco_proximo&order=ended_at.desc&limit=3`);
  const plan = {
    kind, level: p.level, nome: p.name, tema: temaFinal, missao,
    foco: foco.map(x => x.code),
    resumos: recent.map(r => r.summary),
    focoAnterior: recent[0]?.foco_proximo || null,
    erros: st.errs.slice(0, 5).map(e => e.tag),
  };

  const [row] = await db('sessions', {
    method: 'POST', prefer: 'return=representation',
    body: { user_id: u.id, kind, level: p.level, theme: temaFinal, mission: missao },
  });

  const token = sign({ sid: row.id, uid: u.id, exp: Date.now() + 2 * 3600e3, plan });
  res.json({
    sessionId: row.id, token,
    plan: { kind, level: p.level, tema: temaFinal, missao, foco: foco.map(x => x.titulo) },
  });
});
