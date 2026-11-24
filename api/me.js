// Painel do aluno: perfil, nível, competências, erros recorrentes e situação de promoção.
import { handler, requireUser } from '../lib/server.js';
import { loadState, publicState } from '../lib/state.js';

export default handler(async (req, res) => {
  const u = await requireUser(req);
  const st = await loadState(u.id);
  if (!st) return res.status(404).json({ error: 'Perfil não encontrado. Rode o supabase/schema.sql e crie a conta de novo.' });
  res.setHeader('Cache-Control', 'no-store');
  res.json(publicState(st));
}, ['GET']);
