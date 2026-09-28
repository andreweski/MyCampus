const PLACE_KINDS = [
  { zone: 'library', outdoor: false, categories: ['education.library'], note: 'A quiet spot to meet' },
  { zone: 'cafe', outdoor: false, categories: ['catering.cafe', 'catering.cafe.coffee'], note: 'A cafe on or near campus' },
  { zone: 'food', outdoor: false, categories: ['catering.restaurant', 'catering.fast_food'], note: 'An easy place to grab food' },
  { zone: 'outdoors', outdoor: true, categories: ['leisure.park', 'leisure.picnic'], note: 'Outside, open air' },
  { zone: 'gym', outdoor: false, categories: ['sport.sports_centre', 'sport.stadium', 'sport.fitness'], note: 'A place to move around' },
  { zone: 'main', outdoor: true, categories: ['education.university', 'education.college'], note: 'Near the center of campus' },
];

const ACTIVITY_TEMPLATES = [
  { id: 'coffee', title: 'Coffee, then see', intents: ['food', 'social', 'coffee'], bands: ['morning', 'afternoon'], duration: 60, zones: ['cafe', 'food'], line: 'One drink. Stay if the conversation is good.' },
  { id: 'lunch-walk', title: 'Lunch + a short walk', intents: ['food', 'fitness', 'outdoors', 'social'], bands: ['lunch'], duration: 75, zones: ['food', 'cafe', 'outdoors', 'main'], line: 'Eat somewhere easy, then walk it off. Nothing past that.' },
  { id: 'library-break', title: 'Break near the library', intents: ['study', 'studying', 'social'], bands: ['lunch', 'afternoon'], duration: 45, zones: ['library', 'main'], line: 'Forty-five minutes off the problem set.' },
  { id: 'outside', title: 'Sit outside', intents: ['outdoors', 'social', 'creative', 'art'], bands: ['afternoon', 'evening'], duration: 60, zones: ['outdoors', 'main'], line: 'Low-key. Better if the group is quieter.' },
  { id: 'loop', title: 'Easy campus loop', intents: ['fitness', 'outdoors', 'walking', 'running'], bands: ['morning', 'afternoon'], duration: 50, zones: ['outdoors', 'gym', 'main'], line: 'A pace the whole group can hold.' },
  { id: 'hoops', title: 'Short pickup run', intents: ['fitness', 'basketball', 'sports'], bands: ['afternoon', 'evening'], duration: 60, zones: ['gym'], line: 'Half-court. Rotate in, no team to join.' },
  { id: 'games', title: 'One game together', intents: ['social', 'games', 'creative'], bands: ['afternoon', 'evening'], duration: 80, zones: ['main', 'cafe', 'food'], line: 'A short game, then you leave.' },
  { id: 'courtyard', title: 'Courtyard pause', intents: ['study', 'social', 'outdoors'], bands: ['lunch', 'afternoon'], duration: 40, zones: ['main', 'outdoors', 'library'], line: 'Sun, ten minutes of talking, then back to work.' },
];

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'spot';
}

function uniqueName(name, used) {
  let next = name;
  let n = 2;
  while (used.has(next.toLowerCase())) {
    next = `${name} ${n}`;
    n += 1;
  }
  used.add(next.toLowerCase());
  return next;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Lookup failed (${response.status})`);
  return response.json();
}

export function baseEduDomain(host) {
  const parts = String(host || '').trim().toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2 || parts.at(-1) !== 'edu') return '';
  return parts.slice(-2).join('.');
}

export async function schoolNameForDomain(domain) {
  const host = String(domain || '').trim().toLowerCase();
  if (!host) return '';
  const hints = {
    csueastbay: 'California State University East Bay',
    'csueastbay.edu': 'California State University East Bay',
  };
  if (hints[host] || hints[baseEduDomain(host)]) return hints[host] || hints[baseEduDomain(host)];
  try {
    const rows = await fetchJson(`http://universities.hipolabs.com/search?domain=${encodeURIComponent(host)}`);
    if (Array.isArray(rows) && rows[0]?.name) {
      const name = rows[0].name;
      if (/california state university$/i.test(name) && /eastbay|csueastbay/.test(host)) {
        return 'California State University East Bay';
      }
      return name;
    }
  } catch {
    // keep going
  }
  const base = baseEduDomain(host);
  if (base && base !== host) {
    try {
      const rows = await fetchJson(`http://universities.hipolabs.com/search?domain=${encodeURIComponent(base)}`);
      if (Array.isArray(rows) && rows[0]?.name) return rows[0].name;
    } catch {
      // keep going
    }
  }
  return host.replace(/\.edu$/, '').replace(/[-.]/g, ' ');
}

