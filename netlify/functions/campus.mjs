import { resolveCampusFromDomain, baseEduDomain } from '../../server/resolveCampus.js';

export default async (request) => {
  const url = new URL(request.url);
  const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
  const name = String(url.searchParams.get('name') || '').trim();
  if (!domain.endsWith('.edu') && domain !== 'csueastbay') {
    return Response.json({ error: 'Use a school email that ends in .edu.' }, { status: 400 });
  }
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return Response.json({ error: 'Map key missing' }, { status: 500 });
  try {
    const campus = await resolveCampusFromDomain(baseEduDomain(domain) || domain, key, name ? { name } : {});
    if (!campus) return Response.json({ error: 'This campus could not be found.' }, { status: 404 });
    return Response.json({ campus });
  } catch (error) {
    return Response.json({ error: error.message || 'This campus could not be found.' }, { status: 500 });
  }
};
