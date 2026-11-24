// iSpeak · app do navegador (sem build). Telas: entrar, início, conversa, resumo, progresso, conta.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = () => $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UNAME = /^[a-z0-9_.]{3,20}$/;
  const TZ = 'America/Sao_Paulo';
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('ispeak.' + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
               set: (k, v) => { try { localStorage.setItem('ispeak.' + k, JSON.stringify(v)); } catch (_) {} } };

  let CFG = null, sb = null, ME = null, view = 'loading';

  // ---------------------------------------------------------------- utilitários
  const loginId = un => un.replace(/\./g, '-') + '@' + CFG.loginDomain;

  async function token() {
    const { data } = await sb.auth.getSession();
    return data.session ? data.session.access_token : null;
  }
  async function api(path, { method = 'GET', body, raw = false } = {}) {
    const t = await token();
    const r = await fetch(path, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json' }, t ? { Authorization: 'Bearer ' + t } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) { if (!r.ok) throw new Error(await errText(r)); return r; }
    if (!r.ok) throw new Error(await errText(r));
    return r.json();
  }
  async function errText(r) {
    try { const j = await r.json(); return j.error || 'Erro ' + r.status; } catch (_) { return 'Erro ' + r.status; }
  }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; el.setAttribute('role', 'status');
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }
  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
  const levelName = id => (ME && ME.levels.find(l => l.id === id) || { nome: id }).nome;

  // Texto do professor: trechos em português vêm entre [pt]...[/pt].
  // Divide em frases com idioma; "complete" indica que a frase já pode ser falada durante o streaming.
  function parsePieces(raw, final) {
    let s = raw;
    if (!final) s = s.replace(/\[\/?p?t?\]?$/i, m => (/^\[\/?pt\]$/i.test(m) ? m : ''));
    const parts = s.split(/(\[pt\]|\[\/pt\])/i);
    const out = [];
    let lang = 'en';
    parts.forEach((part, k) => {
      if (/^\[pt\]$/i.test(part)) { lang = 'pt'; return; }
      if (/^\[\/pt\]$/i.test(part)) { lang = 'en'; return; }
      if (!part) return;
      const lastPart = k === parts.length - 1;
      const sents = part.split(/(?<=[.!?…])\s+/);
      sents.forEach((t, j) => {
        const complete = final || !lastPart || j < sents.length - 1;
        if (t.trim()) out.push({ lang, text: t.trim(), complete });
      });
    });
    return out;
  }
  function captionHtml(raw) {
    return parsePieces(raw, true).map(p => p.lang === 'pt' ? '<span class="pt">' + esc(p.text) + '</span>' : esc(p.text)).join(' ');
  }

  // ---------------------------------------------------------------- inicialização
  async function boot() {
    render('<div class="center"><div class="spinner" aria-label="Carregando"></div></div>');
    try {
      CFG = await (await fetch('/api/config')).json();
      if (!CFG.supabaseUrl) throw new Error('config');
    } catch (_) {
      return render(card('<h1>Configuração pendente</h1><p class="muted">Configure as variáveis de ambiente na Vercel (veja o README).</p>'));
    }
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    const { data } = await sb.auth.getSession();
    if (data.session) await goHome(); else showAuth('login');
  }

  function render(html) { app().innerHTML = html; window.scrollTo(0, 0); }
  const card = inner => '<main class="auth"><div class="authcard">' + inner + '</div></main>';

  // ---------------------------------------------------------------- login sem e-mail
  let authMode = 'login', authMsg = '', pendingCode = null;

  function pwField(id, label, ac) {
    return '<label class="fl" for="' + id + '">' + label + '<span class="pw"><input type="password" id="' + id + '" autocomplete="' + ac + '" minlength="6" required><button type="button" class="ghost sm" data-pw="' + id + '">Mostrar</button></span></label>';
  }
  function codeBox(c) {
    return '<div class="codebox"><output class="code mono">' + esc(c) + '</output><button type="button" class="btn sm" data-copy="' + esc(c) + '">Copiar</button></div>' +
      '<p class="note">Anote num lugar seguro. Sem e-mail, este código é a única forma de recuperar a conta se você esquecer a senha.</p>';
  }

  function showAuth(mode) {
    authMode = mode; view = 'auth';
    const m = authMsg ? '<p class="err" role="alert">' + esc(authMsg) + '</p>' : '';
    const brand = '<div class="brand big">i<span>Speak</span></div>';
    let h;
    if (mode === 'code') {
      h = brand + '<h1>Seu código de recuperação</h1><p class="muted">Ele aparece só agora.</p>' + codeBox(pendingCode) +
        '<button class="btn primary block" id="codeok">Já guardei, continuar</button>';
    } else if (mode === 'recover') {
      h = brand + '<form id="af" novalidate><h1>Recuperar conta</h1><p class="muted">Use seu @usuário e o código de recuperação.</p>' + m +
        '<label class="fl" for="au">Nome de usuário<input id="au" autocomplete="username" autocapitalize="none" spellcheck="false"></label>' +
        '<label class="fl" for="ac">Código de recuperação<input id="ac" class="mono" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX"></label>' +
        pwField('ap', 'Senha nova (mínimo 6 caracteres)', 'new-password') + pwField('ap2', 'Repita a senha nova', 'new-password') +
        '<button class="btn primary block" id="asub">Trocar senha</button>' +
        '<div class="links"><button type="button" class="link" data-mode="login">Voltar para entrar</button></div></form>';
    } else {
      const su = mode === 'signup';
      h = brand + '<form id="af" novalidate><h1>' + (su ? 'Criar conta' : 'Entrar') + '</h1><p class="muted">' + (su ? 'Só nome de usuário e senha. Não pedimos e-mail.' : 'Converse em inglês com o professor Rafa.') + '</p>' + m +
        (su ? '<label class="fl" for="an">Seu nome<input id="an" autocomplete="given-name" maxlength="60"></label>' : '') +
        '<label class="fl" for="au">Nome de usuário' + (su ? ' <small>(3 a 20: letras minúsculas, números, ponto e _)</small>' : '') + '<input id="au" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20"></label>' +
        (su ? pwField('ap', 'Senha (mínimo 6 caracteres)', 'new-password') + pwField('ap2', 'Repita a senha', 'new-password') : pwField('ap', 'Senha', 'current-password')) +
        '<button class="btn primary block" id="asub">' + (su ? 'Criar conta' : 'Entrar') + '</button>' +
        '<div class="links">' + (su ? '<button type="button" class="link" data-mode="login">Já tenho conta</button>' : '<button type="button" class="link" data-mode="signup">Criar conta</button><button type="button" class="link" data-mode="recover">Esqueci minha senha</button>') + '</div></form>';
    }
    render(card(h));
    const f = $('#af'); if (f) f.addEventListener('submit', e => { e.preventDefault(); submitAuth(); });
    const ok = $('#codeok'); if (ok) ok.onclick = () => { pendingCode = null; goHome(); };
    const first = $('#an') || $('#au'); if (first) first.focus();
  }

  const val = id => { const el = $('#' + id); return el ? el.value : ''; };
  function authErr(e) {
    const s = String((e && e.message) || e || '').toLowerCase();
    if (s.includes('invalid login')) return 'Nome de usuário ou senha incorretos.';
    if (s.includes('already registered') || s.includes('already been registered')) return 'Esse nome de usuário já existe.';
    if (s.includes('password')) return 'Senha fraca: use pelo menos 6 caracteres.';
    if (s.includes('rate limit')) return 'Muitas tentativas. Espere um pouco.';
    if (s.includes('database error')) return 'Não deu para criar a conta. Tente outro nome de usuário.';
    return 'Algo deu errado. Tente de novo.';
  }
  function fail(msg) { authMsg = msg; showAuth(authMode); }

  async function submitAuth() {
    const raw = val('au').trim().replace(/^@/, ''), un = raw.toLowerCase(), pw = val('ap');
    const b = $('#asub'); if (b) { b.disabled = true; b.textContent = 'Aguarde…'; }
    authMsg = '';
    try {
      if (authMode === 'recover') {
        if (pw.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.');
        if (pw !== val('ap2')) return fail('As duas senhas não são iguais.');
        const { data, error } = await sb.rpc('ispeak_recuperar', { p_usuario: un, p_codigo: val('ac'), p_senha: pw });
        if (error) throw error;
        if (!data.ok) return fail(data.erro === 'tentativas' ? 'Muitas tentativas erradas. Espere uma hora e tente de novo.' : 'Usuário ou código incorreto.');
        const r = await sb.auth.signInWithPassword({ email: loginId(un), password: pw });
        if (r.error) throw r.error;
        pendingCode = data.codigo; return showAuth('code');
      }
      if (!UNAME.test(un) || (authMode === 'signup' && un !== raw)) return fail(authMode === 'signup' ? 'Nome de usuário: de 3 a 20 caracteres, só letras minúsculas, números, ponto e _.' : 'Confira o nome de usuário.');
      if (pw.length < 6) return fail('A senha precisa ter pelo menos 6 caracteres.');
      if (authMode === 'login') {
        const r = await sb.auth.signInWithPassword({ email: loginId(un), password: pw });
        if (r.error) throw r.error;
        return goHome();
      }
      if (pw !== val('ap2')) return fail('As duas senhas não são iguais.');
      const free = await sb.rpc('username_available', { u: un });
      if (free.error) throw free.error;
      if (!free.data) return fail('Esse nome de usuário já existe. Escolha outro.');
      const r = await sb.auth.signUp({ email: loginId(un), password: pw, options: { data: { name: val('an').trim() || 'Aluno', username: un } } });
      if (r.error) throw r.error;
      if (!r.data.session) return fail('Conta criada, mas o login precisa de ajuste: desligue "Confirm email" no Supabase.');
      const c = await sb.rpc('ispeak_novo_codigo');
      if (c.error) throw c.error;
      pendingCode = c.data; showAuth('code');
    } catch (e) { fail(authErr(e)); }
  }

  // ---------------------------------------------------------------- casca do app
  function shell(inner, active) {
    const tab = (id, label) => '<button class="tab' + (active === id ? ' on' : '') + '" data-go="' + id + '"' + (active === id ? ' aria-current="page"' : '') + '>' + label + '</button>';
    return '<header class="top"><div class="brand">i<span>Speak</span></div><nav>' + tab('home', 'Início') + tab('progress', 'Progresso') + tab('account', 'Conta') + '</nav></header><main class="page">' + inner + '</main>';
  }

  async function loadMe() { ME = await api('/api/me'); return ME; }

  async function goHome() {
    view = 'home';
    try { await loadMe(); } catch (e) {
      if (/sessão|entre/i.test(e.message)) { await sb.auth.signOut(); return showAuth('login'); }
      return render(shell('<div class="card"><p class="err">' + esc(e.message) + '</p></div>', 'home'));
    }
    const last = await sb.from('sessions').select('started_at,theme,score,summary,foco_proximo').not('summary', 'is', null).order('started_at', { ascending: false }).limit(1);
    renderHome(last.data && last.data[0]);
  }

  function xpBar() {
    const lv = ME.level, nxt = ME.levels[ME.levels.findIndex(l => l.id === lv.id) + 1];
    if (!nxt) return '<p class="muted">Você chegou ao topo da trilha: C2.</p>';
    const span = nxt.xp - lv.xp, cur = Math.max(0, ME.profile.xp - lv.xp);
    const pct = Math.min(100, Math.round(cur / span * 100));
    return '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="XP até o ' + esc(nxt.nome) + '"><i style="width:' + pct + '%"></i></div>' +
      '<p class="small muted">' + ME.profile.xp.toLocaleString('pt-BR') + ' XP · faltam ' + Math.max(0, nxt.xp - ME.profile.xp).toLocaleString('pt-BR') + ' para liberar a prova do ' + esc(nxt.nome) + '</p>';
  }

  function renderHome(last) {
    const p = ME.profile, pr = ME.promocao;
    let h = '';
    if (!p.placed) {
      h += '<section class="card hero"><h1>Oi, ' + esc(p.name) + '! Eu sou o Rafa.</h1><p>Sou brasileiro e ensino inglês americano. Primeiro vamos bater um papo rápido para eu descobrir seu nível. Sem pressão: se não souber nada de inglês, a gente começa do zero.</p>' +
        '<button class="btn primary big" data-start="placement">Começar conversa de nivelamento</button>' + micNote() + '</section>';
      return render(shell(h, 'home'));
    }
    h += '<section class="card level"><div class="lvhead"><span class="badge">' + esc(ME.level.nome) + '</span><div><h2>Seu nível: ' + esc(ME.level.nome) + '</h2><p class="muted">' + esc(ME.level.meta) + '</p></div>' +
      (p.streak ? '<div class="streak" title="Dias seguidos conversando"><b>' + p.streak + '</b><span>dia' + (p.streak > 1 ? 's' : '') + ' seguidos</span></div>' : '') + '</div>' + xpBar() + '</section>';

    if (pr.next) {
      let ptxt;
      if (pr.canEvaluate) ptxt = '<p><b>Prova liberada!</b> Você já pode tentar subir para o ' + esc(levelName(pr.next)) + '.</p><button class="btn accent" data-start="evaluation">Fazer a prova do nível</button>';
      else if (pr.cooldown > 0 && pr.xpOk && pr.compOk) ptxt = '<p>A prova libera de novo em <b>' + pr.cooldown + '</b> conversa' + (pr.cooldown > 1 ? 's' : '') + '.</p>';
      else ptxt = '<ul class="checks"><li class="' + (pr.xpOk ? 'ok' : '') + '">XP do próximo nível (' + pr.xpNeeded.toLocaleString('pt-BR') + ')</li><li class="' + (pr.compOk ? 'ok' : '') + '">Competências dominadas: ' + pr.okCount + ' de ' + pr.needOk + ' necessárias (' + pr.total + ' no nível)</li></ul>';
      h += '<section class="card"><h3>Para subir para o ' + esc(levelName(pr.next)) + '</h3>' + ptxt + '</section>';
    }

    const tema = LS.get('tema', 'livre');
    h += '<section class="card"><h3>Nova conversa</h3><p class="muted small">Escolha um tema ou deixe o Rafa decidir pelo que você mais precisa treinar.</p><div class="chips" role="radiogroup" aria-label="Tema">' +
      ['livre'].concat(ME.temas).map(t => '<button role="radio" aria-checked="' + (t === tema) + '" class="chip' + (t === tema ? ' on' : '') + '" data-tema="' + esc(t) + '">' + esc(t === 'livre' ? 'Rafa escolhe' : t) + '</button>').join('') +
      '</div><button class="btn primary big" data-start="normal">Começar conversa</button>' + micNote() + '</section>';

    if (last) h += '<section class="card"><h3>Última conversa · ' + fmtDate(last.started_at) + (last.score != null ? ' · nota ' + last.score : '') + '</h3><p>' + esc(last.summary) + '</p>' + (last.foco_proximo ? '<p class="small"><b>Próximo foco:</b> ' + esc(last.foco_proximo) + '</p>' : '') + '</section>';
    render(shell(h, 'home'));
  }

  function micNote() {
    return window.Voice.supported.stt ? '' : '<p class="note warn">Seu navegador não reconhece voz. Para falar com o Rafa, use o Chrome ou o Edge. Aqui você ainda pode conversar digitando.</p>';
  }

  // ---------------------------------------------------------------- conversa
  let C = null; // estado da conversa atual

  async function startConversation(kind) {
    view = 'talk';
    C = { kind, msgs: [], token: null, plan: null, status: 'Preparando a aula…', interim: '', ended: false,
          captions: LS.get('captions', true), mic: window.Voice.supported.stt, lang: 'en', busy: false, t0: Date.now() };
    window.Voice.setRate(ME.level.rate || 1);
    renderTalk();
    try {
      const r = await api('/api/start', { method: 'POST', body: { kind, tema: LS.get('tema', 'livre') } });
      C.token = r.token; C.plan = r.plan;
      renderTalk();
      await teacherTurn();
    } catch (e) { toast(e.message); C = null; goHome(); }
  }

  function renderTalk() {
    if (!C) return;
    const pl = C.plan;
    const title = !pl ? 'Preparando…' : pl.kind === 'placement' ? 'Conversa de nivelamento' : pl.kind === 'evaluation' ? 'Prova do nível ' + levelName(pl.level) : 'Tema: ' + pl.tema;
    const showLang = ['PRE_A1', 'A1', 'A2'].includes(ME.level.id) && window.Voice.supported.stt;
    const bubbles = C.msgs.map(m => '<div class="msg ' + m.role + '"><b>' + (m.role === 'aluno' ? 'Você' : 'Rafa') + '</b><p>' + (m.role === 'professor' ? captionHtml(m.text) : esc(m.text)) + '</p></div>').join('') +
      (C.interim ? '<div class="msg aluno interim"><b>Você</b><p>' + esc(C.interim) + '</p></div>' : '');
    render('<div class="talk">' +
      '<header class="talkbar"><div><h1>' + esc(title) + '</h1>' + (pl && pl.kind === 'normal' ? '<p class="small muted">Missão: ' + esc(pl.missao) + '</p>' : '') + '</div>' +
      '<button class="btn danger sm" id="endbtn"' + (C.busy === 'finish' ? ' disabled' : '') + '>Encerrar</button></header>' +
      '<section class="stage"><div class="avatar ' + statusClass() + '" aria-hidden="true"><span>R</span></div><p class="status" role="status" aria-live="polite">' + esc(C.status) + '</p></section>' +
      '<section class="log' + (C.captions ? '' : ' hidden') + '" id="log" aria-live="polite">' + bubbles + '</section>' +
      (!C.captions ? '<p class="small muted center-text">Legenda desligada: só ouvindo e falando.</p>' : '') +
      '<footer class="controls">' +
        (window.Voice.supported.stt ? '<div class="row microw"><button class="btn ' + (C.mic ? 'primary' : '') + ' round" id="micbtn" aria-pressed="' + C.mic + '" title="Microfone mãos-livres">' + (C.mic ? 'Microfone ligado · toque para pausar' : 'Ligar microfone') + '</button></div>' : '') +
        '<div class="row optrow">' +
          (showLang ? '<button class="btn sm" id="langbtn" title="Idioma que o microfone entende">Falando em: ' + (C.lang === 'pt' ? 'português' : 'inglês') + '</button>' : '') +
          '<button class="btn sm" id="capbtn" aria-pressed="' + C.captions + '">Legenda: ' + (C.captions ? 'ligada' : 'desligada') + '</button>' +
        '</div>' +
        '<form id="txtform" class="row"><label class="sr" for="txt">Escrever resposta</label><input id="txt" placeholder="Ou escreva sua resposta…" autocomplete="off" maxlength="500"><button class="btn" id="sendbtn">Enviar</button></form>' +
      '</footer></div>');
    const log = $('#log'); if (log) log.scrollTop = log.scrollHeight;
    $('#endbtn').onclick = endConversation;
    const mb = $('#micbtn'); if (mb) mb.onclick = toggleMic;
    const lb = $('#langbtn'); if (lb) lb.onclick = () => { C.lang = C.lang === 'en' ? 'pt' : 'en'; if (window.Voice.isListening()) listenNow(); renderTalk(); };
    $('#capbtn').onclick = () => { C.captions = !C.captions; LS.set('captions', C.captions); renderTalk(); };
    $('#txtform').addEventListener('submit', e => { e.preventDefault(); const t = val('txt').trim(); if (t && !C.busy) { window.Voice.stopListening(); studentSays(t); } });
  }
  function statusClass() { return C.busy === 'teacher' ? 'speaking' : window.Voice.isListening() ? 'listening' : ''; }
  function setStatus(s) {
    if (!C) return; C.status = s;
    const el = $('.status'); if (el) el.textContent = s;
    const av = $('.avatar'); if (av) av.className = 'avatar ' + statusClass();
  }
  function updateLastBubble() {
    if (!C.captions) return;
    const log = $('#log'); if (!log) return;
    const m = C.msgs[C.msgs.length - 1], nodes = log.querySelectorAll('.msg.professor');
    const el = nodes[nodes.length - 1];
    if (el && m && m.role === 'professor') { el.querySelector('p').innerHTML = captionHtml(m.text); log.scrollTop = log.scrollHeight; }
  }

  async function teacherTurn() {
    if (!C || C.ended) return;
    C.busy = 'teacher'; window.Voice.stopListening();
    setStatus('Rafa está pensando…');
    const history = C.msgs.slice();
    const msg = { role: 'professor', text: '' };
    C.msgs.push(msg); renderTalk();
    let spoken = 0, lastSpeech = Promise.resolve();
    const speakReady = final => {
      const pieces = parsePieces(msg.text, final), batch = [];
      while (spoken < pieces.length && pieces[spoken].complete) batch.push(pieces[spoken++]);
      if (batch.length && window.Voice.supported.tts) { setStatus('Rafa está falando…'); lastSpeech = window.Voice.speak(batch); }
    };
    try {
      const r = await api('/api/chat', { method: 'POST', body: { token: C.token, messages: history }, raw: true });
      const reader = r.body.getReader(), dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!C || C.ended) return;
        msg.text += dec.decode(value, { stream: true });
        updateLastBubble(); speakReady(false);
      }
      msg.text = msg.text.trim();
      if (!msg.text) throw new Error('O Rafa ficou sem resposta. Tente falar de novo.');
      updateLastBubble(); speakReady(true);
      await lastSpeech;
    } catch (e) {
      if (C) { C.msgs.pop(); toast(e.message); }
    }
    if (!C || C.ended) return;
    C.busy = false;
    renderTalk();
    if (C.mic) setTimeout(listenNow, 250); else setStatus('Sua vez: escreva ou ligue o microfone.');
  }

  function listenNow() {
    if (!C || C.ended || C.busy) return;
    const ok = window.Voice.listen({
      lang: C.lang,
      silenceMs: ['PRE_A1', 'A1'].includes(ME.level.id) ? 1800 : 1400,
      onInterim: t => { C.interim = t; if (C.captions) { const log = $('#log'); if (log) { let el = log.querySelector('.interim p'); if (!el) { renderTalk(); el = log.querySelector('.interim p'); } if (el) el.textContent = t; log.scrollTop = log.scrollHeight; } } },
      onFinal: t => { C.interim = ''; studentSays(t); },
      onError: () => { C.mic = false; toast('Libere o microfone no navegador para falar com o Rafa.'); renderTalk(); setStatus('Microfone bloqueado. Você pode escrever.'); },
    });
    setStatus(ok ? 'Sua vez: pode falar…' : 'Não consegui ligar o microfone.');
  }

  function toggleMic() {
    C.mic = !C.mic;
    if (!C.mic) { window.Voice.stopListening(); C.interim = ''; }
    renderTalk();
    if (C.mic && !C.busy) listenNow(); else if (!C.busy) setStatus('Microfone desligado. Você pode escrever.');
  }

  function studentSays(text) {
    if (!C || C.ended || C.busy) return;
    C.msgs.push({ role: 'aluno', text });
    C.interim = '';
    renderTalk();
    teacherTurn();
  }

  async function endConversation() {
    if (!C || C.busy === 'finish') return;
    const realTurns = C.msgs.filter(m => m.role === 'aluno').length;
    if (!realTurns && !confirmEnd()) return;
    C.ended = true; C.busy = 'finish';
    window.Voice.cancel(); window.Voice.stopListening();
    render('<main class="page"><div class="card center"><div class="spinner"></div><p>O Rafa está preparando seu resumo…</p></div></main>');
    try {
      const r = await api('/api/finish', { method: 'POST', body: { token: C.token, messages: C.msgs.filter(m => m.text) } });
      C = null; ME = r.estado || ME;
      renderSummary(r);
    } catch (e) {
      toast(e.message);
      C.ended = false; C.busy = false; renderTalk();
    }
  }
  function confirmEnd() { return window.confirm('Você ainda não falou nada. Encerrar mesmo assim?'); }

  // ---------------------------------------------------------------- resumo
  function idxBar(label, v) {
    return '<div class="idx"><span>' + label + '</span><div class="bar sm"><i style="width:' + (v || 0) + '%"></i></div><b>' + (v == null ? '–' : v) + '</b></div>';
  }
  function renderSummary(r) {
    view = 'summary';
    let h = '';
    if (r.curta) {
      h = '<section class="card"><h1>Conversa curta demais</h1><p>Não deu para avaliar: fale pelo menos algumas frases na próxima. Não vale XP, mas também não conta contra você.</p><button class="btn primary" data-go="home">Voltar ao início</button></section>';
      return render(shell(h, 'home'));
    }
    if (r.nivelInicial) h += '<section class="card celebrate"><h1>Seu nível inicial: ' + esc(levelName(r.nivelInicial)) + '</h1><p>' + esc((ME.levels.find(l => l.id === r.nivelInicial) || {}).meta || '') + ' A partir daqui, cada conversa te leva mais longe.</p></section>';
    if (r.kind === 'evaluation') h += r.levelUp
      ? '<section class="card celebrate"><h1>Você subiu para o ' + esc(levelName(r.levelUp)) + '!</h1><p>Prova aprovada com nota ' + r.score + '. Parabéns, isso é muito esforço.</p></section>'
      : '<section class="card"><h1>Quase lá!</h1><p>Na prova a nota mínima é 70 e você fez ' + r.score + '. Treine os pontos abaixo: a prova libera de novo em 3 conversas.</p></section>';

    h += '<section class="card"><div class="scorehead"><div class="score" aria-label="Nota da conversa"><b>' + r.score + '</b><span>de 100</span></div><div><h2>Resumo da conversa</h2><p>' + esc(r.resumo) + '</p></div></div>' +
      '<div class="idxs">' + idxBar('Gramática', r.indices.gramatica) + idxBar('Vocabulário', r.indices.vocabulario) + idxBar('Compreensão', r.indices.compreensao) + idxBar('Interação', r.indices.interacao) + '</div>' +
      '<p class="xpline">+' + r.xp + ' XP' + (r.xpParts ? ' <span class="muted small">(fala ' + r.xpParts.fala + ' · nota ' + r.xpParts.nota + (r.xpParts.missao ? ' · missão ' + r.xpParts.missao : '') + (r.xpParts.sequencia ? ' · sequência ' + r.xpParts.sequencia : '') + ')</span>' : '') + '</p></section>';
    if (r.acertos.length) h += '<section class="card"><h3>Você mandou bem</h3><ul class="list good">' + r.acertos.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul></section>';
    if (r.melhorias.length) h += '<section class="card"><h3>Para melhorar</h3>' + r.melhorias.map(m => '<div class="fix"><p class="said">Você disse: <i>' + esc(m.dito) + '</i></p><p class="right">O certo: <b>' + esc(m.correto) + '</b></p><p class="small muted">' + esc(m.explicacao) + '</p></div>').join('') + '</section>';
    if (r.palavras.length) h += '<section class="card"><h3>Palavras novas</h3><ul class="words">' + r.palavras.map(w => '<li><b>' + esc(w.en) + '</b><span>' + esc(w.pt) + '</span></li>').join('') + '</ul></section>';
    if (r.foco_proximo) h += '<section class="card"><h3>Próxima aula</h3><p>' + esc(r.foco_proximo) + '</p></section>';
    h += '<div class="row"><button class="btn primary" data-go="home">Voltar ao início</button><button class="btn" data-go="progress">Ver meu progresso</button></div>';
    render(shell(h, 'home'));
  }

  // ---------------------------------------------------------------- progresso semanal
  function weekStart(iso) {
    const d = new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
    const dt = new Date(d + 'T12:00:00Z');
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  }
  const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);

  async function goProgress() {
    view = 'progress';
    render(shell('<div class="center"><div class="spinner"></div></div>', 'progress'));
    try { if (!ME) await loadMe(); } catch (e) { return render(shell('<p class="err">' + esc(e.message) + '</p>', 'progress')); }
    const since = new Date(Date.now() - 8 * 7 * 864e5).toISOString();
    const { data, error } = await sb.from('sessions')
      .select('started_at,kind,theme,score,idx_gramatica,idx_vocabulario,idx_compreensao,idx_interacao,xp,minutes,summary,passed')
      .not('ended_at', 'is', null).gte('started_at', since).order('started_at', { ascending: false });
    if (error) return render(shell('<p class="err">Não consegui carregar seu histórico.</p>', 'progress'));
    const scored = data.filter(s => s.score != null);

    const weeks = {};
    scored.forEach(s => { (weeks[weekStart(s.started_at)] = weeks[weekStart(s.started_at)] || []).push(s); });
    const keys = Object.keys(weeks).sort().reverse();
    const rows = keys.map(k => {
      const w = weeks[k];
      return { k, n: w.length, min: Math.round(w.reduce((a, s) => a + Number(s.minutes), 0)), xp: w.reduce((a, s) => a + s.xp, 0),
        nota: avg(w.map(s => s.score)), g: avg(w.map(s => s.idx_gramatica)), v: avg(w.map(s => s.idx_vocabulario)), c: avg(w.map(s => s.idx_compreensao)), i: avg(w.map(s => s.idx_interacao)) };
    });

    let h = '<h1 class="pagetitle">Seu progresso</h1>';
    if (!rows.length) h += '<section class="card"><p>Ainda não há conversas avaliadas. Depois da primeira, suas notas aparecem aqui, semana a semana.</p></section>';
    else {
      const chrono = rows.slice().reverse();
      h += '<section class="card"><h3>Nota média por semana</h3><div class="chart" role="img" aria-label="Nota média por semana, de 0 a 100">' +
        chrono.map(r => '<div class="col"><span class="v">' + r.nota + '</span><div class="b" style="height:' + r.nota + '%"></div><span class="k">' + r.k.slice(8, 10) + '/' + r.k.slice(5, 7) + '</span></div>').join('') + '</div></section>';
      h += '<section class="card"><h3>Semana a semana</h3><div class="tablewrap"><table><thead><tr><th>Semana de</th><th>Conversas</th><th>Min. falados</th><th>XP</th><th>Nota</th><th>Gram.</th><th>Vocab.</th><th>Compr.</th><th>Inter.</th></tr></thead><tbody>' +
        rows.map(r => '<tr><td>' + r.k.slice(8, 10) + '/' + r.k.slice(5, 7) + '</td><td>' + r.n + '</td><td>' + r.min + '</td><td>' + r.xp + '</td><td><b>' + r.nota + '</b></td><td>' + r.g + '</td><td>' + r.v + '</td><td>' + r.c + '</td><td>' + r.i + '</td></tr>').join('') +
        '</tbody></table></div>' + (rows[1] ? '<p class="small muted">Comparado à semana anterior: nota ' + diff(rows[0].nota, rows[1].nota) + '.</p>' : '') + '</section>';
    }
    h += '<section class="card"><h3>Competências do ' + esc(ME.level.nome) + '</h3><p class="small muted">Dominada a partir de 70. Para a prova, você precisa de ' + ME.promocao.needOk + ' de ' + ME.promocao.total + '.</p>' +
      ME.competencias.map(c => '<div class="idx comp"><span title="' + esc(c.tarefa) + '">' + esc(c.titulo) + '</span><div class="bar sm' + ((c.dominio || 0) >= 70 ? ' ok' : '') + '"><i style="width:' + (c.dominio || 0) + '%"></i></div><b>' + (c.dominio == null ? '–' : c.dominio) + '</b></div>').join('') + '</section>';
    if (ME.erros.length) h += '<section class="card"><h3>Erros que mais se repetem</h3><ul class="list">' + ME.erros.slice(0, 5).map(e => '<li>' + esc(e.tag) + ' <span class="muted small">(' + e.count + 'x)</span></li>').join('') + '</ul></section>';
    if (data.length) h += '<section class="card"><h3>Últimas conversas</h3>' + data.slice(0, 10).map(s => '<details class="hist"><summary><span>' + fmtDate(s.started_at) + ' · ' + esc(s.kind === 'placement' ? 'nivelamento' : s.kind === 'evaluation' ? 'prova' + (s.passed ? ' (aprovada)' : ' (não aprovada)') : s.theme || 'conversa') + '</span><b>' + (s.score == null ? 'curta' : s.score) + '</b></summary><p>' + esc(s.summary || 'Conversa curta demais para avaliar.') + '</p></details>').join('') + '</section>';
    render(shell(h, 'progress'));
  }
  const diff = (a, b) => (a > b ? 'subiu ' + (a - b) + ' pontos' : a < b ? 'caiu ' + (b - a) + ' pontos' : 'igual');

  // ---------------------------------------------------------------- conta
  async function goAccount() {
    view = 'account';
    if (!ME) { try { await loadMe(); } catch (_) {} }
    const has = await sb.rpc('ispeak_tem_codigo');
    const p = ME ? ME.profile : { name: '', username: '' };
    render(shell('<h1 class="pagetitle">Sua conta</h1>' +
      '<section class="card"><p><b>@' + esc(p.username) + '</b> <span class="muted small">(o nome de usuário não muda)</span></p>' +
      '<label class="fl" for="nm">Seu nome<input id="nm" value="' + esc(p.name) + '" maxlength="60"></label><button class="btn sm" id="savename">Salvar nome</button></section>' +
      '<section class="card"><h3>Trocar senha</h3>' + pwField('np', 'Senha nova (mínimo 6 caracteres)', 'new-password') + pwField('np2', 'Repita a senha nova', 'new-password') + '<button class="btn sm" id="savepw">Salvar senha nova</button></section>' +
      '<section class="card"><h3>Código de recuperação</h3><p class="small muted">' + (has.data ? 'Sua conta já tem um código. Se perdeu, gere outro: o anterior deixa de valer.' : 'Sua conta ainda não tem código. Sem ele, não dá para recuperar a senha.') + '</p><div id="codearea"></div><button class="btn sm' + (has.data ? '' : ' primary') + '" id="newcode">' + (has.data ? 'Gerar código novo' : 'Gerar meu código') + '</button></section>' +
      '<section class="card"><button class="btn danger" id="logout">Sair da conta</button></section>', 'account'));
    $('#savename').onclick = async () => {
      const { error } = await sb.from('profiles').update({ name: val('nm').trim() || 'Aluno' }).eq('username', p.username);
      toast(error ? 'Não consegui salvar.' : 'Nome salvo.'); if (!error) ME = null;
    };
    $('#savepw').onclick = async () => {
      const a = val('np'); if (a.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.');
      if (a !== val('np2')) return toast('As duas senhas não são iguais.');
      const { error } = await sb.auth.updateUser({ password: a }); toast(error ? authErr(error) : 'Senha alterada.');
    };
    $('#newcode').onclick = async () => {
      if (has.data && !window.confirm('Gerar um código novo? O anterior deixa de valer.')) return;
      const c = await sb.rpc('ispeak_novo_codigo');
      if (c.error) return toast('Não consegui gerar o código.');
      $('#codearea').innerHTML = codeBox(c.data); $('#newcode').remove();
    };
    $('#logout').onclick = async () => { await sb.auth.signOut(); ME = null; authMsg = ''; showAuth('login'); };
  }

  // ---------------------------------------------------------------- eventos globais
  document.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.mode) { authMsg = ''; showAuth(t.dataset.mode); }
    else if (t.dataset.pw) { const i = $('#' + t.dataset.pw); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; t.textContent = show ? 'Ocultar' : 'Mostrar'; }
    else if (t.dataset.copy) { navigator.clipboard && navigator.clipboard.writeText(t.dataset.copy).then(() => toast('Código copiado.'), () => toast('Copie o código manualmente.')); }
    else if (t.dataset.go) { if (view === 'talk') return; ({ home: goHome, progress: goProgress, account: goAccount })[t.dataset.go](); }
    else if (t.dataset.tema) { LS.set('tema', t.dataset.tema); document.querySelectorAll('.chip').forEach(c => { const on = c === t; c.classList.toggle('on', on); c.setAttribute('aria-checked', on); }); }
    else if (t.dataset.start) startConversation(t.dataset.start);
  });
  window.addEventListener('beforeunload', e => { if (C && !C.ended && C.msgs.some(m => m.role === 'aluno')) { e.preventDefault(); e.returnValue = ''; } });

  // exposto para testes
  window.__ispeak = { parsePieces };
  if (!window.__ISPEAK_TEST__) boot();
})();
