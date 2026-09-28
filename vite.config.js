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

function mapTiles(env) {
  return {
    name: 'map-tiles',
    configureServer(server) {
      server.middlewares.use('/api/map-tiles', async (req, res) => {
        try {
          const match = (req.url || '').match(/(\d+)\/(\d+)\/(\d+)\.png/);
          if (!match || !env.GEOAPIFY_KEY) {
            res.statusCode = match ? 500 : 404;
            res.end(match ? 'Map key missing' : 'Not found');
            return;
          }
          const [, z, x, y] = match;
          const upstream = await fetch(`https://maps.geoapify.com/v1/tile/osm-bright/${z}/${x}/${y}.png?apiKey=${encodeURIComponent(env.GEOAPIFY_KEY)}`);
          res.statusCode = upstream.status;
          res.setHeader('content-type', upstream.headers.get('content-type') || 'image/png');
          res.setHeader('cache-control', 'public, max-age=86400');
          res.end(Buffer.from(await upstream.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.end(error.message || 'Tile unavailable');
        }
      });
    },
  };
}

function campusResolve(env) {
  return {
    name: 'campus-resolve',
    configureServer(server) {
      server.middlewares.use('/api/campus', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
          const name = String(url.searchParams.get('name') || '').trim();
          if (!domain.endsWith('.edu') && domain !== 'csueastbay') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Use a school email that ends in .edu.' }));
            return;
          }
          if (!env.GEOAPIFY_KEY) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Map key missing' }));
            return;
          }
          const { resolveCampusFromDomain, baseEduDomain } = await import('./server/resolveCampus.js');
          const campus = await resolveCampusFromDomain(baseEduDomain(domain) || domain, env.GEOAPIFY_KEY, name ? { name } : {});
          res.setHeader('content-type', 'application/json');
          if (!campus) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'This campus could not be found.' }));
            return;
          }
          res.end(JSON.stringify({ campus }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'This campus could not be found.' }));
        }
      });
      server.middlewares.use('/api/schools', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
          const query = String(url.searchParams.get('q') || '').trim();
          const { suggestSchool, searchSchools } = await import('./server/resolveCampus.js');
          res.setHeader('content-type', 'application/json');
          if (domain) {
            res.end(JSON.stringify({ school: await suggestSchool(domain) }));
            return;
          }
          if (query) {
            res.end(JSON.stringify({ schools: await searchSchools(query) }));
            return;
          }
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Add a domain or a search.' }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'School lookup failed.' }));
        }
      });
      server.middlewares.use('/api/places', async (req, res) => {
        try {
          const url = new URL(req.url || '', 'http://localhost');
          const lat = Number(url.searchParams.get('lat'));
          const lng = Number(url.searchParams.get('lng'));
          const text = String(url.searchParams.get('q') || '').trim();
          if (!env.GEOAPIFY_KEY) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Map key missing' }));
            return;
          }
          const { searchPlacesNear } = await import('./server/resolveCampus.js');
          const places = await searchPlacesNear({ lat, lng, text, key: env.GEOAPIFY_KEY });
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ places }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Place search failed.' }));
        }
      });
    },
  };
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
    plugins: [react(), confirmMail(env), mapTiles(env), campusResolve(env)],
  };
});
