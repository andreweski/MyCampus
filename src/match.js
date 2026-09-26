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

function documentFrequency(id, population) {
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
  const total = Math.max(1, population.length);
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
  return tagAffinity(left, right);
}

function bestHobbyScore(from, against, population) {
  let best = null;
  for (const hobby of from || []) {
    for (const other of against || []) {
      const score = hobbyMatch(hobby, other, population);
      if (score == null) continue;
      if (best == null || score > best) best = score;
    }
  }
  return best;
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

function planAffinity(a, b) {
  return listAffinity(
    (a.activities || []).map((item) => String(item).toLowerCase()),
    (b.activities || []).map((item) => String(item).toLowerCase()),
  );
}

function pairHobby(a, b, population) {
  const direct = bestHobbyScore(a.hobbies, b.hobbies, population);
  if (direct != null) return direct;
  return planAffinity(a, b) * 0.5;
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

function learnedBoost(profile, activity, population) {
  const ids = (profile.hobbies || []).map((hobby) => hobbyId(hobby));
  let hits = 0;
  for (const person of population) {
    const table = person.availability?.outings || {};
    for (const id of ids) hits += Number(table[id]?.[activity.id] || 0);
  }
  return Math.min(0.06, hits * 0.02);
}

function scheduleScore(members, window) {
  let fit = 0;
  for (const member of members) {
    const bands = member.availability?.bands || [];
    const holding = bands
      .map((name) => BANDS[name])
      .find(([start, end]) => start <= window.start && end >= window.end);
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
  return avail.bands.some((band) => {
    const [b0, b1] = BANDS[band];
    return b0 <= start && b1 >= end;
  });
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

function activityFit(activity, members, ask) {
  const tags = members.flatMap((m) => personTags(m));
  const intents = activity.intents;
  let score = 0;
  let n = 0;
  for (const intent of intents) {
    const best = tags.length ? Math.max(...tags.map((t) => tagAffinity(t, intent))) : 0;
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

function whyGroup(user, peers, population) {
  const names = peers.map((p) => p.name.split(' ')[0]);
  const who = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const shared = sharedExact(user, peers)
    .sort((a, b) => documentFrequency(a, population) - documentFrequency(b, population));
  const topic = shared.length ? hobbyLabel(shared[0]).toLowerCase() : (sharedPlan(user, peers) || 'the same free time');
  const verb = names.length === 1 ? 'is' : 'are';
  const size = peers.length + 1;
  const shape = size <= 4 ? 'The group stays small' : `The group is ${size}`;
  return `${who} ${verb} actually free then. ${shape}, and ${topic} is what you share.`;
}

function groupBase(user, peers, window, history, population) {
  const members = [user, ...peers];
  const pairs = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) pairs.push(interestAffinity(members[i], members[j]));
  }
  const interest = pairs.reduce((s, n) => s + n, 0) / pairs.length;
  const hobbyPairs = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) hobbyPairs.push(pairHobby(members[i], members[j], population));
  }
  const hobby = hobbyPairs.reduce((s, n) => s + n, 0) / hobbyPairs.length;
  const weakest = Math.min(...hobbyPairs);
  if (weakest < 0.12 || Math.max(hobby, interest) < 0.28) return null;
  const schedule = scheduleScore(members, window);
  const sameMajor = peers.filter((p) => p.major && p.major === user.major).length / peers.length;
  const past = historyAdjust(peers.map((p) => p.id), history);
  return { members, hobby, interest, schedule, sameMajor, past };
}

function scoreGroup(base, activity, ask, user) {
  const fit = activityFit(activity, base.members, ask);
  if (fit < 0.28) return null;
  const place = placeById(activity.place);
  const proximity = base.members.filter((m) => zonesClose(m.zone, place.zone)).length / base.members.length;
  const liked = place && (user.preferredPlaces || []).includes(place.id) ? 0.07 : 0;
  const score = base.schedule * 0.34 + base.hobby * 0.32 + fit * 0.18 + base.interest * 0.08 + proximity * 0.05 + base.sameMajor * 0.03 + base.past + liked;
  return { score, interest: base.hobby, fit, proximity };
}

const BIO_STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'my', 'i', 'im', 'me', 'is', 'it', 'that', 'this', 'be', 'am', 'are', 'was', 'at', 'from', 'just', 'like', 'really', 'very', 'also', 'but', 'so', 'if', 'your', 'you', 'we', 'our']);
const COMBINATION_LIMIT = 24;

function roundSize(value) {
  const size = Math.max(2, Number(value) || 3);
  if (size <= 4) return size;
  return Math.min(100, Math.max(5, Math.round(size / 5) * 5));
}

