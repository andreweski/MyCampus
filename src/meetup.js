import { isSupabaseConfigured, supabase } from './supabase.js';
import { isLiveUserId } from './privacy.js';

let tablesReady = null;

export async function meetupsAvailable() {
  if (!isSupabaseConfigured) return false;
  if (tablesReady != null) return tablesReady;
  const { error } = await supabase.from('meetups').select('id').limit(1);
  if (!error) {
    tablesReady = true;
    return true;
  }
  if (/permission|policy|row-level|JWT/i.test(error.message || '')) {
    tablesReady = true;
    return true;
  }
  if (/relation|does not exist|schema cache|Could not find the table/i.test(error.message || '')) {
    tablesReady = false;
    return false;
  }
  tablesReady = false;
  return false;
}

export function planPayloadFromRec(rec) {
  return {
    key: rec.key,
    title: rec.title,
    line: rec.line,
    activityId: rec.activityId,
    place: rec.place,
    start: rec.start,
    end: rec.end,
    day: rec.day,
    dayLabel: rec.dayLabel,
    school: rec.school,
    roster: rec.roster,
    crowdCount: rec.crowdCount,
    why: rec.why,
  };
}

export function planFromMeetup(row, members, { userId } = {}) {
  const payload = row.payload || {};
  const host = members.find((m) => m.role === 'host') || members.find((m) => m.user_id === row.host_id);
  const guests = members.filter((m) => m.user_id !== userId && m.status !== 'declined');
  const self = members.find((m) => m.user_id === userId);
  return {
    id: row.id,
    meetupId: row.id,
    key: payload.key || row.id,
    title: payload.title,
    line: payload.line,
    activityId: payload.activityId,
    place: payload.place,
    start: payload.start,
    end: payload.end,
    day: payload.day,
    dayLabel: payload.dayLabel,
    school: payload.school || row.school,
    roster: payload.roster || 'names',
    crowdCount: payload.crowdCount || guests.length + 1,
    why: payload.why,
    status: row.status,
    hostId: row.host_id,
    role: self?.role || (row.host_id === userId ? 'host' : 'guest'),
    memberStatus: self?.status || 'invited',
    userHere: Boolean(self?.here),
    peers: guests.map((m) => ({
      id: m.user_id,
      name: m.name || '',
      major: m.major || '',
      status: m.status,
      role: m.role,
      here: Boolean(m.here),
      because: m.because || '',
    })),
  };
}

export async function createMeetup({ hostId, hostProfile, rec }) {
  const ready = await meetupsAvailable();
  const livePeers = (rec.peers || []).filter((peer) => isLiveUserId(peer.id));
  const localPeers = (rec.peers || []).filter((peer) => !isLiveUserId(peer.id));

  if (!ready) {
    return {
      mode: 'local',
      plan: {
        ...planPayloadFromRec(rec),
        id: `local-${Date.now()}`,
        meetupId: null,
        status: 'open',
        hostId,
        role: 'host',
        memberStatus: 'accepted',
        userHere: false,
        peers: (rec.peers || []).map((peer) => ({
          id: peer.id,
          name: peer.name,
          major: peer.major || '',
          status: isLiveUserId(peer.id) ? 'invited' : 'invited',
          role: 'guest',
          here: false,
          because: peer.because || '',
          synthetic: !isLiveUserId(peer.id),
        })),
      },
    };
  }

  const payload = planPayloadFromRec(rec);
  const { data: meetup, error } = await supabase.from('meetups').insert({
    host_id: hostId,
    school: rec.school || hostProfile?.school || null,
    payload,
    status: 'open',
  }).select('*').single();
  if (error || !meetup) throw error || new Error('Could not create meetup.');

  const rows = [
    {
      meetup_id: meetup.id,
      user_id: hostId,
      role: 'host',
      status: 'accepted',
      here: false,
      name: hostProfile?.name || '',
      major: hostProfile?.major || '',
    },
    ...livePeers.map((peer) => ({
      meetup_id: meetup.id,
      user_id: peer.id,
      role: 'guest',
      status: 'invited',
      here: false,
      // Names stay off the row until that person accepts.
      name: '',
      major: '',
    })),
  ];
  const { error: memberError } = await supabase.from('meetup_members').insert(rows);
  if (memberError) {
    await supabase.from('meetups').delete().eq('id', meetup.id);
    throw memberError;
  }

  return {
    mode: 'shared',
    plan: {
      ...planPayloadFromRec(rec),
      id: meetup.id,
      meetupId: meetup.id,
      status: 'open',
      hostId,
      role: 'host',
      memberStatus: 'accepted',
      userHere: false,
      peers: [
        ...livePeers.map((peer) => ({
          id: peer.id,
          name: peer.name,
          major: peer.major || '',
          status: 'invited',
          role: 'guest',
          here: false,
          because: peer.because || '',
          synthetic: false,
        })),
        ...localPeers.map((peer) => ({
          id: peer.id,
          name: peer.name,
          major: peer.major || '',
          status: 'invited',
          role: 'guest',
          here: false,
          because: peer.because || '',
          synthetic: true,
        })),
      ],
    },
  };
}

export async function fetchInviteFor(userId) {
  if (!(await meetupsAvailable()) || !userId) return null;
  const { data: memberships, error } = await supabase
    .from('meetup_members')
    .select('meetup_id, status, role, here')
    .eq('user_id', userId)
    .eq('status', 'invited')
    .limit(5);
  if (error || !memberships?.length) return null;
  for (const membership of memberships) {
    const plan = await fetchMeetup(membership.meetup_id, userId);
    if (plan && plan.status === 'open') return plan;
  }
  return null;
}

export async function fetchMeetup(meetupId, userId) {
  if (!(await meetupsAvailable()) || !meetupId) return null;
  const { data: meetup, error } = await supabase.from('meetups').select('*').eq('id', meetupId).maybeSingle();
  if (error || !meetup || meetup.status === 'cancelled') return null;
  const { data: members, error: memberError } = await supabase
    .from('meetup_members')
    .select('*')
    .eq('meetup_id', meetupId);
  if (memberError || !members?.length) return null;
  return planFromMeetup(meetup, members, { userId });
}

export async function updateMemberStatus(meetupId, userId, patch) {
  if (!(await meetupsAvailable())) return { ok: false };
  const { error } = await supabase
    .from('meetup_members')
    .update(patch)
    .eq('meetup_id', meetupId)
    .eq('user_id', userId);
  return { ok: !error, error };
}

export async function cancelMeetup(meetupId, hostId) {
  if (!(await meetupsAvailable()) || !meetupId) return { ok: true, mode: 'local' };
  await supabase.from('meetup_members').update({ status: 'declined' }).eq('meetup_id', meetupId).neq('user_id', hostId);
  const { error } = await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', meetupId).eq('host_id', hostId);
  return { ok: !error, error };
}

export async function completeMeetup(meetupId) {
  if (!(await meetupsAvailable()) || !meetupId) return;
  await supabase.from('meetups').update({ status: 'completed' }).eq('id', meetupId);
}
