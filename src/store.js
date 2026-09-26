import { PLACES, hobbyId, placeById } from './data.js';
import { recommend } from './match.js';
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
};

let state = load();
let pool = [];
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

async function persist(next) {
  if (!isSupabaseConfigured || !next.userId || !next.profile) return;
  const profile = next.profile;
  await supabase.from('profiles').upsert({
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
  });
  await supabase.from('private_state').upsert({
    id: next.userId,
    passed: next.passed,
    history: next.history,
    rewards: { ...(next.rewards || {}), campus: next.campus || { conquered: [], preferred: [] } },
    recommendation: next.recommendation,
    plan: next.plan,
    ask: next.ask,
  });
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
  await loadPool();
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const { data: priv } = await supabase.from('private_state').select('*').eq('id', user.id).maybeSingle();
  const person = profile?.name ? rowToPerson(profile) : null;
  const rawRewards = priv?.rewards || {};
  const passed = priv?.passed || [];
  const history = priv?.history || [];
  const ask = priv?.ask || null;
  const campus = campusOf(rawRewards);
  emit({
    ...structuredClone(empty),
    userId: user.id,
    accountEmail: user.email,
    profile: person,
    passed,
    history,
    rewards: rewardsOf(rawRewards),
    campus,
    recommendation: priv?.recommendation || (person ? freshRecommendation(person, { passed, history, ask, preferred: campus.preferred }) : null),
    plan: priv?.plan || null,
    ask,
    signupConfirmed: priv?.signup_confirmed !== false,
  });
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

function freshRecommendation(profile, extra) {
  const person = { ...profile, preferredPlaces: extra.preferred || state.campus?.preferred || [] };
  const others = pool.filter((peer) => peer.id !== person.id && peer.name);
  return recommend(person, {
    passed: extra.passed || [],
    history: extra.history || [],
    ask: extra.ask || null,
    now: new Date(),
    peers: isSupabaseConfigured ? others : undefined,
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
  emit({
    ...state,
    profile,
    campus: { conquered: state.campus?.conquered || [], preferred },
    recommendation: state.plan ? state.recommendation : freshRecommendation(profile, {
      passed: state.passed,
      history: state.history,
      ask: state.ask,
      preferred,
    }),
  });
}

export function saveProfile(profile) {
  const ask = null;
  const passed = [];
  emit({
    ...state,
    profile,
    ask,
    passed,
    recommendation: state.plan ? state.recommendation : freshRecommendation(profile, { passed, history: state.history, ask }),
  });
}

export function askForPlan(ask) {
  emit({
    ...state,
    ask,
    passed: [],
    recommendation: freshRecommendation(state.profile, { passed: [], history: state.history, ask }),
  });
}

export function clearAsk() {
  emit({
    ...state,
    ask: null,
    passed: [],
    recommendation: freshRecommendation(state.profile, { passed: [], history: state.history, ask: null }),
  });
}

export function passRecommendation() {
  if (!state.recommendation) return;
  const passed = [...state.passed, state.recommendation.key];
  emit({
    ...state,
    passed,
    recommendation: freshRecommendation(state.profile, { passed, history: state.history, ask: state.ask }),
  });
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
  emit({
    ...state,
    plan: null,
    passed,
    recommendation: freshRecommendation(state.profile, { passed, history: state.history, ask: state.ask }),
  });
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

  emit({
    ...state,
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
    recommendation: freshRecommendation(profile, { passed: state.passed, history, ask: null }),
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
  if (isSupabaseConfigured && state.userId) {
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
