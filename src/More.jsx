import { useState } from 'react';
import { PLACES, ZONES, placeById } from './data.js';
import { ALL_BADGES, badgeMeta, logOut, preferPlace, resetAll, saveProfile } from './store.js';
import { Avatar, CampusMap, effectFor } from './ui.jsx';
import { Onboarding } from './Onboarding.jsx';

export function MapScreen({ state }) {
  const fallback = state.plan?.place || state.recommendation?.place || placeById('union-lawn');
  const [picked, setPicked] = useState(fallback.id);
  const preferred = state.campus?.preferred || [];
  const place = placeById(picked) || fallback;
  const saved = preferred.includes(place.id);

  return (
    <main className="screen">
      <h1>Campus</h1>
      <p className="lede">Google Maps for a campus spot. Bookmark the places you like. Later plans lean toward them.</p>
      <CampusMap activeId={place.id} userZone={state.profile.zone} />
      <p className="place">{place.name} — {place.note}</p>
      <button type="button" className={saved ? 'solid' : 'ghost'} onClick={() => preferPlace(place.id)}>
        {saved ? 'Bookmarked' : 'Bookmark this place'}
      </button>
      <div className="chips">
        {PLACES.map((spot) => (
          <button type="button" key={spot.id} className={spot.id === place.id ? 'on' : ''} onClick={() => setPicked(spot.id)}>
            {preferred.includes(spot.id) ? '★ ' : ''}{spot.name}
          </button>
        ))}
      </div>
    </main>
  );
}

export function Rewards({ state }) {
  const { rewards } = state;
  return (
    <main className="screen rewards">
      <h1>Rewards</h1>
      <p className="lede">You get these for showing up together. Not for opening the app.</p>
      <div className="stats">
        <div><strong>{rewards.xp}</strong><span>XP</span></div>
        <div><strong>{rewards.streak}</strong><span>day streak</span></div>
        <div><strong>{rewards.people.length}</strong><span>people met</span></div>
      </div>
      <ul className="badges">
        {ALL_BADGES.map((badge) => {
          const on = rewards.badges.includes(badge.id);
          return (
            <li key={badge.id} className={on ? 'on' : ''}>
              <strong>{badge.name}</strong>
              <span>{badge.detail}</span>
            </li>
          );
        })}
      </ul>
      {rewards.badges.length > 0 && (
        <p className="whisper">Latest: {badgeMeta(rewards.badges.at(-1))?.name}. It shows up as a ring on your profile.</p>
      )}
    </main>
  );
}

export function Profile({ state }) {
  const [editing, setEditing] = useState(false);
  const { profile, rewards } = state;
  if (editing) {
    return (
      <Onboarding
        initial={profile}
        onDone={(next) => {
          saveProfile(next);
          setEditing(false);
        }}
      />
    );
  }
  return (
    <main className="screen">
      <div className="who">
        <Avatar person={profile} effect={effectFor(rewards)} size={64} />
        <div>
          <h1>{profile.name}</h1>
          <p className="place">{profile.hobbies.join(' · ')}</p>
        </div>
      </div>
      {profile.major && <p className="lede">{profile.major}</p>}
      <p className="whisper">Usually near the {ZONES.find((z) => z.id === profile.zone)?.label}. Energy {profile.energy}, {profile.setting}.</p>
      <p className="privacy">Your usual spot is a preference, stored on this device. Check-in is the only moment that stands in for proximity, and it applies to one agreed plan.</p>
      <p className="whisper">Signed in as {state.accountEmail}</p>
      <div className="profile-actions">
        <button type="button" className="ghost" onClick={() => setEditing(true)}>Edit preferences</button>
        <button type="button" className="texty" onClick={logOut}>Log out</button>
        <button type="button" className="texty" onClick={resetAll}>Delete this account</button>
      </div>
    </main>
  );
}

