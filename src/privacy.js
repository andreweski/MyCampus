export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.map((part) => part[0]).slice(0, 2).join('').toUpperCase();
}

/** Seed classmates from schema.sql — they cannot log in. */
export const DEMO_PROFILE_IDS = new Set([
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
]);

const DEMO_SLUG_IDS = new Set(['jordan', 'priya', 'maya', 'sam', 'elena', 'noah', 'hana', 'luis', 'alex', 'chris']);

/** Map local PEERS slugs to the seeded Supabase profile ids. */
export const DEMO_ID_BY_SLUG = {
  jordan: '11111111-1111-4111-8111-111111111111',
  priya: '22222222-2222-4222-8222-222222222222',
  maya: '33333333-3333-4333-8333-333333333333',
  sam: '44444444-4444-4444-8444-444444444444',
  elena: '55555555-5555-4555-8555-555555555555',
  luis: '66666666-6666-4666-8666-666666666666',
};

export function isDemoPeerId(id) {
  const value = String(id || '');
  return DEMO_PROFILE_IDS.has(value) || DEMO_SLUG_IDS.has(value);
}

export function isDemoAccount(email) {
  const address = String(email || '').trim().toLowerCase();
  return address === 'demo@school.edu' || address.endsWith('@school.edu');
}

/** True only for real auth users who can open the app and accept. */
export function isLiveUserId(id) {
  if (isDemoPeerId(id)) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''));
}

/** Show full name only after that person has accepted. */
export function personLabel(person) {
  if (!person) return '?';
  if (person.status === 'accepted') return person.name || initialsOf(person.name);
  return initialsOf(person.name);
}

export function redactPeer(peer, { reveal = false } = {}) {
  const shown = reveal || peer?.status === 'accepted';
  const label = shown ? (peer.name || initialsOf(peer.name)) : initialsOf(peer.name);
  return {
    ...peer,
    label,
    displayName: label,
    major: peer.major || '',
    because: peer.because || '',
    revealed: shown,
  };
}

export function redactWhy(why, peers = []) {
  let text = String(why || '');
  for (const peer of peers) {
    const name = String(peer?.name || '').trim();
    if (!name) continue;
    const first = name.split(/\s+/)[0];
    const initials = initialsOf(name);
    text = text.split(name).join(initials);
    if (first && first !== name) text = text.split(first).join(initials);
  }
  return text;
}
