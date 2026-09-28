import { useEffect } from 'react';
import { PREVIEW_COUNT, formatRange } from './match.js';
import { cancelPlan, completePlan, getState, markHere, markPeerHere, retryDemoAccepts } from './store.js';
import { isDemoPeerId, redactPeer } from './privacy.js';
import { Avatar, CampusMap } from './ui.jsx';
import { userPlaces } from './data.js';

function statusLine(peer) {
  if (peer.here) return 'At the spot';
  if (peer.status === 'accepted') return 'On the way';
  if (peer.status === 'declined') return 'Declined';
  return 'Invite pending';
}

function isDemoGuest(peer) {
  return Boolean(peer?.synthetic || peer?.demo || isDemoPeerId(peer?.id));
}

export function Plan({ plan }) {
  const profile = getState().profile;
  const places = userPlaces(plan.school, profile);
  useEffect(() => {
    if (!plan) return;
    if (!(plan.peers || []).some((p) => p.status === 'invited' && isDemoGuest(p))) return;
    retryDemoAccepts();
  }, [plan?.meetupId, plan?.id]);

  useEffect(() => {
    if (!plan?.userHere) return undefined;
    const next = plan.peers.find((p) => isDemoGuest(p) && p.status === 'accepted' && !p.here);
    if (!next) return undefined;
    const timer = setTimeout(() => markPeerHere(next.id), 1100);
    return () => clearTimeout(timer);
  }, [plan]);

  useEffect(() => {
    if (!plan?.userHere || !plan.peers.some((p) => p.here)) return undefined;
    const timer = setTimeout(() => completePlan(), 900);
    return () => clearTimeout(timer);
  }, [plan]);

  const shown = plan.roster === 'preview' || plan.roster === 'count' ? plan.peers.slice(0, PREVIEW_COUNT) : plan.peers;
  const hidden = Math.max(0, (plan.crowdCount || plan.peers.length + 1) - 1 - shown.length);
  const waiting = shown.some((p) => p.status === 'invited');

  return (
    <main className="screen">
      <p className="kicker">You are going</p>
      <h1>{plan.title}</h1>
      <p className="place">{plan.dayLabel} · {formatRange(plan.start, plan.end)}</p>
      <p className="line">{plan.place?.name}{plan.place?.note ? `. ${plan.place.note}.` : plan.place?.name ? '.' : ''}</p>
      <p className="privacy">
        {waiting
          ? 'Full names open only after someone accepts. Declines stay as initials.'
          : 'Check-in only confirms this plan. MyCampus does not keep a trail of where you were before or after.'}
      </p>
      <ul className="people">
        <li>
          <span className={`dot ${plan.userHere ? 'on' : ''}`} />
          <div><strong>You</strong><span>{plan.userHere ? 'Here' : 'Not checked in'}</span></div>
        </li>
        {shown.map((peer) => {
          const shownPeer = redactPeer(peer);
          return (
            <li key={peer.id}>
              <Avatar person={shownPeer} size={40} />
              <div>
                <strong>{shownPeer.displayName}</strong>
                <span>{statusLine(peer)}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="whisper">And {hidden.toLocaleString('en-US')} more people are in this plan.</p>}
      {!plan.userHere && (
        <button type="button" className="solid accent" onClick={markHere}>I&apos;m here</button>
      )}
      {plan.userHere && <p className="lede">Waiting until someone else in the group is here too. That is the whole proximity check.</p>}
      {plan.place && (
        <CampusMap activeId={plan.place.id} userZone={plan.place?.zone} school={plan.school} places={places} />
      )}
      <button type="button" className="texty" onClick={() => void cancelPlan()}>Can&apos;t make it</button>
    </main>
  );
}

export function Reward({ reward, onDone }) {
  return (
    <main className="screen reward">
      <p className="kicker">Match completed</p>
      <h1>You met.</h1>
      <p className="lede">{reward.title} with {reward.people.join(', ')}.</p>
      <p className="xp">+{reward.xp} XP</p>
      <p className="whisper">Streak {reward.streak}</p>
      {reward.badge && <p className="badge-pop">New badge unlocked. It is on Rewards.</p>}
      <button type="button" className="solid accent" onClick={onDone}>Keep going</button>
    </main>
  );
}
