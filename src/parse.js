import { intentsIn, clusterOf, resolveHobby, normalizeHobby } from './data.js';

const WEEKDAYS = [
  ['sunday', 'sun'],
  ['monday', 'mon'],
  ['tuesday', 'tue', 'tues'],
  ['wednesday', 'wed', 'weds'],
  ['thursday', 'thu', 'thur', 'thurs'],
  ['friday', 'fri'],
  ['saturday', 'sat'],
];

const DAY_WORD = WEEKDAYS.flat().sort((a, b) => b.length - a.length).join('|');
const DAY_RE = new RegExp(`\\b(?:(next|this)\\s+)?(tomorrow|tmrw|tmr|${DAY_WORD})\\b`, 'gi');
const BETWEEN_RE = /\b(?:between|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:and|to|-)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
const RANGE_RE = /(?:^|[\s,])(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
const AFTER_RE = /\bafter(?:\s+my)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?:\s+class)?/gi;
const PLAY_RE = /\b(?:want to|wanna|going to|gonna)\s+(?:play|do|go|watch|try|have)\s+(?:something\s+)?([a-z][a-z-]*)/gi;
const PLAYING_RE = /\bplay(?:ing)?\s+([a-z][a-z-]*)/gi;
const AT_RE = /\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/gi;
const NAMED_RE = /\b(lunch|morning|afternoon|tonight|evening)\b/gi;

function toMinutes(hour, minute, ap) {
  let h = Number(hour);
  const m = Number(minute || 0);
  const mark = (ap || '').toLowerCase();
  if (mark === 'pm' && h < 12) h += 12;
  if (mark === 'am' && h === 12) h = 0;
  if (!mark && h >= 1 && h <= 7) h += 12;
  return h * 60 + m;
}

function collect(re, text) {
  const found = [];
  re.lastIndex = 0;
  let match = re.exec(text);
  while (match) {
    if (match[0].length === 0) re.lastIndex += 1;
    else found.push(match);
    match = re.exec(text);
  }
  return found;
}

function spanOf(match) {
  const raw = match[0];
  const lead = raw.length - raw.trimStart().length;
  const trail = raw.length - raw.trimEnd().length;
  return { start: match.index + lead, end: match.index + raw.length - trail };
}

const ACTIVITY_SKIP = new Set(['something', 'some', 'a', 'an', 'the', 'my', 'to', 'just', 'around', 'class', 'free', 'with']);

export function readActivity(label) {
  const key = normalizeHobby(label);
  if (!key) return { intents: [] };
  const resolved = resolveHobby(key);
  if (resolved.known) return { intents: [resolved.id] };
  const hits = intentsIn(key);
  if (hits.length) return { intents: hits };
  return { intents: [key] };
}

function activityLabel(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function wordSpan(hit, word) {
  const local = hit[0].toLowerCase().lastIndexOf(word);
  const start = hit.index + (local < 0 ? 0 : local);
  return { start, end: start + word.length };
}

function explicitActivity(text) {
  for (const re of [PLAY_RE, PLAYING_RE]) {
    const hits = collect(re, text);
    if (!hits.length) continue;
    const hit = hits[hits.length - 1];
    const word = hit[1].toLowerCase();
    if (ACTIVITY_SKIP.has(word)) continue;
    return { label: activityLabel(word), ...wordSpan(hit, word) };
  }
  return null;
}

function impliedActivity(text, occupied) {
  const tokens = [...text.matchAll(/[a-z0-9]+/gi)];
  const covered = (token) => occupied.some((mark) => token.index >= mark.start && token.index < mark.end);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (covered(token)) continue;
    const word = token[0].toLowerCase();
    if (ACTIVITY_SKIP.has(word)) continue;
    const next = tokens[i + 1];
    if (next && !covered(next)) {
      const pair = `${word} ${next[0].toLowerCase()}`;
      const pairHits = intentsIn(pair);
      const single = intentsIn(word);
      if (pairHits.length && pairHits[0] !== single[0]) {
        return { label: activityLabel(pair), start: token.index, end: next.index + next[0].length };
      }
    }
    if (intentsIn(word).length) return { label: activityLabel(word), start: token.index, end: token.index + token[0].length };
  }
  return null;
}

const MONTHS = [
  ['january', 'jan'], ['february', 'feb'], ['march', 'mar'], ['april', 'apr'],
  ['may'], ['june', 'jun'], ['july', 'jul'], ['august', 'aug'],
  ['september', 'sep', 'sept'], ['october', 'oct'], ['november', 'nov'], ['december', 'dec'],
];
const MONTH_WORD = MONTHS.flat().sort((a, b) => b.length - a.length).join('|');
const COUNT_WORD = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an|\\d{1,2}';
const MONTH_DAY_RE = new RegExp(`\\b(${MONTH_WORD})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi');
const DAY_MONTH_RE = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_WORD})(?:,?\\s+(\\d{4}))?\\b`, 'gi');
const NUMERIC_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/gi;
const ORDINAL_RE = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/gi;
const WEEK_SHIFT_RE = new RegExp(`\\b(?:(next)\\s+week|(this)\\s+week|in\\s+(${COUNT_WORD})\\s+weeks?)\\b`, 'gi');
const MONTH_SHIFT_RE = new RegExp(`\\b(?:(next)\\s+month|(this)\\s+month|in\\s+(${COUNT_WORD})\\s+months?)\\b`, 'gi');
const FROM_RE = new RegExp(`\\b(?:in\\s+)?(${COUNT_WORD})\\s+weeks?\\s+from\\s+(today|tomorrow|tmrw|tmr|${DAY_WORD})\\b`, 'gi');
const COUNTS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