function scoreCampusHit(props, name, domain) {
  const hay = `${props.name || ''} ${props.formatted || ''} ${props.city || ''} ${props.result_type || ''}`.toLowerCase();
  const tokens = String(name || '')
    .toLowerCase()
    .replace(/university|college|state|of|the|california/g, ' ')
    .match(/[a-z]{4,}/g) || [];
  let score = 0;
  if (/university|college|campus/.test(hay)) score += 3;
  if ((props.result_type || '') === 'amenity') score += 2;
  if ((props.result_type || '') === 'suburb') score += 1;
  for (const token of tokens) {
    if (hay.includes(token)) score += 4;
  }
  if (/east bay/.test(String(name || '').toLowerCase()) && /hayward/.test(hay)) score += 6;
  if (/east bay/.test(String(name || '').toLowerCase()) && /concord/.test(hay)) score -= 8;
  const base = String(domain || '').replace(/\.edu$/, '');
  if (base && hay.includes(base.replace(/[-.]/g, ' '))) score += 2;
  if (!Number.isFinite(props.lat) || !Number.isFinite(props.lon)) return -1;
  return score;
}

async function geocodeCampus(name, domain, key) {
  const queries = [];
  const clean = String(name || '').trim();
  if (clean) queries.push(clean);
  if (clean && !/university|college/i.test(clean)) queries.push(`${clean} University`);
  if (domain) queries.push(domain);
  let best = null;
  let bestScore = 0;
  for (const text of queries) {
    const data = await fetchJson(`https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(text)}&limit=8&apiKey=${encodeURIComponent(key)}`);
    for (const feature of data.features || []) {
      const props = feature.properties || {};
      const score = scoreCampusHit(props, clean, domain);
      if (score > bestScore) {
        bestScore = score;
        best = {
          name: props.name || clean || domain,
          lat: props.lat,
          lng: props.lon,
        };
      }
    }
    if (bestScore >= 8) break;
  }
  return bestScore >= 3 ? best : null;
}

function kindForCategories(categories = []) {
  const set = new Set(categories);
  for (const kind of PLACE_KINDS) {
    if (kind.categories.some((item) => set.has(item) || [...set].some((cat) => cat.startsWith(`${item}.`) || item.startsWith(`${cat}.`)))) {
      return kind;
    }
  }
  if ([...set].some((cat) => cat.startsWith('education'))) return PLACE_KINDS.find((item) => item.zone === 'library');
  if ([...set].some((cat) => cat.startsWith('catering'))) return PLACE_KINDS.find((item) => item.zone === 'cafe');
  if ([...set].some((cat) => cat.startsWith('leisure') || cat.startsWith('natural'))) return PLACE_KINDS.find((item) => item.zone === 'outdoors');
  if ([...set].some((cat) => cat.startsWith('sport'))) return PLACE_KINDS.find((item) => item.zone === 'gym');
  return PLACE_KINDS.find((item) => item.zone === 'main');
}

