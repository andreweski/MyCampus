# Matching notes

The sentence is parsed on the phone. Postgres picks who is free at the same school and shares a hobby or a preferred plan. The phone scores that shortlist. Accepting a plan creates a shared meetup; classmates see initials until they accept.

## Who gets in

- The database requires that weekday, an overlapping time band, the same school, and a shared hobby or preferred plan. It sorts by the rarest shared hobby and returns at most 1,000 people.
- The phone then checks the exact clock times.
- A related hobby, such as gym and basketball, can raise a score only after someone is already in that list.
- An exact hobby scores higher when fewer students list it.
- Seed demo classmates (fixed profile ids in `schema.sql` / local `PEERS`) are kept out of the live student pool. The `demo@school.edu` account matches only those demo classmates so the demo can finish without other logins. Live accounts match other live signups; if a campus has nobody yet, matching falls back to the demo pool.

## Group size

A size of 4 or less is exact. Above 4 it rounds to the nearest multiple of 5. Several sizes are scored, and the stronger plan wins. “Any” uses the most common size and stays in the 80-person search. The button labeled 5+ means five people.

- **80 or fewer.** At most 80 people. Groups of 5 or fewer try combinations of 24. Larger groups in this range are one ranked list. A weak pair is dropped. Every name is shown.
- **81 to 300.** That many people, each scored only against the student who asked. Every name is shown.
- **301 to 1,000.** Same score. The plan shows 8 names and a count of the rest.
- **Above 1,000.** The database returns a count and 8 names. The plan appears when enough people accept that size. There is no “Not this one.”

## Ranking

- Schedule weighs the most, then hobbies, then activity fit. Major is small.
- A shared bio word can nudge the rank. No shared words leaves the rank unchanged. A blank bio changes nothing.
- The activity and place are chosen after the people. “At a park” picks an outdoor spot. It does not search for people who asked for a park.
- Place choice prefers bookmarks and custom places from the map when they fit.

## Invites and names

- Whoever Accepts first becomes the meetup host in the database. The UI does not label host or guest.
- The other people get the same style of card on Today (Accept / Not this one). An invite clears a pending solo recommendation.
- Full names open only after that person accepts. Initials, major, and match details still show before then. A decline never reveals the name.
- Guest names are not written onto `meetup_members` until they accept. Demo classmates cannot log in; after you Accept, the demo simulates their accepts one by one.
- While you already have an open plan, a new invite is not shown until that plan ends.

## Campuses and map

- School comes from the `.edu` email domain (with a small demo host map for `school.edu` → Cal State East Bay).
- Campus places come from Geoapify near the school geocode, with Hipolabs used to resolve school names. Results can be cached in `campuses`.
- Map actions: bookmark a place, show more / show fewer nearby places, and add a place by searching near campus. Bookmarks bias later plans.

## Approximate bio search

- A SimHash index exists for bio seats in groups of 5 or fewer. It turns on at 2,000 written bios.
- Searches download at most 1,000 people, so bios are scored directly.
- Direct scoring was faster at every size timed, from 1,000 through 50,000 bios. The index also missed more of the exact top matches as the pool grew.
- That index would fit long bios matched by meaning, across a whole campus, with the index saved when the profile is saved.

## Scale

- A bigger campus does not enlarge the download. A search still returns at most 1,000 people, or a count plus 8 names.
- A test campus of 10,000, with half the students free on a busy afternoon and sharing one common hobby, still returned each query in well under a second.
- A common hobby on a busy day is the slow case, because the rarity sort walks everyone who matched. A rare hobby stays a small lookup.
- If the shortlist call fails, the backup reads every named profile (still filtered to the school when possible).

## Edge Cases: what a student can type

- **“Friday at 2.”** The coming Friday, 2:00–3:15, with a small group who share a hobby.
- **“This Friday” on a Saturday.** The coming Friday, not the Friday that just passed.
- **“Friday from 1 to 3.”** People free across lunch and afternoon. The plan activity is 75 minutes inside that window, so the card can read 1:00–2:15 while the tag reads 1:00–3:00.
- **“Sunday at 2” when Sunday is not a free day.** No plan.
- **A blank sentence.** A prompt to add a time. No search. “Use my usual hours” clears the prompt and searches the next day the student is usually free. On Saturday that is Monday.
- **“2 PM” with a classmate who listed only afternoon.** They can still match. Listing lunch as well does not stretch a 2 PM window.
- **A group of 4 when only two people accept 4.** No plan.
- **200 people.** Every matching name on the card (as initials until each person accepts).
- **400 people.** Eight names, plus how many more are in the plan.
- **1,000 people.** Same preview. **1,003** rounds to 1,005 and becomes a count.
- **5,000 people, and enough classmates accept it.** A count and eight names. No “Not this one.”
- **5,000 people, and too few accept it.** No plan.
- **“At a park” with that counted plan.** An outdoor place, chosen after the people.
- **A bio that shares no words with the group.** The same winner as a blank bio.
- **Log out while a search is still running.** The result is discarded.
- **Someone else Accepts first.** Their invite replaces your recommendation card. Same Accept / Not this one actions.
- **You already have a plan.** An incoming invite waits until that plan is cancelled or completed.
