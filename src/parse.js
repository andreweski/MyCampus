import { intentsIn, clusterOf } from './data.js';

function toMinutes(hour, minute, ap) {
  let h = Number(hour);
  const m = Number(minute || 0);
  const mark = (ap || '').toLowerCase();
  if (mark === 'pm' && h < 12) h += 12;
  if (mark === 'am' && h === 12) h = 0;
  if (!mark && h >= 1 && h <= 7) h += 12;
  return h * 60 + m;
}

export function parseAsk(text) {
  const raw = String(text || '').trim();
  const t = raw.toLowerCase();
  if (!t) return null;

  const intents = intentsIn(t);

  let start = null;
  let end = null;
  const hourLong = /\b(for an hour|for 1 hour|for one hour|for an hr)\b/.test(t);
  const duration = hourLong ? 60 : 75;

  if (/\blunch\b/.test(t)) { start = 12 * 60; end = 14 * 60; }
  else if (/\bmorning\b/.test(t)) { start = 9 * 60; end = 12 * 60; }
  else if (/\b(tonight|evening)\b/.test(t)) { start = 17 * 60; end = 20 * 60; }
  else if (/\bafternoon\b/.test(t)) { start = 14 * 60; end = 17 * 60; }

  const between = t.match(/between\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+and\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const after = t.match(/after(?:\s+my)?\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  const at = t.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);

  if (between) {
    start = toMinutes(between[1], between[2], between[3] || between[6]);
    end = toMinutes(between[4], between[5], between[6] || between[3]);
  } else if (after) {
    start = toMinutes(after[1], after[2], after[3]);
    end = start + (hourLong ? 60 : 90);
  } else if (at) {
    start = toMinutes(at[1], at[2], at[3]);
    end = start + duration;
  } else if (start != null && hourLong) {
    end = start + 60;
  }

  if (start != null && end != null && end <= start) end = start + duration;
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
  return {
    text: raw,
    intents,
    start,
    end,
    duration: end != null && start != null ? Math.min(duration, end - start) : duration,
  };
}
