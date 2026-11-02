-- Jobs for the cloud runner, and the approvals they wait on. A job is the user's: they start it, read it, stop it and
-- answer it. The runner is an ordinary Supabase user of its own, such as runner@…, signed in with email and password
-- and the publishable key, and linked to one owner. It only works on that owner's jobs, and only through the `runner_*`
-- functions below: it can ask, but nothing lets it answer. A decision is only ever written by `decide_cloud_approval`,
-- which refuses any runner. No cookie, code or picture is kept here. Run it once in the SQL editor, after the Gallery's.

-- Who is asking. `auth.uid()` reads the token's `sub`.
create function public.cloud_user() returns uuid
language sql stable security definer set search_path = ''
as $$ select auth.uid() $$;
revoke all on function public.cloud_user() from public, anon, authenticated;
grant execute on function public.cloud_user() to authenticated;

-- Which user is whose runner. The owner offers it, naming the runner's account, and it counts only once the runner has
-- accepted, naming the owner back. So nobody can send their jobs to someone else's runner, or turn someone's own account
-- into a runner, by knowing an email. One runner per owner and one owner per runner.
create table public.cloud_runner_links (
  owner uuid primary key references auth.users (id) on delete cascade,
  runner uuid not null references auth.users (id) on delete cascade,
  accepted boolean not null default false,
  created_at timestamptz not null default now(),
  constraint not_yourself check (owner <> runner)
);
create unique index cloud_runner_links_one_owner on public.cloud_runner_links (runner) where accepted;
alter table public.cloud_runner_links enable row level security;
revoke all on table public.cloud_runner_links from public, anon, authenticated;

-- The owner the caller is runner for, or null for anyone who isn't one.
create function public.cloud_runner_for() returns uuid
language sql stable security definer set search_path = ''
as $$ select l.owner from public.cloud_runner_links l where l.runner = auth.uid() and l.accepted $$;
revoke all on function public.cloud_runner_for() from public, anon, authenticated;
grant execute on function public.cloud_runner_for() to authenticated;

create table public.cloud_jobs (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default public.cloud_user() references auth.users (id) on delete cascade,
  -- The newest message, and the chat before it, as the app's model would get them.
  prompt text not null,
  history jsonb not null default '[]',
  -- Who it runs as and what that bird may do: { id, name, instructions, sites, tools, fromGallery }. The runner checks it
  -- again, and its limits can only narrow.
  mascot jsonb not null,
  -- The user's Ask before acting setting when they sent it.
  action_approval text not null default 'risky',
  -- The user's Browserbase Context, so the sites they brought along are signed in. Only an id: the cookies stay there.
  context_id text,
  status text not null default 'queued',
  stop_requested boolean not null default false,
  -- What it has done, in its own words: [{ text, done }].
  steps jsonb not null default '[]',
  reply text not null default '',
  error text,
  -- Browserbase's live view of the page it's on, while it runs. Only its user can read it.
  live_view_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,

  constraint prompt_shape check (char_length(prompt) between 1 and 8000),
  constraint history_shape check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 40 and octet_length(history::text) <= 100000),
  constraint mascot_shape check (jsonb_typeof(mascot) = 'object' and octet_length(mascot::text) <= 10000),
  constraint approval_mode check (action_approval in ('risky', 'always', 'never')),
  constraint context_shape check (context_id is null or context_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  constraint status_shape check (status in ('queued', 'running', 'waiting', 'done', 'failed', 'stopped')),
  constraint steps_shape check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 500 and octet_length(steps::text) <= 100000),
  constraint reply_shape check (char_length(reply) <= 40000),
  constraint error_shape check (error is null or char_length(error) <= 500),
  -- Only ever Browserbase's own page.
  constraint live_view_shape check (live_view_url is null or (char_length(live_view_url) <= 2000 and live_view_url ~ '^https://([a-z0-9-]+\.)*browserbase\.com/'))
);
create index cloud_jobs_queue on public.cloud_jobs (status, created_at);
create index cloud_jobs_owner on public.cloud_jobs (owner, created_at);

create table public.cloud_approvals (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.cloud_jobs (id) on delete cascade,
  owner uuid not null default public.cloud_user() references auth.users (id) on delete cascade,
  -- An action to allow, a question to answer, or a page handed to the user.
  kind text not null,
  -- Exactly what `describe` says, or the question, or what the user is asked to do.
  text text not null,
  -- For a handoff: what's needed and on which site.
  need text,
  site text,
  -- Set once, by the user, through `decide_cloud_approval`.
  decision text,
  answer text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,

  constraint kind_shape check (kind in ('approval', 'question', 'handoff')),
  constraint text_shape check (char_length(text) between 1 and 4000),
  constraint handoff_shape check (
    (kind = 'handoff' and need in ('sign-in', 'captcha') and site is not null and char_length(site) <= 300)
    or (kind <> 'handoff' and need is null and site is null)
  ),
  constraint decision_shape check (decision is null or decision in ('allow', 'deny')),
  constraint answer_shape check (answer is null or (kind = 'question' and char_length(answer) <= 2000))
);
create index cloud_approvals_job on public.cloud_approvals (job_id, created_at);

