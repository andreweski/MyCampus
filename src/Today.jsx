import { useState } from 'react';
import { formatRange } from './match.js';
import { parseAsk } from './parse.js';
import { askForPlan, clearAsk, passRecommendation, acceptRecommendation } from './store.js';
import { Avatar, CampusMap } from './ui.jsx';

export function Today({ state, onOpenPlan }) {
  const { profile, recommendation: rec, plan, ask } = state;
  const [text, setText] = useState(ask?.text || '');
  const [note, setNote] = useState('');

  function submit(e) {
    e.preventDefault();
    const parsed = parseAsk(text);
    if (!parsed) return;
    if (parsed.start == null) {
      setNote('Add a time, like “after my 2 PM class” or “at lunch.”');
      return;
    }
    setNote('');
    askForPlan(parsed);
  }

  return (
    <main className="screen">
      <header className="top">
        <p className="brand">MyCampus</p>
        <p className="whisper">For {profile.name.split(' ')[0]}</p>
      </header>

      {plan && (
        <button type="button" className="banner" onClick={onOpenPlan}>
          You are meeting for {plan.title.toLowerCase()}. Open the plan.
        </button>
      )}

      {!plan && rec && (
        <article className="invite">
          <p className="kicker">{rec.dayLabel} · {formatRange(rec.start, rec.end)}</p>
          <h1>{rec.title}</h1>
          <p className="place">{rec.place.name}</p>
          <p className="line">{rec.line}</p>
          <p className="why">{rec.why}</p>
          <ul className="people">
            {rec.peers.map((peer) => (
              <li key={peer.id}>
                <Avatar person={peer} />
                <div>
                  <strong>{peer.name}</strong>
                  <span>{peer.major}</span>
                  <em>{peer.because}</em>
                </div>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="solid accent" onClick={acceptRecommendation}>Accept</button>
            <button type="button" className="ghost" onClick={passRecommendation}>Not this one</button>
          </div>
          <CampusMap activeId={rec.place.id} userZone={profile.zone} />
        </article>
      )}

      {!plan && !rec && (
        <article className="invite empty">
          <h1>No strong fit in that window.</h1>
          <p className="lede">Nobody free in that window shares a hobby with you. Try another time, or add the hours you are usually around.</p>
          {ask && <button type="button" className="ghost" onClick={clearAsk}>Use my usual hours</button>}
        </article>
      )}

      <form className="ask" onSubmit={submit}>
        <label htmlFor="ask">Say when you are free</label>
        <textarea
          id="ask"
          rows={3}
          value={text}
          placeholder="I'm free for an hour after my 2 PM class and want to do something social."
          onChange={(e) => setText(e.target.value)}
        />
        {note && <p className="warn">{note}</p>}
        {ask?.text && <p className="whisper">Using “{ask.text}”</p>}
        <button type="submit" className="solid slim">Find a plan</button>
      </form>
    </main>
  );
}
