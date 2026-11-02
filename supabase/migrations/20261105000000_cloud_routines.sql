-- Routines that run even when the Mac is off. The app keeps a copy of each such routine here, written only by its owner
-- through `sync_cloud_routine`, and the runner starts a job from it when it's due, through `runner_start_routine`. That
-- job is an ordinary cloud job of the owner's, with the bird, limits and Ask before acting the owner wrote, so the
-- runner checks it as it checks any other, and its approvals are answered only by the owner. The runner reads only when
-- each is due and how its schedule goes: never the instructions until a job is made from them. Run it in the SQL
-- editor, after the conversations'. Running it again is safe.

create table if not exists public.cloud_routines (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default public.cloud_user() references auth.users (id) on delete cascade,
  -- The routine's own id in the app.
  routine_key text not null,
  prompt text not null,
  -- As on a job: who it runs as and what that bird may do, already narrowed to the routine's own sites.
  mascot jsonb not null,
  action_approval text not null default 'risky',
  context_id text,
  -- The app's schedule, which the runner reads with the app's own rules, in the owner's time zone.
  schedule jsonb not null,
  time_zone text not null,
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),

  constraint routine_key_shape check (char_length(routine_key) between 1 and 100),
  constraint routine_prompt_shape check (char_length(prompt) between 1 and 8000),
  constraint routine_mascot_shape check (jsonb_typeof(mascot) = 'object' and octet_length(mascot::text) <= 10000),
  constraint routine_approval_mode check (action_approval in ('risky', 'always', 'never')),
  constraint routine_context_shape check (context_id is null or context_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  constraint routine_schedule_shape check (jsonb_typeof(schedule) = 'object' and octet_length(schedule::text) <= 1000),
  constraint routine_zone_shape check (time_zone ~ '^[A-Za-z0-9_+/-]{1,64}$'),
  unique (owner, routine_key)
);
create index if not exists cloud_routines_due on public.cloud_routines (owner, next_run_at);

-- Which routine a job was started from, so one can't be started twice while the last is going.
alter table public.cloud_jobs add column if not exists routine_id uuid references public.cloud_routines (id) on delete set null;
create unique index if not exists cloud_jobs_one_per_routine on public.cloud_jobs (routine_id) where status in ('queued', 'running', 'waiting');

alter table public.cloud_routines enable row level security;
drop policy if exists "Users read their own cloud routines" on public.cloud_routines;
create policy "Users read their own cloud routines" on public.cloud_routines
  for select to authenticated using (owner = public.cloud_user());
-- Nobody writes it directly, and the runner reads it only through `runner_due_routines`.
revoke all on table public.cloud_routines from public, anon, authenticated;
grant select on table public.cloud_routines to authenticated;

-- The owner's copy of one routine, made or replaced. Like starting a job, it needs a runner that has accepted, and a
-- runner can't call it. A null `p_next_run_at` keeps it here without running, as for a paused routine.
create or replace function public.sync_cloud_routine(
  p_key text, p_prompt text, p_mascot jsonb, p_action_approval text, p_context_id text, p_schedule jsonb, p_time_zone text, p_next_run_at timestamptz
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  made uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.lock_cloud_account(me);
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t keep routines' using errcode = '42501'; end if;
  if not exists (select 1 from public.cloud_runner_links l where l.owner = me and l.accepted) then
    raise exception 'No runner has accepted a link to this account' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.cloud_routines r where r.owner = me and r.routine_key = p_key)
    and (select count(*) from public.cloud_routines r where r.owner = me) >= 20 then
    raise exception 'Too many routines in the cloud' using errcode = 'P0001';
  end if;
  insert into public.cloud_routines (owner, routine_key, prompt, mascot, action_approval, context_id, schedule, time_zone, next_run_at)
    values (me, p_key, p_prompt, p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''), p_schedule, p_time_zone, p_next_run_at)
    on conflict (owner, routine_key) do update set
      prompt = excluded.prompt, mascot = excluded.mascot, action_approval = excluded.action_approval, context_id = excluded.context_id,
      schedule = excluded.schedule, time_zone = excluded.time_zone, next_run_at = excluded.next_run_at, updated_at = now()
    returning id into made;
  return made;
end;
$$;

-- As the caller, so row-level security keeps it to their own. A job already made from it carries on.
create or replace function public.forget_cloud_routine(p_key text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.cloud_routines where owner = public.cloud_user() and routine_key = p_key;
  return found;
end;
$$;

-- The runner's owner's routines that are due now: only enough to work out the next time. Nothing for anyone else.
create or replace function public.runner_due_routines()
returns table (id uuid, schedule jsonb, time_zone text, next_run_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  return query
    select r.id, r.schedule, r.time_zone, r.next_run_at from public.cloud_routines r
    where r.owner = owner_of and r.next_run_at is not null and r.next_run_at <= now()
    order by r.next_run_at limit 20;
end;
$$;

-- Makes the job for one due run, from what the owner wrote, and moves the routine on to `p_next`, which may be null for
-- one that won't run again. `p_due` must be the time it was due, so two calls for the same run make one job. A run that
-- can't start, because its last is still going or the owner has five jobs going, is skipped, as the app skips one that
-- was missed. Says the job's id, or null for a skipped run.
create or replace function public.runner_start_routine(p_routine uuid, p_due timestamptz, p_next timestamptz) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
  routine public.cloud_routines;
  made uuid := gen_random_uuid();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  perform public.lock_cloud_account(owner_of);
  select * into routine from public.cloud_routines r
    where r.id = p_routine and r.owner = owner_of and r.next_run_at = p_due and r.next_run_at <= now()
    for update;
  if not found then return null; end if;
  if p_next is not null and p_next <= p_due then raise exception 'The next run has to come after this one' using errcode = 'P0001'; end if;
  update public.cloud_routines set next_run_at = p_next, updated_at = now() where id = routine.id;
  if exists (select 1 from public.cloud_jobs j where j.routine_id = routine.id and j.status in ('queued', 'running', 'waiting'))
    or (select count(*) from public.cloud_jobs j where j.owner = owner_of and j.status in ('queued', 'running', 'waiting')) >= 5 then
    return null;
  end if;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id, routine_id)
    values (made, owner_of, routine.prompt, '[]', routine.mascot, routine.action_approval, routine.context_id, made, routine.id);
  return made;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'sync_cloud_routine(text, text, jsonb, text, text, jsonb, text, timestamptz)', 'forget_cloud_routine(text)',
    'runner_due_routines()', 'runner_start_routine(uuid, timestamptz, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
