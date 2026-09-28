import { suggestSchool, searchSchools } from '../../server/resolveCampus.js';

export default async (request) => {
  const url = new URL(request.url);
  const domain = String(url.searchParams.get('domain') || '').trim().toLowerCase();
  const query = String(url.searchParams.get('q') || '').trim();
  try {
    if (domain) {
      const school = await suggestSchool(domain);
      return Response.json({ school });
    }
    if (query) {
      const schools = await searchSchools(query);
      return Response.json({ schools });
    }
    return Response.json({ error: 'Add a domain or a search.' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message || 'School lookup failed.' }, { status: 500 });
  }
};