alter table public.cloud_jobs enable row level security;
alter table public.cloud_approvals enable row level security;

create policy "Users read their own jobs" on public.cloud_jobs
  for select to authenticated using (owner = public.cloud_user());
create policy "Users remove their own jobs" on public.cloud_jobs
  for delete to authenticated using (owner = public.cloud_user());
-- Only what's still to do, so a runner never sees how the owner's earlier jobs went.
create policy "A runner reads its owner's unfinished jobs" on public.cloud_jobs
  for select to authenticated using (owner = public.cloud_runner_for() and status in ('queued', 'running', 'waiting'));

create policy "Users read their own approvals" on public.cloud_approvals
  for select to authenticated using (owner = public.cloud_user());
create policy "A runner reads its owner's approvals" on public.cloud_approvals
  for select to authenticated using (owner = public.cloud_runner_for());

-- The user and the runner are both `authenticated`, so no column grant can tell them apart. So nobody writes these
-- tables directly: every write is one of the functions below, and each checks who's calling. Reading and deleting
-- one's own jobs is all a grant allows.
revoke all on table public.cloud_jobs from public, anon, authenticated;
revoke all on table public.cloud_approvals from public, anon, authenticated;
grant select, delete on table public.cloud_jobs to authenticated;
grant select on table public.cloud_approvals to authenticated;

-- Linking, by the owner and then the runner.

-- The owner names the runner's account by email. It replaces any earlier link, and waits for the runner to accept.
create function public.link_cloud_runner(p_email text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
  found_runner uuid;
begin
  if me is null or public.cloud_runner_for() is not null then return false; end if;
  select u.id into found_runner from auth.users u where lower(u.email) = lower(btrim(p_email));
  if found_runner is null or found_runner = me then return false; end if;
  insert into public.cloud_runner_links (owner, runner) values (me, found_runner)
    on conflict (owner) do update set runner = excluded.runner, accepted = false, created_at = now();
  return true;
end;
$$;

create function public.unlink_cloud_runner() returns void
language sql security definer set search_path = ''
as $$ delete from public.cloud_runner_links where owner = auth.uid() $$;

-- The owner's link: the runner's email and whether it has accepted. Nothing if there's none.
create function public.my_cloud_runner() returns table (email text, accepted boolean)
language sql stable security definer set search_path = ''
as $$
  select u.email::text, l.accepted from public.cloud_runner_links l join auth.users u on u.id = l.runner where l.owner = auth.uid();
$$;

-- The runner takes up the link from the owner it was set up for, by their email. False if that owner hasn't offered one.
-- An account that has jobs of its own can't become anyone's runner.
create function public.accept_cloud_runner_link(p_owner_email text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or exists (select 1 from public.cloud_jobs j where j.owner = me) then return false; end if;
  update public.cloud_runner_links l set accepted = true
    where l.runner = me and l.owner = (select u.id from auth.users u where lower(u.email) = lower(btrim(p_owner_email)))
      and not exists (select 1 from public.cloud_runner_links o where o.runner = me and o.accepted and o.owner <> l.owner);
  return found;
end;
$$;

-- For the user, as themselves, so the rules above apply.

-- The only way a job is made, and at most a few at a time, so one account can't fill the queue. Its owner is whoever
-- calls it, and one call per user at a time holds the lock, so two at once can't both get under the limit.
create function public.start_cloud_job(p_prompt text, p_history jsonb, p_mascot jsonb, p_action_approval text, p_context_id text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  made uuid;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  -- A runner works on its owner's jobs and has none of its own.
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t start jobs' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cloud_jobs:' || me::text, 0));
  if (select count(*) from public.cloud_jobs j where j.owner = public.cloud_user() and j.status in ('queued', 'running', 'waiting')) >= 5 then
    raise exception 'Too many cloud jobs at once' using errcode = 'P0001';
  end if;
  insert into public.cloud_jobs (owner, prompt, history, mascot, action_approval, context_id)
    values (me, p_prompt, coalesce(p_history, '[]'), p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''))
    returning id into made;
  return made;
end;
$$;

