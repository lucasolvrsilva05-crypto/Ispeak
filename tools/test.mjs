// Testes locais: regras de XP/promoção, prompts, parser de fala e fluxo das APIs com banco e OpenAI simulados.
// Rode com: node tools/test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { LEVELS, getLevel, allModules } from '../lib/curriculum.js';
import { computeScore, computeXp, updateStreak, mergeMastery, promotionStatus, speakingMinutes } from '../lib/scoring.js';
import { teacherPrompt, evaluatorPrompt, evaluatorSchema } from '../lib/prompts.js';

let n = 0;
const t = (name, fn) => Promise.resolve().then(fn).then(() => { n++; console.log('ok  ', name); }, e => { console.error('FAIL', name); console.error(e); process.exitCode = 1; });

// ------------------------------------------------------------ currículo e regras
await t('currículo: 7 níveis, XP crescente, códigos únicos', () => {
  assert.equal(LEVELS.length, 7);
  LEVELS.slice(1).forEach((l, i) => assert.ok(l.xp > LEVELS[i].xp));
  const codes = allModules().map(m => m.code);
  assert.equal(new Set(codes).size, codes.length);
  allModules().forEach(m => assert.ok(m.code.startsWith(m.level + '.')));
});
await t('nota ponderada 30/30/20/20', () => {
  assert.equal(computeScore({ gramatica: 80, vocabulario: 60, compreensao: 100, interacao: 50 }).score, 72);
  assert.equal(computeScore({ gramatica: 150, vocabulario: -5, compreensao: 'x', interacao: 70 }).gramatica, 100);
});
await t('XP: sessão típica ~120', () => {
  const x = computeXp({ minutes: 8, score: 70, mission: true, streak: 2, firstToday: true });
  assert.deepEqual(x.parts, { fala: 40, nota: 35, missao: 30, sequencia: 20 });
  assert.equal(x.total, 125);
  assert.equal(computeXp({ minutes: 8, score: 70, mission: false, streak: 9, firstToday: false }).parts.sequencia, 0);
  assert.equal(computeXp({ minutes: 1, score: 0, mission: false, streak: 9, firstToday: true }).parts.sequencia, 50);
  assert.equal(speakingMinutes(5000), 30);
});
await t('sequência diária', () => {
  assert.deepEqual(updateStreak(null, 0, '2026-11-24'), { streak: 1, firstToday: true });
  assert.deepEqual(updateStreak('2026-11-23', 4, '2026-11-24'), { streak: 5, firstToday: true });
  assert.deepEqual(updateStreak('2026-11-24', 5, '2026-11-24'), { streak: 5, firstToday: false });
  assert.deepEqual(updateStreak('2026-11-20', 5, '2026-11-24'), { streak: 1, firstToday: true });
  assert.deepEqual(updateStreak('2026-02-28', 2, '2026-03-01'), { streak: 3, firstToday: true });
});
await t('domínio = média das últimas 5', () => {
  assert.deepEqual(mergeMastery([50, 60, 70, 80, 90], 100), { evidences: [60, 70, 80, 90, 100], mastery: 80 });
  assert.deepEqual(mergeMastery(undefined, 40), { evidences: [40], mastery: 40 });
});
await t('promoção: XP + 80% competências + sem espera', () => {
  const a1 = getLevel('A1').modulos.map(m => m.code); // 8 → precisa de 7
  const comps = Object.fromEntries(a1.slice(0, 7).map(c => [c, 75]));
  assert.equal(promotionStatus({ level: 'A1', xp: 3000, eval_cooldown: 0 }, comps).canEvaluate, true);
  assert.equal(promotionStatus({ level: 'A1', xp: 2999, eval_cooldown: 0 }, comps).canEvaluate, false);
  assert.equal(promotionStatus({ level: 'A1', xp: 5000, eval_cooldown: 2 }, comps).canEvaluate, false);
  comps[a1[6]] = 69;
  assert.equal(promotionStatus({ level: 'A1', xp: 5000, eval_cooldown: 0 }, comps).canEvaluate, false);
  assert.equal(promotionStatus({ level: 'C2', xp: 99999, eval_cooldown: 0 }, {}).canEvaluate, false);
});

