import { useState } from 'react';
import { formatRange } from './match.js';
import { formatAskDate, parseAsk, readActivity } from './parse.js';
import { askForPlan, clearAsk, passRecommendation, acceptRecommendation } from './store.js';
import { Avatar, CampusMap } from './ui.jsx';

function weekdayFromIso(iso) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getDay();
}

function clockValue(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minutesFromClock(value) {
  const [h, m] = String(value || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function Today({ state, onOpenPlan }) {
  const { profile, recommendation: rec, plan, ask } = state;
  const [text, setText] = useState(ask?.text || '');
  const [note, setNote] = useState('');
  const [overrides, setOverrides] = useState(() => (
    ask ? {
      day: ask.day,
      ...(ask.date ? { date: ask.date } : {}),
      start: ask.start,
      end: ask.end,
      ...(ask.activity ? { activity: ask.activity } : {}),
    } : {}
  ));
  const [open, setOpen] = useState(null);
  const live = parseAsk(text);
  const date = overrides.date ?? live?.date ?? '';
  const day = overrides.day ?? live?.day ?? weekdayFromIso(date) ?? new Date().getDay();
  const start = overrides.start ?? live?.start ?? null;
  const end = overrides.end ?? live?.end ?? null;
  const activity = overrides.activity ?? live?.activity ?? '';
  const showReads = Boolean(live && (live.start != null || live.activity || activity));

  function askFrom(source) {
    const parsed = parseAsk(text);
    const nextStart = source.start ?? parsed?.start ?? null;
    const nextEnd = source.end ?? parsed?.end ?? null;
    const nextDate = source.date ?? parsed?.date ?? '';
    const nextDay = source.day ?? weekdayFromIso(nextDate) ?? parsed?.day ?? new Date().getDay();
    const nextActivity = source.activity ?? parsed?.activity ?? '';
    if (!parsed || nextStart == null || nextEnd == null || nextEnd <= nextStart) return null;
    const touchedTime = source.start != null || source.end != null;
    const span = nextEnd - nextStart;
    return {
      ...parsed,
      day: nextDay,
      date: nextDate,
      start: nextStart,
      end: nextEnd,
      activity: nextActivity.trim(),
      intents: readActivity(nextActivity).intents,
      duration: touchedTime ? span : Math.min(parsed.duration || span, span),
    };
  }

  function edit(partial) {
    const next = { ...overrides, ...partial };
    setOverrides(next);
    if (!ask) return;
    const built = askFrom(next);
    if (!built) return;
    setNote('');
    askForPlan(built);
  }

  function submit(e) {
    e.preventDefault();
    const built = askFrom(overrides);
    if (!built) {
      setNote('Add a time, like “after my 2 PM class” or “at lunch.”');
      return;
    }
    setNote('');
    askForPlan(built);
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
          onChange={(e) => { setText(e.target.value); setOverrides({}); setOpen(null); }}
        />
        {showReads && (
          <>
            <p className="whisper ask-edit">Tap a tag to edit it.</p>
            <div className="ask-tags">
            {start != null && end != null && (
              open === 'day' ? (
                <input
                  type="date"
                  className="tag"
                  autoFocus
                  value={date}
                  aria-label="Date"
                  onChange={(e) => {
                    const next = e.target.value;
                    const weekday = weekdayFromIso(next);
                    if (!next || weekday == null) return;
                    edit({ date: next, day: weekday });
                    setOpen(null);
                  }}
                  onBlur={() => setOpen(null)}
                />
              ) : (
                <button type="button" className="tag" onClick={() => setOpen('day')}>{formatAskDate(date)}</button>
              )
            )}
            {start != null && end != null && (
              open === 'time' ? (
                <span
                  className="tag"
                  onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(null); }}
                >
                  <input
                    type="time"
                    aria-label="Start"
                    autoFocus
                    value={clockValue(start)}
                    onChange={(e) => {
                      const next = minutesFromClock(e.target.value);
                      if (next == null) return;
                      edit({ start: next, end: next < end ? end : next + 60 });
                    }}
                  />
                  <input
                    type="time"
                    aria-label="End"
                    value={clockValue(end)}
                    onChange={(e) => {
                      const next = minutesFromClock(e.target.value);
                      if (next == null || next <= start) return;
                      edit({ end: next });
                    }}
                  />
                </span>
              ) : (
                <button type="button" className="tag" onClick={() => setOpen('time')}>{formatRange(start, end)}</button>
              )
            )}
            {activity && (
              open === 'activity' ? (
                <input
                  className="tag"
                  autoFocus
                  value={activity}
                  aria-label="Activity"
                  onChange={(e) => setOverrides((current) => ({ ...current, activity: e.target.value }))}
                  onBlur={(e) => { edit({ activity: e.target.value }); setOpen(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                />
              ) : (
                <button type="button" className="tag" onClick={() => setOpen('activity')}>{activity}</button>
              )
            )}
            </div>
          </>
        )}
        {note && <p className="warn">{note}</p>}
        <button type="submit" className="solid accent slim">Find a plan</button>
      </form>
    </main>
  );
}
