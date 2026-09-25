import { ZONES, placeById } from './data.js';
import { profileEffect } from './store.js';

export function Mark({ size = 36 }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#1d4e9e" />
      <circle cx="24" cy="24" r="14" fill="none" stroke="#d7e8ff" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="4.5" fill="#f4f8fd" />
      <path d="M24 6.5v5.5M24 36v5.5M6.5 24h5.5M36 24h5.5" stroke="#9cc4ff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function Avatar({ person, effect = '', size = 44 }) {
  const name = person?.name || 'You';
  const initials = name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('');
  return (
    <span
      className={`avatar effect-${effect}`}
      style={{ width: size, height: size }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function CampusMap({ activeId, userZone }) {
  const active = placeById(activeId) || placeById('union-lawn');
  const query = `${active.lat},${active.lng}`;
  const src = `https://maps.google.com/maps?q=${query}&z=17&hl=en&output=embed`;
  const open = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${active.lat},${active.lng}`)}`;
  const zone = ZONES.find((z) => z.id === userZone)?.label;
  return (
    <figure className="map-frame">
      <iframe className="campus" title={`Google Maps: ${active.name}`} src={src} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <figcaption>
        <a href={open} target="_blank" rel="noreferrer">Open {active.name} in Google Maps</a>
        {zone && <span>You usually are near the {zone}</span>}
      </figcaption>
    </figure>
  );
}

export function effectFor(rewards) {
  return profileEffect(rewards);
}
