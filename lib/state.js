// Estado do aluno lido do banco, e a versão pública enviada ao navegador.
import { db } from './server.js';
import { LEVELS, getLevel, THEMES } from './curriculum.js';
import { promotionStatus } from './scoring.js';

export async function loadState(uid) {
  const [profiles, comps, errs] = await Promise.all([
    db(`profiles?id=eq.${uid}&select=*`),
    db(`competencies?user_id=eq.${uid}&select=code,level,mastery,evidences`),
    db(`error_tags?user_id=eq.${uid}&select=tag,count,last_seen&order=count.desc,last_seen.desc&limit=8`),
  ]);
  const profile = profiles?.[0];
  if (!profile) return null;
  const compMap = Object.fromEntries((comps || []).map(c => [c.code, c.mastery]));
  return { profile, comps: comps || [], compMap, errs: errs || [] };
}

export function publicState(st) {
  const lvl = getLevel(st.profile.level);
  return {
    profile: {
      username: st.profile.username, name: st.profile.name, level: st.profile.level, xp: st.profile.xp,
      streak: st.profile.streak, lastDay: st.profile.last_day, placed: st.profile.placed,
    },
    level: { id: lvl.id, nome: lvl.nome, meta: lvl.meta, xp: lvl.xp, pt: lvl.pt, rate: lvl.rate },
    levels: LEVELS.map(l => ({ id: l.id, nome: l.nome, xp: l.xp, meta: l.meta })),
    competencias: lvl.modulos.map(x => ({ code: x.code, titulo: x.titulo, tarefa: x.tarefa, tema: x.tema, dominio: st.compMap[x.code] ?? null })),
    erros: st.errs.map(e => ({ tag: e.tag, count: e.count })),
    promocao: promotionStatus(st.profile, st.compMap),
    temas: THEMES,
  };
}
