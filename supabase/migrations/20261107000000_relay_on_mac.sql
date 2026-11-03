-- Relay jobs on the owner's own Mac. A job from ChatGPT or Claude can run in Blueberry on the owner's Mac, with their real
-- tabs and sign-ins, while it's on and they've allowed it in Settings. It's a row in `cloud_jobs` like any other, with
-- `target` 'mac', written only by `relay_start_job` with a grant, as before. The runner never reads, claims or writes
-- one. Only the owner's own app session claims one, through `mac_claim_job`, and only while the opt-in kept here with the
-- Mac's presence is on, so a stale app can't. Approvals for it stay on the Mac and never come here, so there's still
-- nothing that answers one. Run it in the SQL editor, after the relay's. Running it again is safe.

alter table public.cloud_jobs add column if not exists target text not null default 'cloud';
alter table public.cloud_jobs drop constraint if exists target_shape;
alter table public.cloud_jobs add constraint target_shape check (target in ('cloud', 'mac'));

-- --- The runner keeps to the cloud's ---

drop policy if exists "A runner reads its owner's unfinished jobs" on public.cloud_jobs;
create policy "A runner reads its owner's unfinished jobs" on public.cloud_jobs
  for select to authenticated using (owner = public.cloud_runner_for() and target = 'cloud' and status in ('queued', 'running', 'waiting'));

create or replace function public.runner_claim_job() returns setof public.cloud_jobs
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  update public.cloud_jobs
    set status = 'failed', error = 'The runner stopped while this job was going, so it ended there.',
      live_view_url = null, finished_at = now(), updated_at = now()
    where owner = owner_of and target = 'cloud' and status in ('running', 'waiting') and heartbeat_at < now() - interval '2 minutes';
  return query
    update public.cloud_jobs j
      set status = 'running', claimed_at = now(), heartbeat_at = now(), updated_at = now()
      where j.id = (
        select q.id from public.cloud_jobs q where q.owner = owner_of and q.target = 'cloud' and q.status = 'queued' order by q.created_at limit 1 for update skip locked
      )
      returning j.*;
end;
$$;

