import { useState } from 'react';
import { BAND_LABELS, DAY_LABELS, INTERESTS, ZONES } from './data.js';
import { logOut } from './store.js';

const empty = {
  name: '',
  major: '',
  interests: [],
  hobbies: [],
  activities: [],
  energy: 'mixed',
  setting: 'either',
  groupSize: 3,
  groupFlex: 'exact',
  availability: { days: [1, 2, 3, 4, 5], bands: ['lunch'] },
  zone: 'union',
};

function toggle(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function Onboarding({ onDone, initial }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial ? { ...empty, ...initial } : empty);
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customSize, setCustomSize] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const can = [
    form.name.trim().length > 1,
    form.hobbies.length >= 2,
    form.activities.length >= 1,
    form.availability.days.length >= 1 && form.availability.bands.length >= 1 && form.zone,
  ][step];

  function addCustom() {
    const value = custom.trim();
    if (!value) return;
    if (!form.hobbies.includes(value)) set({ hobbies: [...form.hobbies, value] });
    setCustom('');
  }

  function finish() {
    onDone({
      ...form,
      name: form.name.trim(),
      major: form.major.trim(),
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
          <label>Major, if you want it listed<input value={form.major} onChange={(e) => set({ major: e.target.value })} placeholder="Computer Science" /></label>
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
              <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Bouldering, film photos…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              <button type="button" className="ghost" onClick={addCustom}>Add</button>
            </span>
          </label>
          {form.hobbies.some((item) => !INTERESTS.includes(item)) && (
            <p className="whisper">{form.hobbies.filter((item) => !INTERESTS.includes(item)).join(' · ')}</p>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          <h1>How should the plan feel?</h1>
          <p className="lede">The plan uses the size you pick here. Everyone in it still has to be free and share a hobby.</p>
          <p className="label">How many people, including you</p>
          <div className="chips">
            {[[2, '2', 'exact'], [3, '3', 'exact'], [4, '4', 'exact'], [5, '5+', 'atLeast'], [0, 'Any', 'any']].map(([id, label, flex]) => (
              <button type="button" key={label} className={form.groupFlex === flex && form.groupSize === id ? 'on' : ''} onClick={() => { setCustomOpen(false); set({ groupSize: id, groupFlex: flex }); }}>{label}</button>
            ))}
            <button type="button" className={form.groupFlex === 'custom' ? 'on' : ''} onClick={() => setCustomOpen(true)}>+</button>
          </div>
          {customOpen && (
            <label>Custom size, including you
              <input type="number" min="2" max="12" value={customSize} placeholder="6" onChange={(e) => {
                const next = e.target.value;
                setCustomSize(next);
                const count = Number(next);
                if (count >= 2) set({ groupSize: Math.min(12, count), groupFlex: 'custom' });
              }} />
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
            {['Food', 'Fitness', 'Social', 'Studying', 'Outdoors', 'Games'].map((item) => (
              <button type="button" key={item} className={form.activities.includes(item) ? 'on' : ''} onClick={() => set({ activities: toggle(form.activities, item) })}>{item}</button>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1>When are you usually free?</h1>
          <p className="lede">Your free hours decide who can actually meet. General windows are enough. The plan lands inside time you already have.</p>
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
          <p className="whisper">A coarse spot, so plans start near you. You are not tracked around campus.</p>
          <div className="chips">
            {ZONES.map((z) => (
              <button type="button" key={z.id} className={form.zone === z.id ? 'on' : ''} onClick={() => set({ zone: z.id })}>{z.label}</button>
            ))}
          </div>
        </section>
      )}

      <footer className="actions">
        {step > 0 && <button type="button" className="ghost" onClick={() => setStep((n) => n - 1)}>Back</button>}
        {step < 3 && <button type="button" className="solid" disabled={!can} onClick={() => setStep((n) => n + 1)}>Continue</button>}
        {step === 3 && <button type="button" className="solid accent" disabled={!can} onClick={finish}>Show me a plan</button>}
      </footer>
    </main>
  );
}
