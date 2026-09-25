import { useEffect, useState } from 'react';
import { isSupabaseConfigured } from './supabase.js';
import { confirmSignupCode, logIn, logInWithSupabase, logOut, sendSignupCode, signUp, signUpWithSupabase } from './store.js';

let lastSentFor = '';
const IDEAS = ['lunch', 'a chat', 'a game', 'soccer', 'coffee', 'a walk'];

function TypedIdea() {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const word = IDEAS[index];

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    const typed = !deleting && count === word.length;
    const cleared = deleting && count === 0;
    const delay = typed ? 1200 : cleared ? 240 : deleting ? 42 : 78;
    const timer = setTimeout(() => {
      if (typed) setDeleting(true);
      else if (cleared) {
        setDeleting(false);
        setIndex((n) => (n + 1) % IDEAS.length);
      } else setCount((n) => n + (deleting ? -1 : 1));
    }, delay);
    return () => clearTimeout(timer);
  }, [count, deleting, word]);

  return <span className="typed">{word.slice(0, count)}<span className="caret" aria-hidden="true" />?</span>;
}

async function hashPassword(email, password) {
  const data = new TextEncoder().encode(`${email.trim().toLowerCase()}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ConfirmCode({ email }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(event) {
    event?.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const result = await sendSignupCode();
      if (!result.ok) setError(result.error);
      else setNotice(`A 6-digit code is on its way to ${email}.`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (lastSentFor === email) return;
    lastSentFor = email;
    send();
  }, [email]);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await confirmSignupCode(code);
      if (!result.ok) setError(result.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboard auth">
      <p className="brand">MyCampus</p>
      <form onSubmit={submit}>
        <h1>Check your email.</h1>
        <p className="lede">This happens once, the first time you join. Enter the code sent to {email}.</p>
        <label>Confirmation code
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
        </label>
        {notice && <p className="lede">{notice}</p>}
        {error && <p className="warn">{error}</p>}
        <div className="actions">
          <button type="submit" className="solid accent" disabled={busy}>Confirm</button>
          <button type="button" className="ghost" onClick={send} disabled={busy}>Send code</button>
          <button type="button" className="ghost" onClick={() => logOut()}>Log out</button>
        </div>
      </form>
    </main>
  );
}

export function Auth() {
  const [mode, setMode] = useState('choose');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!email.includes('@') || !email.includes('.')) {
      setError('Use a school email.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      let result;
      if (isSupabaseConfigured) {
        result = mode === 'join' ? await signUpWithSupabase(email, password) : await logInWithSupabase(email, password);
      } else {
        const hashed = await hashPassword(email, password);
        result = mode === 'join' ? signUp(email, hashed) : logIn(email, hashed);
      }
      if (result.pending) {
        setMode('confirm');
        return;
      }
      if (!result.ok) setError(result.error);
    } catch {
      setError('Could not check that password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboard auth">
      {mode !== 'choose' && <p className="brand">MyCampus</p>}
      {mode === 'choose' && (
        <section className="hero">
          <div className="auth-bar">
            <p className="brand">MyCampus</p>
            <button type="button" className="texty" onClick={() => { setMode('login'); setError(''); }}>Log in</button>
          </div>
          <div className="hero-copy">
            <h1>Up for<br /><TypedIdea /></h1>
            <p className="lede">Find your people. Get matched with a fellow student.</p>
            <form className="enroll" onSubmit={(event) => {
              event.preventDefault();
              if (!email.includes('@') || !email.includes('.')) {
                setError('Use a school email.');
                return;
              }
              setError('');
              setMode('join');
            }}>
              <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu" aria-label="School email" />
              {error && <p className="warn">{error}</p>}
              <button type="submit" className="solid">Join</button>
            </form>
          </div>
        </section>
      )}
      {mode === 'confirm' && (
        <section>
          <h1>Check your email.</h1>
          <p className="lede">Open the confirmation link sent to {email.trim().toLowerCase()}, then log in. The account stays inactive until you do.</p>
          <div className="actions">
            <button type="button" className="solid accent" onClick={() => { setMode('login'); setError(''); }}>Log in</button>
          </div>
        </section>
      )}
      {(mode === 'join' || mode === 'login') && (
        <form onSubmit={submit}>
          <h1>{mode === 'join' ? 'Create your account.' : 'Welcome back.'}</h1>
          <p className="lede">{mode === 'join' ? 'Then set when you are free and what you like to do.' : 'Your plans and rewards stay with this email.'}</p>
          <label>School email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" />
          </label>
          <label>Password
            <input type="password" autoComplete={mode === 'join' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </label>
          {error && <p className="warn">{error}</p>}
          <div className="actions">
            <button type="submit" className="solid accent" disabled={busy}>{mode === 'join' ? 'Create account' : 'Log in'}</button>
            <button type="button" className="ghost" onClick={() => { setMode('choose'); setError(''); }}>{mode === 'join' ? 'I already have an account' : 'Need an account?'}</button>
          </div>
        </form>
      )}
    </main>
  );
}
