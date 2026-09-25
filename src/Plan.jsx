import { useEffect } from 'react';
import { formatRange } from './match.js';
import { cancelPlan, completePlan, markHere, markPeerHere } from './store.js';
import { Avatar, CampusMap } from './ui.jsx';

export function Plan({ plan }) {
  useEffect(() => {
    if (!plan?.userHere) return undefined;
    const next = plan.peers.find((p) => !p.here);
    if (!next) return undefined;
    const timer = setTimeout(() => markPeerHere(next.id), 1100);
    return () => clearTimeout(timer);
  }, [plan]);

  useEffect(() => {
    if (!plan?.userHere || !plan.peers.some((p) => p.here)) return undefined;
    const timer = setTimeout(() => completePlan(), 900);
    return () => clearTimeout(timer);
  }, [plan]);

  return (
    <main className="screen">
      <p className="kicker">You are going</p>
      <h1>{plan.title}</h1>
      <p className="place">{plan.dayLabel} · {formatRange(plan.start, plan.end)}</p>
      <p className="line">{plan.place.name}. {plan.place.note}.</p>
      <p className="privacy">Check-in only confirms this plan. MyCampus does not keep a trail of where you were before or after.</p>
      <ul className="people">
        <li>
          <span className={`dot ${plan.userHere ? 'on' : ''}`} />
          <div><strong>You</strong><span>{plan.userHere ? 'Here' : 'Not checked in'}</span></div>
        </li>
        {plan.peers.map((peer) => (
          <li key={peer.id}>
            <Avatar person={peer} size={40} />
            <div>
              <strong>{peer.name}</strong>
              <span>{peer.here ? 'At the spot' : 'On the way'}</span>
            </div>
          </li>
        ))}
      </ul>
      {!plan.userHere && (
        <button type="button" className="solid accent" onClick={markHere}>I&apos;m here</button>
      )}
      {plan.userHere && <p className="lede">Waiting until someone else in the group is here too. That is the whole proximity check.</p>}
      <CampusMap activeId={plan.place.id} />
      <button type="button" className="texty" onClick={cancelPlan}>Can&apos;t make it</button>
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
