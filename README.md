# MyCampus

Live site: https://mycampus-meets.netlify.app/

MyCampus matches a small group of students for one campus activity at a time they are all free. A student sets preferences, gets a recommendation, accepts it, and checks in when the group meets.

## What a student does

1. Join with a school email, then confirm the account with a 6-digit code on first signup.
2. Set a name, major, hobbies, preferred activities, energy, indoor or outdoor setting, usual free times, and group size.
3. Open Today for a recommended plan. A sentence such as “I want to play basketball this afternoon” can replace the usual hours for that search.
4. Accept the plan, then tap I’m here. Rewards update after the student and at least one other person are both checked in.
5. Bookmark campus places on the map. A bookmarked place is preferred the next time a plan is chosen.

Group size can be 2, 3, 4, 5+, Any, or a custom size from 2 to 12. When preferences disagree, the matcher uses the most common size. Custom sizes of 5 or more round to the nearest multiple of 5 when the pool is large enough.

## How matching works

Matching runs in the browser. It does not call a language model.

Shared schedule carries the most weight, then hobbies, then how well the activity fits the request. Major is a small factor. Hobbies are linked by meaning: words such as gym, workout, and basketball sit in the same group, so a close word can still match. The sentence parser is a word list in `src/parse.js` and `src/data.js`.

## Stack

- React 18 and Vite 6
- Supabase Auth and Postgres
- Netlify for the site and the mail function
- Brevo SMTP for the signup code

`profiles` holds the fields other signed-in students can read: name, major, hobbies, activities, energy, setting, group size, zone, and availability. `private_state` is readable only by its owner and holds passes, history, rewards, the current plan, and the signup code hash.

The SQL for those tables is in `supabase/schema.sql`.

## Run it locally

```bash
npm install
npm run dev
npm run build
```

Copy `.env.example` to `.env.local` and fill in:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — required for login, profiles, and rewards. Vite bakes these into the site at build time.
- `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, and `BREVO_FROM` — required to email the signup code. These stay on the server.

In local development, `POST /api/send-code` is handled by the Vite server. On Netlify, `netlify.toml` sends that path to `netlify/functions/send-code.mjs`.

## Publish

Netlify builds with `npm run build` and publishes `dist`. Set the same five variables in the Netlify site settings before building. The current site is https://mycampus-meets.netlify.app/.
