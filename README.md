# MyCampus

Live site: https://mycampus-meets.netlify.app/

MyCampus matches students at the same school for one campus activity while they are all free. A student sets preferences, gets a recommendation, accepts it (which invites the others), and checks in when the group meets. Names stay as initials until someone accepts.

## Main Pages
<h2>Front Page</h2>
<img src="https://github.com/user-attachments/assets/b284d791-73cf-49a5-a44c-d333683fb9dc" alt="Front page" width="800">

<h2>App Screens</h2>
<table>
  <tr>
    <td align="center">
      <strong>Today Page</strong><br>
      <img src="https://github.com/user-attachments/assets/e3ab0dae-50b0-40be-a09b-e20197fbfede" alt="Today page" width="210">
    </td>
    <td align="center">
      <strong>Campus Map Page</strong><br>
      <img src="https://github.com/user-attachments/assets/9f6eb3cc-c006-43ed-a745-d8da6c9cce96" alt="Campus Map page" width="210">
    </td>
    <td align="center">
      <strong>Rewards Page</strong><br>
      <img src="https://github.com/user-attachments/assets/6534babe-91e9-477a-b518-533acae7a2ed" alt="Rewards page" width="210">
    </td>
    <td align="center">
      <strong>Profile Page</strong><br>
      <img src="https://github.com/user-attachments/assets/a2ae883d-34ee-4c01-afb8-70d2b308c9e0" alt="Profile page" width="210">
    </td>
  </tr>
</table>

## What a student does

1. Join with a school `.edu` email, then confirm the account with a 6-digit code on first signup. The school is taken from that email (or resolved through the schools lookup).
2. Set a name, major, hobbies, an optional bio, preferred activities, energy, indoor or outdoor setting, usual free times, and one or more group sizes. Campus places load for that school during onboarding.
3. Open Today for a recommended plan. A sentence such as “I want to play basketball this afternoon” can replace the usual hours for that search.
4. Accept the plan. That creates a shared meetup and invites the other people. Their names stay as initials (major and match details still show) until they accept. If they pass, their full name never opens.
5. If someone else accepts first, Today shows the same style of card for their invite. Accept or Not this one. An invite replaces a solo recommendation so you do not join two plans at once.
6. Open the plan and tap I’m here. Rewards update after the student and at least one other person are both checked in.
7. On the map, bookmark places, show more nearby spots, or add a place near campus. Bookmarks bias the next plan’s place.

Group size can be 2, 3, 4, 5, Any, or a custom number of at least 2. The choice of 5 is labeled 5+. A custom number above 4 rounds to the nearest multiple of 5. A student can select more than one size, and the matcher keeps the stronger plan. Any uses the most common size among people who are free and share a hobby or a preferred plan.

## How matching works

Matching starts in the database and finishes in the browser. It does not call a language model. People are limited to the same school.

The database returns people who are free on that day, overlap the time bands, and share a hobby or a preferred plan. The phone then checks the exact free window. Someone enters that list by sharing an exact hobby or the same preferred plan. Related words, such as gym and basketball, can raise a score after that person is already in the list.

How many people come back depends on the group size:

- **80 or fewer.** At most 80 people. A group of 5 or fewer is chosen from combinations of 24. A larger group in this range is one ranked list, and the plan names everyone.
- **81 to 300.** That many people, scored against the student who asked. The plan names everyone.
- **301 to 1,000.** That many people, scored the same way. The plan shows eight names and how many more are included.
- **More than 1,000.** The database counts who is free, shares a hobby or a preferred plan, and accepts that size, then returns the count and eight names. That plan has no “Not this one.”

Shared schedule carries the most weight, then hobbies, then how well the activity fits the request. Major is a small factor. An optional bio is a smaller nudge when the words overlap. A blank bio leaves the ranking unchanged. The sentence parser is a phrase list in `src/parse.js` and `src/data.js`.

Input examples, latency, invites, campuses, and the approximate bio index are in [NOTES.md](NOTES.md).

## Stack

- React 18 and Vite 6
- Supabase Auth and Postgres
- Netlify for the site and API functions (signup mail, campus resolve, schools search, places search, map tiles)
- Hipolabs for university name lookup; Geoapify for geocoding, nearby places, and map tiles
- Brevo SMTP for the signup code

`profiles` holds the fields other signed-in students can read: name, major, hobbies, activities, energy, setting, group size, zone, school, and availability. Availability also stores the free days and bands, the sizes a student accepts, and an optional bio. `private_state` is readable only by its owner and holds passes, history, rewards, a cached recommendation or plan, and the signup code hash. Shared plans live in `meetups` and `meetup_members` (see `supabase/meetups.sql` and `supabase/schema.sql`). Campus place catalogs can be cached in `campuses`.

## Run it locally

```bash
npm install
npm run dev
npm run build
```

Copy `.env.example` to `.env.local` and fill in:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — required for login, profiles, matching, and rewards. Vite bakes these into the site at build time.
- `BREVO_SMTP_USER`, `BREVO_SMTP_KEY`, and `BREVO_FROM` — required to email the signup code. These stay on the server.
- `GEOAPIFY_KEY` — required for campus lookup, nearby places, and map tiles. Stays on the server.

In local development, `/api/send-code`, `/api/campus`, `/api/schools`, `/api/places`, and `/api/map-tiles` are handled by the Vite server. On Netlify, `netlify.toml` sends those paths to functions under `netlify/functions/`.

Apply `supabase/schema.sql` (and `supabase/meetups.sql` if you are only adding meetups) in the Supabase SQL editor so profiles, matching helpers, campuses, and meetup tables exist.

## Publish

Netlify builds with `npm run build` and publishes `dist`. Set the same six variables in the Netlify site settings before building. The current site is https://mycampus-meets.netlify.app/.