-- Each job asked about, with the approval it's waiting on, if any.
create function public.my_cloud_jobs(p_ids uuid[])
returns table (
  id uuid, status text, steps jsonb, reply text, error text, live_view_url text, updated_at timestamptz,
  approval_id uuid, approval_kind text, approval_text text, approval_need text, approval_site text, approval_asked_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select j.id, j.status, j.steps, j.reply, j.error, j.live_view_url, j.updated_at,
    a.id, a.kind, a.text, a.need, a.site, a.created_at
  from public.cloud_jobs j
  left join lateral (
    select * from public.cloud_approvals x
    where x.job_id = j.id and x.decision is null and j.status = 'waiting'
    order by x.created_at desc limit 1
  ) a on true
  where j.id = any (p_ids) and j.owner = public.cloud_user();
$$;

-- A queued job just stops. A running one is asked to, and the runner stops it.
create function public.stop_cloud_job(p_job uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  update public.cloud_jobs set status = 'stopped', finished_at = now(), updated_at = now()
    where id = p_job and owner = public.cloud_user() and status = 'queued';
  if found then return true; end if;
  update public.cloud_jobs set stop_requested = true, updated_at = now()
    where id = p_job and owner = public.cloud_user() and status in ('running', 'waiting');
  return found;
end;
$$;

-- The one way anything is allowed: the signed-in owner, on their own approval, once, while its job is waiting on it.
-- Nobody signed out can call it, and a linked runner is refused outright.
create function public.decide_cloud_approval(p_approval uuid, p_allow boolean, p_answer text default null) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
begin
  -- Whatever it's asked, a runner never answers.
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t decide' using errcode = '42501'; end if;
  if me is null or p_approval is null or p_allow is null then return false; end if;
  update public.cloud_approvals a
    set decision = case when p_allow then 'allow' else 'deny' end,
      answer = case when p_allow and a.kind = 'question' then left(nullif(btrim(p_answer), ''), 2000) end,
      decided_at = now()
    where a.id = p_approval and a.owner = me and a.decision is null
      and exists (select 1 from public.cloud_jobs j where j.id = a.job_id and j.owner = me and j.status = 'waiting');
  return found;
end;
$$;

create function public.forget_cloud_job(p_job uuid) returns boolean
language sql security invoker set search_path = ''
as $$
  with gone as (delete from public.cloud_jobs where id = p_job returning id) select exists (select 1 from gone);
$$;

-- For the runner, signed in as its own user. Each checks that the caller is a linked runner, and only ever touches its
-- owner's jobs, and only what the runner may write.

-- Takes the owner's oldest queued job, so two runners never get the same one. A job whose runner went quiet ends as
-- failed rather than starting again, because it may have done half of something.
create function public.runner_claim_job() returns setof public.cloud_jobs
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  update public.cloud_jobs
    set status = 'failed', error = 'The runner stopped while this job was going, so it ended there.',
      live_view_url = null, finished_at = now(), updated_at = now()
    where owner = owner_of and status in ('running', 'waiting') and heartbeat_at < now() - interval '2 minutes';
  return query
    update public.cloud_jobs j
      set status = 'running', claimed_at = now(), heartbeat_at = now(), updated_at = now()
      where j.id = (
        select q.id from public.cloud_jobs q where q.owner = owner_of and q.status = 'queued' order by q.created_at limit 1 for update skip locked
      )
      returning j.*;
end;
$$;

-- What happened so far. Null leaves a field as it is, and an empty live view clears it. Answers whether to stop, which
-- is also the answer for a job that's gone, over or not this runner's.
create function public.runner_update_job(
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
    where id = p_job and owner = owner_of and status in ('running', 'waiting')
    returning stop_requested into stopping;
  return coalesce(stopping, true);
end;
$$;

-- Asks the owner, on a job it's running, and the job waits. Says the approval's id, which the runner can then only read.
create function public.runner_ask(p_job uuid, p_kind text, p_text text, p_need text default null, p_site text default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
  made uuid;
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  if not exists (select 1 from public.cloud_jobs j where j.id = p_job and j.owner = owner_of and j.status = 'running') then
    raise exception 'Not a job it''s running' using errcode = '42501';
  end if;
  insert into public.cloud_approvals (job_id, owner, kind, text, need, site)
    values (p_job, owner_of, p_kind, p_text, p_need, p_site)
    returning id into made;
  update public.cloud_jobs set status = 'waiting', heartbeat_at = now(), updated_at = now() where id = p_job;
  return made;
end;
$$;

create function public.runner_decision(p_approval uuid) returns table (decision text, answer text)
language sql stable security invoker set search_path = ''
as $$
  select a.decision, a.answer from public.cloud_approvals a where a.id = p_approval and a.owner = public.cloud_runner_for();
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'start_cloud_job(text, jsonb, jsonb, text, text)', 'my_cloud_jobs(uuid[])', 'stop_cloud_job(uuid)',
    'decide_cloud_approval(uuid, boolean, text)', 'forget_cloud_job(uuid)', 'link_cloud_runner(text)', 'unlink_cloud_runner()',
    'my_cloud_runner()', 'accept_cloud_runner_link(text)', 'runner_claim_job()',
    'runner_update_job(uuid, text, jsonb, text, text, text)', 'runner_ask(uuid, text, text, text, text)', 'runner_decision(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
