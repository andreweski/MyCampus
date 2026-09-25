import {
  ACTIVITIES, BANDS, DAY_LABELS, PEERS, activityById, clusterOf, pairAffinity, personTags,
  placeById, sharedLanguage, tagAffinity, zonesClose,
} from './data.js';

function listAffinity(a, b) {
  if (!a.length || !b.length) return 0;
  const scores = a.map((tag) => Math.max(...b.map((other) => tagAffinity(tag, other))));
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function hobbyAffinity(a, b) {
  const ha = (a.hobbies || []).map((t) => t.toLowerCase());
  const hb = (b.hobbies || []).map((t) => t.toLowerCase());
  return listAffinity(ha, hb);
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

function because(user, peer) {
  const hobbies = sharedLanguage(
    { hobbies: user.hobbies, interests: [], activities: [] },
    { hobbies: peer.hobbies, interests: [], activities: [] },
  );
  if (hobbies.length) return `Free at the same time, and you both like ${hobbies[0]}`;
  const shared = sharedLanguage(user, peer);
  if (shared.length) return `Your hours overlap, and you are close on ${shared[0]}`;
  if (zonesClose(user.zone, peer.zone)) return 'Free then, and usually on the same part of campus';
  return peer.vibe;
}

function whyGroup(user, peers, activity) {
  const names = peers.map((p) => p.name.split(' ')[0]);
  const who = names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`;
  const hobbies = sharedLanguage(
    { hobbies: user.hobbies, interests: [], activities: [] },
    { hobbies: peers.flatMap((p) => p.hobbies), interests: [], activities: [] },
  );
  const topic = hobbies[0] || activity.intents[0];
  return `${who} are actually free then. The group stays small, and ${topic} is what you share.`;
}

function scoreGroup(user, peers, activity, window, ask, history) {
  const members = [user, ...peers];
  const pairs = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) pairs.push(pairAffinity(members[i], members[j]));
  }
  const interest = pairs.reduce((s, n) => s + n, 0) / pairs.length;
  const hobbyPairs = [];
  for (let i = 0; i < members.length; i += 1) {
    for (let j = i + 1; j < members.length; j += 1) hobbyPairs.push(hobbyAffinity(members[i], members[j]));
  }
  const hobby = hobbyPairs.reduce((s, n) => s + n, 0) / hobbyPairs.length;
  const weakest = Math.min(...pairs, ...hobbyPairs);
  if (weakest < 0.12 || Math.max(hobby, interest) < 0.28) return null;

  const fit = activityFit(activity, members, ask);
  if (fit < 0.28) return null;

  const place = placeById(activity.place);
  const proximity = members.filter((m) => zonesClose(m.zone, place.zone)).length / members.length;
  const schedule = scheduleScore(members, window);
  const sameMajor = peers.filter((p) => p.major && p.major === user.major).length / peers.length;
  const past = historyAdjust(peers.map((p) => p.id), history);
  const liked = place && (user.preferredPlaces || []).includes(place.id) ? 0.07 : 0;
  const score = schedule * 0.34 + hobby * 0.32 + fit * 0.18 + interest * 0.08 + proximity * 0.05 + sameMajor * 0.03 + past + liked;
  return { score, interest: hobby, fit, proximity };
}

function roundSize(value) {
  const size = Math.max(2, Number(value) || 3);
  if (size <= 4) return size;
  return Math.max(5, Math.round(size / 5) * 5);
}

function votedSize(person) {
  if (person.groupFlex === 'any' || person.groupSize === 0) return null;
  if (person.groupFlex === 'atLeast') return 5;
  return roundSize(person.groupSize);
}

function acceptsSize(person, size) {
  if (person.groupFlex === 'any' || person.groupSize === 0) return true;
  return votedSize(person) === size;
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
    const vote = votedSize(person);
    if (!vote) continue;
    counts.set(vote, (counts.get(vote) || 0) + 1);
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
  const day = now.getDay();
  if (ask?.start == null && !profile.availability.days?.includes(day)) return null;

  const windows = windowsFor(profile, day, ask).filter((w) => (ask || profile.availability.days.includes(day)));
  let best = null;

  for (const window of windows) {
    const duration = ask?.duration || null;
    const free = peers.filter((p) => p.id !== profile.id && freeFor(p, day, window.start, window.end));
    if (!free.length) continue;
    const wanted = popularSize([profile, ...free]);
    const target = fitTarget(wanted, free.length + 1);
    let peerCount = Math.max(1, target - 1);
    const willing = free.filter((person) => acceptsSize(person, target) || acceptsSize(person, wanted));
    const pool = willing.length >= peerCount ? willing : [...willing, ...free.filter((person) => !willing.includes(person))];
    if (pool.length < peerCount) peerCount = pool.length;
    const groups = peerCount <= 4 ? combinations(pool, peerCount) : [pool.slice(0, peerCount)];

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

    for (const group of groups) {
        for (const activity of activities) {
          const length = duration || activity.duration;
          const end = window.start + length;
          if (end > window.end) continue;
          if (!group.every((p) => freeFor(p, day, window.start, end))) continue;
          if (!freeFor(profile, day, window.start, end) && ask?.start == null) continue;
          if (ask?.start != null && !group.every((p) => freeFor(p, day, window.start, end))) continue;

          const key = `${[...group.map((p) => p.id)].sort().join('.')}|${activity.id}|${window.start}`;
          if (passed.includes(key)) continue;
          const judged = scoreGroup(profile, group, activity, window, ask, history);
          if (!judged) continue;
          const agreement = [profile, ...group].filter((person) => acceptsSize(person, target)).length;
          const rank = judged.score + agreement * 0.03;
          if (!best || rank > best.rank) {
            best = { key, group, activity, start: window.start, end, window, judged, rank };
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
    dayLabel: DAY_LABELS[day],
    peers: best.group.map((peer) => ({ ...peer, because: because(profile, peer) })),
    why: whyGroup(profile, best.group, activity),
    ask: ask ? { ...ask } : null,
  };
}
