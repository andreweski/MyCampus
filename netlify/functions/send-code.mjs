import { createClient } from '@supabase/supabase-js';
import { sendConfirmCode } from '../../server/sendCode.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  try {
    const body = JSON.parse(event.body || '{}');
    const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer /, '');
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.email) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Log in again, then request a new code.' }) };
    }
    if (!/^\d{6}$/.test(body.code || '')) {
      return { statusCode: 400, body: JSON.stringify({ error: 'The code could not be sent.' }) };
    }
    await sendConfirmCode({ to: data.user.email, code: body.code, env: process.env });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message || 'The code could not be sent.' }) };
  }
}
