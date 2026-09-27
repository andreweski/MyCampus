# MyCampus

Live site: https://mycampus-meets.netlify.app/

MyCampus matches students for one campus activity at a time they are all free. A student sets preferences, gets a recommendation, accepts it, and checks in when the group meets.

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

1. Join with a school email, then confirm the account with a 6-digit code on first signup.
2. Set a name, major, hobbies, an optional bio, preferred activities, energy, indoor or outdoor setting, usual free times, and one or more group sizes.
3. Open Today for a recommended plan. A sentence such as “I want to play basketball this afternoon” can replace the usual hours for that search.
4. Accept the plan, then tap I’m here. Rewards update after the student and at least one other person are both checked in.
5. Bookmark campus places on the map. A bookmarked place is preferred the next time a plan is chosen.

Group size can be 2, 3, 4, 5, Any, or a custom number of at least 2. The choice of 5 is labeled 5+. A custom number above 4 rounds to the nearest multiple of 5. A student can select more than one size, and the matcher keeps the stronger plan. Any uses the most common size among people who are free and share a hobby or a preferred plan.

## How matching works

Matching starts in the database and finishes in the browser. It does not call a language model.

The database returns people who are free on that day, overlap the time bands, and share a hobby or a preferred plan. The phone then checks the exact free window. Someone enters that list by sharing an exact hobby or the same preferred plan. Related words, such as gym and basketball, can raise a score after that person is already in the list.

How many people come back depends on the group size:

- **80 or fewer.** At most 80 people. A group of 5 or fewer is chosen from combinations of 24. A larger group in this range is one ranked list, and the plan names everyone.
- **81 to 300.** That many people, scored against the student who asked. The plan names everyone.
- **301 to 1,000.** That many people, scored the same way. The plan shows eight names and how many more are included.
- **More than 1,000.** The database counts who is free, shares a hobby or a preferred plan, and accepts that size, then returns the count and eight names. That plan has no “Not this one.”

Shared schedule carries the most weight, then hobbies, then how well the activity fits the request. Major is a small factor. An optional bio is a smaller nudge when the words overlap. A blank bio leaves the ranking unchanged. The sentence parser is a phrase list in `src/parse.js` and `src/data.js`.

Input examples, latency, and the approximate bio index are in [NOTES.md](NOTES.md).

## Stack

- React 18 and Vite 6
- Supabase Auth and Postgres
- Netlify for the site and the mail function
- Brevo SMTP for the signup code

`profiles` holds the fields other signed-in students can read: name, major, hobbies, activities, energy, setting, group size, zone, and availability. Availability also stores the free days and bands, the sizes a student accepts, and an optional bio. `private_state` is readable only by its owner and holds passes, history, rewards, the current plan, and the signup code hash.

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