async function nearbyPlaces(lat, lng, key) {
  const categories = PLACE_KINDS.flatMap((kind) => kind.categories).join(',');
  const data = await fetchJson(
    `https://api.geoapify.com/v2/places?categories=${encodeURIComponent(categories)}&filter=circle:${lng},${lat},2000&bias=proximity:${lng},${lat}&limit=60&apiKey=${encodeURIComponent(key)}`,
  );
  const usedNames = new Set();
  const byZone = new Map();
  for (const feature of data.features || []) {
    const props = feature.properties || {};
    const name = String(props.name || '').trim();
    if (!name || !Number.isFinite(props.lat) || !Number.isFinite(props.lon)) continue;
    const kind = kindForCategories(props.categories || []);
    const list = byZone.get(kind.zone) || [];
    if (list.length >= 4) continue;
    const label = uniqueName(name, usedNames);
    if (!label || /^none$/i.test(label)) continue;
    list.push({
      id: `${kind.zone}-${slug(label)}`,
      name: label,
      zone: kind.zone,
      outdoor: kind.outdoor,
      lat: props.lat,
      lng: props.lon,
      note: kind.note,
    });
    byZone.set(kind.zone, list);
  }
  if (![...byZone.values()].flat().length) {
    return [{
      id: 'main-campus',
      name: 'Campus center',
      zone: 'main',
      outdoor: true,
      lat,
      lng,
      note: 'Meet near the center of campus',
    }];
  }
  const ordered = ['cafe', 'library', 'outdoors', 'food', 'gym', 'main'];
  const places = [];
  for (const zone of ordered) {
    for (const place of byZone.get(zone) || []) {
      if (places.length >= 20) break;
      places.push(place);
    }
    if (places.length >= 20) break;
  }
  return places;
}

function activitiesForPlaces(places) {
  const used = new Set();
  const list = [];
  for (const template of ACTIVITY_TEMPLATES) {
    const place = places.find((item) => template.zones.includes(item.zone));
    if (!place) continue;
    const key = `${template.id}:${place.id}`;
    if (used.has(key)) continue;
    used.add(key);
    list.push({
      id: template.id,
      title: template.title,
      intents: template.intents,
      bands: template.bands,
      duration: template.duration,
      place: place.id,
      line: template.line,
    });
  }
  if (!list.length && places[0]) {
    list.push({
      id: 'meet-up',
      title: 'Meet up on campus',
      intents: ['social'],
      bands: ['lunch', 'afternoon', 'evening'],
      duration: 60,
      place: places[0].id,
      line: 'A short plan near a spot you both know.',
    });
  }
  return list;
}

function nearFromPlaces(places) {
  const near = {};
  for (const place of places) {
    near[place.zone] = places
      .filter((other) => other.zone !== place.zone)
      .slice(0, 3)
      .map((other) => other.zone);
  }
  return near;
}

export async function resolveCampusFromDomain(domain, key, options = {}) {
  const host = String(domain || '').trim().toLowerCase();
  const hints = {
    csueastbay: { id: 'csueastbay', domain: 'csueastbay.edu', name: 'Cal State East Bay', geocode: 'California State University East Bay' },
    'csueastbay.edu': { id: 'csueastbay', domain: 'csueastbay.edu', name: 'Cal State East Bay', geocode: 'California State University East Bay' },
  };
  const hint = hints[host] || hints[baseEduDomain(host)];
  if (!(host.endsWith('.edu') || hint) || !key) return null;
  const id = hint?.id || baseEduDomain(host) || host;
  const lookupDomain = hint?.domain || baseEduDomain(host) || host;
  const schoolName = String(options.name || '').trim() || hint?.geocode || hint?.name || await schoolNameForDomain(lookupDomain);
  const pin = await geocodeCampus(schoolName, lookupDomain, key);
  if (!pin) return null;
  const places = await nearbyPlaces(pin.lat, pin.lng, key);
  const zones = [...new Map(places.map((place) => [place.zone, {
    id: place.zone,
    label: place.zone === 'main' ? 'Campus center'
      : place.zone === 'cafe' ? 'Cafe'
        : place.zone === 'food' ? 'Food'
          : place.zone === 'outdoors' ? 'Outdoors'
            : place.zone === 'gym' ? 'Gym'
              : 'Library',
  }])).values()];
  return {
    id,
    name: hint?.name || String(options.name || '').trim() || schoolName || pin.name,
    domains: Array.isArray(options.domains) && options.domains.length ? options.domains : [lookupDomain],
    defaultZone: places[0]?.zone || 'main',
    zones,
    near: nearFromPlaces(places),
    places,
    activities: activitiesForPlaces(places),
    lat: pin.lat,
    lng: pin.lng,
    source: 'geoapify',
  };
}

