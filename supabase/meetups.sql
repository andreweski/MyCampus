-- Shared meetups: Accept creates invites; names stay private until the other person accepts.

create table if not exists meetups (
  id uuid primary key default gen_random_uuid(),
  host_id text not null,
  school text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz default now()
);

create table if not exists meetup_members (
  meetup_id uuid not null references meetups(id) on delete cascade,
  user_id text not null,
  role text not null default 'guest',
  status text not null default 'invited',
  here boolean not null default false,
  name text default '',
  major text default '',
  primary key (meetup_id, user_id)
);

create index if not exists meetup_members_user on meetup_members (user_id);
create index if not exists meetups_host on meetups (host_id);

alter table meetups enable row level security;
alter table meetup_members enable row level security;

grant select, insert, update, delete on meetups to authenticated;
grant select, insert, update, delete on meetup_members to authenticated;

drop policy if exists "members read meetups" on meetups;
create policy "members read meetups"
  on meetups for select to authenticated
  using (
    host_id = auth.uid()::text
    or exists (
      select 1 from meetup_members m
      where m.meetup_id = id and m.user_id = auth.uid()::text
    )
  );

drop policy if exists "host insert meetups" on meetups;
create policy "host insert meetups"
  on meetups for insert to authenticated
  with check (host_id = auth.uid()::text);

drop policy if exists "host update meetups" on meetups;
create policy "host update meetups"
  on meetups for update to authenticated
  using (host_id = auth.uid()::text);

drop policy if exists "host delete meetups" on meetups;
create policy "host delete meetups"
  on meetups for delete to authenticated
  using (host_id = auth.uid()::text);

drop policy if exists "members read roster" on meetup_members;
create policy "members read roster"
  on meetup_members for select to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1 from meetup_members self
      where self.meetup_id = meetup_id and self.user_id = auth.uid()::text
    )
  );

drop policy if exists "host insert members" on meetup_members;
create policy "host insert members"
  on meetup_members for insert to authenticated
  with check (
    exists (
      select 1 from meetups m
      where m.id = meetup_id and m.host_id = auth.uid()::text
    )
  );

drop policy if exists "member update self" on meetup_members;
create policy "member update self"
  on meetup_members for update to authenticated
  using (
    user_id = auth.uid()::text
    or exists (
      select 1 from meetups m
      where m.id = meetup_id and m.host_id = auth.uid()::text
    )
  );

notify pgrst, 'reload schema';
