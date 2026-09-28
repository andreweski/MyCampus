import {
  campusById, campusForEmail, customPlacesFrom, hobbyId, hobbyQueryLabels, placeById, placeOrderFrom,
  PEERS, rememberCampus, schoolIdFromEmail, userPlaces,
} from './data.js';
import { DOWNLOAD_CAP, PAIR_POOL, nextOpenDay, recommend, searchSizes, windowBands } from './match.js';
import {
  cancelMeetup, completeMeetup, createMeetup, fetchInviteFor, fetchMeetup, updateMemberStatus,
} from './meetup.js';
import { isDemoAccount, isDemoPeerId, isLiveUserId, DEMO_ID_BY_SLUG } from './privacy.js';
import { isSupabaseConfigured, supabase } from './supabase.js';

const KEY = 'mycampus.v1';
const ACCOUNTS = 'mycampus.accounts';

const empty = {
  userId: null,
  accountEmail: null,
  profile: null,
  passed: [],
  history: [],
  rewards: { xp: 0, streak: 0, lastDay: null, badges: [], people: [] },
  recommendation: null,
  plan: null,
  invite: null,
  justRewarded: null,
  ask: null,
  signupConfirmed: true,
  campus: { conquered: [], preferred: [] },
  school: null,
  campusCatalog: null,
  campusLoading: false,
  campusMissing: false,
  searching: false,
};

let state = load();
let pool = [];
let rarity = null;
let shortlist = [];
let shortlistKey = '';
const listeners = new Set();

function rowToPerson(row) {
  return {
    id: row.id,
    name: row.name,
    major: row.major || '',
    hobbies: row.hobbies || [],
    activities: row.activities || [],
    interests: [],
    energy: row.energy || 'mixed',
    setting: row.setting || 'either',
    groupSize: row.availability?.groupSize ?? (row.group_size == null ? 0 : row.group_size),
    groupFlex: row.availability?.groupFlex || 'exact',
    groupSizes: Array.isArray(row.availability?.groupSizes) ? row.availability.groupSizes : null,
    bio: row.availability?.bio || '',
    zone: row.zone || 'union',
    school: row.school || null,
    availability: row.availability || { days: [], bands: [] },
    vibe: 'On campus',
  };
}

async function loadPool() {
  if (!isSupabaseConfigured) {
    pool = [];
    return;
  }
  const { data } = await supabase.from('profiles').select('id,name,major,hobbies,activities,energy,setting,group_size,zone,school,availability').not('name', 'is', null);
  pool = (data || []).filter((row) => row.name).map(rowToPerson);
}

function storedGroupSize(profile) {
  if (profile.groupFlex === 'any') return null;
  const sizes = Array.isArray(profile.groupSizes) ? profile.groupSizes : [];
  const small = sizes.find((n) => n >= 2 && n <= 4);
  if (small) return small;
  const one = Math.round(Number(profile.groupSize));
  if (one >= 2 && one <= 4) return one;
  return null;
}

let lastPersistUser = '';
let lastProfileWrite = '';
let lastPrivateWrite = '';

function profileRow(next) {
  const profile = next.profile;
  return {
    id: next.userId,
    name: profile.name,
    major: profile.major || '',
    hobbies: profile.hobbies || [],
    activities: profile.activities || [],
    energy: profile.energy || 'mixed',
    setting: profile.setting || 'either',
    group_size: storedGroupSize(profile),
    zone: profile.zone || 'union',
    school: profile.school || null,
    availability: {
      ...(profile.availability || { days: [], bands: [] }),
      groupFlex: profile.groupFlex || 'sizes',
      groupSize: profile.groupFlex === 'any' ? 0 : Math.max(2, Number(profile.groupSize) || 3),
      groupSizes: profile.groupFlex === 'any' ? [] : (profile.groupSizes || []),
      bio: (profile.bio || '').trim().slice(0, 400),
    },
  };
}

function privateRow(next) {
  return {
    id: next.userId,
    passed: next.passed,
    history: next.history,
    rewards: { ...(next.rewards || {}), campus: next.campus || { conquered: [], preferred: [] } },
    recommendation: next.recommendation,
    plan: next.plan,
    ask: next.ask,
  };
}

function rememberPersist(next) {
  lastPersistUser = next.userId || '';
  lastProfileWrite = next.userId && next.profile ? JSON.stringify(profileRow(next)) : '';
  lastPrivateWrite = next.userId ? JSON.stringify(privateRow(next)) : '';
}

function persist(next) {
  if (!isSupabaseConfigured || !next.userId || !next.profile || next.searching) return;
  if (lastPersistUser !== next.userId) {
    lastPersistUser = next.userId;
    lastProfileWrite = '';
    lastPrivateWrite = '';
  }
  const profile = profileRow(next);
  const priv = privateRow(next);
  const profileKey = JSON.stringify(profile);
  const privateKey = JSON.stringify(priv);
  if (profileKey !== lastProfileWrite) {
    lastProfileWrite = profileKey;
    void supabase.from('profiles').upsert(profile).then(({ error }) => {
      if (error && lastProfileWrite === profileKey) lastProfileWrite = '';
    });
  }
  if (privateKey !== lastPrivateWrite) {
    lastPrivateWrite = privateKey;
    void supabase.from('private_state').upsert(priv).then(({ error }) => {
      if (error && lastPrivateWrite === privateKey) lastPrivateWrite = '';
    });
  }
}

