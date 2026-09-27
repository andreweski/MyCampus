import {
  ACTIVITIES, BANDS, DAY_LABELS, PEERS, activityById, clusterOf, hobbyId, hobbyLabel,
  personTags, placeById, resolveHobby, tagAffinity, zonesClose,
} from './data.js';
import { formatAskDate } from './parse.js';

function listAffinity(a, b) {
  if (!a.length || !b.length) return 0;
  const scores = a.map((tag) => Math.max(...b.map((other) => tagAffinity(tag, other))));
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

const frequencyCache = new WeakMap();

let activeRarity = null;

function documentFrequency(id, population) {
  if (activeRarity?.counts) return activeRarity.counts[id] || 0;
  let table = frequencyCache.get(population);
  if (!table) {
    table = new Map();
    for (const person of population) {
      const seen = new Set();
      for (const hobby of person.hobbies || []) {
        const key = hobbyId(hobby);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        table.set(key, (table.get(key) || 0) + 1);
      }
    }
    frequencyCache.set(population, table);
  }
  return table.get(id) || 0;
}

function exactWeight(id, population) {
  const total = Math.max(1, activeRarity?.total || population.length);
  const seen = Math.max(1, documentFrequency(id, population));
  const scale = Math.log(total + 1);
  const rarity = scale === 0 ? 0 : Math.log((total + 1) / (seen + 1)) / scale;
  return 0.55 + 0.45 * rarity;
}

function hobbyMatch(a, b, population) {
  const left = hobbyId(a);
  const right = hobbyId(b);
  if (!left || !right) return null;
  if (left === right) return exactWeight(left, population);
  if (!resolveHobby(left).known || !resolveHobby(right).known) return null;
  const near = tagAffinity(left, right);
  if (near < 0.42) return null;
  return near;
}

function bestHobbyScore(from, against, population) {
  let exact = null;
  let near = null;
  for (const hobby of from || []) {
    const left = hobbyId(hobby);
    for (const other of against || []) {
      const score = hobbyMatch(hobby, other, population);
      if (score == null) continue;
      if (left && left === hobbyId(other)) {
        if (exact == null || score > exact) exact = score;
      } else if (near == null || score > near) near = score;
    }
  }
  if (exact != null) return exact;
  return near;
}

function interestTags(person) {
  const tags = [...(person.interests || [])];
  for (const hobby of person.hobbies || []) {
    const resolved = resolveHobby(hobby);
    if (resolved.known) tags.push(resolved.id);
  }
  return tags.map((tag) => String(tag).toLowerCase());
}

function interestAffinity(a, b) {
  return listAffinity(interestTags(a), interestTags(b));
}

function pairHobby(a, b, population) {
  const direct = bestHobbyScore(a.hobbies, b.hobbies, population);
  if (direct != null) return direct;
  const mine = new Set((a.activities || []).map((item) => String(item).toLowerCase()));
  const shared = (b.activities || []).some((item) => mine.has(String(item).toLowerCase()));
  return shared ? 0.5 : 0;
}

const pairHobbyMemo = new Map();
const bioMemo = new Map();
const interestMemo = new Map();
const fitMemo = new Map();
const boostMemo = new Map();
const personTagCache = new WeakMap();
let fitIntentCache = null;

function pairKey(a, b) {
  if (!a?.id || !b?.id || a.id === b.id) return null;
  return a.id < b.id ? `${a.id}\0${b.id}` : `${b.id}\0${a.id}`;
}

function memoPairHobby(a, b, population) {
  const key = pairKey(a, b);
  if (key && pairHobbyMemo.has(key)) return pairHobbyMemo.get(key);
  const score = pairHobby(a, b, population);
  if (key) pairHobbyMemo.set(key, score);
  return score;
}

function memoBio(a, b, population) {
  const key = pairKey(a, b);
  if (key && bioMemo.has(key)) return bioMemo.get(key);
  const score = bioScore(a, b, population);
  if (key) bioMemo.set(key, score);
  return score;
}

function memoInterest(a, b) {
  const key = pairKey(a, b);
  if (key && interestMemo.has(key)) return interestMemo.get(key);
  const score = interestAffinity(a, b);
  if (key) interestMemo.set(key, score);
  return score;
}

function fitKey(members, activity, ask) {
  const ids = members.map((member) => member?.id).filter(Boolean).sort().join('.');
  if (!ids) return null;
  return `${ids}|${activity.id}|${(ask?.intents || []).join(',')}`;
}

function memoActivityFit(activity, members, ask) {
  const key = fitKey(members, activity, ask);
  if (key && fitMemo.has(key)) return fitMemo.get(key);
  const fit = activityFit(activity, members, ask);
  if (key) fitMemo.set(key, fit);
  return fit;
}

function clearScoreMemo() {
  pairHobbyMemo.clear();
  bioMemo.clear();
  interestMemo.clear();
  fitMemo.clear();
  boostMemo.clear();
  activeRarity = null;
  fitIntentCache = null;
}

function tagsOf(person) {
  let tags = personTagCache.get(person);
  if (!tags) {
    tags = personTags(person);
    personTagCache.set(person, tags);
  }
  return tags;
}

function sharesEntry(user, person) {
  const mine = new Set((user.hobbies || []).map((hobby) => hobbyId(hobby)));
  if ((person.hobbies || []).some((hobby) => mine.has(hobbyId(hobby)))) return true;
  const plans = new Set((user.activities || []).map((item) => String(item).toLowerCase()));
  return (person.activities || []).some((item) => plans.has(String(item).toLowerCase()));
}

function sharedExact(user, peers) {
  let ids = new Set((user.hobbies || []).map((hobby) => hobbyId(hobby)));
  for (const peer of peers) {
    const theirs = new Set((peer.hobbies || []).map((hobby) => hobbyId(hobby)));
    ids = new Set([...ids].filter((id) => theirs.has(id)));
  }
  return [...ids];
}

function sharedPlan(user, peers) {
  let plans = new Set((user.activities || []).map((item) => String(item).toLowerCase()));
  for (const peer of peers) {
    const theirs = new Set((peer.activities || []).map((item) => String(item).toLowerCase()));
    plans = new Set([...plans].filter((item) => theirs.has(item)));
  }
  return [...plans][0] || '';
}

function learnedBoost(profile, activity) {
  if (boostMemo.has(activity.id)) return boostMemo.get(activity.id);
  const ids = (profile.hobbies || []).map((hobby) => hobbyId(hobby));
  const table = profile.availability?.outings || {};
  let hits = 0;
  for (const id of ids) hits += Number(table[id]?.[activity.id] || 0);
  const boost = Math.min(0.06, hits * 0.02);
  boostMemo.set(activity.id, boost);
  return boost;
}

function mergedBandRanges(person) {
  const ranges = (person.availability?.bands || [])
    .map((name) => BANDS[name])
    .filter(Boolean)
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (!last || range[0] > last[1]) merged.push([range[0], range[1]]);
    else last[1] = Math.max(last[1], range[1]);
  }
  return merged;
}

