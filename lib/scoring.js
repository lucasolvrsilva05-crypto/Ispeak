// Regras de pontuação, XP e promoção. Funções puras (testadas em tools/test.mjs).
import { getLevel, nextLevel, RULES, LEVEL_IDS } from './curriculum.js';

export const clamp = (n, a, b) => Math.max(a, Math.min(b, Math.round(Number(n) || 0)));

export function countWords(text) {
  return (String(text || '').match(/[A-Za-zÀ-ÿ']+/g) || []).length;
}

// Minutos de fala estimados pelas palavras do aluno (~100 palavras/min para quem está aprendendo), máx. 30.
export function speakingMinutes(words) {
  return Math.min(30, Math.round((words / 100) * 10) / 10);
}

// Nota 0–100: gramática 30%, vocabulário 30%, compreensão 20%, interação 20%.
export function computeScore(ix) {
  const g = clamp(ix.gramatica, 0, 100), v = clamp(ix.vocabulario, 0, 100);
  const c = clamp(ix.compreensao, 0, 100), i = clamp(ix.interacao, 0, 100);
  return { gramatica: g, vocabulario: v, compreensao: c, interacao: i, score: Math.round(0.3 * g + 0.3 * v + 0.2 * c + 0.2 * i) };
}

// Dia local (São Paulo) no formato AAAA-MM-DD.
export function localDay(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}
const dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

// Sequência diária: conta dias seguidos com conversa concluída.
export function updateStreak(lastDay, streak, today) {
  if (lastDay === today) return { streak: streak || 1, firstToday: false };
  if (lastDay && dayDiff(lastDay, today) === 1) return { streak: (streak || 0) + 1, firstToday: true };
  return { streak: 1, firstToday: true };
}

// XP da sessão: 5/min de fala + nota÷2 + 30 pela missão + 10 por dia de sequência (máx. 50, só 1ª sessão do dia).
export function computeXp({ minutes, score, mission, streak, firstToday }) {
  const parts = {
    fala: Math.round(minutes * 5),
    nota: Math.round(score / 2),
    missao: mission ? 30 : 0,
    sequencia: firstToday ? Math.min(50, 10 * streak) : 0,
  };
  return { total: parts.fala + parts.nota + parts.missao + parts.sequencia, parts };
}

// Domínio da competência = média das últimas 5 evidências.
export function mergeMastery(evidences, value) {
  const ev = [...(evidences || []), clamp(value, 0, 100)].slice(-RULES.evidences);
  return { evidences: ev, mastery: Math.round(ev.reduce((a, b) => a + b, 0) / ev.length) };
}

// Situação de promoção do nível atual. compMap: { 'A1.1': mastery, ... }
export function promotionStatus(profile, compMap) {
  const lvl = getLevel(profile.level), nxt = nextLevel(profile.level);
  const codes = lvl.modulos.map(x => x.code);
  const ok = codes.filter(c => (compMap[c] || 0) >= RULES.masteryOk).length;
  const needOk = Math.ceil(codes.length * RULES.shareOk);
  const xpOk = !!nxt && profile.xp >= nxt.xp;
  const compOk = ok >= needOk;
  return {
    next: nxt ? nxt.id : null,
    xpNeeded: nxt ? nxt.xp : null,
    xpOk, compOk, okCount: ok, needOk, total: codes.length,
    cooldown: profile.eval_cooldown || 0,
    canEvaluate: !!nxt && xpOk && compOk && !(profile.eval_cooldown > 0),
  };
}

export const validLevel = id => (LEVEL_IDS.includes(id) ? id : null);