// ------------------------------------------------------------ prompts
await t('prompt do professor cobre persona, nível, correção e formato', () => {
  const base = { level: 'A1', nome: 'Ana', tema: 'restaurante', missao: 'pedir um café', foco: ['A1.4'], resumos: ['Falamos da rotina.'], erros: ['terceira pessoa -s'], focoAnterior: 'present simple' };
  for (const kind of ['normal', 'placement', 'evaluation']) {
    const p = teacherPrompt({ ...base, kind });
    assert.match(p, /Rafa/); assert.match(p, /\[pt\]/); assert.match(p, /UM só/); assert.match(p, /Ana/);
  }
  assert.match(teacherPrompt({ ...base, kind: 'normal' }), /pedir um café/);
  assert.match(teacherPrompt({ ...base, kind: 'evaluation' }), /A1\.8/);
  assert.match(teacherPrompt({ ...base, kind: 'placement', level: 'PRE_A1' }), /ESCADA/);
});
await t('schema do avaliador é estrito e completo', () => {
  const s = evaluatorSchema().schema;
  const check = o => { if (o.type === 'object') { assert.equal(o.additionalProperties, false); assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort()); Object.values(o.properties).forEach(check); } if (o.type === 'array') check(o.items); };
  check(s);
  assert.match(evaluatorPrompt({ kind: 'placement', level: 'PRE_A1' }), /nivel_sugerido/);
});