function acceptedSizes(person) {
  const listed = Array.isArray(person.groupSizes) && person.groupSizes.length
    ? person.groupSizes
    : (Array.isArray(person.availability?.groupSizes) && person.availability.groupSizes.length ? person.availability.groupSizes : null);
  if (listed) {
    const sizes = [...new Set(listed.map((n) => roundSize(n)))].filter((n) => n >= 2 && n <= 100);
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
  const plans = new Set((person.activities || []).map((item) => String(item).toLowerCase()));
  const words = String(person.bio || person.availability?.bio || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter((word) => word.length > 2 && !BIO_STOP.has(word) && !plans.has(word)))];
}

function bioScore(a, b) {
  const left = bioTokens(a);
  const right = bioTokens(b);
  if (!left.length || !right.length) return 0;
  const have = new Set(right);
  let shared = 0;
  for (const word of left) if (have.has(word)) shared += 1;
  if (!shared) return 0;
  return shared / Math.sqrt(left.length * right.length);
}

function bioAffinity(user, peers) {
  if (!peers.length) return 0;
  return peers.reduce((sum, peer) => sum + bioScore(user, peer), 0) / peers.length;
}

function scheduleCover(person, window) {
  const bands = person.availability?.bands || [];
  const holding = bands
    .map((name) => BANDS[name])
    .filter(Boolean)
    .find(([start, end]) => start <= window.start && end >= window.end);
  if (!holding) return 0.35;
  const slack = Math.min(holding[1] - window.end, window.start - holding[0]);
  return slack >= 20 ? 1 : 0.72;
}

function limitPool(user, pool, window, population, peerCount) {
  const limit = peerCount <= 4 ? COMBINATION_LIMIT : peerCount;
  if (pool.length <= limit) return pool;
  const hobby = [];
  const plan = [];
  for (const person of pool) {
    if (sharedExact(user, [person]).length) hobby.push(person);
    else plan.push(person);
  }
  const byHobby = (a, b) => pairHobby(user, b, population) - pairHobby(user, a, population);
  hobby.sort(byHobby);
  plan.sort((a, b) => (bioScore(user, b) - bioScore(user, a)) || (scheduleCover(b, window) - scheduleCover(a, window)) || byHobby(a, b));
  return [...hobby, ...plan].slice(0, limit);
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

export function recommend(profile, { passed = [], history = [], ask = null, now = new Date(), peers = PEERS } = {}) {
  if (!profile?.availability) return null;
  const day = Number.isInteger(ask?.day) ? ask.day : now.getDay();
  if (ask?.start == null && !profile.availability.days?.includes(day)) return null;
  const population = [profile, ...peers.filter((peer) => peer.id !== profile.id)];

  const windows = windowsFor(profile, day, ask).filter((w) => (ask || profile.availability.days.includes(day)));
  let best = null;

  for (const window of windows) {
    const duration = ask?.duration || null;
    const free = peers.filter((p) => p.id !== profile.id && freeFor(p, day, window.start, window.end) && sharesEntry(profile, p));
    if (!free.length) continue;
    const chosen = acceptedSizes(profile);
    const sizes = chosen || [fitTarget(popularSize([profile, ...free]), free.length + 1)];

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
      let willing = free.filter((person) => acceptsSize(person, size));
      if (!chosen && willing.length < peerCount) {
        willing = [...willing, ...free.filter((person) => !willing.includes(person))];
      }
      if (willing.length < peerCount) continue;
      const limited = limitPool(profile, willing, window, population, peerCount);
      const groups = peerCount <= 4 ? combinations(limited, peerCount) : [limited.slice(0, peerCount)];

      for (const group of groups) {
        const base = groupBase(profile, group, window, history, population);
        if (!base) continue;
        const agreement = [profile, ...group].filter((person) => acceptsSize(person, size)).length;
        const bio = bioAffinity(profile, group) * 0.04;
        for (const activity of activities) {
          const length = duration || activity.duration;
          const end = window.start + length;
          if (end > window.end) continue;
          if (!group.every((p) => freeFor(p, day, window.start, end))) continue;
          if (!freeFor(profile, day, window.start, end) && ask?.start == null) continue;
          if (ask?.start != null && !group.every((p) => freeFor(p, day, window.start, end))) continue;

          const key = `${[...group.map((p) => p.id)].sort().join('.')}|${activity.id}|${window.start}`;
          if (passed.includes(key)) continue;
          const judged = scoreGroup(base, activity, ask, profile);
          if (!judged) continue;
          const rank = judged.score + agreement * 0.03 + learnedBoost(profile, activity, population) + bio;
          if (!best || rank > best.rank) {
            best = { key, group, activity, start: window.start, end, window, judged, rank };
          }
        }
      }
    }
  }

  if (!best) return null;
  const place = placeById(best.activity.place);
  const activity = activityById(best.activity.id);
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
    why: whyGroup(profile, best.group, population),
    ask: ask ? { ...ask } : null,
  };
}
