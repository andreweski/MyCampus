import { useEffect, useState, useSyncExternalStore } from 'react';
import { Onboarding } from './Onboarding.jsx';
import { Today } from './Today.jsx';
import { Plan, Reward } from './Plan.jsx';
import { MapScreen, Profile, Rewards } from './More.jsx';
import { Auth, ConfirmCode } from './Auth.jsx';
import { dismissReward, getState, saveProfile, subscribe } from './store.js';

const TABS = [
  ['today', 'Today'],
  ['map', 'Map'],
  ['rewards', 'Rewards'],
  ['you', 'You'],
];

export function App() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const [tab, setTab] = useState('today');
  const planKey = state.plan?.key;

  useEffect(() => {
    if (planKey) setTab('plan');
  }, [planKey]);

  useEffect(() => {
    if (!state.plan && tab === 'plan') setTab('today');
  }, [state.plan, tab]);

  if (!state.accountEmail) return <Auth />;
  if (state.signupConfirmed === false) return <ConfirmCode email={state.accountEmail} />;
  if (!state.profile) return <Onboarding onDone={saveProfile} />;
  if (state.justRewarded) return <Reward reward={state.justRewarded} onDone={dismissReward} />;

  return (
    <div className="shell">
      {tab === 'today' && <Today state={state} onOpenPlan={() => setTab('plan')} />}
      {tab === 'plan' && state.plan && <Plan plan={state.plan} />}
      {tab === 'map' && <MapScreen state={state} />}
      {tab === 'rewards' && <Rewards state={state} />}
      {tab === 'you' && <Profile state={state} />}
      <nav className="nav">
        {TABS.map(([id, label]) => (
          <button type="button" key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}
