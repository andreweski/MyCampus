import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { campusFor } from './data.js';
import { initialsOf } from './privacy.js';
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
  const label = person?.displayName || person?.label || person?.name || 'You';
  const initials = initialsOf(person?.name || person?.displayName || label);
  return (
    <span
      className={`avatar effect-${effect}`}
      style={{ width: size, height: size }}
      title={label}
    >
      {initials}
    </span>
  );
}

export function CampusMap({ activeId, userZone, school, places: placesProp }) {
  const campus = campusFor(school);
  const places = placesProp?.length ? placesProp : campus.places;
  const active = places.find((place) => place.id === activeId) || places[0];
  const node = useRef(null);
  if (!active) {
    return (
      <figure className="map-frame">
        <figcaption>No places loaded for this campus yet.</figcaption>
      </figure>
    );
  }
  const open = `https://www.openstreetmap.org/?mlat=${active.lat}&mlon=${active.lng}#map=17/${active.lat}/${active.lng}`;
  const zone = campus.zones.find((item) => item.id === userZone)?.label;

  useEffect(() => {
    if (!node.current) return undefined;
    const map = L.map(node.current, { zoomControl: true, attributionControl: true }).setView([active.lat, active.lng], 17);
    L.tileLayer('/api/map-tiles/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors, &copy; Geoapify',
      maxZoom: 20,
    }).addTo(map);
    L.circleMarker([active.lat, active.lng], {
      radius: 8,
      color: '#1d4e9e',
      weight: 2,
      fillColor: '#1d4e9e',
      fillOpacity: 1,
    }).addTo(map);
    const frame = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
    };
  }, [active.lat, active.lng]);

  return (
    <figure className="map-frame">
      <div className="map-clip">
        <div ref={node} className="campus-map" role="img" aria-label={`Map: ${active.name}`} />
      </div>
      <figcaption>
        <a href={open} target="_blank" rel="noreferrer">Open {active.name} on a larger map</a>
        {zone && <span>You usually are near the {zone} at {campus.name}</span>}
      </figcaption>
    </figure>
  );
}

export function effectFor(rewards) {
  return profileEffect(rewards);
}