function campusOf(raw) {
  const campus = raw?.campus || {};
  return {
    conquered: Array.isArray(campus.conquered) ? campus.conquered : [],
    preferred: Array.isArray(campus.preferred) ? campus.preferred : [],
  };
}

function rewardsOf(raw) {
  const rewards = { ...empty.rewards, ...(raw || {}) };
  delete rewards.campus;
  return rewards;
}
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return structuredClone(empty);
    return {
      ...structuredClone(empty),
      ...saved,
      rewards: rewardsOf(saved.rewards),
      campus: campusOf(saved.campus || saved.rewards),
    };
  } catch {
    return structuredClone(empty);
  }
}

function readAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS) || '{}');
  } catch {
    return {};
  }
}

function snapshotAccount(next) {
  if (!next.accountEmail) return;
  const all = readAccounts();
  const prev = all[next.accountEmail] || {};
  all[next.accountEmail] = {
    email: next.accountEmail,
    passwordHash: prev.passwordHash,
    profile: next.profile,
    passed: next.passed,
    history: next.history,
    rewards: next.rewards,
    campus: next.campus,
    recommendation: next.recommendation,
    plan: next.plan,
    ask: next.ask,
  };
  localStorage.setItem(ACCOUNTS, JSON.stringify(all));
}

function emit(next) {
  state = next;
  if (!isSupabaseConfigured) {
    localStorage.setItem(KEY, JSON.stringify(state));
    snapshotAccount(next);
  }
  persist(next);
  listeners.forEach((fn) => fn());
}

async function loadCachedCampus(id) {
  if (!isSupabaseConfigured || !id) return null;
  const { data } = await supabase.from('campuses').select('*').eq('id', id).maybeSingle();
  if (!data?.places?.length) return null;
  return rememberCampus({
    id: data.id,
    name: data.name,
    domains: data.domains || [data.id],
    defaultZone: data.default_zone || data.places[0]?.zone || 'main',
    zones: data.zones || [],
    near: data.near || {},
    places: data.places,
    activities: data.activities || [],
    lat: data.lat,
    lng: data.lng,
    source: data.source || 'cache',
  });
}

async function saveCampusCache(campus) {
  if (!isSupabaseConfigured || !campus?.id || !campus.places?.length) return;
  await supabase.from('campuses').upsert({
    id: campus.id,
    name: campus.name,
    domains: campus.domains || [campus.id],
    default_zone: campus.defaultZone || campus.places[0]?.zone || 'main',
    zones: campus.zones || [],
    near: campus.near || {},
    places: campus.places,
    activities: campus.activities || [],
    lat: campus.lat ?? null,
    lng: campus.lng ?? null,
    source: campus.source || 'geoapify',
    updated_at: new Date().toISOString(),
  });
}

