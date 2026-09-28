import { searchPlacesNear } from '../../server/resolveCampus.js';

export default async (request) => {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get('lat'));
  const lng = Number(url.searchParams.get('lng'));
  const text = String(url.searchParams.get('q') || '').trim();
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return Response.json({ error: 'Map key missing' }, { status: 500 });
  try {
    const places = await searchPlacesNear({ lat, lng, text, key });
    return Response.json({ places });
  } catch (error) {
    return Response.json({ error: error.message || 'Place search failed.' }, { status: 500 });
  }
};
