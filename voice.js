// iSpeak · camada de voz. Hoje usa o reconhecimento e a fala do próprio navegador (grátis).
// Para trocar por voz em tempo real no futuro, basta reimplementar este objeto com a mesma interface:
//   Voice.supported.stt / .tts, Voice.listen(opts), Voice.stopListening(), Voice.speak(pieces), Voice.cancel()
(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synth = window.speechSynthesis;

  // ------------------------------------------------------------------ fala (TTS)
  let voices = [];
  const loadVoices = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

  // Preferência por vozes masculinas e naturais (o professor é o Rafa).
  const PREF = {
    en: ['Andrew', 'Guy', 'Christopher', 'Eric', 'Brian', 'Aaron', 'Google US English', 'Alex', 'Daniel'],
    pt: ['Antonio', 'Donato', 'Fabio', 'Julio', 'Google português do Brasil', 'Felipe', 'Luciana', 'Francisca'],
  };
  function pickVoice(lang) {
    const tag = lang === 'pt' ? 'pt-BR' : 'en-US';
    const pool = voices.filter(v => v.lang.replace('_', '-').toLowerCase() === tag.toLowerCase());
    const pool2 = pool.length ? pool : voices.filter(v => v.lang.toLowerCase().startsWith(lang));
    for (const name of PREF[lang]) {
      const v = pool2.find(x => x.name.includes(name) && /natural|online|neural/i.test(x.name)) || pool2.find(x => x.name.includes(name));
      if (v) return v;
    }
    return pool2.find(x => /natural|online|neural/i.test(x.name)) || pool2[0] || null;
  }

  let rate = 1;
  let speakQueue = Promise.resolve();
  let speakToken = 0;

  function speakOne(text, lang, token) {
    return new Promise(resolve => {
      if (!synth || token !== speakToken || !text.trim()) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
      u.rate = lang === 'pt' ? Math.max(1, rate) : rate;
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(guard); resolve(); } };
      // alguns navegadores às vezes não disparam onend: trava de segurança pelo tamanho do texto
      const guard = setTimeout(finish, 1500 + text.length * 110 / Math.max(0.5, u.rate));
      u.onend = finish; u.onerror = finish;
      synth.speak(u);
    });
  }

  // pieces: [{lang:'en'|'pt', text}] — entra na fila e devolve uma promessa que termina quando tudo foi falado
  function speak(pieces) {
    const token = speakToken;
    speakQueue = speakQueue.then(async () => {
      for (const p of pieces) await speakOne(p.text, p.lang, token);
    });
    return speakQueue;
  }
  function cancel() {
    speakToken++;
    if (synth) synth.cancel();
    speakQueue = Promise.resolve();
  }

  // ------------------------------------------------------------------ escuta (STT)
  let rec = null, listening = false, timer = null, finalText = '', interimText = '', opts = null;

  function commit() {
    clearTimeout(timer);
    const text = (finalText + ' ' + interimText).replace(/\s+/g, ' ').trim();
    if (!text) return;
    finalText = ''; interimText = '';
    const cb = opts && opts.onFinal;
    stopListening();
    if (cb) cb(text);
  }

  function listen(o) {
    if (!SR) return false;
    stopListening();
    opts = o; finalText = ''; interimText = ''; listening = true;
    rec = new SR();
    rec.lang = o.lang === 'pt' ? 'pt-BR' : 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += ' ' + r[0].transcript; else interim += r[0].transcript;
      }
      interimText = interim;
      if (opts.onInterim) opts.onInterim((finalText + ' ' + interimText).trim());
      clearTimeout(timer);
      // o aluno terminou a frase quando fica em silêncio por um tempo
      timer = setTimeout(commit, interimText ? (o.silenceMs || 1400) + 900 : (o.silenceMs || 1400));
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { listening = false; if (opts.onError) opts.onError('mic'); }
    };
    rec.onend = () => {
      // o Chrome encerra a escuta sozinho após um tempo: reinicia enquanto estiver ouvindo
      if (listening && rec) { try { rec.start(); } catch (_) { /* já reiniciando */ } }
    };
    try { rec.start(); } catch (_) { return false; }
    return true;
  }

  function stopListening() {
    listening = false;
    clearTimeout(timer);
    if (rec) { rec.onend = null; try { rec.abort(); } catch (_) {} rec = null; }
  }

  window.Voice = {
    supported: { stt: !!SR, tts: !!synth },
    setRate: r => { rate = r || 1; },
    listen, stopListening, commitNow: commit,
    speak, cancel,
    isListening: () => listening,
  };
})();