create or replace function public.runner_update_job(
  p_job uuid, p_status text default null, p_steps jsonb default null, p_reply text default null, p_error text default null, p_live_view text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
  ending boolean := p_status in ('done', 'failed', 'stopped');
  stopping boolean;
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  if p_status = 'queued' then raise exception 'A job goes back to the queue only by being sent again' using errcode = 'P0001'; end if;
  update public.cloud_jobs
    set status = coalesce(p_status, status),
      steps = coalesce(p_steps, steps),
      reply = coalesce(p_reply, reply),
      error = coalesce(p_error, error),
      live_view_url = case when ending or p_live_view = '' then null else coalesce(p_live_view, live_view_url) end,
      heartbeat_at = now(),
      updated_at = now(),
      finished_at = case when ending then now() else finished_at end
    where id = p_job and owner = owner_of and target = 'cloud' and status in ('running', 'waiting')
    returning stop_requested into stopping;
  return coalesce(stopping, true);
end;
$$;

create or replace function public.runner_ask(p_job uuid, p_kind text, p_text text, p_need text default null, p_site text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
  made uuid;
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  if not exists (select 1 from public.cloud_jobs j where j.id = p_job and j.owner = owner_of and j.target = 'cloud' and j.status = 'running') then
    raise exception 'Not a job it''s running' using errcode = '42501';
  end if;
  insert into public.cloud_approvals (job_id, owner, kind, text, need, site)
    values (p_job, owner_of, p_kind, p_text, p_need, p_site)
    returning id into made;
  update public.cloud_jobs set status = 'waiting', heartbeat_at = now(), updated_at = now() where id = p_job;
  return made;
end;
$$;

-- --- The Mac ---

-- Whether the owner lets relay jobs run on their Mac, and when the app last said it's there. Nobody reads it directly.
create table if not exists public.cloud_mac_presence (
  owner uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  last_seen timestamptz
);
alter table public.cloud_mac_presence enable row level security;
revoke all on table public.cloud_mac_presence from public, anon, authenticated;

-- Allowed, and seen in the last minute. Not callable.
create or replace function public.mac_available(p_owner uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.cloud_mac_presence p where p.owner = p_owner and p.enabled and p.last_seen > now() - interval '60 seconds');
$$;
revoke all on function public.mac_available(uuid) from public, anon, authenticated;

-- As the owner, from the app, every half a minute while the switch is on, and once with false when it goes off. Going
-- off ends what was sent to the Mac and not yet taken, since nothing would take it.
create or replace function public.mac_presence(p_on boolean) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  turned_on boolean := coalesce(p_on, false);
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner isn''t a Mac' using errcode = '42501'; end if;
  insert into public.cloud_mac_presence (owner, enabled, last_seen) values (me, turned_on, case when turned_on then now() end)
    on conflict (owner) do update set enabled = excluded.enabled, last_seen = excluded.last_seen;
  if not turned_on then
    update public.cloud_jobs set status = 'failed', error = 'Blueberry on the Mac stopped taking jobs before this one started.', finished_at = now(), updated_at = now()
      where owner = me and target = 'mac' and status = 'queued';
  end if;
  return turned_on;
end;
$$;

-- As the owner, from the app, only while the switch is on here: takes their oldest job sent to the Mac. A job whose app
-- went quiet ends as failed rather than starting again, and so does one that waited too long for the Mac to take it.
create or replace function public.mac_claim_job() returns setof public.cloud_jobs
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner isn''t a Mac' using errcode = '42501'; end if;
  update public.cloud_mac_presence set last_seen = now() where owner = me and enabled;
  if not found then return; end if;
  update public.cloud_jobs
    set status = 'failed', error = 'Blueberry on the Mac stopped while this job was going, so it ended there.', finished_at = now(), updated_at = now()
    where owner = me and target = 'mac' and status in ('running', 'waiting') and heartbeat_at < now() - interval '2 minutes';
  update public.cloud_jobs
    set status = 'failed', error = 'Blueberry on the Mac didn''t take this job in time.', finished_at = now(), updated_at = now()
    where owner = me and target = 'mac' and status = 'queued' and created_at < now() - interval '5 minutes';
  return query
    update public.cloud_jobs j
      set status = 'running', claimed_at = now(), heartbeat_at = now(), updated_at = now()
      where j.id = (
        select q.id from public.cloud_jobs q where q.owner = me and q.target = 'mac' and q.status = 'queued' order by q.created_at limit 1 for update skip locked
      )
      returning j.*;
end;
$$;

-- As the owner, from the app, on a job it took: what happened so far, as `runner_update_job`. Answers whether to stop.
create or replace function public.mac_update_job(
  p_job uuid, p_status text default null, p_steps jsonb default null, p_reply text default null, p_error text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  ending boolean := p_status in ('done', 'failed', 'stopped');
  stopping boolean;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner isn''t a Mac' using errcode = '42501'; end if;
  if p_status = 'queued' then raise exception 'A job goes back to the queue only by being sent again' using errcode = 'P0001'; end if;
  update public.cloud_jobs
    set status = coalesce(p_status, status),
      steps = coalesce(p_steps, steps),
      reply = coalesce(p_reply, reply),
      error = coalesce(p_error, error),
      heartbeat_at = now(),
      updated_at = now(),
      finished_at = case when ending then now() else finished_at end
    where id = p_job and owner = me and target = 'mac' and status in ('running', 'waiting')
    returning stop_requested into stopping;
  return coalesce(stopping, true);
end;
$$;

-- --- The relay chooses ---

-- As before, with where it goes: 'auto' to the Mac if it's there and otherwise the cloud, 'mac' only there, or 'cloud'.
-- Null when it was for the Mac and the Mac isn't there.
drop function if exists public.relay_start_job(text, text, jsonb);
drop function if exists public.relay_start_job(text, text, jsonb, text);
create function public.relay_start_job(p_secret text, p_prompt text, p_mascot jsonb, p_where text default 'auto') returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
  made uuid := gen_random_uuid();
  newest_context text;
  wanted text := coalesce(p_where, 'auto');
  goes text;
begin
  if wanted not in ('auto', 'mac', 'cloud') then raise exception 'Where is auto, mac or cloud' using errcode = 'P0001'; end if;
  perform public.lock_cloud_account(g.owner);
  -- Checked again under the lock that accepting a link takes: an owner who has since become a runner starts nothing.
  if exists (select 1 from public.cloud_runner_links l where l.runner = g.owner and l.accepted) then
    raise exception 'A runner can''t start jobs' using errcode = '42501';
  end if;
  goes := case when wanted = 'cloud' then 'cloud' when public.mac_available(g.owner) then 'mac' when wanted = 'mac' then null else 'cloud' end;
  if goes is null then return null; end if;
  if (select count(*) from public.cloud_jobs j where j.owner = g.owner and j.status in ('queued', 'running', 'waiting')) >= 5 then
    raise exception 'Too many cloud jobs at once' using errcode = 'P0001';
  end if;
  if goes = 'cloud' then
    select j.context_id into newest_context from public.cloud_jobs j where j.owner = g.owner and j.context_id is not null order by j.created_at desc limit 1;
  end if;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id, target)
    values (made, g.owner, p_prompt, '[]', p_mascot, 'risky', newest_context, made, goes);
  insert into public.cloud_relay_jobs (job_id, grant_id) values (made, g.id);
  return made;
end;
$$;

-- As before, with where each job runs.
drop function if exists public.relay_jobs(text, uuid[]);
create function public.relay_jobs(p_secret text, p_ids uuid[])
returns table (
  id uuid, status text, steps jsonb, reply text, error text, created_at timestamptz,
  approval_id uuid, approval_kind text, approval_text text, approval_need text, approval_site text, approval_asked_at timestamptz,
  target text
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  return query select j.id, j.status, j.steps, j.reply, j.error, j.created_at, a.id, a.kind, a.text, a.need, a.site, a.created_at, j.target
    from public.cloud_relay_jobs r
    join public.cloud_jobs j on j.id = r.job_id and j.owner = g.owner
    left join lateral (
      select * from public.cloud_approvals x where x.job_id = j.id and x.decision is null and j.status = 'waiting' order by x.created_at desc limit 1
    ) a on true
    where r.grant_id = g.id and (p_ids is null or j.id = any (p_ids))
    order by j.created_at desc limit 20;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'runner_claim_job()', 'runner_update_job(uuid, text, jsonb, text, text, text)', 'runner_ask(uuid, text, text, text, text)',
    'mac_presence(boolean)', 'mac_claim_job()', 'mac_update_job(uuid, text, jsonb, text, text)',
    'relay_start_job(text, text, jsonb, text)', 'relay_jobs(text, uuid[])'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
