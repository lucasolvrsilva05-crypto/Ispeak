// Utilitários das funções da Vercel: ambiente, login, banco (service_role), OpenAI e contexto assinado.
import crypto from 'node:crypto';

export const env = name => {
  const v = process.env[name];
  if (!v) throw httpError(500, `Variável de ambiente ${name} não configurada na Vercel.`);
  return v;
};
export const CHAT_MODEL = () => process.env.CHAT_MODEL || 'gpt-6-luna';
export const EVAL_MODEL = () => process.env.EVAL_MODEL || 'gpt-6-luna';

export function httpError(status, message) {
  const e = new Error(message); e.status = status; return e;
}

export function handler(fn, methods = ['POST']) {
  return async (req, res) => {
    try {
      if (!methods.includes(req.method)) throw httpError(405, 'Método não permitido.');
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      if (!res.headersSent) res.status(status).json({ error: e.message || 'Erro inesperado.' });
      else res.end();
    }
  };
}

export function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { throw httpError(400, 'Corpo inválido.'); }
}

// Confere o token do Supabase e devolve o usuário logado.
export async function requireUser(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) throw httpError(401, 'Entre na sua conta.');
  const r = await fetch(env('SUPABASE_URL') + '/auth/v1/user', {
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: auth },
  });
  if (!r.ok) throw httpError(401, 'Sessão expirada. Entre de novo.');
  const u = await r.json();
  if (!u?.id) throw httpError(401, 'Sessão inválida.');
  return u;
}

// Banco com a chave service_role (só no servidor).
export async function db(path, { method = 'GET', body: b, prefer } = {}) {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(env('SUPABASE_URL') + '/rest/v1/' + path, { method, headers, body: b === undefined ? undefined : JSON.stringify(b) });
  const text = await r.text();
  if (!r.ok) { console.error('db', method, path, r.status, text); throw httpError(502, 'Falha ao falar com o banco.'); }
  return text ? JSON.parse(text) : null;
}

export async function openai(path, payload, { stream = false } = {}) {
  const r = await fetch('https://api.openai.com/v1/' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env('OPENAI_API_KEY'), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('openai', path, r.status, t);
    throw httpError(502, r.status === 429 ? 'O professor está sobrecarregado. Tente de novo em instantes.' : 'O professor não conseguiu responder agora.');
  }
  return stream ? r : r.json();
}

// Contexto da sessão assinado (HMAC), para o cliente não conseguir alterar o plano/prompt.
const secret = () => env('ISPEAK_SECRET');
const b64 = s => Buffer.from(s).toString('base64url');
export function sign(obj) {
  const data = b64(JSON.stringify(obj));
  const mac = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  return data + '.' + mac;
}
export function verify(token, uid) {
  const [data, mac] = String(token || '').split('.');
  if (!data || !mac) throw httpError(400, 'Sessão de conversa inválida.');
  const want = crypto.createHmac('sha256', secret()).update(data).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) throw httpError(400, 'Sessão de conversa inválida.');
  const obj = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (obj.uid !== uid) throw httpError(403, 'Esta conversa é de outra conta.');
  if (Date.now() > obj.exp) throw httpError(410, 'Esta conversa expirou. Comece uma nova.');
  return obj;
}

// Limpa e limita as mensagens que chegam do navegador.
export const MAX_TURNS = 120;
export function cleanMessages(list) {
  if (!Array.isArray(list)) throw httpError(400, 'Mensagens inválidas.');
  if (list.length > MAX_TURNS) throw httpError(413, 'A conversa ficou longa demais. Toque em Encerrar para ver seu resumo.');
  return list
    .filter(x => x && (x.role === 'aluno' || x.role === 'professor') && typeof x.text === 'string')
    .map(x => ({ role: x.role, text: x.text.slice(0, x.role === 'aluno' ? 800 : 1500).trim() }))
    .filter(x => x.text);
}