function weekdayIndex(word) {
  const key = word.toLowerCase();
  return WEEKDAYS.findIndex((names) => names.includes(key));
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, count) {
  const next = startOfDay(date);
  next.setDate(next.getDate() + count);
  return next;
}

function addMonths(date, count) {
  const next = startOfDay(date);
  const day = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + count);
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, last));
  return next;
}

function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatAskDate(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const label = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${label} ${date.getDate()}`;
}

function countOf(word) {
  if (!word) return 1;
  const named = COUNTS[word.toLowerCase()];
  if (named) return named;
  const value = Number(word);
  return Number.isFinite(value) ? value : 1;
}

function monthIndex(word) {
  const key = word.toLowerCase();
  return MONTHS.findIndex((names) => names.includes(key));
}

function latest(matches) {
  if (!matches.length) return null;
  return matches.slice().sort((a, b) => spanOf(a).end - spanOf(b).end).at(-1);
}

function calendarDate(month, day, year, now) {
  const today = startOfDay(now);
  let y = year ? Number(year) : today.getFullYear();
  if (year && y < 100) y += 2000;
  const built = new Date(y, month, Number(day));
  if (built.getMonth() !== month || built.getDate() !== Number(day)) return null;
  if (!year && built < today) return new Date(y + 1, month, Number(day));
  return built;
}

function explicitDate(text, now) {
  const found = [];
  collect(MONTH_DAY_RE, text).forEach((hit) => {
    const date = calendarDate(monthIndex(hit[1]), hit[2], hit[3], now);
    if (date) found.push(Object.assign(hit, { date }));
  });
  collect(DAY_MONTH_RE, text).forEach((hit) => {
    const date = calendarDate(monthIndex(hit[2]), hit[1], hit[3], now);
    if (date) found.push(Object.assign(hit, { date }));
  });
  collect(NUMERIC_RE, text).forEach((hit) => {
    const month = Number(hit[1]) - 1;
    if (month < 0 || month > 11) return;
    const date = calendarDate(month, hit[2], hit[3], now);
    if (date) found.push(Object.assign(hit, { date }));
  });
  const hit = latest(found);
  if (!hit) return null;
  return { date: hit.date, span: spanOf(hit) };
}

function weekMonday(date) {
  const delta = (startOfDay(date).getDay() + 6) % 7;
  return addDays(date, -delta);
}

function weekdayOnOrAfter(date, weekday) {
  const delta = (weekday - startOfDay(date).getDay() + 7) % 7;
  return addDays(date, delta);
}

function weekdayInWeek(monday, weekday) {
  return addDays(monday, (weekday + 6) % 7);
}

function shiftOf(re, text, nextIndex) {
  const hit = latest(collect(re, text));
  if (!hit) return null;
  if (hit[nextIndex]) return { n: 1, span: spanOf(hit) };
  const count = hit[3] ? countOf(hit[3]) : 0;
  return { n: count, span: spanOf(hit) };
}

function fromDate(text, now) {
  const hit = latest(collect(FROM_RE, text));
  if (!hit) return null;
  const today = startOfDay(now);
  const word = hit[2].toLowerCase();
  const count = countOf(hit[1]);
  let anchor = today;
  if (word === 'tomorrow' || word === 'tmrw' || word === 'tmr') anchor = addDays(today, 1);
  else if (word !== 'today') anchor = weekdayOnOrAfter(today, weekdayIndex(word));
  return { date: addDays(anchor, 7 * count), span: spanOf(hit) };
}

function resolveWhen(text, now) {
  const today = startOfDay(now);
  const explicit = explicitDate(text, now);
  if (explicit) return { date: explicit.date, marks: [explicit.span] };
  const from = fromDate(text, now);
  if (from) return { date: from.date, marks: [from.span] };

  const named = latest(collect(DAY_RE, text));
  const weeks = shiftOf(WEEK_SHIFT_RE, text, 1);
  const months = shiftOf(MONTH_SHIFT_RE, text, 1);
  const ordinal = latest(collect(ORDINAL_RE, text));

  if (named) {
    const word = named[2].toLowerCase();
    const tomorrow = word === 'tomorrow' || word === 'tmrw' || word === 'tmr';
    const next = named[1] === 'next';
    let date;
    if (tomorrow) {
      date = addDays(today, 1 + (next ? 7 : 0) + (weeks?.n || 0) * 7);
      if (months) date = addMonths(date, months.n);
    } else if (months) {
      const base = addMonths(today, months.n || 1);
      date = weekdayOnOrAfter(new Date(base.getFullYear(), base.getMonth(), 1), weekdayIndex(word));
    } else if (named[1] === 'this' && !weeks) {
      date = weekdayInWeek(weekMonday(today), weekdayIndex(word));
    } else {
      const shift = Math.max(weeks?.n || 0, next ? 1 : 0);
      date = shift
        ? weekdayInWeek(addDays(weekMonday(today), 7 * shift), weekdayIndex(word))
        : weekdayOnOrAfter(today, weekdayIndex(word));
    }
    return { date, marks: [spanOf(named)] };
  }

  if (ordinal) {
    const day = Number(ordinal[1]);
    const shift = months?.n || 0;
    let date = new Date(today.getFullYear(), today.getMonth() + shift, day);
    if (date.getDate() !== day) date = null;
    if (date && date < today) date = new Date(today.getFullYear(), today.getMonth() + shift + 1, day);
    if (date && date.getDate() === day) return { date, marks: [spanOf(ordinal)] };
  }

  if (weeks) return { date: addDays(today, 7 * weeks.n), marks: [weeks.span] };
  if (months) return { date: addMonths(today, months.n), marks: [months.span] };
  return { date: today, marks: [] };
}

function clockFrom(kind, match, hourLong) {
  const duration = hourLong ? 60 : 75;
  if (kind === 'named') {
    const word = match[1].toLowerCase();
    const blocks = { lunch: [12 * 60, 14 * 60], morning: [9 * 60, 12 * 60], afternoon: [14 * 60, 17 * 60], tonight: [17 * 60, 20 * 60], evening: [17 * 60, 20 * 60] };
    const [start, blockEnd] = blocks[word];
    return { start, end: hourLong ? start + 60 : blockEnd };
  }
  if (kind === 'after') {
    const start = toMinutes(match[1], match[2], match[3]);
    return { start, end: start + (hourLong ? 60 : 90) };
  }
  if (kind === 'at') {
    const start = toMinutes(match[1], match[2], match[3]);
    return { start, end: start + duration };
  }
  let start = toMinutes(match[1], match[2], match[3]);
  let end = toMinutes(match[4], match[5], match[6]);
  if (end <= start && !match[6]) end += 12 * 60;
  if (end <= start) end = start + duration;
  return { start, end };
}

function bestClock(text, hourLong) {
  const numeric = [
    ...collect(BETWEEN_RE, text).map((match) => ({ match, kind: 'between' })),
    ...collect(RANGE_RE, text).map((match) => ({ match, kind: 'between' })),
    ...collect(AFTER_RE, text).map((match) => ({ match, kind: 'after' })),
    ...collect(AT_RE, text).map((match) => ({ match, kind: 'at' })),
  ];
  const pool = numeric.length
    ? numeric
    : collect(NAMED_RE, text).map((match) => ({ match, kind: 'named' }));
  if (!pool.length) return null;
  const length = (item) => spanOf(item.match).end - spanOf(item.match).start;
  const picked = pool.sort((a, b) => spanOf(a.match).end - spanOf(b.match).end || length(a) - length(b)).at(-1);
  return { ...clockFrom(picked.kind, picked.match, hourLong), mark: spanOf(picked.match) };
}

export function parseAsk(text, now = new Date()) {
  const raw = String(text || '');
  const t = raw.toLowerCase();
  if (!t.trim()) return null;

  const intents = intentsIn(t);
  const hourLong = /\b(for an hour|for 1 hour|for one hour|for an hr)\b/.test(t);
  const duration = hourLong ? 60 : 75;
  const clock = bestClock(t, hourLong);
  const when = resolveWhen(t, now);

  let start = clock?.start ?? null;
  let end = clock?.end ?? null;
  if (start == null && intents.length) {
    if (intents.includes('dinner')) {
      start = 17 * 60;
      end = 20 * 60;
    } else if (clusterOf(intents[0]) === 'food') {
      start = 12 * 60;
      end = 14 * 60;
    } else {
      start = 14 * 60;
      end = 17 * 60;
    }
  }

  const marks = [];
  if (start != null && clock?.mark) marks.push(clock.mark);
  if (start != null) {
    when.marks.forEach((mark) => {
      if (!marks.some((have) => mark.start < have.end && mark.end > have.start)) marks.push(mark);
    });
  }
  const found = explicitActivity(t) || (start != null ? impliedActivity(t, marks) : null);
  if (found && !marks.some((have) => found.start < have.end && found.end > have.start)) {
    marks.push({ start: found.start, end: found.end });
  }
  marks.sort((a, b) => a.start - b.start);
  const activity = found?.label || '';

  return {
    text: raw.trim(),
    intents: activity ? readActivity(activity).intents : intents,
    activity,
    start,
    end,
    day: when.date.getDay(),
    date: isoDate(when.date),
    marks,
    duration: end != null && start != null ? Math.min(duration, end - start) : duration,
  };
}
