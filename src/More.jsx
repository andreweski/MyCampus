import { useEffect, useState } from 'react';
import { campusFor, hobbyLabel, placeById, userPlaces } from './data.js';
import { ALL_BADGES, addCustomPlace, badgeMeta, getState, logOut, preferPlace, previewDemoInvite, resetAll, saveProfile } from './store.js';
import { Avatar, CampusMap, effectFor } from './ui.jsx';
import { Onboarding } from './Onboarding.jsx';

const PLACE_PREVIEW = 8;

export function MapScreen({ state }) {
  const campus = state.campusCatalog || campusFor(state.profile?.school || state.school);
  const places = userPlaces(campus.id, state.profile);
  const fallback = state.plan?.place || state.recommendation?.place || places[0];
  const [picked, setPicked] = useState(fallback?.id);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const preferred = state.campus?.preferred || [];
  const place = placeById(picked, campus.id, state.profile?.availability?.customPlaces) || fallback;
  const saved = place && preferred.includes(place.id);
  const visible = showAll ? places : places.slice(0, PLACE_PREVIEW);

  useEffect(() => {
    if (picked && places.some((item) => item.id === picked)) return;
    if (fallback?.id) setPicked(fallback.id);
  }, [picked, places, fallback?.id]);

  useEffect(() => {
    if (!adding || !campus.lat || !campus.lng) {
      setHits([]);
      return undefined;
    }
    const text = query.trim();
    if (text.length < 2) {
      setHits([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setSearchBusy(true);
      try {
        const params = new URLSearchParams({
          lat: String(campus.lat),
          lng: String(campus.lng),
          q: text,
        });
        const response = await fetch(`/api/places?${params}`);
        const payload = await response.json().catch(() => ({}));
        const known = new Set(places.map((item) => item.id));
        setHits((payload.places || []).filter((item) => !known.has(item.id)));
      } finally {
        setSearchBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [adding, query, campus.lat, campus.lng, places]);

  function takePlace(next) {
    if (!next?.id) return;
    addCustomPlace(next);
    setPicked(next.id);
    setAdding(false);
    setQuery('');
    setHits([]);
    setShowAll(true);
    const bookmarked = getState().campus?.preferred || [];
    if (!bookmarked.includes(next.id)) preferPlace(next.id);
  }

  return (
    <main className="screen map-screen">
      <h1>{campus.name}</h1>
      <p className="lede">Pick a spot, bookmark the ones you like, or search for another place near campus. Later plans lean toward your bookmarks.</p>
      {place ? (
        <>
          <CampusMap activeId={place.id} userZone={state.profile.zone} school={campus.id} places={places} />
          <p className="place">{place.name}{place.note ? ` — ${place.note}` : ''}</p>
        </>
      ) : (
        <p className="warn">Places for this campus are still loading.</p>
      )}
      <div className="chips">
        {visible.map((spot) => (
          <button type="button" key={spot.id} className={spot.id === place?.id ? 'on' : ''} onClick={() => setPicked(spot.id)}>
            {preferred.includes(spot.id) ? '★ ' : ''}{spot.name}
          </button>
        ))}
      </div>
      <div className="map-actions">
        {place && (
          <button type="button" className={saved ? 'solid' : 'ghost'} onClick={() => preferPlace(place.id)}>
            {saved ? 'Bookmarked' : 'Bookmark this place'}
          </button>
        )}
        {places.length > PLACE_PREVIEW && (
          <button type="button" className="ghost" onClick={() => setShowAll((open) => !open)}>
            {showAll ? 'Show fewer' : `Show more (${places.length - PLACE_PREVIEW})`}
          </button>
        )}
        {!adding ? (
          <button type="button" className="ghost" onClick={() => setAdding(true)}>Add a place</button>
        ) : (
          <label className="map-search">Search near campus
            <span className="row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Bookstore, cafe, quad…"
                autoComplete="off"
              />
              <button type="button" className="ghost" onClick={() => { setAdding(false); setQuery(''); setHits([]); }}>Cancel</button>
            </span>
          </label>
        )}
      </div>
      {searchBusy && <p className="whisper">Searching places…</p>}
      {!!hits.length && (
        <div className="chips">
          {hits.map((hit) => (
            <button type="button" key={hit.id} onClick={() => takePlace(hit)}>{hit.name}</button>
          ))}
        </div>
      )}
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
  const campus = state.campusCatalog || campusFor(profile.school);
  const zone = campus.zones.find((item) => item.id === profile.zone)?.label || profile.zone;
  if (editing) {
    return (
      <Onboarding
        editing
        school={profile.school}
        campus={state.campusCatalog}
        email={state.accountEmail}
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
          <p className="place">{(profile.hobbies || []).map((hobby) => hobbyLabel(hobby)).join(' · ')}</p>
        </div>
      </div>
      {profile.major && <p className="lede">{profile.major}</p>}
      {profile.bio && <p className="lede">{profile.bio}</p>}
      <p className="whisper">Usually near the {zone} at {campus.name}. Energy {profile.energy}, {profile.setting}.</p>
      <p className="privacy">Your usual spot is a preference, stored on this device. Check-in is the only moment that stands in for proximity, and it applies to one agreed plan.</p>
      <p className="whisper">Signed in as {state.accountEmail}</p>
      <div className="profile-actions">
        <button type="button" className="ghost" onClick={() => setEditing(true)}>Edit preferences</button>
        <button type="button" className="ghost" onClick={() => { previewDemoInvite(); }}>Preview incoming invite</button>
        <button type="button" className="texty" onClick={logOut}>Log out</button>
        <button type="button" className="texty" onClick={resetAll}>Delete this account</button>
      </div>
    </main>
  );
}