export async function ensureCampusCatalog(schoolId, options = {}) {
  const id = schoolId || state.school;
  const name = String(options.name || '').trim();
  if (!id) return null;
  const known = campusById(id);
  if (known?.places?.length && known.source === 'geoapify' && (!name || known.name === name)) {
    emit({ ...state, school: id, campusCatalog: known, campusLoading: false, campusMissing: false });
    return known;
  }
  emit({ ...state, school: id, campusLoading: true, campusMissing: false });
  let campus = (!name || known?.name === name) ? await loadCachedCampus(id) : null;
  if (campus && campus.source !== 'geoapify') campus = null;
  if (!campus?.places?.length) {
    const query = new URLSearchParams({ domain: id });
    if (name) query.set('name', name);
    const response = await fetch(`/api/campus?${query}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.campus) {
      emit({ ...state, school: id, campusLoading: false, campusMissing: true, campusCatalog: null });
      return null;
    }
    campus = rememberCampus(payload.campus);
    await saveCampusCache(campus);
  }
  emit({ ...state, school: id, campusCatalog: campus, campusLoading: false, campusMissing: false });
  return campus;
}

async function hydrate(user) {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const { data: priv } = await supabase.from('private_state').select('*').eq('id', user.id).maybeSingle();
  const suggested = schoolIdFromEmail(user.email);
  const school = profile?.school || suggested || null;
  const person = profile?.name ? rowToPerson({ ...profile, school: profile.school || school }) : null;
  const rawRewards = priv?.rewards || {};
  const passed = priv?.passed || [];
  const history = priv?.history || [];
  const ask = priv?.ask || null;
  const campus = campusOf(rawRewards);
  const next = {
    ...structuredClone(empty),
    userId: user.id,
    accountEmail: user.email,
    profile: person,
    passed,
    history,
    rewards: rewardsOf(rawRewards),
    campus,
    school: person?.school || suggested,
    campusMissing: false,
    recommendation: priv?.recommendation || null,
    plan: priv?.plan || null,
    ask,
    signupConfirmed: priv?.signup_confirmed !== false,
    searching: Boolean(person && !priv?.recommendation && !priv?.plan),
  };
  rememberPersist(next);
  emit(next);
  shortlistKey = '';
  shortlist = null;
  if (person?.school) await ensureCampusCatalog(person.school);
  startMeetupPoll();
  await refreshMeetupState();
  const current = getState();
  if (person && !current.plan && !current.invite && !current.recommendation) {
    requestRecommendation(person, { passed, history, ask, preferred: campus.preferred }, {});
  }
}

export async function init() {
  if (!isSupabaseConfigured) return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) await hydrate(data.session.user);
  else state = structuredClone(empty);
}

export async function signUpWithSupabase(email, password) {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.edu$/i.test(address)) {
    return { ok: false, error: 'Use a school email that ends in .edu.' };
  }
  const campus = campusForEmail(address);
  if (!campus?.id) return { ok: false, error: 'Use a school email that ends in .edu.' };
  const { data, error } = await supabase.auth.signUp({ email: address, password });
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: true, pending: true };
  await supabase.from('profiles').upsert({ id: data.user.id, school: campus.id });
  await supabase.from('private_state').upsert({ id: data.user.id, signup_confirmed: false });
  await hydrate(data.user);
  return { ok: true };
}

async function codeHash(code) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sendSignupCode() {
  if (!state.userId) return { ok: false, error: 'Create an account first.' };
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { error } = await supabase.from('private_state').update({
    confirm_code_hash: await codeHash(code),
    confirm_code_expires: expires,
  }).eq('id', state.userId);
  if (error) return { ok: false, error: error.message };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const response = await fetch('/api/send-code', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, error: payload.error || 'The code could not be sent.' };
  return { ok: true };
}

export async function confirmSignupCode(typed) {
  const code = typed.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Enter the 6-digit code from the email.' };
  const { data, error } = await supabase.from('private_state').select('confirm_code_hash, confirm_code_expires').eq('id', state.userId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.confirm_code_expires || new Date(data.confirm_code_expires).getTime() < Date.now()) {
    return { ok: false, error: 'That code expired. Send a new one.' };
  }
  if (data.confirm_code_hash !== await codeHash(code)) return { ok: false, error: 'That code does not match.' };
  const saved = await supabase.from('private_state').update({
    signup_confirmed: true,
    confirm_code_hash: null,
    confirm_code_expires: null,
  }).eq('id', state.userId);
  if (saved.error) return { ok: false, error: saved.error.message };
  emit({ ...state, signupConfirmed: true });
  return { ok: true };
}

export async function logInWithSupabase(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) {
    const unconfirmed = /not confirmed/i.test(error.message);
    return { ok: false, error: unconfirmed ? 'Confirm that email first, then log in.' : error.message };
  }
  await hydrate(data.user);
  return { ok: true };
}

export function signUp(email, passwordHash) {
  const key = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.edu$/i.test(key)) {
    return { ok: false, error: 'Use a school email that ends in .edu.' };
  }
  const campus = campusForEmail(key);
  if (!campus?.id) return { ok: false, error: 'Use a school email that ends in .edu.' };
  const all = readAccounts();
  if (all[key]) return { ok: false, error: 'That email already has an account. Log in instead.' };
  all[key] = { email: key, passwordHash, profile: null, school: campus.id };
  localStorage.setItem(ACCOUNTS, JSON.stringify(all));
  emit({ ...structuredClone(empty), accountEmail: key, school: campus.id });
  void ensureCampusCatalog(campus.id);
  return { ok: true };
}

export function logIn(email, passwordHash) {
  const key = email.trim().toLowerCase();
  const account = readAccounts()[key];
  if (!account || account.passwordHash !== passwordHash) {
    return { ok: false, error: 'Email or password does not match.' };
  }
  const school = schoolIdFromEmail(key) || account.school || account.profile?.school || null;
  if (!school) {
    emit({ ...structuredClone(empty), accountEmail: key, campusMissing: true });
    return { ok: true };
  }
  emit({
    ...structuredClone(empty),
    accountEmail: key,
    school,
    profile: account.profile ? { ...account.profile, school } : null,
    passed: account.passed || [],
    history: account.history || [],
    rewards: rewardsOf(account.rewards),
    campus: campusOf(account.campus || account.rewards),
    recommendation: account.recommendation || null,
    plan: account.plan || null,
    ask: account.ask || null,
  });
  void ensureCampusCatalog(school);
  return { ok: true };
}

export async function logOut() {
  searchToken += 1;
  stopMeetupPoll();
  if (isSupabaseConfigured) await supabase.auth.signOut();
  emit(structuredClone(empty));
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

let searchToken = 0;
let matchWorker;
let matchJob = 0;
const matchWaiters = new Map();

function matchWorkerOf() {
  if (matchWorker) return matchWorker;
  matchWorker = new Worker(new URL('./match.worker.js', import.meta.url), { type: 'module' });
  matchWorker.onmessage = (event) => {
    const job = matchWaiters.get(event.data?.id);
    if (!job) return;
    matchWaiters.delete(event.data.id);
    if (event.data.error) job.reject(new Error(event.data.error));
    else job.resolve(event.data.result || null);
  };
  matchWorker.onerror = () => {
    for (const job of matchWaiters.values()) job.reject(new Error('match worker failed'));
    matchWaiters.clear();
    matchWorker = null;
  };
  return matchWorker;
}

function recommendOffThread(profile, options) {
  const now = options.now ? new Date(options.now) : new Date();
  const runHere = () => recommend(profile, { ...options, now });
  if (typeof Worker === 'undefined') return Promise.resolve(runHere());
  try {
    const id = ++matchJob;
    return new Promise((resolve, reject) => {
      matchWaiters.set(id, { resolve, reject });
      const want = profile?.school;
      const catalog = options.campus?.id === want
        ? options.campus
        : (state.campusCatalog?.id === want ? state.campusCatalog : null)
          || campusById(want)
          || options.campus
          || state.campusCatalog
          || null;
      const message = {
        id,
        profile,
        options: {
          passed: options.passed || [],
          history: options.history || [],
          ask: options.ask || null,
          now: now.toISOString(),
          rarity: options.rarity || null,
          census: options.census || null,
          campus: catalog,
        },
      };
      if (options.peers) message.options.peers = options.peers;
      matchWorkerOf().postMessage(message);
    });
  } catch {
    return Promise.resolve(runHere());
  }
}

function bandsFor(profile, ask) {
  if (ask?.start == null || ask?.end == null) return profile.availability?.bands || [];
  return windowBands(ask.start, ask.end);
}

function searchDay(profile, ask) {
  if (Number.isInteger(ask?.day)) return ask.day;
  return nextOpenDay(profile, new Date());
}

function searchKey(profile, ask) {
  const day = searchDay(profile, ask);
  const bands = bandsFor(profile, ask).slice().sort().join(',');
  const hobbies = (profile.hobbies || []).map((hobby) => hobbyId(hobby)).filter(Boolean).sort().join(',');
  const plans = (profile.activities || []).map((item) => String(item).toLowerCase()).sort().join(',');
  const sizes = searchSizes(profile);
  const sizeKey = sizes ? sizes.join(',') : 'any';
  return `${profile.id}|${day}|${bands}|${hobbies}|${plans}|${sizeKey}`;
}

function shortlistLimit(profile) {
  const sizes = (searchSizes(profile) || []).filter((size) => size <= DOWNLOAD_CAP);
  const wanted = sizes.length ? Math.max(...sizes) : 0;
  if (!Number.isFinite(wanted) || wanted <= PAIR_POOL) return PAIR_POOL;
  return wanted;
}

function passedPeople(passed) {
  const ids = new Set();
  for (const key of passed || []) {
    for (const id of String(key).split('|')[0].split('.')) if (id) ids.add(id);
  }
  return ids;
}

function planQueryLabels(activities) {
  const labels = new Set();
  for (const item of activities || []) {
    const text = String(item || '').trim();
    if (!text) continue;
    labels.add(text);
    labels.add(text.toLowerCase());
    labels.add(text.charAt(0).toUpperCase() + text.slice(1).toLowerCase());
  }
  return [...labels];
}

async function loadRarity() {
  const [{ data: rows, error: rowError }, { data: stats, error: statsError }] = await Promise.all([
    supabase.from('hobby_stats').select('id,seen'),
    supabase.from('campus_stats').select('profiles').eq('id', 1).maybeSingle(),
  ]);
  if (rowError || statsError || !stats?.profiles) return null;
  return {
    total: stats.profiles,
    counts: Object.fromEntries((rows || []).map((row) => [row.id, row.seen])),
  };
}

async function fetchShortlist(profile, ask) {
  const day = searchDay(profile, ask);
  const bands = bandsFor(profile, ask);
  if (day == null || !bands.length) return [];
  const { data, error } = await supabase.rpc('match_candidates', {
    match_day: day,
    match_bands: bands,
    hobby_labels: hobbyQueryLabels(profile.hobbies || []),
    plan_labels: planQueryLabels(profile.activities || []),
    lim: shortlistLimit(profile),
  });
  if (error) return null;
  return (data || []).filter((row) => row.name && row.id !== profile.id).map(rowToPerson);
}

function censusWindows(profile, ask) {
  if (ask?.start != null && ask?.end != null) return [{ key: 'ask', bands: windowBands(ask.start, ask.end) }];
  return (profile.availability?.bands || []).map((band) => ({ key: band, bands: [band] }));
}

async function fetchCensus(profile, ask, sizes) {
  const day = searchDay(profile, ask);
  const windows = censusWindows(profile, ask).filter((window) => window.bands.length);
  if (day == null || !windows.length || !sizes.length) return {};
  const hobbyLabels = hobbyQueryLabels(profile.hobbies || []);
  const planLabels = planQueryLabels(profile.activities || []);
  const census = {};
  await Promise.all(sizes.flatMap((size) => windows.map(async (window) => {
    const { data, error } = await supabase.rpc('match_crowd', {
      match_day: day,
      match_bands: window.bands,
      hobby_labels: hobbyLabels,
      plan_labels: planLabels,
      wanted: size,
    });
    if (!census[size]) census[size] = {};
    if (error || !data) {
      census[size][window.key] = null;
      return;
    }
    const sample = Array.isArray(data.sample) ? data.sample : [];
    census[size][window.key] = {
      count: Number(data.count) || 0,
      sample: sample.filter((row) => row?.name && row.id !== profile.id).map(rowToPerson),
    };
  })));
  return census;
}

function demoPeerPool(profile) {
  return PEERS.map((peer) => ({
    ...peer,
    id: DEMO_ID_BY_SLUG[peer.id] || peer.id,
    school: peer.school || profile.school || null,
    groupFlex: 'any',
    groupSize: 0,
    groupSizes: [],
    demo: true,
  }));
}

function withoutDemoPeers(list) {
  return (list || []).filter((peer) => !isDemoPeerId(peer.id));
}

async function peersForSearch(profile, ask) {
  // Demo login only meets seed classmates. Same recommend() path, separate pool.
  if (isDemoAccount(state.accountEmail)) {
    const peers = demoPeerPool(profile);
    shortlist = peers;
    shortlistKey = searchKey(profile, ask);
    return shortlist;
  }

  if (!isSupabaseConfigured) return undefined;
  const key = searchKey(profile, ask);
  if (shortlistKey === key) return shortlist;
  const sizes = searchSizes(profile);
  const countable = (sizes || []).filter((size) => size > DOWNLOAD_CAP);
  const listed = !sizes || sizes.some((size) => size <= DOWNLOAD_CAP);
  const needRarity = !rarity;
  const [loaded, rows, census] = await Promise.all([
    needRarity ? loadRarity() : null,
    listed ? fetchShortlist(profile, ask) : [],
    countable.length ? fetchCensus(profile, ask, countable) : null,
  ]);
  if (needRarity && loaded) rarity = loaded;
  let peers;
  if (rows == null) {
    await loadPool();
    peers = withoutDemoPeers(keepCampus(profile, pool));
  } else {
    peers = withoutDemoPeers(keepCampus(profile, rows));
  }
  // Empty campus: fall back to demo classmates so matching still runs.
  if (!peers.length) peers = demoPeerPool(profile);
  shortlist = census ? { peers, census } : peers;
  shortlistKey = key;
  return shortlist;
}

function keepCampus(person, list) {
  if (!person?.school || !Array.isArray(list)) return list;
  const same = list.filter((peer) => peer.school === person.school);
  if (same.length) return same;
  // Older profiles may not have school set yet; keep them instead of emptying the pool.
  return list.filter((peer) => !peer.school);
}

function resolvedHobbyIds(profile) {
  return [...new Set((profile?.hobbies || []).map((hobby) => hobbyId(hobby)).filter(Boolean))];
}

async function syncHobbyCounts(previous, next, { joining = false, leaving = false } = {}) {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.rpc('sync_hobby_counts', {
    new_ids: leaving ? [] : resolvedHobbyIds(next),
    joining,
    leaving,
  });
  if (error) return;
  rarity = null;
  shortlistKey = '';
}

function requestRecommendation(profile, extra, patch) {
  if (!profile) return;
  const token = ++searchToken;
  const next = { ...state, ...patch, searching: true };
  emit(next);
  const person = { ...profile, preferredPlaces: extra.preferred || next.campus?.preferred || [] };
  const ask = extra.ask || null;
  const passed = extra.passed || [];
  peersForSearch(person, ask).then((others) => {
    if (token !== searchToken) return null;
    const skipped = passedPeople(passed);
    const packed = Array.isArray(others) || others == null ? { peers: others, census: null } : others;
    const peers = packed.peers ? packed.peers.filter((peer) => peer.id !== person.id && !skipped.has(peer.id)) : undefined;
    return recommendOffThread(person, {
      passed,
      history: extra.history || [],
      ask,
      now: new Date().toISOString(),
      peers,
      rarity,
      census: packed.census,
    });
  }).then((recommendation) => {
    if (token !== searchToken) return;
    emit({ ...state, recommendation, searching: false });
  }).catch(() => {
    if (token !== searchToken) return;
    emit({ ...state, recommendation: null, searching: false });
  });
}

function profileExtras(profile) {
  return customPlacesFrom(profile);
}

export function visibleCampus(profile, campus) {
  const saved = campus?.conquered || [];
  const conquered = saved.length
    ? [...saved]
    : userPlaces(profile?.school, profile).filter((place) => place.zone === profile?.zone).map((place) => place.id);
  return { conquered, preferred: campus?.preferred || [] };
}

export function claimPlace(id) {
  if (!placeById(id, state.profile?.school, profileExtras(state.profile)) || !state.profile) return;
  const { conquered, preferred } = visibleCampus(state.profile, state.campus);
  if (!conquered.includes(id)) conquered.push(id);
  emit({ ...state, campus: { conquered, preferred } });
}

export function preferPlace(id) {
  const extras = profileExtras(state.profile);
  const place = placeById(id, state.profile?.school, extras);
  if (!place || !state.profile) return;
  const current = state.campus?.preferred || [];
  const preferred = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  const last = preferred.length ? placeById(preferred.at(-1), state.profile.school, extras) : null;
  const zone = last?.zone || state.profile.zone;
  const profile = { ...state.profile, zone, preferredPlaces: preferred };
  const patch = {
    profile,
    campus: { conquered: state.campus?.conquered || [], preferred },
  };
  if (state.plan) {
    emit({ ...state, ...patch });
    return;
  }
  requestRecommendation(profile, {
    passed: state.passed,
    history: state.history,
    ask: state.ask,
    preferred,
  }, patch);
}

export function addCustomPlace(place) {
  if (!place?.id || !place?.name || !state.profile) return null;
  const school = state.profile.school;
  const extras = customPlacesFrom(state.profile);
  if (placeById(place.id, school, extras)) return place;
  const customPlaces = [...extras, place];
  const currentOrder = placeOrderFrom(state.profile);
  const knownIds = userPlaces(school, state.profile).map((item) => item.id);
  const placeOrder = [...(currentOrder.length ? currentOrder : knownIds), place.id];
  const availability = {
    ...(state.profile.availability || {}),
    customPlaces,
    placeOrder,
  };
  const profile = { ...state.profile, availability };
  emit({ ...state, profile });
  return place;
}

export function saveProfile(profile) {
  const previous = state.profile;
  const joining = !previous?.name && !!profile.name;
  const school = profile.school || state.school || campusForEmail(state.accountEmail)?.id || null;
  profile = { ...profile, school };
  shortlistKey = '';
  rarity = null;
  const patch = { profile, school, ask: null, passed: [] };
  const finish = () => {
    if (state.plan) {
      emit({ ...state, ...patch });
      return;
    }
    requestRecommendation(profile, { passed: [], history: state.history, ask: null }, patch);
  };
  const catalogReady = school && state.campusCatalog?.id !== school
    ? ensureCampusCatalog(school, { name: profile.schoolName })
    : Promise.resolve(state.campusCatalog);
  Promise.all([syncHobbyCounts(previous, profile, { joining }), catalogReady]).finally(finish);
}

export function askForPlan(ask) {
  requestRecommendation(state.profile, { passed: [], history: state.history, ask }, { ask, passed: [] });
}

export function clearAsk() {
  requestRecommendation(state.profile, { passed: [], history: state.history, ask: null }, { ask: null, passed: [] });
}

export function passRecommendation() {
  if (!state.recommendation || state.searching || state.recommendation.roster === 'count') return;
  const passed = [...state.passed, state.recommendation.key];
  requestRecommendation(state.profile, { passed, history: state.history, ask: state.ask }, { passed });
}

function isSyntheticPeer(peer) {
  return Boolean(peer?.synthetic || peer?.demo || isDemoPeerId(peer?.id) || (peer?.id && !isLiveUserId(peer.id)));
}

/** Demo classmates cannot log in — simulate their accepts so the demo can move. */
function scheduleDemoAccepts(planRef) {
  const id = planRef.meetupId || planRef.id;
  const pending = (planRef.peers || []).filter((peer) => (
    isSyntheticPeer(peer) && peer.status !== 'accepted' && peer.status !== 'declined'
  ));
  pending.forEach((peer, index) => {
    setTimeout(() => {
      const current = state.plan;
      if (!current) return;
      if ((current.meetupId || current.id) !== id) return;
      const still = current.peers.find((item) => item.id === peer.id);
      if (!still || still.status === 'accepted' || still.status === 'declined') return;
      emit({
        ...state,
        plan: {
          ...current,
          peers: current.peers.map((item) => (
            item.id === peer.id
              ? {
                  ...item,
                  status: 'accepted',
                  synthetic: true,
                  name: item.name || peer.name || '',
                  major: item.major || peer.major || '',
                }
              : item
          )),
        },
      });
    }, 800 + index * 650);
  });
}

export function retryDemoAccepts() {
  if (!state.plan) return;
  scheduleDemoAccepts(state.plan);
}

let meetupPoll = null;

function stopMeetupPoll() {
  if (meetupPoll) clearInterval(meetupPoll);
  meetupPoll = null;
}

function startMeetupPoll() {
  stopMeetupPoll();
  if (!isSupabaseConfigured || !state.userId) return;
  meetupPoll = setInterval(() => {
    void refreshMeetupState();
  }, 4000);
}

export async function refreshMeetupState() {
  if (!state.userId) return;
  if (state.plan?.meetupId) {
    const latest = await fetchMeetup(state.plan.meetupId, state.userId);
    if (!latest || latest.status === 'cancelled') {
      if (state.plan) {
        const passed = [...state.passed, state.plan.key];
        requestRecommendation(state.profile, { passed, history: state.history, ask: state.ask }, {
          plan: null,
          invite: null,
          passed,
        });
      }
      return;
    }
    const priorPeers = state.plan.peers || [];
    const livePeers = latest.peers.map((peer) => {
      const prior = priorPeers.find((item) => item.id === peer.id);
      // Keep a local demo accept until the row catches up (or if the guest never writes back).
      const accepted = peer.status === 'accepted'
        || (peer.status !== 'declined' && prior?.status === 'accepted');
      return {
        ...peer,
        status: peer.status === 'declined' ? 'declined' : (accepted ? 'accepted' : peer.status),
        name: accepted ? (peer.name || prior?.name || '') : (prior?.name || peer.name || ''),
        major: peer.major || prior?.major || '',
        because: prior?.because || peer.because || '',
        synthetic: false,
      };
    });
    const liveIds = new Set(livePeers.map((peer) => peer.id));
    // Keep seed classmates that never land in meetup_members.
    const syntheticPeers = priorPeers
      .filter((peer) => isSyntheticPeer(peer) && !liveIds.has(peer.id))
      .map((peer) => ({ ...peer, synthetic: true }));
    const merged = {
      ...latest,
      peers: [...livePeers, ...syntheticPeers],
    };
    emit({ ...state, plan: merged, invite: null });
    return;
  }
  if (!state.plan) {
    const invite = await fetchInviteFor(state.userId);
    if (invite?.meetupId !== state.invite?.meetupId) {
      // Same card either way — drop a solo recommendation so you don't Accept twice.
      emit({
        ...state,
        invite,
        recommendation: invite ? null : state.recommendation,
      });
    } else if (!invite && state.invite) {
      emit({ ...state, invite: null });
    }
  }
}

export async function acceptRecommendation() {
  const rec = state.recommendation;
  if (!rec || !state.profile) return;
  try {
    const created = await createMeetup({
      hostId: state.userId || `local-${state.profile.id || 'host'}`,
      hostProfile: state.profile,
      rec,
    });
    const plan = created.plan;
    emit({
      ...state,
      recommendation: null,
      invite: null,
      plan,
    });
    startMeetupPoll();
    scheduleDemoAccepts(plan);
  } catch (error) {
    console.warn(error);
    // Local fallback if the meetup tables are not applied yet.
    const plan = {
      ...rec,
      id: `local-${Date.now()}`,
      meetupId: null,
      status: 'open',
      hostId: state.userId,
      role: 'host',
      memberStatus: 'accepted',
      userHere: false,
      peers: (rec.peers || []).map((peer) => ({
        id: peer.id,
        name: peer.name,
        major: peer.major || '',
        status: 'invited',
        role: 'guest',
        here: false,
        because: peer.because || '',
        synthetic: !isLiveUserId(peer.id),
      })),
    };
    emit({ ...state, recommendation: null, invite: null, plan });
    scheduleDemoAccepts(plan);
  }
}

export async function acceptInvite() {
  const invite = state.invite;
  if (!invite || !state.userId) return;
  // Demo preview has no meetup row — just open the plan locally.
  if (!invite.meetupId) {
    const plan = {
      ...invite,
      id: invite.id || `local-${Date.now()}`,
      memberStatus: 'accepted',
      role: 'guest',
      userHere: false,
      peers: (invite.peers || []).map((peer) => ({
        ...peer,
        status: peer.synthetic || !isLiveUserId(peer.id) ? 'accepted' : peer.status,
      })),
    };
    emit({ ...state, invite: null, recommendation: null, plan });
    scheduleDemoAccepts(plan);
    return;
  }
  await updateMemberStatus(invite.meetupId, state.userId, {
    status: 'accepted',
    name: state.profile?.name || '',
    major: state.profile?.major || '',
  });
  const plan = await fetchMeetup(invite.meetupId, state.userId);
  emit({ ...state, invite: null, recommendation: null, plan });
  startMeetupPoll();
}

export async function declineInvite() {
  const invite = state.invite;
  if (!invite) return;
  if (invite.meetupId && state.userId) {
    await updateMemberStatus(invite.meetupId, state.userId, { status: 'declined' });
  }
  // Same as "Not this one" on a match — look for another plan.
  const passed = invite.key ? [...state.passed, invite.key] : state.passed;
  emit({ ...state, invite: null });
  if (state.profile) {
    requestRecommendation(state.profile, { passed, history: state.history, ask: state.ask }, { passed });
  }
}

/** Local-only: pretend Jordan Kim invited you, so you can try Accept / Decline without a second account. */
export function previewDemoInvite() {
  if (!state.profile || state.plan) return;
  const peer = PEERS.find((item) => item.id === 'jordan') || PEERS[0];
  const place = userPlaces(state.profile.school, state.profile)[0] || null;
  const day = nextOpenDay(state.profile, new Date()) ?? new Date().getDay();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const peerId = DEMO_ID_BY_SLUG[peer.id] || peer.id;
  emit({
    ...state,
    recommendation: null,
    invite: {
      id: `demo-invite-${Date.now()}`,
      meetupId: null,
      key: `demo-invite-${Date.now()}`,
      title: 'Coffee',
      line: 'A short meetup near campus.',
      activityId: 'coffee',
      place,
      start: 14 * 60,
      end: 15 * 60,
      day,
      dayLabel: dayNames[day] || 'Today',
      school: state.profile.school,
      roster: 'names',
      crowdCount: 2,
      why: '',
      status: 'open',
      hostId: peerId,
      role: 'guest',
      memberStatus: 'invited',
      userHere: false,
      peers: [{
        id: peerId,
        name: peer.name,
        major: peer.major || '',
        status: 'invited',
        role: 'guest',
        here: false,
        because: peer.vibe || 'Free in the same window',
        synthetic: true,
        demo: true,
      }],
    },
  });
}

export async function cancelPlan() {
  const plan = state.plan;
  if (!plan) return;
  if (plan.meetupId && plan.role === 'host') {
    await cancelMeetup(plan.meetupId, state.userId);
  } else if (plan.meetupId && state.userId) {
    await updateMemberStatus(plan.meetupId, state.userId, { status: 'declined' });
  }
  stopMeetupPoll();
  const passed = plan ? [...state.passed, plan.key] : state.passed;
  requestRecommendation(state.profile, { passed, history: state.history, ask: state.ask }, {
    plan: null,
    invite: null,
    passed,
  });
}

export function markHere() {
  if (!state.plan || state.plan.userHere) return;
  const plan = { ...state.plan, userHere: true };
  emit({ ...state, plan });
  if (plan.meetupId && state.userId) {
    void updateMemberStatus(plan.meetupId, state.userId, { here: true });
  }
  // Synthetic classmates can check in after you do.
  const synth = (plan.peers || []).filter((peer) => peer.synthetic && peer.status === 'accepted' && !peer.here);
  if (synth.length) {
    setTimeout(() => {
      if (!state.plan || state.plan.id !== plan.id) return;
      markPeerHere(synth[0].id);
    }, 1100);
  }
}

export function markPeerHere(id) {
  if (!state.plan) return;
  const peers = state.plan.peers.map((p) => (p.id === id ? { ...p, here: true, status: p.status === 'invited' ? 'accepted' : p.status } : p));
  emit({
    ...state,
    plan: {
      ...state.plan,
      peers,
    },
  });
}

const BADGES = [
  { id: 'first-hello', name: 'First hello', detail: 'You showed up to a plan.', need: (r, n) => n >= 1 },
  { id: 'showed-up', name: 'Showed up', detail: 'Three plans, actually met.', need: (r, n) => n >= 3 },
  { id: 'new-circle', name: 'New circle', detail: 'Five different people.', need: (r) => r.people.length >= 5 },
  { id: 'streak-3', name: 'Three-day streak', detail: 'Met someone three days running.', need: (r) => r.streak >= 3 },
  { id: 'regular', name: 'Campus regular', detail: '200 XP on the quad.', need: (r) => r.xp >= 200 },
];

let completing = false;

export function completePlan() {
  const plan = state.plan;
  if (completing || !plan || plan.settled) return;
  if (!plan.userHere || !plan.peers.some((p) => p.here)) return;
  completing = true;
  stopMeetupPoll();
  if (plan.meetupId) void completeMeetup(plan.meetupId);

  const today = dayKey();
  const rewards = { ...state.rewards, badges: [...state.rewards.badges], people: [...state.rewards.people] };
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const prev = dayKey(yesterday);
  rewards.streak = rewards.lastDay === today ? rewards.streak : rewards.lastDay === prev ? rewards.streak + 1 : 1;
  rewards.lastDay = today;
  const gained = 40 + Math.min(20, (rewards.streak - 1) * 10);
  rewards.xp += gained;
  for (const peer of plan.peers) {
    if (!rewards.people.includes(peer.id)) rewards.people.push(peer.id);
  }
  const completions = state.history.filter((h) => h.status === 'completed').length + 1;
  const earned = BADGES.filter((b) => !rewards.badges.includes(b.id) && b.need(rewards, completions)).map((b) => b.id);
  rewards.badges.push(...earned);

  const hobbyIds = (state.profile.hobbies || []).map((hobby) => hobbyId(hobby));
  const availability = { ...(state.profile.availability || {}) };
  const outings = { ...(availability.outings || {}) };
  for (const id of hobbyIds) {
    const row = { ...(outings[id] || {}) };
    row[plan.activityId] = (row[plan.activityId] || 0) + 1;
    outings[id] = row;
  }
  availability.outings = outings;
  const profile = { ...state.profile, availability };
  const history = [...state.history, {
    peerIds: plan.peers.map((p) => p.id),
    activityId: plan.activityId,
    hobbyIds,
    status: 'completed',
    at: new Date().toISOString(),
  }];

  const revealed = plan.peers
    .filter((p) => p.status === 'accepted' || p.synthetic)
    .map((p) => (p.name || '').split(' ')[0])
    .filter(Boolean);

  const passed = state.passed;
  requestRecommendation(profile, { passed, history, ask: null }, {
    profile,
    rewards,
    history,
    plan: null,
    invite: null,
    justRewarded: {
      xp: gained,
      streak: rewards.streak,
      badge: earned[0] || null,
      title: plan.title,
      people: revealed.length ? revealed : ['your group'],
    },
    ask: null,
    passed: [],
  });
  completing = false;
}

export async function noteOpenHobby(phrase) {
  if (!isSupabaseConfigured || !phrase) return;
  const { data, error } = await supabase.from('open_hobbies').select('count').eq('phrase', phrase).maybeSingle();
  if (error) return;
  if (!data) await supabase.from('open_hobbies').insert({ phrase, count: 1 });
  else await supabase.from('open_hobbies').update({ count: data.count + 1 }).eq('phrase', phrase);
}

export function dismissReward() {
  emit({ ...state, justRewarded: null });
}

export async function resetAll() {
  searchToken += 1;
  stopMeetupPoll();
  if (isSupabaseConfigured && state.userId) {
    await syncHobbyCounts(state.profile, null, { leaving: true });
    await supabase.from('private_state').delete().eq('id', state.userId);
    await supabase.from('profiles').delete().eq('id', state.userId);
    await supabase.auth.signOut();
  } else if (state.accountEmail) {
    const all = readAccounts();
    delete all[state.accountEmail];
    localStorage.setItem(ACCOUNTS, JSON.stringify(all));
    localStorage.removeItem(KEY);
  }
  emit(structuredClone(empty));
}

export function badgeMeta(id) {
  return BADGES.find((b) => b.id === id);
}

export const ALL_BADGES = BADGES;

export function profileEffect(rewards) {
  if (!rewards) return '';
  if (rewards.badges.includes('regular') || rewards.streak >= 3) return 'glow';
  if (rewards.badges.includes('first-hello')) return 'ring';
  return '';
}