function holdingRange(person, start, end) {
  const single = (person.availability?.bands || [])
    .map((name) => BANDS[name])
    .filter(Boolean)
    .find((range) => range[0] <= start && range[1] >= end);
  if (single) return single;
  return mergedBandRanges(person).find((range) => range[0] <= start && range[1] >= end) || null;
}

export function windowBands(start, end) {
  return Object.entries(BANDS)
    .filter(([, span]) => span[0] < end && span[1] > start)
    .map(([name]) => name);
}

function scheduleScore(members, window) {
  let fit = 0;
  for (const member of members) {
    const holding = holdingRange(member, window.start, window.end);
    if (!holding) {
      fit += 0.35;
      continue;
    }
    const slack = Math.min(holding[1] - window.end, window.start - holding[0]);
    fit += slack >= 20 ? 1 : 0.72;
  }
  const shared = ['morning', 'lunch', 'afternoon', 'evening'].filter((band) => (
    members.every((member) => member.availability?.bands?.includes(band))
  )).length;
  return (fit / members.length) * 0.75 + Math.min(1, shared / 2) * 0.25;
}

export function formatTime(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return m ? `${hr}:${String(m).padStart(2, '0')} ${ap}` : `${hr} ${ap}`;
}

export function formatRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function combinations(list, k) {
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < list.length; i += 1) {
      acc.push(list[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

function freeFor(person, day, start, end) {
  const avail = person.availability;
  if (!avail?.days?.includes(day)) return false;
  return Boolean(holdingRange(person, start, end));
}

export function nextOpenDay(profile, now) {
  const days = profile.availability?.days || [];
  const today = now.getDay();
  if (days.includes(today)) return today;
  for (let step = 1; step <= 6; step += 1) {
    const day = (today + step) % 7;
    if (days.includes(day)) return day;
  }
  return null;
}

function windowsFor(user, day, ask) {
  if (ask?.start != null && ask?.end != null) {
    return [{ start: ask.start, end: ask.end, band: bandAt(ask.start) }];
  }
  return (user.availability?.bands || []).map((band) => {
    const [start, end] = BANDS[band];
    return { start, end, band };
  });
}

function bandAt(min) {
  for (const [name, [a, b]] of Object.entries(BANDS)) {
    if (min >= a && min < b) return name;
  }
  return 'afternoon';
}

function bestTag(person, intent) {
  let best = 0;
  for (const tag of tagsOf(person)) {
    const affinity = tagAffinity(tag, intent);
    if (affinity > best) best = affinity;
  }
  return best;
}

function intentRow(person, intents) {
  const row = new Map();
  for (const intent of intents) row.set(intent, bestTag(person, intent));
  return row;
}

function activityFit(activity, members, ask) {
  const intents = activity.intents;
  let score = 0;
  let n = 0;
  for (const intent of intents) {
    let best = 0;
    for (const member of members) {
      const row = fitIntentCache?.get(member);
      const affinity = row ? (row.get(intent) || 0) : bestTag(member, intent);
      if (affinity > best) best = affinity;
    }
    score += best;
    n += 1;
  }
  let fit = n ? score / n : 0;
  if (ask?.intents?.length) {
    const asked = Math.max(...ask.intents.map((intent) => (
      Math.max(...activity.intents.map((have) => tagAffinity(intent, have)))
    )));
    fit = fit * 0.35 + asked * 0.65;
    if (ask.intents.some((intent) => activity.intents.some((have) => tagAffinity(intent, have) === 1))) fit = Math.max(fit, 0.82);
  }
  const calm = members.filter((m) => m.energy === 'calm').length;
  const high = members.filter((m) => m.energy === 'high').length;
  if (activity.id === 'hoops' && calm > high && !ask?.intents?.some((intent) => tagAffinity(intent, 'basketball') === 1)) fit -= 0.18;
  if (activity.id === 'garden' && calm >= 2) fit += 0.08;
  const indoors = members.filter((m) => m.setting === 'indoors').length;
  const place = placeById(activity.place);
  if (place?.outdoor && indoors >= Math.ceil(members.length * 0.7)) fit -= 0.12;
  if (!place?.outdoor && members.filter((m) => m.setting === 'outdoors').length >= 3) fit -= 0.06;
  return Math.max(0, Math.min(1, fit));
}

function historyAdjust(peerIds, history) {
  const recent = (history || []).slice(-8);
  let familiarity = 0;
  let repeat = 0;
  const set = new Set(peerIds);
  for (const item of recent) {
    const overlap = (item.peerIds || []).filter((id) => set.has(id)).length;
    if (item.status === 'completed' && overlap) familiarity += overlap;
    if (overlap === set.size && (item.peerIds || []).length === set.size) repeat += 1;
  }
  return Math.min(0.12, familiarity * 0.03) - Math.min(0.28, repeat * 0.16);
}

function because(user, peer, population) {
  const shared = sharedExact(user, [peer])
    .sort((a, b) => documentFrequency(a, population) - documentFrequency(b, population));
  if (shared.length) return `Free at the same time, and you both like ${hobbyLabel(shared[0]).toLowerCase()}`;
  const plan = sharedPlan(user, [peer]);
  if (plan) return `Free at the same time, and you both are up for ${plan}`;
  if (zonesClose(user.zone, peer.zone)) return 'Free then, and usually on the same part of campus';
  return peer.vibe;
}

export function rosterFor(size) {
  if (size <= NAME_LIST) return 'names';
  if (size <= DOWNLOAD_CAP) return 'preview';
  return 'count';
}

export function searchSizes(profile) {
  if (!profile) return null;
  if (profile.groupFlex === 'any' || (profile.groupSize === 0 && !(profile.groupSizes || []).length)) return null;
  return acceptedSizes(profile);
}

function whyGroup(user, peers, population, size = peers.length + 1) {
  const sizeLabel = size.toLocaleString('en-US');
  const shape = size <= 4 ? 'The group stays small' : `The group is ${size}`;
  if (size > 80) {
    const counts = new Map();
    for (const peer of peers) {
      for (const id of sharedExact(user, [peer])) counts.set(id, (counts.get(id) || 0) + 1);
      const plan = sharedPlan(user, [peer]);
      if (plan) counts.set(`plan:${plan}`, (counts.get(`plan:${plan}`) || 0) + 1);
    }
    let best = 0;
    let crowdTopic = 'the same free time';
    for (const [id, count] of counts) {
      if (count <= best) continue;
      best = count;
      crowdTopic = id.startsWith('plan:') ? id.slice(5) : hobbyLabel(id).toLowerCase();
    }
    const others = (size - 1).toLocaleString('en-US');
    return `${others} people are actually free then. The group is ${sizeLabel}, and ${crowdTopic} is what you share.`;
  }
  const shared = sharedExact(user, peers)
    .sort((a, b) => documentFrequency(a, population) - documentFrequency(b, population));
  const topic = shared.length ? hobbyLabel(shared[0]).toLowerCase() : (sharedPlan(user, peers) || 'the same free time');
  const names = peers.map((p) => p.name.split(' ')[0]);
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const verb = names.length === 1 ? 'is' : 'are';
  return `${who} ${verb} actually free then. ${shape}, and ${topic} is what you share.`;
}

function groupBase(user, peers, window, history, population) {
  const members = [user, ...peers];
  const crowd = members.length > 80;
  let hobby;
  let interest;
  if (crowd) {
    const hobbyScores = peers.map((peer) => memoPairHobby(user, peer, population));
    const interestScores = peers.map((peer) => memoInterest(user, peer));
    hobby = hobbyScores.reduce((sum, score) => sum + score, 0) / hobbyScores.length;
    interest = interestScores.reduce((sum, score) => sum + score, 0) / interestScores.length;
    if (Math.max(hobby, interest) < 0.28) return null;
  } else {
    const pairs = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) pairs.push(memoInterest(members[i], members[j]));
    }
    interest = pairs.reduce((s, n) => s + n, 0) / pairs.length;
    const hobbyPairs = [];
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) hobbyPairs.push(memoPairHobby(members[i], members[j], population));
    }
    hobby = hobbyPairs.reduce((s, n) => s + n, 0) / hobbyPairs.length;
    const weakest = Math.min(...hobbyPairs);
    if (weakest < 0.12 || Math.max(hobby, interest) < 0.28) return null;
  }
  const schedule = scheduleScore(members, window);
  const sameMajor = peers.filter((p) => p.major && p.major === user.major).length / peers.length;
  const past = historyAdjust(peers.map((p) => p.id), history);
  return { members, hobby, interest, schedule, sameMajor, past };
}

