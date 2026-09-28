import { useEffect, useState } from 'react';
import {
  BAND_LABELS, DAY_LABELS, INTERESTS, campusById, campusFor, customPlacesFrom, hobbyId, hobbyLabel,
  normalizeHobby, orderPlaces, placeOrderFrom, placesFor, resolveHobby, schoolIdFromEmail, suggestHobby,
} from './data.js';
import { ensureCampusCatalog, getState, logOut, noteOpenHobby } from './store.js';

const PLACE_PREVIEW = 6;

const empty = {
  name: '',
  major: '',
  interests: [],
  hobbies: [],
  activities: [],
  energy: 'mixed',
  setting: 'either',
  groupSize: 3,
  groupFlex: 'sizes',
  groupSizes: [3],
  bio: '',
  availability: { days: [1, 2, 3, 4, 5], bands: ['lunch'] },
  zone: 'union',
  school: '',
  schoolName: '',
};

function snapSize(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size) || size < 2) return null;
  if (size <= 4) return size;
  return Math.max(5, Math.round(size / 5) * 5);
}

function sizesFrom(source) {
  if (Array.isArray(source?.groupSizes) && source.groupSizes.length) {
    const groupSizes = [...new Set(source.groupSizes.map((n) => snapSize(n)).filter(Boolean))].sort((a, b) => a - b);
    if (groupSizes.length) return { groupSizes, groupFlex: 'sizes', groupSize: groupSizes[0] };
  }
  if (source?.groupFlex === 'any' || source?.groupSize === 0) return { groupSizes: [], groupFlex: 'any', groupSize: 0 };
  if (source?.groupFlex === 'atLeast') return { groupSizes: [5], groupFlex: 'sizes', groupSize: 5 };
  const size = snapSize(source?.groupSize || 3) || 3;
  return { groupSizes: [size], groupFlex: 'sizes', groupSize: size };
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function eastBayChoice() {
  return { name: 'Cal State East Bay', domain: 'csueastbay.edu', domains: ['csueastbay.edu'] };
}

export function Onboarding({ onDone, initial, editing = false, school, campus: campusProp, email }) {
  const startSchool = school || initial?.school || schoolIdFromEmail(email) || '';
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(() => {
    const campus = campusProp || campusById(startSchool) || campusFor(startSchool);
    const customPlaces = customPlacesFrom(initial);
    const places = orderPlaces(placesFor(campus.id, customPlaces), placeOrderFrom(initial));
    const savedPlace = initial?.availability?.usualPlace;
    const place = places.find((item) => item.id === savedPlace)
      || places.find((item) => item.zone === initial?.zone)
      || places.find((item) => item.zone === campus.defaultZone)
      || places[0];
    const zone = place?.zone || campus.defaultZone || 'main';
    const base = initial ? { ...empty, ...initial, zone, usualPlace: place?.id || '' } : { ...empty, zone, usualPlace: place?.id || '' };
    return {
      ...base,
      ...sizesFrom(initial || null),
      bio: initial?.bio || '',
      school: startSchool,
      schoolName: campus?.name && campus.source !== 'pending' ? campus.name : '',
    };
  });
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const [campusQuery, setCampusQuery] = useState(form.schoolName || '');
  const [campusHits, setCampusHits] = useState([]);
  const [campusBusy, setCampusBusy] = useState(false);
  const [campusNote, setCampusNote] = useState('');
  const [placesBusy, setPlacesBusy] = useState(false);
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const liveCampus = getState().campusCatalog || campusProp || campusById(form.school) || campusFor(form.school);
  const places = orderPlaces(
    placesFor(liveCampus.id, form.school === initial?.school ? customPlacesFrom(initial) : []),
    form.school === initial?.school ? placeOrderFrom(initial) : [],
  );
  const visiblePlaces = showAllPlaces ? places : places.slice(0, PLACE_PREVIEW);

  useEffect(() => {
    let cancelled = false;
    async function suggest() {
      if (form.schoolName) {
        setCampusQuery(form.schoolName);
        return;
      }
      if (startSchool === 'csueastbay') {
        const choice = eastBayChoice();
        if (cancelled) return;
        setCampusQuery(choice.name);
        set({ school: 'csueastbay', schoolName: choice.name });
        setCampusNote('Suggested from your school email. Tap a different school if this is wrong.');
        return;
      }
      if (!startSchool?.endsWith('.edu') && startSchool !== 'csueastbay') return;
      setCampusBusy(true);
      try {
        const domain = startSchool === 'csueastbay' ? 'csueastbay.edu' : startSchool;
        const response = await fetch(`/api/schools?domain=${encodeURIComponent(domain)}`);
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (payload.school?.name) {
          setCampusQuery(payload.school.name);
          set({ school: payload.school.domain || domain, schoolName: payload.school.name });
          setCampusNote('Suggested from your school email. Tap a different school if this is wrong.');
        }
      } finally {
        if (!cancelled) setCampusBusy(false);
      }
    }
    suggest();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (campusQuery.trim().length < 2 || campusQuery.trim() === form.schoolName) {
      setCampusHits([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      setCampusBusy(true);
      try {
        const response = await fetch(`/api/schools?q=${encodeURIComponent(campusQuery.trim())}`);
        const payload = await response.json().catch(() => ({}));
        setCampusHits(payload.schools || []);
      } finally {
        setCampusBusy(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [campusQuery, form.schoolName]);

  const can = [
    form.name.trim().length > 1 && form.school && form.schoolName,
    form.hobbies.length >= 2,
    form.activities.length >= 1,
    form.availability.days.length >= 1 && form.availability.bands.length >= 1 && form.usualPlace && form.zone,
  ][step];

  const suggestion = suggestHobby(custom);
  const suggestionTaken = suggestion && form.hobbies.some((hobby) => hobbyId(hobby) === suggestion.id);

  function hasHobby(value) {
    const id = hobbyId(value);
    return form.hobbies.some((hobby) => hobbyId(hobby) === id);
  }

  function addHobby(raw, fromSuggestion) {
    const key = normalizeHobby(raw);
    if (!key || hasHobby(key)) {
      setCustom('');
      return;
    }
    const resolved = resolveHobby(key);
    const typedName = resolved.known && hobbyLabel(resolved.id).toLowerCase() === key;
    const stored = fromSuggestion || typedName ? hobbyLabel(fromSuggestion ? suggestion.id : resolved.id) : hobbyLabel(key);
    set({ hobbies: [...form.hobbies, stored] });
    if (!fromSuggestion && !resolved.known) noteOpenHobby(key);
    setCustom('');
  }

  function chooseSizes(sizes) {
    const groupSizes = [...new Set(sizes)].sort((a, b) => a - b);
    if (!groupSizes.length) return;
    set({ groupSizes, groupFlex: 'sizes', groupSize: groupSizes[0] });
  }

  function toggleSize(size) {
    setCustomOpen(false);
    const current = form.groupFlex === 'any' ? [] : form.groupSizes;
    if (current.includes(size)) {
      chooseSizes(current.filter((item) => item !== size));
      return;
    }
    chooseSizes([...current, size]);
  }

  function addCustom() {
    const size = snapSize(customSize);
    if (!size) return;
    const current = form.groupFlex === 'any' ? [] : form.groupSizes;
    chooseSizes([...current, size]);
    setCustomSize('');
    setCustomOpen(false);
  }

  function applyCampusPlaces(campus, keepUsual) {
    const ordered = campus.places || [];
    const place = (keepUsual && ordered.find((item) => item.id === form.usualPlace)) || ordered[0];
    set({
      zone: place?.zone || campus.defaultZone || 'main',
      usualPlace: place?.id || '',
    });
  }

  async function pickSchool(school) {
    const domain = school.domain === 'csueastbay.edu' ? 'csueastbay' : school.domain;
    const name = school.domain === 'csueastbay.edu' || /east bay/i.test(school.name)
      ? 'Cal State East Bay'
      : school.name;
    const id = /east bay/i.test(name) ? 'csueastbay' : domain;
    setCampusQuery(name);
    setCampusHits([]);
    setCampusNote('');
    set({ school: id, schoolName: name, usualPlace: '', zone: '' });
    setPlacesBusy(true);
    const campus = await ensureCampusCatalog(id, { name });
    setPlacesBusy(false);
    if (!campus?.places?.length) {
      setCampusNote('That campus could not be found. Try another school name.');
      return;
    }
    const place = campus.places[0];
    set({ zone: place.zone, usualPlace: place.id });
  }

  async function continueFromStart() {
    if (!form.school || !form.schoolName) return;
    setPlacesBusy(true);
    const campus = await ensureCampusCatalog(form.school, { name: form.schoolName });
    setPlacesBusy(false);
    if (!campus?.places?.length) {
      setCampusNote('That campus could not be found. Try another school name.');
      return;
    }
    applyCampusPlaces(campus, true);
    setStep(1);
  }

  function finish() {
    const sameSchool = form.school === initial?.school;
    onDone({
      ...form,
      name: form.name.trim(),
      major: form.major.trim(),
      bio: form.bio.trim().slice(0, 400),
      school: form.school,
      availability: {
        ...form.availability,
        usualPlace: form.usualPlace,
        customPlaces: sameSchool ? customPlacesFrom(initial) : [],
        placeOrder: sameSchool ? placeOrderFrom(initial) : [],
      },
    });
  }

  return (
    <main className="onboard">
      <header className="top">
        <p className="brand">MyCampus</p>
        <button type="button" className="texty" onClick={logOut}>Log out</button>
      </header>
      <div className="progress" aria-hidden="true"><span style={{ width: `${((step + 1) / 4) * 100}%` }} /></div>

      {step === 0 && (
        <section>
          <h1>Back to campus.</h1>
          <p className="lede">A light profile. Plans are built from when you are free and what you like to do.</p>
          <label>Name<input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Maya Lopez" /></label>
          <label>Campus
            <input
              value={campusQuery}
              onChange={(e) => {
                setCampusQuery(e.target.value);
                setCampusNote('');
                if (e.target.value.trim() !== form.schoolName) set({ schoolName: '', school: form.school });
              }}
              placeholder="Search for your school"
              autoComplete="off"
            />
          </label>
          {campusNote && <p className="whisper">{campusNote}</p>}
          {campusBusy && <p className="whisper">Looking up schools…</p>}
          {!!campusHits.length && (
            <div className="chips">
              {campusHits.map((hit) => (
                <button type="button" key={hit.domain} onClick={() => pickSchool(hit)}>{hit.name}</button>
              ))}
            </div>
          )}
          {form.schoolName && (
            <p className="whisper">Selected: {form.schoolName}</p>
          )}
          <label>Major, if you want it listed<input value={form.major} onChange={(e) => set({ major: e.target.value })} placeholder="Computer Science" /></label>
          <label>A short bio, if you want one
            <textarea value={form.bio} maxLength={400} rows={3} onChange={(e) => set({ bio: e.target.value })} placeholder="Quiet mornings in the library, or a walk after class." />
          </label>
          <p className="whisper">Optional. Leave it blank and plans still come from your hobbies, preferred plans, and free time.</p>
        </section>
      )}

      {step === 1 && (
        <section>
          <h1>What do you do for fun?</h1>
          <p className="lede">Hobbies carry the match. Related ones count: running and basketball are both close. Pick at least two.</p>
          <div className="chips">
            {INTERESTS.map((item) => (
              <button type="button" key={item} className={form.hobbies.includes(item) ? 'on' : ''} onClick={() => set({ hobbies: toggle(form.hobbies, item) })}>{item}</button>
            ))}
          </div>
          <label>Add your own
            <span className="row">
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Bouldering, film photos…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHobby(custom, false); } }} />
              <button type="button" className="ghost" onClick={() => addHobby(custom, false)}>Add</button>
            </span>
          </label>
          {suggestion && !suggestionTaken && (
            <p className="whisper">Did you mean <button type="button" onClick={() => addHobby(suggestion.label, true)}>{suggestion.label}</button>?</p>
          )}
          {form.hobbies.some((hobby) => !INTERESTS.includes(hobby)) && (
            <div className="chips">
              {form.hobbies.filter((hobby) => !INTERESTS.includes(hobby)).map((item) => (
                <button type="button" key={item} className="on" onClick={() => set({ hobbies: form.hobbies.filter((hobby) => hobby !== item) })}>{hobbyLabel(item)}</button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>How do you like to meet?</h1>
          <p className="lede">Group size, energy, and indoors or outdoors.</p>
          <p className="label">Group size</p>
          <div className="chips">
            {[2, 3, 4].map((size) => (
              <button type="button" key={size} className={form.groupFlex !== 'any' && form.groupSizes.includes(size) ? 'on' : ''} onClick={() => toggleSize(size)}>{size}</button>
            ))}
            <button type="button" className={form.groupFlex !== 'any' && form.groupSizes.includes(5) ? 'on' : ''} onClick={() => toggleSize(5)}>5+</button>
            <button type="button" className={form.groupFlex === 'any' ? 'on' : ''} onClick={() => { setCustomOpen(false); set({ groupFlex: 'any', groupSize: 0, groupSizes: [] }); }}>Any</button>
            <button type="button" className={customOpen ? 'on' : ''} onClick={() => setCustomOpen((open) => !open)}>+</button>
            {form.groupSizes.filter((size) => size > 5).map((size) => (
              <button type="button" key={size} className="on" onClick={() => toggleSize(size)}>{size}</button>
            ))}
          </div>
          {customOpen && (
            <label>Custom size
              <span className="row">
                <input inputMode="numeric" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="12" />
                <button type="button" className="ghost" onClick={addCustom}>Add</button>
              </span>
            </label>
          )}
          <p className="label">Energy</p>
          <div className="chips">
            {[['calm', 'Calm'], ['mixed', 'Mixed'], ['high', 'High']].map(([id, label]) => (
              <button type="button" key={id} className={form.energy === id ? 'on' : ''} onClick={() => set({ energy: id })}>{label}</button>
            ))}
          </div>
          <p className="label">Setting</p>
          <div className="chips">
            {[['indoors', 'Indoors'], ['either', 'Either'], ['outdoors', 'Outdoors']].map(([id, label]) => (
              <button type="button" key={id} className={form.setting === id ? 'on' : ''} onClick={() => set({ setting: id })}>{label}</button>
            ))}
          </div>
          <p className="label">Preferred plans</p>
          <div className="chips">
            {['Food', 'Fitness', 'Studying', 'Social', 'Outdoors', 'Games'].map((item) => (
              <button type="button" key={item} className={form.activities.includes(item) ? 'on' : ''} onClick={() => set({ activities: toggle(form.activities, item) })}>{item}</button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1>When are you usually free?</h1>
          <p className="lede">Your free hours decide who can actually meet. General windows are fine. The plan lands in a time you already have.</p>
          <div className="chips">
            {DAY_LABELS.map((label, i) => (
              <button type="button" key={label} className={form.availability.days.includes(i) ? 'on' : ''} onClick={() => set({ availability: { ...form.availability, days: toggle(form.availability.days, i) } })}>{label}</button>
            ))}
          </div>
          <div className="chips">
            {BAND_LABELS.map(([id, label]) => (
              <button type="button" key={id} className={form.availability.bands.includes(id) ? 'on' : ''} onClick={() => set({ availability: { ...form.availability, bands: toggle(form.availability.bands, id) } })}>{label}</button>
            ))}
          </div>
          <p className="label">Where you usually are</p>
          <p className="whisper">A usual spot at {form.schoolName || liveCampus.name}. Bookmark more places later on the map. You are not tracked around campus.</p>
          {placesBusy && <p className="whisper">Loading places…</p>}
          {!places.length && !placesBusy && <p className="warn">Places for this campus are still loading.</p>}
          <div className="chips">
            {visiblePlaces.map((place) => (
              <button type="button" key={place.id} className={form.usualPlace === place.id ? 'on' : ''} onClick={() => set({ zone: place.zone, usualPlace: place.id })}>{place.name}</button>
            ))}
          </div>
          {places.length > PLACE_PREVIEW && (
            <button type="button" className="ghost" onClick={() => setShowAllPlaces((open) => !open)}>
              {showAllPlaces ? 'Show fewer' : `Show more (${places.length - PLACE_PREVIEW})`}
            </button>
          )}
        </section>
      )}

      <footer className="actions">
        {step > 0 && <button type="button" className="ghost" onClick={() => setStep((n) => n - 1)}>Back</button>}
        {step === 0 && <button type="button" className="solid" disabled={!can || placesBusy} onClick={continueFromStart}>{placesBusy ? 'Loading…' : 'Continue'}</button>}
        {step > 0 && step < 3 && <button type="button" className="solid" disabled={!can} onClick={() => setStep((n) => n + 1)}>Continue</button>}
        {step === 3 && <button type="button" className="solid accent" disabled={!can || placesBusy} onClick={finish}>{editing ? 'Save' : 'Show me a plan'}</button>}
      </footer>
    </main>
  );
}
