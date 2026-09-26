-- Run this once in the Supabase SQL editor.
-- Leave "Confirm email" off so a student can join without a confirmation link.

create table if not exists profiles (
  id uuid primary key,
  name text,
  major text default '',
  hobbies text[] default '{}',
  activities text[] default '{}',
  energy text default 'mixed',
  setting text default 'either',
  group_size int default 3 check (group_size is null or group_size between 2 and 12),
  zone text default 'union',
  availability jsonb default '{"days":[],"bands":[]}'::jsonb, -- also groupFlex, groupSize, groupSizes, and optional bio
  updated_at timestamptz default now()
);

create table if not exists private_state (
  id uuid primary key,
  passed jsonb default '[]'::jsonb,
  history jsonb default '[]'::jsonb,
  rewards jsonb default '{"xp":0,"streak":0,"lastDay":null,"badges":[],"people":[]}'::jsonb,
  recommendation jsonb,
  plan jsonb,
  ask jsonb,
  signup_confirmed boolean default true,
  confirm_code_hash text,
  confirm_code_expires timestamptz
);

alter table profiles enable row level security;
alter table private_state enable row level security;

grant select, insert, update, delete on profiles to authenticated;
grant select, insert, update, delete on private_state to authenticated;

drop policy if exists "students can read profiles" on profiles;
create policy "students can read profiles"
  on profiles for select to authenticated using (true);

drop policy if exists "students insert own profile" on profiles;
create policy "students insert own profile"
  on profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "students update own profile" on profiles;
create policy "students update own profile"
  on profiles for update to authenticated using (auth.uid() = id);

drop policy if exists "students delete own profile" on profiles;
create policy "students delete own profile"
  on profiles for delete to authenticated using (auth.uid() = id);

drop policy if exists "students own private state" on private_state;
create policy "students own private state"
  on private_state for all to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

-- Demo classmates so a brand-new account still has people to meet.
-- They cannot log in. Real signups are added by the app.
insert into profiles (id, name, major, hobbies, activities, energy, setting, group_size, zone, availability) values
  ('11111111-1111-4111-8111-111111111111', 'Jordan Kim', 'Kinesiology', array['Basketball','Coffee'], array['Fitness','Food'], 'high', 'outdoors', 3, 'gym', '{"days":[1,2,3,4,5],"bands":["morning","lunch","afternoon"]}'::jsonb),
  ('22222222-2222-4222-8222-222222222222', 'Priya Shah', 'Biology', array['Games','Walking'], array['Food','Studying'], 'calm', 'either', 3, 'science', '{"days":[1,2,3,4,5],"bands":["lunch","afternoon"]}'::jsonb),
  ('33333333-3333-4333-8333-333333333333', 'Maya Lopez', 'Computer Science', array['Walking','Music'], array['Studying','Fitness'], 'mixed', 'either', 3, 'library', '{"days":[1,2,4,5],"bands":["lunch","afternoon","evening"]}'::jsonb),
  ('44444444-4444-4444-8444-444444444444', 'Sam Nguyen', 'Business', array['Games','Movies'], array['Social','Food'], 'mixed', 'indoors', 3, 'union', '{"days":[2,3,4,5],"bands":["lunch","afternoon","evening"]}'::jsonb),
  ('55555555-5555-4555-8555-555555555555', 'Elena Vasquez', 'Art', array['Walking','Coffee'], array['Outdoors','Social'], 'calm', 'outdoors', 3, 'quad', '{"days":[1,3,4,5,6],"bands":["afternoon","evening"]}'::jsonb),
  ('66666666-6666-4666-8666-666666666666', 'Luis Ortega', 'Biology', array['Walking','Photography'], array['Food','Studying'], 'mixed', 'either', 3, 'science', '{"days":[1,2,3,4,5],"bands":["lunch","afternoon"]}'::jsonb)
on conflict (id) do nothing;

-- Spellings the hobby list does not know. Matching does not read this table.
create table if not exists open_hobbies (
  phrase text primary key,
  count int default 1
);

alter table open_hobbies enable row level security;
grant select, insert, update on open_hobbies to authenticated;

drop policy if exists "students read open hobbies" on open_hobbies;
create policy "students read open hobbies"
  on open_hobbies for select to authenticated using (true);

drop policy if exists "students insert open hobbies" on open_hobbies;
create policy "students insert open hobbies"
  on open_hobbies for insert to authenticated with check (true);

drop policy if exists "students update open hobbies" on open_hobbies;
create policy "students update open hobbies"
  on open_hobbies for update to authenticated using (true);
