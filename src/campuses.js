const SCHOOL_HINTS = {
  csueastbay: {
    id: 'csueastbay',
    name: 'Cal State East Bay',
    domain: 'csueastbay.edu',
    geocode: 'California State University East Bay',
  },
  'csueastbay.edu': {
    id: 'csueastbay',
    name: 'Cal State East Bay',
    domain: 'csueastbay.edu',
    geocode: 'California State University East Bay',
  },
};

const DEMO_HOSTS = {
  'school.edu': 'csueastbay',
};

const remembered = new Map();

export function isSchoolEmail(value) {
  return /^[^\s@]+@[^\s@]+\.edu$/i.test(String(value || '').trim());
}

export function baseEduDomain(host) {
  const parts = String(host || '').trim().toLowerCase().split('.').filter(Boolean);
  if (parts.length < 2 || parts.at(-1) !== 'edu') return '';
  return parts.slice(-2).join('.');
}

export function schoolHint(id) {
  return SCHOOL_HINTS[id] || SCHOOL_HINTS[baseEduDomain(id)] || null;
}

export function schoolIdFromEmail(email) {
  const host = String(email || '').trim().toLowerCase().split('@')[1] || '';
  if (!host.endsWith('.edu')) return null;
  if (DEMO_HOSTS[host]) return DEMO_HOSTS[host];
  const hint = schoolHint(host);
  if (hint) return hint.id;
  return baseEduDomain(host) || host;
}

export function rememberCampus(campus) {
  if (!campus?.id || !Array.isArray(campus.places) || !campus.places.length) return null;
  remembered.set(campus.id, campus);
  return campus;
}

export function campusById(id) {
  if (!id) return null;
  return remembered.get(id) || null;
}

export function campusForEmail(email) {
  const id = schoolIdFromEmail(email);
  if (!id) return null;
  const known = campusById(id);
  if (known) return known;
  const hint = schoolHint(id);
  return {
    id,
    name: hint?.name || id,
    domains: [hint?.domain || id],
    places: [],
    zones: [],
    activities: [],
    defaultZone: 'main',
    near: {},
    source: 'pending',
  };
}

export function emptyCampus(school) {
  const hint = schoolHint(school);
  return {
    id: school || 'campus',
    name: hint?.name || school || 'Campus',
    domains: [hint?.domain || school].filter(Boolean),
    places: [],
    zones: [],
    activities: [],
    defaultZone: 'main',
    near: {},
    source: 'pending',
  };
}

export function campusFor(school) {
  return campusById(school) || emptyCampus(school);
}

export function placesFor(school, extras = []) {
  const base = campusFor(school).places || [];
  if (!extras?.length) return base;
  const seen = new Set(base.map((place) => place.id));
  return [...base, ...extras.filter((place) => place?.id && !seen.has(place.id))];
}

export function zonesFor(school) {
  return campusFor(school).zones || [];
}

export function activitiesFor(school) {
  return campusFor(school).activities || [];
}

export function placeById(id, school, extras = []) {
  return placesFor(school, extras).find((place) => place.id === id);
}

export function activityById(id, school) {
  return activitiesFor(school).find((activity) => activity.id === id);
}

export function zonesClose(a, b, school) {
  if (!a || !b) return false;
  if (a === b) return true;
  return ((campusFor(school).near || {})[a] || []).includes(b);
}

export function orderPlaces(places, order = []) {
  if (!places?.length) return [];
  if (!order?.length) return [...places];
  const byId = new Map(places.map((place) => [place.id, place]));
  const ordered = [];
  for (const id of order) {
    if (!byId.has(id)) continue;
    ordered.push(byId.get(id));
    byId.delete(id);
  }
  return [...ordered, ...byId.values()];
}

export function customPlacesFrom(source) {
  const list = source?.availability?.customPlaces || source?.customPlaces || [];
  return Array.isArray(list) ? list.filter((place) => place?.id && place?.name) : [];
}

export function placeOrderFrom(source) {
  const list = source?.availability?.placeOrder || source?.placeOrder || [];
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

export function userPlaces(school, source) {
  return orderPlaces(placesFor(school, customPlacesFrom(source)), placeOrderFrom(source));
}

export function movePlaceId(order, id, delta) {
  const next = [...order];
  const index = next.indexOf(id);
  if (index < 0) return next;
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export const CAMPUSES = [];
export const ZONES = [];
export const PLACES = [];
export const ACTIVITIES = [];
