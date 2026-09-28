export const BANDS = {
  morning: [9 * 60, 12 * 60],
  lunch: [12 * 60, 14 * 60],
  afternoon: [14 * 60, 17 * 60],
  evening: [17 * 60, 20 * 60],
};

export const BAND_LABELS = [
  ['morning', 'Morning'],
  ['lunch', 'Lunch'],
  ['afternoon', 'Afternoon'],
  ['evening', 'Evening'],
];

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export {
  ACTIVITIES, PLACES, ZONES, activitiesFor, activityById, baseEduDomain, campusById, campusFor, campusForEmail,
  customPlacesFrom, isSchoolEmail, movePlaceId, orderPlaces, placeById, placeOrderFrom, placesFor, rememberCampus,
  schoolHint, schoolIdFromEmail, userPlaces, zonesClose, zonesFor,
} from './campuses.js';

export const INTERESTS = [
  'Fitness', 'Food', 'Walking', 'Coffee', 'Studying', 'Music', 'Games',
  'Art', 'Basketball', 'Running', 'Outdoors', 'Movies', 'Photography', 'Career',
];

export const CLUSTERS = {
  fitness: ['fitness', 'running', 'gym', 'basketball', 'yoga', 'sports', 'workout', 'soccer', 'tennis', 'swim', 'dance', 'hiking', 'biking'],
  food: ['food', 'lunch', 'coffee', 'cooking', 'boba', 'brunch', 'eat', 'dinner'],
  study: ['studying', 'study', 'reading', 'homework', 'computers'],
  social: ['social', 'games', 'movies', 'music'],
  outdoors: ['outdoors', 'walking', 'picnic', 'hike'],
  creative: ['art', 'music', 'photography', 'movies', 'design'],
  career: ['career', 'networking', 'resume'],
};

const CANON = {
  gym: 'fitness', workout: 'fitness', workouts: 'fitness', lifting: 'fitness', weights: 'fitness', weightlifting: 'fitness',
  yoga: 'yoga', pilates: 'yoga', stretch: 'yoga',
  run: 'running', running: 'running', jog: 'running', jogging: 'running', sprint: 'running', cardio: 'fitness',
  basketball: 'basketball', hoop: 'basketball', hoops: 'basketball',
  soccer: 'soccer', football: 'soccer', futsal: 'soccer', tennis: 'tennis', volleyball: 'sports', badminton: 'sports',
  baseball: 'sports', softball: 'sports', golf: 'sports', pickleball: 'sports', frisbee: 'sports',
  swim: 'swim', swimming: 'swim', pool: 'swim',
  bike: 'biking', biking: 'biking', cycling: 'biking',
  hike: 'hiking', hiking: 'hiking', climb: 'hiking', climbing: 'hiking', bouldering: 'hiking',
  dance: 'dance', dancing: 'dance', zumba: 'dance', boxing: 'fitness', skate: 'sports', skating: 'sports',
  sport: 'sports', sports: 'sports', training: 'fitness', crossfit: 'fitness',
  food: 'food', eat: 'food', eating: 'food', hungry: 'food', snack: 'food', pizza: 'food', ramen: 'food', sushi: 'food',
  lunch: 'lunch', dinner: 'dinner', breakfast: 'brunch', brunch: 'brunch',
  cook: 'cooking', cooking: 'cooking', bake: 'cooking', baking: 'cooking',
  coffee: 'coffee', cafe: 'coffee', espresso: 'coffee', latte: 'coffee', matcha: 'coffee', tea: 'coffee',
  boba: 'boba',
  study: 'study', studying: 'studying', homework: 'homework', library: 'studying', quiet: 'studying',
  reading: 'reading', read: 'reading', exam: 'studying', midterm: 'studying', coding: 'computers', programming: 'computers',
  class: 'studying',
  social: 'social', hang: 'social', hangout: 'social', meet: 'social', chat: 'social', talk: 'social', party: 'social', friends: 'social', people: 'social',
  outdoors: 'outdoors', outdoor: 'outdoors', outside: 'outdoors', sun: 'outdoors', garden: 'outdoors', park: 'outdoors', nature: 'outdoors', picnic: 'picnic', trail: 'hike',
  walk: 'walking', walking: 'walking',
  art: 'art', draw: 'art', drawing: 'art', paint: 'art', painting: 'art', design: 'design',
  music: 'music', guitar: 'music', piano: 'music', singing: 'music', concert: 'music',
  photo: 'photography', photos: 'photography', photography: 'photography', camera: 'photography',
  movie: 'movies', movies: 'movies', film: 'movies',
  game: 'games', games: 'games', gaming: 'games', chess: 'games', cards: 'games', arcade: 'games',
  career: 'career', resume: 'resume', networking: 'networking', interview: 'career', internship: 'career',
};

const WORD = new Map();
for (const [name, words] of Object.entries(CLUSTERS)) {
  WORD.set(name, name);
  for (const word of words) WORD.set(word, word);
}
for (const [word, canon] of Object.entries(CANON)) WORD.set(word, canon);
for (const [phrase, canon] of Object.entries({
  'board games': 'games',
  'video games': 'games',
  'bubble tea': 'boba',
  'ping pong': 'sports',
  'table tennis': 'tennis',
  'problem set': 'homework',
  'weight lifting': 'fitness',
  'rock climbing': 'hiking',
})) WORD.set(phrase, canon);