function scoreGroup(base, activity, ask, user, useBio) {
  const fit = memoActivityFit(activity, base.members, ask);
  if (fit < 0.28) return null;
  const place = placeById(activity.place);
  const proximity = base.members.filter((m) => zonesClose(m.zone, place.zone)).length / base.members.length;
  const liked = place && (user.preferredPlaces || []).includes(place.id) ? 0.07 : 0;
  const w = useBio
    ? { schedule: 0.32, hobby: 0.30, fit: 0.15, interest: 0.05, proximity: 0.05, major: 0.03 }
    : { schedule: 0.34, hobby: 0.32, fit: 0.18, interest: 0.08, proximity: 0.05, major: 0.03 };
  const score = base.schedule * w.schedule + base.hobby * w.hobby + fit * w.fit + base.interest * w.interest + proximity * w.proximity + base.sameMajor * w.major + base.past + liked;
  return { score, interest: base.hobby, fit, proximity };
}

const BIO_STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'my', 'i', 'im', 'me', 'is', 'it', 'that', 'this', 'be', 'am', 'are', 'was', 'at', 'from', 'just', 'like', 'really', 'very', 'also', 'but', 'so', 'if', 'your', 'you', 'we', 'our']);
export const PAIR_POOL = 80;
export const NAME_LIST = 300;
export const DOWNLOAD_CAP = 1000;
export const PREVIEW_COUNT = 8;
const COMBINATION_LIMIT = 24;
const HOBBY_SEATS = 14;
const BIO_SEATS = 10;
const BIO_SEAT_FLOOR = 0.35;
const ANN_POOL = 2000;
const tokenCache = new WeakMap();
const bioFreqCache = new WeakMap();

