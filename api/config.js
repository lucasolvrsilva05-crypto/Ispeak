// Configuração pública do navegador (só a chave anon, nunca a service_role).
import { handler, env } from '../lib/server.js';

export default handler(async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ supabaseUrl: env('SUPABASE_URL'), supabaseAnonKey: env('SUPABASE_ANON_KEY'), loginDomain: 'ispeak.vercel.app' });
}, ['GET']);