function schoolRow(row) {
  const domains = (row.domains || []).map((item) => String(item || '').toLowerCase()).filter((item) => item.endsWith('.edu'));
  const domain = domains[0] || '';
  if (!domain || !row.name) return null;
  return {
    name: row.name,
    domain: baseEduDomain(domain) || domain,
    domains: [...new Set(domains.map((item) => baseEduDomain(item) || item))],
  };
}

export async function suggestSchool(domain) {
  const host = String(domain || '').trim().toLowerCase();
  if (host === 'csueastbay' || host === 'csueastbay.edu' || host.endsWith('.csueastbay.edu')) {
    return { name: 'Cal State East Bay', domain: 'csueastbay.edu', domains: ['csueastbay.edu'] };
  }
  if (!host.endsWith('.edu')) return null;
  const id = baseEduDomain(host) || host;
  try {
    const rows = await fetchJson(`http://universities.hipolabs.com/search?domain=${encodeURIComponent(host)}`);
    const hit = Array.isArray(rows) ? schoolRow(rows[0]) : null;
    if (hit) {
      if (/california state university$/i.test(hit.name) && id === 'csueastbay.edu') {
        return { name: 'Cal State East Bay', domain: 'csueastbay.edu', domains: ['csueastbay.edu'] };
      }
      return { ...hit, domain: id, domains: [...new Set([id, ...hit.domains])] };
    }
  } catch {
    // keep going
  }
  if (id !== host) {
    try {
      const rows = await fetchJson(`http://universities.hipolabs.com/search?domain=${encodeURIComponent(id)}`);
      const hit = Array.isArray(rows) ? schoolRow(rows[0]) : null;
      if (hit) return { ...hit, domain: id, domains: [...new Set([id, ...hit.domains])] };
    } catch {
      // keep going
    }
  }
  return {
    name: id.replace(/\.edu$/, '').replace(/[-.]/g, ' '),
    domain: id,
    domains: [id],
  };
}

export async function searchSchools(query) {
  const text = String(query || '').trim();
  if (text.length < 2) return [];
  const rows = await fetchJson(`http://universities.hipolabs.com/search?name=${encodeURIComponent(text)}`);
  const seen = new Set();
  const schools = [];
  if (/east bay|csueb|csueastbay/i.test(text)) {
    schools.push({ name: 'Cal State East Bay', domain: 'csueastbay.edu', domains: ['csueastbay.edu'] });
    seen.add('csueastbay.edu');
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    const school = schoolRow(row);
    if (!school || seen.has(school.domain)) continue;
    if (/california state university$/i.test(school.name) && school.domain === 'csueastbay.edu') {
      school.name = 'Cal State East Bay';
    }
    seen.add(school.domain);
    schools.push(school);
    if (schools.length >= 8) break;
  }
  return schools;
}

export async function searchPlacesNear({ lat, lng, text, key }) {
  if (!key || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return [];
  const query = String(text || '').trim();
  if (query.length < 2) return [];
  const data = await fetchJson(
    `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&filter=circle:${lng},${lat},5000&bias=proximity:${lng},${lat}&limit=8&apiKey=${encodeURIComponent(key)}`,
  );
  const used = new Set();
  const places = [];
  for (const feature of data.features || []) {
    const props = feature.properties || {};
    const name = String(props.name || props.address_line1 || '').trim();
    const placeLat = props.lat ?? feature.geometry?.coordinates?.[1];
    const placeLng = props.lon ?? feature.geometry?.coordinates?.[0];
    if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLng)) continue;
    const kind = kindForCategories(props.categories || []);
    const label = uniqueName(name, used);
    places.push({
      id: `custom-${kind.zone}-${slug(label)}-${Math.round(placeLat * 10000)}`,
      name: label,
      zone: kind.zone,
      outdoor: kind.outdoor,
      lat: placeLat,
      lng: placeLng,
      note: kind.note,
      custom: true,
    });
    if (places.length >= 8) break;
  }
  return places;
}
