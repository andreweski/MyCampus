import { recommend } from './match.js';
import { rememberCampus } from './data.js';

self.onmessage = (event) => {
  const { id, profile, options } = event.data || {};
  try {
    if (options?.campus) rememberCampus(options.campus);
    const now = options?.now ? new Date(options.now) : new Date();
    const result = recommend(profile, { ...(options || {}), now });
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'match failed' });
  }
};
