import { PLACES, hobbyId, hobbyQueryLabels, placeById } from './data.js';
import { DOWNLOAD_CAP, PAIR_POOL, nextOpenDay, recommend, searchSizes, windowBands } from './match.js';
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
  justRewarded: null,
  ask: null,
  signupConfirmed: true,
  campus: { conquered: [], preferred: [] },
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
    availability: row.availability || { days: [], bands: [] },
    vibe: 'On campus',
  };
}

async function loadPool() {
  if (!isSupabaseConfigured) {
    pool = [];
    return;
  }
  const { data } = await supabase.from('profiles').select('id,name,major,hobbies,activities,energy,setting,group_size,zone,availability').not('name', 'is', null);
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

async function hydrate(user) {
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const { data: priv } = await supabase.from('private_state').select('*').eq('id', user.id).maybeSingle();
  const person = profile?.name ? rowToPerson(profile) : null;
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
    recommendation: priv?.recommendation || null,
    plan: priv?.plan || null,
    ask,
    signupConfirmed: priv?.signup_confirmed !== false,
    searching: Boolean(person && !priv?.recommendation && !priv?.plan),
  };
  rememberPersist(next);
  emit(next);
  if (person && !priv?.recommendation && !priv?.plan) {
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
  const { data, error } = await supabase.auth.signUp({ email: address, password });
  if (error) return { ok: false, error: error.message };
  if (!data.session) return { ok: true, pending: true };
  await supabase.from('profiles').upsert({ id: data.user.id });
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
  const all = readAccounts();
  if (all[key]) return { ok: false, error: 'That email already has an account. Log in instead.' };
  all[key] = { email: key, passwordHash, profile: null };
  localStorage.setItem(ACCOUNTS, JSON.stringify(all));
  emit({ ...structuredClone(empty), accountEmail: key });
  return { ok: true };
}

export function logIn(email, passwordHash) {
  const key = email.trim().toLowerCase();
  const account = readAccounts()[key];
  if (!account || account.passwordHash !== passwordHash) {
    return { ok: false, error: 'Email or password does not match.' };
  }
  emit({
    ...structuredClone(empty),
    accountEmail: key,
    profile: account.profile || null,
    passed: account.passed || [],
    history: account.history || [],
    rewards: rewardsOf(account.rewards),
    campus: campusOf(account.campus || account.rewards),
    recommendation: account.recommendation || null,
    plan: account.plan || null,
    ask: account.ask || null,
  });
  return { ok: true };
}

export async function logOut() {
  searchToken += 1;
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

async function peersForSearch(profile, ask) {
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
  if (rows == null) {
    await loadPool();
    shortlist = census ? { peers: pool, census } : pool;
    shortlistKey = key;
    return shortlist;
  }
  shortlist = census ? { peers: rows, census } : rows;
  shortlistKey = key;
  return shortlist;
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

export function visibleCampus(profile, campus) {
  const saved = campus?.conquered || [];
  const conquered = saved.length
    ? [...saved]
    : PLACES.filter((place) => place.zone === profile?.zone).map((place) => place.id);
  return { conquered, preferred: campus?.preferred || [] };
}

export function claimPlace(id) {
  if (!placeById(id) || !state.profile) return;
  const { conquered, preferred } = visibleCampus(state.profile, state.campus);
  if (!conquered.includes(id)) conquered.push(id);
  emit({ ...state, campus: { conquered, preferred } });
}

export function preferPlace(id) {
  const place = placeById(id);
  if (!place || !state.profile) return;
  const current = state.campus?.preferred || [];
  const preferred = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
  const zone = preferred.length ? placeById(preferred.at(-1)).zone : state.profile.zone;
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

export function saveProfile(profile) {
  const previous = state.profile;
  const joining = !previous?.name && !!profile.name;
  shortlistKey = '';
  rarity = null;
  const patch = { profile, ask: null, passed: [] };
  const finish = () => {
    if (state.plan) {
      emit({ ...state, ...patch });
      return;
    }
    requestRecommendation(profile, { passed: [], history: state.history, ask: null }, patch);
  };
  syncHobbyCounts(previous, profile, { joining }).finally(finish);
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

export function acceptRecommendation() {
  const rec = state.recommendation;
  if (!rec) return;
  emit({
    ...state,
    recommendation: null,
    plan: {
      ...rec,
      userHere: false,
      peers: rec.peers.map((p) => ({ ...p, here: false })),
    },
  });
}

export function cancelPlan() {
  const plan = state.plan;
  const passed = plan ? [...state.passed, plan.key] : state.passed;
  requestRecommendation(state.profile, { passed, history: state.history, ask: state.ask }, { plan: null, passed });
}

export function markHere() {
  if (!state.plan || state.plan.userHere) return;
  emit({ ...state, plan: { ...state.plan, userHere: true } });
}

export function markPeerHere(id) {
  if (!state.plan) return;
  emit({
    ...state,
    plan: {
      ...state.plan,
      peers: state.plan.peers.map((p) => (p.id === id ? { ...p, here: true } : p)),
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

  const passed = state.passed;
  requestRecommendation(profile, { passed, history, ask: null }, {
    profile,
    rewards,
    history,
    plan: null,
    justRewarded: {
      xp: gained,
      streak: rewards.streak,
      badge: earned[0] || null,
      title: plan.title,
      people: plan.peers.map((p) => p.name.split(' ')[0]),
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
