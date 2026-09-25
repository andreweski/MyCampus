import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createClient } from '@supabase/supabase-js';
import { sendConfirmCode } from './server/sendCode.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

function confirmMail(env) {
  return {
    name: 'confirm-mail',
    configureServer(server) {
      server.middlewares.use('/api/send-code', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method not allowed');
          return;
        }
        try {
          const body = JSON.parse(await readBody(req) || '{}');
          const token = (req.headers.authorization || '').replace(/^Bearer /, '');
          const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
          const { data, error } = await supabase.auth.getUser(token);
          if (error || !data.user?.email) {
            res.statusCode = 401;
            res.end(JSON.stringify({ error: 'Log in again, then request a new code.' }));
            return;
          }
          if (!/^\d{6}$/.test(body.code || '')) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'The code could not be sent.' }));
            return;
          }
          await sendConfirmCode({ to: data.user.email, code: body.code, env });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message || 'The code could not be sent.' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), confirmMail(env)],
  };
});
