-- The relay: ChatGPT and Claude giving the flock jobs through the runner. The relay never keeps the owner's session. When
-- the owner signs in on its page, their session is used once, for `create_relay_grant`, which ties a grant to their
-- accepted runner link and gives back a random secret, kept here only as a hash. From then on the relay calls the
-- `relay_*` functions below as the runner's own session, with that secret, and each acts as the owner for that one thing
-- only while the grant stands and its link is still accepted and the caller's. There's no relay function for approvals,
-- so nothing on the runner can answer one: `decide_cloud_approval` still refuses any runner. Unlinking or replacing the
-- runner revokes its grants. Also the address ChatGPT and Claude connect to, for the owner to see in Settings. Run it in
-- the SQL editor, after the routines'. Running it again is safe.

-- --- The address ---

alter table public.cloud_runner_links add column if not exists relay_url text;
alter table public.cloud_runner_links drop constraint if exists relay_url_https;
alter table public.cloud_runner_links add constraint relay_url_https check (relay_url is null or (relay_url ~ '^https://[^\s/?#]+/mcp$' and length(relay_url) <= 300));

-- Null clears it, as when the relay is turned off. Only an accepted runner, on its own link.
create or replace function public.runner_set_relay_url(p_url text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.cloud_runner_links set relay_url = nullif(btrim(p_url), '') where runner = auth.uid() and accepted;
  return found;
end;
$$;

drop function if exists public.my_cloud_runner();
create function public.my_cloud_runner() returns table (email text, accepted boolean, relay_url text)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, l.accepted, case when l.accepted then l.relay_url end
  from public.cloud_runner_links l join auth.users u on u.id = l.runner where l.owner = auth.uid();
$$;

-- --- Grants ---

create table if not exists public.cloud_relay_grants (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  runner uuid not null references auth.users (id) on delete cascade,
  secret_hash text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists cloud_relay_grants_owner on public.cloud_relay_grants (owner);
alter table public.cloud_relay_grants enable row level security;
revoke all on table public.cloud_relay_grants from public, anon, authenticated;

-- Which jobs each grant started, the only ones it can see or stop.
create table if not exists public.cloud_relay_jobs (
  job_id uuid primary key references public.cloud_jobs (id) on delete cascade,
  grant_id uuid not null references public.cloud_relay_grants (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists cloud_relay_jobs_grant on public.cloud_relay_jobs (grant_id, created_at);
alter table public.cloud_relay_jobs enable row level security;
revoke all on table public.cloud_relay_jobs from public, anon, authenticated;

-- A link that's deleted, unaccepted or given another runner takes its grants with it. An account that accepts a link as
-- someone's runner has no jobs of its own from then on, so its own grants go too.
create or replace function public.revoke_relay_grants_of_link() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.runner <> old.runner or not new.accepted then
    update public.cloud_relay_grants set revoked_at = now() where owner = old.owner and runner = old.runner and revoked_at is null;
  end if;
  if tg_op = 'UPDATE' and new.accepted and not old.accepted then
    update public.cloud_relay_grants set revoked_at = now() where owner = new.runner and revoked_at is null;
  end if;
  return null;
end;
$$;
revoke all on function public.revoke_relay_grants_of_link() from public, anon, authenticated;
drop trigger if exists cloud_runner_links_revoke_relay on public.cloud_runner_links;
create trigger cloud_runner_links_revoke_relay after update or delete on public.cloud_runner_links
  for each row execute function public.revoke_relay_grants_of_link();

-- As the owner, once, from the relay's sign-in page. Needs an accepted runner, and gives the secret only this once.
create or replace function public.create_relay_grant() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  its_runner uuid;
  secret text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner has no grants' using errcode = '42501'; end if;
  select l.runner into its_runner from public.cloud_runner_links l where l.owner = me and l.accepted;
  if its_runner is null then raise exception 'No runner has accepted a link to this account' using errcode = 'P0001'; end if;
  -- A few at a time: the oldest go first.
  update public.cloud_relay_grants set revoked_at = now()
    where id in (select g.id from public.cloud_relay_grants g where g.owner = me and g.revoked_at is null order by g.created_at desc offset 19);
  insert into public.cloud_relay_grants (owner, runner, secret_hash) values (me, its_runner, encode(sha256(convert_to(secret, 'UTF8')), 'hex'));
  return secret;
end;
$$;

-- As the owner, from Settings: every app connected through the relay has to connect again.
create or replace function public.revoke_relay_grants() returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  gone integer;
begin
  update public.cloud_relay_grants set revoked_at = now() where owner = public.cloud_user() and revoked_at is null;
  get diagnostics gone = row_count;
  return gone;
end;
$$;

-- The grant a secret stands for, only for the runner it was made for, while it and their link stand. Not callable.
create or replace function public.relay_grant(p_secret text) returns public.cloud_relay_grants
language plpgsql stable security definer set search_path = ''
as $$
declare
  found_grant public.cloud_relay_grants;
begin
  select g.* into found_grant from public.cloud_relay_grants g
    where g.secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex') and g.revoked_at is null and g.runner = auth.uid()
      and exists (select 1 from public.cloud_runner_links l where l.owner = g.owner and l.runner = g.runner and l.accepted);
  if found_grant.id is null or public.cloud_runner_for() is distinct from found_grant.owner then
    raise exception 'Not a grant of this runner' using errcode = '42501';
  end if;
  return found_grant;
end;
$$;
revoke all on function public.relay_grant(text) from public, anon, authenticated;

-- --- What the relay can do, as the runner, with a grant ---

-- The runner ends a grant itself, when an app's refresh token is reused or it runs out.
create or replace function public.relay_revoke_grant(p_secret text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  update public.cloud_relay_grants set revoked_at = now() where id = g.id;
  return true;
end;
$$;

create or replace function public.relay_flock(p_secret text)
returns table (id text, name text, palette text, accessory text, instructions text, sites jsonb, tools jsonb, from_gallery boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  return query select f.id, f.name, f.palette, f.accessory, f.instructions, f.sites, f.tools, f.from_gallery
    from public.cloud_flock f where f.owner = g.owner order by f.position;
end;
$$;

-- A new conversation as the owner, as `start_cloud_job` makes one, with the Context of their newest job that has one.
-- The runner checks the bird when it runs, as it does every job's.
create or replace function public.relay_start_job(p_secret text, p_prompt text, p_mascot jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
  made uuid := gen_random_uuid();
  newest_context text;
begin
  perform public.lock_cloud_account(g.owner);
  -- Checked again under the lock that accepting a link takes: an owner who has since become a runner starts nothing.
  if exists (select 1 from public.cloud_runner_links l where l.runner = g.owner and l.accepted) then
    raise exception 'A runner can''t start jobs' using errcode = '42501';
  end if;
  if (select count(*) from public.cloud_jobs j where j.owner = g.owner and j.status in ('queued', 'running', 'waiting')) >= 5 then
    raise exception 'Too many cloud jobs at once' using errcode = 'P0001';
  end if;
  select j.context_id into newest_context from public.cloud_jobs j where j.owner = g.owner and j.context_id is not null order by j.created_at desc limit 1;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id)
    values (made, g.owner, p_prompt, '[]', p_mascot, 'risky', newest_context, made);
  insert into public.cloud_relay_jobs (job_id, grant_id) values (made, g.id);
  return made;
end;
$$;

-- The grant's own jobs, by id, or its newest twenty with none given, with any approval waiting, as `my_cloud_jobs`.
create or replace function public.relay_jobs(p_secret text, p_ids uuid[])
returns table (
  id uuid, status text, steps jsonb, reply text, error text, created_at timestamptz,
  approval_id uuid, approval_kind text, approval_text text, approval_need text, approval_site text, approval_asked_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  return query select j.id, j.status, j.steps, j.reply, j.error, j.created_at, a.id, a.kind, a.text, a.need, a.site, a.created_at
    from public.cloud_relay_jobs r
    join public.cloud_jobs j on j.id = r.job_id and j.owner = g.owner
    left join lateral (
      select * from public.cloud_approvals x where x.job_id = j.id and x.decision is null and j.status = 'waiting' order by x.created_at desc limit 1
    ) a on true
    where r.grant_id = g.id and (p_ids is null or j.id = any (p_ids))
    order by j.created_at desc limit 20;
end;
$$;

create or replace function public.relay_stop_job(p_secret text, p_job uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  if not exists (select 1 from public.cloud_relay_jobs r where r.job_id = p_job and r.grant_id = g.id) then return false; end if;
  update public.cloud_jobs set status = 'stopped', finished_at = now(), updated_at = now() where id = p_job and owner = g.owner and status = 'queued';
  if found then return true; end if;
  update public.cloud_jobs set stop_requested = true, updated_at = now() where id = p_job and owner = g.owner and status in ('running', 'waiting');
  return found;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'runner_set_relay_url(text)', 'my_cloud_runner()', 'create_relay_grant()', 'revoke_relay_grants()', 'relay_revoke_grant(text)',
    'relay_flock(text)', 'relay_start_job(text, text, jsonb)', 'relay_jobs(text, uuid[])', 'relay_stop_job(text, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