// ------------------------------------------------------------ parser de fala (app.js no navegador)
await t('parser de fala: idiomas, frases e streaming estável', () => {
  const ctx = { window: { __ISPEAK_TEST__: true, Voice: { supported: {} }, addEventListener() {} }, document: { addEventListener() {}, querySelector() { return null; } }, console };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8').replace("'use strict';", ''), ctx);
  const parse = ctx.window.__ispeak.parsePieces;
  const full = 'Nice! [pt]Muito bem, você usou o passado.[/pt] So, what did you eat? I love pizza.';
  const fin = JSON.parse(JSON.stringify(parse(full, true)));
  assert.deepEqual(fin.map(p => p.lang), ['en', 'pt', 'en', 'en']);
  assert.equal(fin[1].text, 'Muito bem, você usou o passado.');
  // a cada pedaço de streaming, as frases já completas nunca mudam
  let spoken = [];
  for (let i = 1; i <= full.length; i++) {
    const ps = parse(full.slice(0, i), false);
    while (spoken.length < ps.length && ps[spoken.length].complete) spoken.push(ps[spoken.length].lang + ':' + ps[spoken.length].text);
    spoken.forEach((s, k) => assert.equal(s, ps[k].lang + ':' + ps[k].text));
  }
  const rest = fin.slice(spoken.length).map(p => p.lang + ':' + p.text);
  assert.deepEqual(spoken.concat(rest), fin.map(p => p.lang + ':' + p.text));
  assert.ok(!parse('Hello [p', false).some(p => /\[/.test(p.text)), 'tag parcial não é falada');
  assert.equal(parse('It costs 3.5 dollars. Ok', false)[0].text, 'It costs 3.5 dollars.');
});

// ------------------------------------------------------------ APIs com banco e OpenAI simulados
process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
process.env.OPENAI_API_KEY = 'sk'; process.env.ISPEAK_SECRET = 'segredo-de-teste';

const UID = '11111111-1111-1111-1111-111111111111';
const DB = { profiles: [], sessions: [], competencies: [], error_tags: [] };
let EVAL = null, CHAT_TEXT = 'Hi Ana! [pt]Vamos lá.[/pt] What would you like?';
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

function filterRows(table, qs) {
  let rows = DB[table];
  for (const [k, v] of qs) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    if (v.startsWith('eq.')) rows = rows.filter(r => String(r[k]) === v.slice(3));
    else if (v === 'is.null') rows = rows.filter(r => r[k] == null);
    else if (v === 'not.is.null') rows = rows.filter(r => r[k] != null);
    else if (v.startsWith('gte.')) rows = rows.filter(r => r[k] >= v.slice(4));
  }
  return rows;
}
globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url), method = opts.method || 'GET', bodyIn = opts.body ? JSON.parse(opts.body) : null;
  if (u.host === 'sb.test' && u.pathname === '/auth/v1/user') return opts.headers.Authorization === 'Bearer good' ? json({ id: UID }) : json({}, 401);
  if (u.host === 'sb.test' && u.pathname.startsWith('/rest/v1/')) {
    assert.equal(opts.headers.apikey, 'svc', 'servidor usa service_role');
    const path = u.pathname.slice(9);
    if (path === 'rpc/ispeak_bump_errors') { bodyIn.p_tags.forEach(tag => { const r = DB.error_tags.find(e => e.tag === tag); if (r) r.count++; else DB.error_tags.push({ user_id: UID, tag, count: 1, last_seen: new Date().toISOString() }); }); return new Response(null, { status: 204 }); }
    const table = path, qs = [...u.searchParams];
    if (method === 'GET') return json(filterRows(table, qs).slice(0, Number(u.searchParams.get('limit')) || 999));
    if (method === 'POST') {
      const rows = (Array.isArray(bodyIn) ? bodyIn : [bodyIn]).map(r => ({ ...r }));
      for (const r of rows) {
        if (table === 'sessions') Object.assign(r, { id: 'sess-' + (DB.sessions.length + 1), started_at: new Date(Date.now() - 10 * 60000).toISOString(), ended_at: null, xp: 0 });
        const i = table === 'competencies' ? DB.competencies.findIndex(c => c.code === r.code) : -1;
        if (i >= 0) DB.competencies[i] = r; else DB[table].push(r);
      }
      return json(rows, 201);
    }
    if (method === 'PATCH') { const rows = filterRows(table, qs); rows.forEach(r => Object.assign(r, bodyIn)); return json(rows); }
  }
  if (u.host === 'api.openai.com') {
    if (bodyIn.stream) {
      const enc = new TextEncoder(), parts = CHAT_TEXT.match(/.{1,7}/g);
      return new Response(new ReadableStream({ start(c) { parts.forEach(p => c.enqueue(enc.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n'))); c.enqueue(enc.encode('data: [DONE]\n\n')); c.close(); } }));
    }
    assert.equal(bodyIn.response_format.type, 'json_schema');
    return json({ choices: [{ message: { content: JSON.stringify(EVAL) } }] });
  }
  throw new Error('fetch inesperado ' + url);
};

function mockRes() {
  const r = { statusCode: 200, headers: {}, chunks: [], headersSent: false,
    status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
    json(b) { this.body = b; this.headersSent = true; return this; }, write(c) { this.headersSent = true; this.chunks.push(c); }, end() { this.ended = true; } };
  return r;
}
const call = async (mod, body, method = 'POST', auth = 'Bearer good') => { const res = mockRes(); await (await import(mod)).default({ method, headers: { authorization: auth }, body }, res); return res; };
const evalFor = (idx, extra = {}) => ({ indices: idx, resumo: 'Você pediu comida.', acertos: ['a', 'b', 'c'], melhorias: [{ dito: 'I want a coffee', correto: "I'd like a coffee", explicacao: 'Mais educado.' }], palavras_novas: [{ en: 'menu', pt: 'cardápio' }], erros_tags: ['pedido educado'], competencias: [{ codigo: 'A1.4', dominio: 80 }, { codigo: 'B2.1', dominio: 99 }], missao_cumprida: true, foco_proximo: 'some/any', nivel_sugerido: 'A1', ...extra });
const studentTalk = Array.from({ length: 6 }, (_, i) => [{ role: 'professor', text: 'Question ' + i }, { role: 'aluno', text: 'I would like a coffee and a sandwich please thank you ' + i }]).flat();

await t('API: sem login é recusado', async () => {
  DB.profiles.push({ id: UID, username: 'ana', name: 'Ana', level: 'PRE_A1', xp: 0, streak: 0, last_day: null, placed: false, eval_cooldown: 0 });
  const r = await call('../api/me.js', null, 'GET', 'Bearer bad');
  assert.equal(r.statusCode, 401);
});
await t('API: primeira conversa é sempre nivelamento', async () => {
  const r = await call('../api/start.js', { kind: 'evaluation' });
  assert.equal(r.body.plan.kind, 'placement');
});
await t('API: chat transmite o texto do professor e recusa token adulterado', async () => {
  const st = await call('../api/start.js', { kind: 'normal' });
  const r = await call('../api/chat.js', { token: st.body.token, messages: [] });
  assert.equal(r.chunks.join(''), CHAT_TEXT);
  const [d, mac] = st.body.token.split('.');
  const bad = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(d, 'base64url')), plan: { kind: 'normal', level: 'C2' } })).toString('base64url') + '.' + mac;
  assert.equal((await call('../api/chat.js', { token: bad, messages: [] })).statusCode, 400);
});
await t('API: nivelamento define nível e XP de entrada; encerrar 2x não duplica', async () => {
  const st = await call('../api/start.js', {});
  EVAL = evalFor({ gramatica: 70, vocabulario: 70, compreensao: 70, interacao: 70 }, { nivel_sugerido: 'A1', competencias: [] });
  const r = await call('../api/finish.js', { token: st.body.token, messages: studentTalk });
  assert.equal(r.body.nivelInicial, 'A1', JSON.stringify(r.body));
  const p = DB.profiles[0];
  assert.equal(p.level, 'A1'); assert.equal(p.placed, true); assert.ok(p.xp >= 600);
  const xpAfter = p.xp;
  const again = await call('../api/finish.js', { token: st.body.token, messages: studentTalk });
  assert.equal(again.body.repetido, true); assert.equal(DB.profiles[0].xp, xpAfter);
});
await t('API: conversa curta não avalia nem dá XP', async () => {
  const st = await call('../api/start.js', { kind: 'normal' });
  const xp = DB.profiles[0].xp;
  const r = await call('../api/finish.js', { token: st.body.token, messages: [{ role: 'aluno', text: 'hi' }] });
  assert.equal(r.body.curta, true); assert.equal(DB.profiles[0].xp, xp);
});
await t('API: conversa normal grava resumo, competência do nível e erros', async () => {
  const st = await call('../api/start.js', { kind: 'normal', tema: 'restaurante' });
  assert.equal(st.body.plan.tema, 'restaurante');
  assert.match(st.body.plan.missao, /café|lanche/);
  EVAL = evalFor({ gramatica: 80, vocabulario: 80, compreensao: 80, interacao: 80 });
  const r = await call('../api/finish.js', { token: st.body.token, messages: studentTalk });
  assert.equal(r.body.score, 80);
  assert.ok(r.body.xp > 0 && r.body.missao === true);
  assert.deepEqual(DB.competencies.map(c => c.code), ['A1.4'], 'competência de outro nível é ignorada');
  assert.equal(DB.error_tags[0].tag, 'pedido educado');
  const s = DB.sessions.find(x => x.id === r.body && x.id) || DB.sessions[DB.sessions.length - 1];
  assert.equal(s.summary, 'Você pediu comida.');
  assert.equal(JSON.stringify(s).includes('sandwich'), false, 'transcrição não é gravada');
});
await t('API: prova só quando liberada; aprovação sobe de nível, reprovação dá espera de 3', async () => {
  assert.equal((await call('../api/start.js', { kind: 'evaluation' })).statusCode, 403);
  const p = DB.profiles[0];
  p.xp = 3000;
  getLevel('A1').modulos.forEach(m => { const i = DB.competencies.findIndex(c => c.code === m.code); const row = { user_id: UID, code: m.code, level: 'A1', mastery: 90, evidences: [90] }; if (i >= 0) DB.competencies[i] = row; else DB.competencies.push(row); });
  let st = await call('../api/start.js', { kind: 'evaluation' });
  assert.equal(st.body.plan.kind, 'evaluation');
  EVAL = evalFor({ gramatica: 60, vocabulario: 60, compreensao: 60, interacao: 60 });
  let r = await call('../api/finish.js', { token: st.body.token, messages: studentTalk });
  assert.equal(r.body.passed, false); assert.equal(DB.profiles[0].eval_cooldown, 3); assert.equal(DB.profiles[0].level, 'A1');
  DB.profiles[0].eval_cooldown = 0;
  st = await call('../api/start.js', { kind: 'evaluation' });
  EVAL = evalFor({ gramatica: 85, vocabulario: 80, compreensao: 90, interacao: 75 });
  r = await call('../api/finish.js', { token: st.body.token, messages: studentTalk });
  assert.equal(r.body.passed, true); assert.equal(r.body.levelUp, 'A2'); assert.equal(DB.profiles[0].level, 'A2');
  assert.equal(r.body.estado.level.id, 'A2');
});

console.log(`\n${n} testes passaram${process.exitCode ? ', com falhas acima' : ''}.`);