const CLUSTER_OF = new Map();
for (const [name, words] of Object.entries(CLUSTERS)) {
  CLUSTER_OF.set(name, name);
  for (const word of words) CLUSTER_OF.set(word, name);
}

function canonOf(tag) {
  const key = normalizeHobby(tag);
  return WORD.get(key) || key;
}

const DISPLAY = new Map(INTERESTS.map((item) => [item.toLowerCase(), item]));
const CATALOG = [...WORD.keys()].filter((word) => !word.includes(' '));

export function normalizeHobby(text) {
  return String(text || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function hobbyLabel(id) {
  const key = normalizeHobby(id);
  if (DISPLAY.has(key)) return DISPLAY.get(key);
  if (!key) return '';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function mapHits(text) {
  const key = normalizeHobby(text);
  if (!key) return [];
  if (WORD.has(key)) return [{ id: WORD.get(key), length: key.length, at: 0 }];
  const tokens = key.match(/[a-z0-9]+/g) || [];
  const hits = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const pair = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : '';
    if (pair && WORD.has(pair)) {
      hits.push({ id: WORD.get(pair), length: pair.length, at: i });
      i += 1;
      continue;
    }
    if (WORD.has(tokens[i])) hits.push({ id: WORD.get(tokens[i]), length: tokens[i].length, at: i });
  }
  return hits;
}

export function resolveHobby(text) {
  const key = normalizeHobby(text);
  const hits = mapHits(key);
  let id = key;
  if (hits.length) {
    hits.sort((a, b) => b.length - a.length || b.at - a.at);
    id = hits[0].id;
  }
  const known = clusterOf(id) != null;
  return { id: known ? id : key, label: known ? hobbyLabel(id) : key, known };
}

function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let edits = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  edits += (a.length - i) + (b.length - j);
  return edits === 1;
}

export function suggestHobby(text) {
  const key = normalizeHobby(text);
  if (!key) return null;
  const resolved = resolveHobby(key);
  if (resolved.known && resolved.id !== key) return { id: resolved.id, label: resolved.label };
  if (key.length < 3 || key.includes(' ')) return null;
  const ids = new Set();
  for (const word of CATALOG) {
    if (!withinOneEdit(key, word)) continue;
    const id = WORD.get(word) || word;
    if (clusterOf(id) != null) ids.add(id);
  }
  if (ids.size !== 1) return null;
  const id = [...ids][0];
  if (id === key) return null;
  return { id, label: hobbyLabel(id) };
}

export function hobbyId(text) {
  return resolveHobby(text).id;
}

export function hobbyQueryLabels(hobbies) {
  const ids = new Set((hobbies || []).map((hobby) => hobbyId(hobby)).filter(Boolean));
  const labels = new Set();
  for (const hobby of hobbies || []) {
    const text = String(hobby || '').trim();
    if (text) labels.add(text);
  }
  for (const [form, canon] of WORD) {
    if (!ids.has(canon) && !ids.has(form)) continue;
    labels.add(form);
    labels.add(canon);
    labels.add(hobbyLabel(form));
    labels.add(hobbyLabel(canon));
  }
  return [...labels];
}

export function clusterOf(tag) {
  const canon = canonOf(tag);
  return CLUSTER_OF.get(canon) || CLUSTER_OF.get(String(tag || '').toLowerCase().trim()) || null;
}

export function intentsIn(text) {
  const tokens = String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const found = [];
  const seen = new Set();
  for (let i = 0; i < tokens.length; i += 1) {
    const pair = i + 1 < tokens.length ? `${tokens[i]} ${tokens[i + 1]}` : '';
    const paired = pair && WORD.get(pair);
    const hit = paired || WORD.get(tokens[i]);
    if (!hit || seen.has(hit)) {
      if (paired) i += 1;
      continue;
    }
    seen.add(hit);
    found.push(hit);
    if (paired) i += 1;
  }
  return found;
}

const RELATED = {
  fitness: ['outdoors'],
  outdoors: ['fitness', 'food', 'social'],
  food: ['social', 'outdoors'],
  social: ['food', 'creative'],
  creative: ['social'],
  study: ['career'],
  career: ['study'],
};

export function tagAffinity(a, b) {
  const x = canonOf(a);
  const y = canonOf(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const cx = clusterOf(x);
  const cy = clusterOf(y);
  if (cx && cx === cy) return 0.74;
  if (cx && cy && (RELATED[cx] || []).includes(cy)) return 0.42;
  return 0.04;
}

export function personTags(person) {
  const tags = [...(person.interests || []), ...(person.activities || [])];
  for (const hobby of person.hobbies || []) {
    const resolved = resolveHobby(hobby);
    if (resolved.known) tags.push(resolved.id);
  }
  return tags.map((t) => String(t).toLowerCase());
}

export function pairAffinity(a, b) {
  const ta = personTags(a);
  const tb = personTags(b);
  if (!ta.length || !tb.length) return 0;
  const scores = ta.map((tag) => Math.max(...tb.map((other) => tagAffinity(tag, other))));
  const mean = scores.reduce((s, n) => s + n, 0) / scores.length;
  return mean;
}

export function sharedLanguage(a, b) {
  const tb = personTags(b);
  const hits = [];
  for (const tag of personTags(a)) {
    let best = 0;
    let label = tag;
    for (const other of tb) {
      const score = tagAffinity(tag, other);
      if (score > best) {
        best = score;
        label = score === 1 ? tag : `${tag} / ${other}`;
      }
    }
    if (best >= 0.42 && !hits.some((h) => h.label === label)) hits.push({ label, best });
  }
  hits.sort((x, y) => y.best - x.best);
  return hits.slice(0, 2).map((h) => h.label);
}

export const PEERS = [
  { id: 'jordan', name: 'Jordan Kim', major: 'Kinesiology', zone: 'gym', energy: 'high', setting: 'outdoors', interests: ['Fitness', 'Running', 'Food'], hobbies: ['Basketball', 'Coffee'], activities: ['Fitness', 'Food'], availability: { days: [1, 2, 3, 4, 5], bands: ['morning', 'lunch', 'afternoon'] }, vibe: 'Sweat, then food' },
  { id: 'priya', name: 'Priya Shah', major: 'Biology', zone: 'science', energy: 'calm', setting: 'either', interests: ['Food', 'Studying', 'Coffee'], hobbies: ['Games', 'Walking'], activities: ['Food', 'Studying'], availability: { days: [1, 2, 3, 4, 5], bands: ['lunch', 'afternoon'] }, vibe: 'Calm pace, good snacks' },
  { id: 'maya', name: 'Maya Lopez', major: 'Computer Science', zone: 'library', energy: 'mixed', setting: 'either', interests: ['Studying', 'Fitness', 'Coffee'], hobbies: ['Walking', 'Music'], activities: ['Studying', 'Fitness'], availability: { days: [1, 2, 4, 5], bands: ['lunch', 'afternoon', 'evening'] }, vibe: 'Will leave the library for a walk' },
  { id: 'sam', name: 'Sam Nguyen', major: 'Business', zone: 'union', energy: 'mixed', setting: 'indoors', interests: ['Career', 'Food', 'Coffee'], hobbies: ['Games', 'Movies'], activities: ['Social', 'Food'], availability: { days: [2, 3, 4, 5], bands: ['lunch', 'afternoon', 'evening'] }, vibe: 'Easy to talk to' },
  { id: 'elena', name: 'Elena Vasquez', major: 'Art', zone: 'quad', energy: 'calm', setting: 'outdoors', interests: ['Art', 'Photography', 'Music'], hobbies: ['Walking', 'Coffee'], activities: ['Outdoors', 'Social'], availability: { days: [1, 3, 4, 5, 6], bands: ['afternoon', 'evening'] }, vibe: 'Would rather be outside' },
  { id: 'noah', name: 'Noah Abebe', major: 'Computer Science', zone: 'library', energy: 'calm', setting: 'indoors', interests: ['Studying', 'Games', 'Music'], hobbies: ['Coffee', 'Movies'], activities: ['Studying', 'Games'], availability: { days: [1, 2, 3, 4], bands: ['afternoon', 'evening'] }, vibe: 'Quiet until the game starts' },
  { id: 'hana', name: 'Hana Ito', major: 'Kinesiology', zone: 'gym', energy: 'high', setting: 'outdoors', interests: ['Fitness', 'Basketball', 'Food'], hobbies: ['Running', 'Outdoors'], activities: ['Fitness'], availability: { days: [1, 2, 3, 4, 5], bands: ['morning', 'afternoon'] }, vibe: 'Already in gym clothes' },
  { id: 'luis', name: 'Luis Ortega', major: 'Biology', zone: 'science', energy: 'mixed', setting: 'either', interests: ['Studying', 'Food', 'Outdoors'], hobbies: ['Walking', 'Photography'], activities: ['Food', 'Studying'], availability: { days: [1, 2, 3, 4, 5], bands: ['lunch', 'afternoon'] }, vibe: 'Down for lunch near lab' },
  { id: 'alex', name: 'Alex Morgan', major: 'Business', zone: 'union', energy: 'high', setting: 'either', interests: ['Social', 'Music', 'Food'], hobbies: ['Games', 'Basketball'], activities: ['Social', 'Games'], availability: { days: [3, 4, 5, 6], bands: ['afternoon', 'evening'] }, vibe: 'Will rally a table' },
  { id: 'chris', name: 'Chris Patel', major: 'Computer Science', zone: 'quad', energy: 'mixed', setting: 'outdoors', interests: ['Walking', 'Coffee', 'Career'], hobbies: ['Fitness', 'Music'], activities: ['Outdoors', 'Food'], availability: { days: [1, 2, 4, 5], bands: ['morning', 'lunch'] }, vibe: 'A loop, then coffee' },
];

