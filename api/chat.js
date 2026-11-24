// Fala do professor, em streaming de texto (o navegador transforma em voz frase a frase).
import { handler, requireUser, body, verify, cleanMessages, openai, CHAT_MODEL } from '../lib/server.js';
import { teacherPrompt } from '../lib/prompts.js';

export const config = { maxDuration: 30 };

export default handler(async (req, res) => {
  const u = await requireUser(req);
  const { token, messages } = body(req);
  const ctx = verify(token, u.id);
  const msgs = cleanMessages(messages).slice(-40);

  const payload = {
    model: CHAT_MODEL(),
    reasoning_effort: 'none',
    stream: true,
    max_completion_tokens: 350,
    messages: [
      { role: 'system', content: teacherPrompt(ctx.plan) },
      { role: 'user', content: '[O aluno entrou na sala. Comece a aula.]' },
      ...msgs.map(x => ({ role: x.role === 'aluno' ? 'user' : 'assistant', content: x.text })),
    ],
  };
  const r = await openai('chat/completions', payload, { stream: true });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const t = JSON.parse(data).choices?.[0]?.delta?.content;
        if (t) res.write(t);
      } catch { /* pedaço incompleto: ignora */ }
    }
  }
  res.end();
});