function roundSize(value) {
  const size = Math.max(2, Number(value) || 3);
  if (size <= 4) return size;
  return Math.max(5, Math.round(size / 5) * 5);
}

function acceptedSizes(person) {
  const listed = Array.isArray(person.groupSizes) && person.groupSizes.length
    ? person.groupSizes
    : (Array.isArray(person.availability?.groupSizes) && person.availability.groupSizes.length ? person.availability.groupSizes : null);
  if (listed) {
    const sizes = [...new Set(listed.map((n) => roundSize(n)))].filter((n) => n >= 2);
    sizes.sort((a, b) => a - b);
    if (sizes.length) return sizes;
  }
  if (person.groupFlex === 'any' || person.groupSize === 0) return null;
  if (person.groupFlex === 'atLeast') return [5];
  if (person.groupSize == null && !person.groupFlex) return [3];
  return [roundSize(person.groupSize)];
}

function acceptsSize(person, size) {
  const sizes = acceptedSizes(person);
  if (sizes == null) return true;
  return sizes.includes(size);
}

function bioTokens(person) {
  const cached = tokenCache.get(person);
  if (cached) return cached;
  const blocked = new Set((person.activities || []).map((item) => String(item).toLowerCase()));
  for (const hobby of person.hobbies || []) {
    blocked.add(String(hobby).toLowerCase());
    const id = hobbyId(hobby);
    if (id) blocked.add(id);
  }
  const words = String(person.bio || person.availability?.bio || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const tokens = [...new Set(words.filter((word) => word.length > 2 && !BIO_STOP.has(word) && !blocked.has(word)))];
  tokenCache.set(person, tokens);
  return tokens;
}

function bioFrequency(population) {
  const cached = bioFreqCache.get(population);
  if (cached) return cached;
  const table = new Map();
  for (const person of population) {
    for (const token of bioTokens(person)) table.set(token, (table.get(token) || 0) + 1);
  }
  const freq = { docs: population.length, table };
  bioFreqCache.set(population, freq);
  return freq;
}

function idf(token, freq) {
  const docs = Math.max(1, freq.docs || 0);
  const scale = Math.log(docs + 1);
  if (!scale) return 0;
  return Math.log((docs + 1) / ((freq.table.get(token) || 0) + 1)) / scale;
}

function bioScore(a, b, population) {
  const left = bioTokens(a);
  const right = bioTokens(b);
  if (!left.length || !right.length) return 0;
  const freq = bioFrequency(population);
  const rightWeight = new Map(right.map((token) => [token, idf(token, freq)]));
  let dot = 0;
  let leftNorm = 0;
  for (const token of left) {
    const weight = idf(token, freq);
    leftNorm += weight * weight;
    if (rightWeight.has(token)) dot += weight * rightWeight.get(token);
  }
  if (!dot || !leftNorm) return 0;
  let rightNorm = 0;
  for (const weight of rightWeight.values()) rightNorm += weight * weight;
  if (!rightNorm) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function groupBio(members, population) {
  const scored = [];
  if (members.length > 80) {
    for (let i = 1; i < members.length; i += 1) {
      if (!bioTokens(members[0]).length || !bioTokens(members[i]).length) continue;
      scored.push(memoBio(members[0], members[i], population));
    }
    if (!scored.length) return 0;
    return scored.reduce((sum, score) => sum + score, 0) / scored.length;
  }
  for (let i = 0; i < members.length; i += 1) {
    if (!bioTokens(members[i]).length) continue;
    for (let j = i + 1; j < members.length; j += 1) {
      if (!bioTokens(members[j]).length) continue;
      scored.push(memoBio(members[i], members[j], population));
    }
  }
  if (!scored.length) return 0;
  return scored.reduce((sum, score) => sum + score, 0) / scored.length;
}

function rareShared(left, right, freq) {
  const docs = Math.max(1, freq.docs || 0);
  const have = new Set(right);
  return left.some((token) => have.has(token) && (freq.table.get(token) || 0) * 20 <= docs);
}

function mixHash(text, salt) {
  let hash = (2166136261 ^ salt) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

function simhash(tokens, freq, salt) {
  const bits = new Float64Array(16);
  for (const token of tokens) {
    const weight = idf(token, freq);
    if (!weight) continue;
    const base = mixHash(token, salt);
    for (let bit = 0; bit < 16; bit += 1) bits[bit] += ((base >>> bit) & 1 ? 1 : -1) * weight;
  }
  let code = 0;
  for (let bit = 0; bit < 16; bit += 1) if (bits[bit] >= 0) code |= 1 << bit;
  return code;
}

function annBioCandidates(user, pool, freq) {
  const tables = Array.from({ length: 4 }, () => new Map());
  for (const person of pool) {
    const tokens = bioTokens(person);
    for (let table = 0; table < tables.length; table += 1) {
      const code = simhash(tokens, freq, 100 + table);
      const list = tables[table].get(code);
      if (list) list.push(person);
      else tables[table].set(code, [person]);
    }
  }
  const found = new Set();
  const out = [];
  const add = (person) => {
    if (!person || found.has(person.id)) return;
    found.add(person.id);
    out.push(person);
  };
  const mine = bioTokens(user);
  for (let table = 0; table < tables.length; table += 1) {
    const code = simhash(mine, freq, 100 + table);
    const probes = [code];
    for (let bit = 0; bit < 16; bit += 1) probes.push(code ^ (1 << bit));
    for (const probe of probes) {
      for (const person of tables[table].get(probe) || []) add(person);
    }
  }
  const rare = [...mine].sort((a, b) => idf(b, freq) - idf(a, freq)).slice(0, 3)
    .filter((token) => (freq.table.get(token) || 0) * 20 <= Math.max(1, freq.docs || 0));
  if (rare.length) {
    const wanted = new Set(rare);
    for (const person of pool) {
      if (bioTokens(person).some((token) => wanted.has(token))) add(person);
    }
  }
  return out.length ? out : pool;
}

function bioSeats(user, pool, population, count) {
  const mine = bioTokens(user);
  if (!mine.length || count <= 0) return [];
  const freq = bioFrequency(population);
  const written = pool.filter((person) => bioTokens(person).length);
  const candidates = written.length >= ANN_POOL ? annBioCandidates(user, written, freq) : written;
  const ranked = [];
  for (const person of candidates) {
    const score = bioScore(user, person, population);
    if (score < BIO_SEAT_FLOOR && !rareShared(mine, bioTokens(person), freq)) continue;
    ranked.push({ person, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, count).map((item) => item.person);
}

function sharedBioWord(user, peers, population) {
  const freq = bioFrequency(population);
  const mine = bioTokens(user);
  let best = '';
  let bestWeight = -1;
  for (const peer of peers) {
    const theirs = new Set(bioTokens(peer));
    for (const token of mine) {
      if (!theirs.has(token)) continue;
      const weight = idf(token, freq);
      if (weight > bestWeight) {
        best = token;
        bestWeight = weight;
      }
    }
  }
  return best;
}

function passedIdsOf(passed) {
  const ids = new Set();
  for (const key of passed || []) {
    for (const id of String(key).split('|')[0].split('.')) if (id) ids.add(id);
  }
  return ids;
}

function scheduleCover(person, window) {
  const holding = holdingRange(person, window.start, window.end);
  if (!holding) return 0.35;
  const slack = Math.min(holding[1] - window.end, window.start - holding[0]);
  return slack >= 20 ? 1 : 0.72;
}

function limitPool(user, pool, window, population, peerCount, passedIds) {
  const limit = peerCount <= 4 ? COMBINATION_LIMIT : peerCount;
  const fresh = [];
  const seen = [];
  for (const person of pool) (passedIds.has(person.id) ? seen : fresh).push(person);
  const usable = fresh.length >= peerCount ? fresh : [...fresh, ...seen];
  if (usable.length <= limit) return usable;
  const byHobby = (a, b) => (
    memoPairHobby(user, b, population) - memoPairHobby(user, a, population)
    || scheduleCover(b, window) - scheduleCover(a, window)
    || memoBio(user, b, population) - memoBio(user, a, population)
  );
  const ranked = [...usable].sort(byHobby);
  if (peerCount > 4) return ranked.slice(0, peerCount);
  const chosen = new Set();
  const out = [];
  const take = (person) => {
    if (!person || chosen.has(person.id) || out.length >= limit) return;
    chosen.add(person.id);
    out.push(person);
  };
  for (const person of ranked.slice(0, HOBBY_SEATS)) take(person);
  for (const person of bioSeats(user, usable, population, BIO_SEATS)) take(person);
  for (const person of ranked) take(person);
  return out;
}

function fitTarget(wanted, available) {
  if (available >= wanted) return wanted;
  if (wanted >= 5) {
    const stepped = Math.floor(available / 5) * 5;
    if (stepped >= 5) return stepped;
  }
  return Math.max(2, Math.min(wanted, available));
}

function popularSize(people) {
  const counts = new Map();
  for (const person of people) {
    const votes = acceptedSizes(person);
    if (!votes) continue;
    for (const vote of votes) counts.set(vote, (counts.get(vote) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [size, count] of counts) {
    if (count > bestCount || (count === bestCount && (best == null || size < best))) {
      best = size;
      bestCount = count;
    }
  }
  return best || 4;
}

export function recommend(profile, { passed = [], history = [], ask = null, now = new Date(), peers = PEERS, rarity = null, census = null } = {}) {
  if (!profile?.availability) return null;
  clearScoreMemo();
  activeRarity = rarity?.total ? rarity : null;
  const day = Number.isInteger(ask?.day) ? ask.day : nextOpenDay(profile, now);
  if (day == null) {
    clearScoreMemo();
    return null;
  }
  const population = [profile, ...peers.filter((peer) => peer.id !== profile.id)];

  const windows = windowsFor(profile, day, ask).filter((w) => (ask || profile.availability.days.includes(day)));
  const skipped = passedIdsOf(passed);
  const userHasBio = bioTokens(profile).length > 0;
  let best = null;
  let runner = null;

  for (const window of windows) {
    const duration = ask?.duration || null;
    const free = peers.filter((p) => p.id !== profile.id && freeFor(p, day, window.start, window.end) && sharesEntry(profile, p));
    const chosen = acceptedSizes(profile);
    const sizes = chosen || (free.length ? [fitTarget(popularSize([profile, ...free]), free.length + 1)] : []);
    if (!sizes.length) continue;
    if (!free.length && !sizes.some((size) => size > DOWNLOAD_CAP)) continue;

    let activities = ACTIVITIES.filter((activity) => {
      const length = duration || activity.duration;
      if (window.end - window.start < length) return false;
      if (!ask && !activity.bands.includes(window.band)) return false;
      return true;
    });
    if (ask?.intents?.length) {
      let bestScore = 0;
      const scored = activities.map((activity) => {
        const score = Math.max(0, ...ask.intents.map((intent) => (
          Math.max(...activity.intents.map((have) => tagAffinity(intent, have)))
        )));
        if (score > bestScore) bestScore = score;
        return { activity, score };
      });
      if (bestScore >= 0.74) {
        const floor = bestScore === 1 ? 1 : 0.74;
        let picked = scored.filter((item) => item.score >= floor);
        const askedCluster = clusterOf(ask.intents[0]);
        const focused = picked.filter((item) => clusterOf(item.activity.intents[0]) === askedCluster);
        if (focused.length) picked = focused;
        activities = picked.map((item) => item.activity);
      }
    }

    for (const size of sizes) {
      const peerCount = size - 1;
      if (peerCount < 1) continue;
      if (size > DOWNLOAD_CAP) {
        const bucket = census?.[size];
        const hit = bucket?.[ask?.start != null ? 'ask' : window.band];
        const sample = (hit?.sample || []).filter((person) => (
          person.id !== profile.id && freeFor(person, day, window.start, window.end) && sharesEntry(profile, person)
        )).slice(0, PREVIEW_COUNT);
        if (!hit || hit.count < peerCount || !activities.length) continue;
        let picked = null;
        for (const activity of activities) {
          const length = duration || activity.duration;
          const end = window.start + length;
          if (end > window.end) continue;
          const fit = activityFit(activity, [profile, ...sample], ask);
          if (!picked || fit > picked.fit) picked = { activity, end, fit };
        }
        if (!picked) continue;
        const peopleKey = [...sample.map((person) => person.id)].sort().join('.');
        const key = `count.${size}|${peopleKey}|${picked.activity.id}|${window.start}`;
        if (passed.includes(key)) continue;
        const row = { key, group: sample, activity: picked.activity, start: window.start, end: picked.end, window, rank: picked.fit, bio: 0, useBio: false, size };
        if (!best || row.rank > best.rank) {
          runner = best;
          best = row;
        }
        continue;
      }
      let willing = free.filter((person) => acceptsSize(person, size));
      if (!chosen && willing.length < peerCount) {
        willing = [...willing, ...free.filter((person) => !willing.includes(person))];
      }
      if (willing.length < peerCount) continue;
      const limited = limitPool(profile, willing, window, population, peerCount, skipped);
      const groups = peerCount <= 4 ? combinations(limited, peerCount) : [limited.slice(0, peerCount)];
      if (peerCount <= 4 && activities.length) {
        const intents = [...new Set(activities.flatMap((activity) => activity.intents))];
        fitIntentCache = new Map([[profile, intentRow(profile, intents)]]);
        for (const person of limited) fitIntentCache.set(person, intentRow(person, intents));
      }

      const prepared = [];
      for (const group of groups) {
        const base = groupBase(profile, group, window, history, population);
        if (!base) continue;
        const agreement = [profile, ...group].filter((person) => acceptsSize(person, size)).length;
        const bio = groupBio([profile, ...group], population);
        const useBio = userHasBio && bio > 0;
        const peopleKey = [...group.map((p) => p.id)].sort().join('.');
        const scheduleW = useBio ? 0.32 : 0.34;
        const hobbyW = useBio ? 0.30 : 0.32;
        const interestW = useBio ? 0.05 : 0.08;
        const fitW = useBio ? 0.15 : 0.18;
        const ceiling = base.schedule * scheduleW + base.hobby * hobbyW + base.interest * interestW + base.sameMajor * 0.03 + base.past + fitW + 0.05 + 0.07 + 0.06 + agreement * 0.03 + (useBio ? bio * 0.10 : 0);
        prepared.push({ group, base, agreement, bio, peopleKey, ceiling, useBio });
      }
      prepared.sort((a, b) => b.ceiling - a.ceiling);

      for (const item of prepared) {
        if (best && item.ceiling <= best.rank) break;
        const { group, base, agreement, bio, peopleKey, useBio } = item;
        for (const activity of activities) {
          const length = duration || activity.duration;
          const end = window.start + length;
          if (end > window.end) continue;

          const key = `${peopleKey}|${activity.id}|${window.start}`;
          if (passed.includes(key)) continue;
          const judged = scoreGroup(base, activity, ask, profile, useBio);
          if (!judged) continue;
          const rank = judged.score + agreement * 0.03 + learnedBoost(profile, activity) + (useBio ? bio * 0.10 : 0);
          const row = { key, group, activity, start: window.start, end, window, judged, rank, bio, useBio, size };
          const samePeople = (left, right) => left && right && left.key.split('|')[0] === right.key.split('|')[0];
          if (!best || rank > best.rank) {
            if (!samePeople(best, row)) runner = best;
            best = row;
          } else if (!samePeople(best, row) && (!runner || rank > runner.rank)) {
            runner = row;
          }
        }
      }
      fitIntentCache = null;
    }
  }

  if (!best) {
    clearScoreMemo();
    return null;
  }
  const place = placeById(best.activity.place);
  const activity = activityById(best.activity.id);
  let why = whyGroup(profile, best.group, population, best.size);
  if (best.useBio && runner) {
    const bare = best.rank - best.bio * 0.10;
    const other = runner.rank - (runner.useBio ? runner.bio * 0.10 : 0);
    const word = bare < other ? sharedBioWord(profile, best.group, population) : '';
    if (word) why = `${why} Your bios both mention ${word}.`;
  }
  clearScoreMemo();
  return {
    key: best.key,
    activityId: activity.id,
    title: activity.title,
    line: activity.line,
    place,
    start: best.start,
    end: best.end,
    day,
    dayLabel: ask?.date ? formatAskDate(ask.date) : DAY_LABELS[day],
    peers: best.group.map((peer) => ({ ...peer, because: because(profile, peer, population) })),
    why,
    roster: rosterFor(best.size),
    crowdCount: best.size,
    ask: ask ? { ...ask } : null,
  };
}
