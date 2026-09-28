export default async (request) => {
  const match = new URL(request.url).pathname.match(/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match) return new Response('Not found', { status: 404 });
  const key = process.env.GEOAPIFY_KEY;
  if (!key) return new Response('Map key missing', { status: 500 });
  const [, z, x, y] = match;
  const upstream = await fetch(`https://maps.geoapify.com/v1/tile/osm-bright/${z}/${x}/${y}.png?apiKey=${encodeURIComponent(key)}`);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'image/png',
      'cache-control': 'public, max-age=86400',
    },
  });
};
