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

-- Shortlist support. Run once in the Supabase SQL editor.
-- Counts are campus-wide. Students can read them and cannot write them directly.

create table if not exists hobby_stats (
  id text primary key,
  seen int not null default 0
);

create table if not exists campus_stats (
  id int primary key default 1 check (id = 1),
  profiles int not null default 0
);

create table if not exists profile_hobbies (
  user_id uuid not null references profiles(id) on delete cascade,
  hobby_id text not null,
  primary key (user_id, hobby_id)
);

insert into campus_stats (id, profiles)
select 1, count(*) from profiles where name is not null
on conflict (id) do update set profiles = excluded.profiles;

insert into hobby_stats (id, seen)
select lower(hobby), count(distinct p.id)
from profiles p
cross join lateral unnest(p.hobbies) as hobby
where p.name is not null and hobby is not null and hobby <> ''
group by 1
on conflict (id) do update set seen = excluded.seen;

insert into profile_hobbies (user_id, hobby_id)
select p.id, lower(hobby)
from profiles p
cross join lateral unnest(p.hobbies) as hobby
where p.name is not null and hobby is not null and hobby <> ''
on conflict do nothing;

create index if not exists profiles_hobbies_gin on profiles using gin (hobbies);
create index if not exists profiles_activities_gin on profiles using gin (activities);
create index if not exists profiles_availability_gin on profiles using gin (availability);

create or replace function match_candidates(
  match_day int,
  match_bands text[],
  hobby_labels text[],
  plan_labels text[],
  lim int
)
returns setof profiles
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
  from profiles p
  where p.id is distinct from auth.uid()
    and p.name is not null
    and (p.availability -> 'days') @> to_jsonb(match_day)
    and (p.availability -> 'bands') ?| match_bands
    and (
      p.hobbies && hobby_labels
      or p.activities && plan_labels
    )
  order by (
    select min(s.seen)
    from unnest(p.hobbies) as hobby(value)
    join hobby_stats s on s.id = lower(hobby.value)
    where hobby.value = any (hobby_labels)
  ) asc nulls last,
  p.updated_at desc nulls last
  limit least(greatest(coalesce(lim, 80), 1), 1000);
$$;

create or replace function match_crowd(
  match_day int,
  match_bands text[],
  hobby_labels text[],
  plan_labels text[],
  wanted int
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with eligible as (
    select p.*
    from profiles p
    where p.id is distinct from auth.uid()
      and p.name is not null
      and (p.availability -> 'days') @> to_jsonb(match_day)
      and (p.availability -> 'bands') ?& match_bands
      and (
        p.hobbies && hobby_labels
        or p.activities && plan_labels
      )
      and (
        coalesce(p.availability ->> 'groupFlex', '') = 'any'
        or (
          jsonb_typeof(p.availability -> 'groupSizes') = 'array'
          and jsonb_array_length(p.availability -> 'groupSizes') > 0
          and (p.availability -> 'groupSizes') @> jsonb_build_array(wanted)
        )
        or (
          case
            when jsonb_typeof(p.availability -> 'groupSizes') = 'array' then jsonb_array_length(p.availability -> 'groupSizes')
            else 0
          end = 0
          and (
            (
              coalesce(p.availability ->> 'groupFlex', '') = 'atLeast'
              and wanted = 5
            )
            or (
              coalesce(p.availability ->> 'groupFlex', '') <> 'atLeast'
              and (
                case
                  when coalesce(p.availability ->> 'groupSize', '') ~ '^[0-9]+$' then (p.availability ->> 'groupSize')::int
                  when p.group_size is null then 0
                  else p.group_size
                end in (0, wanted)
              )
            )
          )
        )
      )
  )
  select jsonb_build_object(
    'count', (select count(*) from eligible),
    'sample', coalesce((
      select jsonb_agg(to_jsonb(picked))
      from (
        select e.*
        from eligible e
        order by (
          select min(st.seen)
          from unnest(e.hobbies) as hobby(value)
          join hobby_stats st on st.id = lower(hobby.value)
          where hobby.value = any (hobby_labels)
        ) asc nulls last,
        e.updated_at desc nulls last
        limit 8
      ) picked
    ), '[]'::jsonb)
  );
$$;

create or replace function sync_hobby_counts(
  new_ids text[],
  joining boolean default false,
  leaving boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  old_ids text[];
  dropped text;
  added text;
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  select coalesce(array_agg(hobby_id), '{}') into old_ids
  from profile_hobbies
  where user_id = uid;

  if leaving or joining then
    update campus_stats
      set profiles = greatest(0, profiles + case when leaving then -1 else 1 end)
      where id = 1;
  end if;

  foreach dropped in array coalesce(old_ids, '{}')
  loop
    if not leaving and dropped = any (coalesce(new_ids, '{}')) then
      continue;
    end if;
    update hobby_stats set seen = greatest(0, seen - 1) where id = dropped;
    delete from profile_hobbies where user_id = uid and hobby_id = dropped;
  end loop;

  if leaving then
    return;
  end if;

  foreach added in array coalesce(new_ids, '{}')
  loop
    if added is null or added = '' or added = any (coalesce(old_ids, '{}')) then
      continue;
    end if;
    insert into hobby_stats (id, seen) values (added, 1)
    on conflict (id) do update set seen = hobby_stats.seen + 1;
    insert into profile_hobbies (user_id, hobby_id) values (uid, added)
    on conflict do nothing;
  end loop;
end;
$$;

alter table hobby_stats enable row level security;
alter table campus_stats enable row level security;
alter table profile_hobbies enable row level security;

drop policy if exists "students read hobby stats" on hobby_stats;
create policy "students read hobby stats"
  on hobby_stats for select to authenticated using (true);

drop policy if exists "students read campus stats" on campus_stats;
create policy "students read campus stats"
  on campus_stats for select to authenticated using (true);

revoke all on function match_candidates(int, text[], text[], text[], int) from public, anon;
revoke all on function match_crowd(int, text[], text[], text[], int) from public, anon;
revoke all on function sync_hobby_counts(text[], boolean, boolean) from public, anon;
grant select on hobby_stats, campus_stats to authenticated;
grant execute on function match_candidates(int, text[], text[], text[], int) to authenticated;
grant execute on function match_crowd(int, text[], text[], text[], int) to authenticated;
grant execute on function sync_hobby_counts(text[], boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
