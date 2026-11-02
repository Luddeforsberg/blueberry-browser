-- Jobs for the cloud runner, and the approvals they wait on. A job is the user's: they start it, read it, stop it and
-- answer it. The runner only works on it, as the role `blueberry_runner`, with a token that also names the user, so it
-- reaches that one user's jobs and nothing else. It can ask, but no grant or function lets it answer: a decision is only
-- ever written by `decide_cloud_approval`, which only a signed-in user can call. No cookie, code or picture is kept here.
-- Run it once in the SQL editor, after the Gallery's migration.

create role blueberry_runner nologin noinherit;
-- So the API can take on the role for a token that names it.
grant blueberry_runner to authenticator;
grant usage on schema public to blueberry_runner;

-- Who is asking, for the user and the runner alike. `auth.uid()` reads the token's `sub`, and this calls it as its owner
-- so the runner's role needs nothing in the `auth` schema.
create function public.cloud_user() returns uuid
language sql stable security definer set search_path = ''
as $$ select auth.uid() $$;
revoke all on function public.cloud_user() from public, anon, authenticated;
grant execute on function public.cloud_user() to authenticated, blueberry_runner;

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
create policy "Users start their own jobs" on public.cloud_jobs
  for insert to authenticated with check (owner = public.cloud_user());
create policy "Users remove their own jobs" on public.cloud_jobs
  for delete to authenticated using (owner = public.cloud_user());
create policy "The runner reads its user's jobs" on public.cloud_jobs
  for select to blueberry_runner using (owner = public.cloud_user());
create policy "The runner works on its user's jobs" on public.cloud_jobs
  for update to blueberry_runner using (owner = public.cloud_user()) with check (owner = public.cloud_user());

create policy "Users and the runner read their own approvals" on public.cloud_approvals
  for select to authenticated, blueberry_runner using (owner = public.cloud_user());
-- Only on a job it's running for that same user.
create policy "The runner asks on its user's running jobs" on public.cloud_approvals
  for insert to blueberry_runner with check (
    owner = public.cloud_user()
    and exists (select 1 from public.cloud_jobs j where j.id = job_id and j.owner = public.cloud_user() and j.status = 'running')
  );

-- Rows say whose. These say which columns. The user writes what they asked for, the runner what happened, and nobody
-- writes a decision: that's only the function below. Nobody but the database changes `owner` or the dates it stamps.
revoke all on table public.cloud_jobs from public, anon, authenticated, blueberry_runner;
revoke all on table public.cloud_approvals from public, anon, authenticated, blueberry_runner;
grant select, delete on table public.cloud_jobs to authenticated;
grant insert (prompt, history, mascot, action_approval, context_id) on table public.cloud_jobs to authenticated;
grant select on table public.cloud_jobs to blueberry_runner;
grant update (status, steps, reply, error, live_view_url, claimed_at, heartbeat_at, updated_at, finished_at) on table public.cloud_jobs to blueberry_runner;
grant select on table public.cloud_approvals to authenticated, blueberry_runner;
grant insert (job_id, owner, kind, text, need, site) on table public.cloud_approvals to blueberry_runner;

-- For the user, as themselves, so the rules above apply.

-- At most a few at a time, so one account can't fill the queue.
create function public.start_cloud_job(p_prompt text, p_history jsonb, p_mascot jsonb, p_action_approval text, p_context_id text)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  made uuid;
begin
  if (select count(*) from public.cloud_jobs j where j.owner = public.cloud_user() and j.status in ('queued', 'running', 'waiting')) >= 5 then
    raise exception 'Too many cloud jobs at once' using errcode = 'P0001';
  end if;
  insert into public.cloud_jobs (prompt, history, mascot, action_approval, context_id)
    values (p_prompt, coalesce(p_history, '[]'), p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''))
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

-- The one way anything is allowed: the signed-in user, on their own approval, once, while its job is waiting on it. Only
-- `authenticated` may call it, so the runner's role can't, and neither can anyone signed out.
create function public.decide_cloud_approval(p_approval uuid, p_allow boolean, p_answer text default null) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
begin
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

-- For the runner, as `blueberry_runner`, so it only ever touches its user's jobs, and only the columns it may.

-- Takes the oldest queued job, so two runners never get the same one. A job whose runner went quiet ends as failed
-- rather than starting again, because it may have done half of something.
create function public.runner_claim_job() returns setof public.cloud_jobs
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.cloud_jobs
    set status = 'failed', error = 'The runner stopped while this job was going, so it ended there.',
      live_view_url = null, finished_at = now(), updated_at = now()
    where status in ('running', 'waiting') and heartbeat_at < now() - interval '2 minutes';
  return query
    update public.cloud_jobs j
      set status = 'running', claimed_at = now(), heartbeat_at = now(), updated_at = now()
      where j.id = (
        select q.id from public.cloud_jobs q where q.status = 'queued' order by q.created_at limit 1 for update skip locked
      )
      returning j.*;
end;
$$;

-- What happened so far. Null leaves a field as it is, and an empty live view clears it. Answers whether to stop, which
-- is also the answer for a job that's gone or over.
create function public.runner_update_job(
  p_job uuid, p_status text default null, p_steps jsonb default null, p_reply text default null, p_error text default null, p_live_view text default null
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare
  ending boolean := p_status in ('done', 'failed', 'stopped');
  stopping boolean;
begin
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
    where id = p_job and status in ('running', 'waiting')
    returning stop_requested into stopping;
  return coalesce(stopping, true);
end;
$$;

-- Asks the user, and the job waits. Says the approval's id, which is all the runner can then do anything with: read it.
create function public.runner_ask(p_job uuid, p_kind text, p_text text, p_need text default null, p_site text default null) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  made uuid;
begin
  insert into public.cloud_approvals (job_id, owner, kind, text, need, site)
    values (p_job, public.cloud_user(), p_kind, p_text, p_need, p_site)
    returning id into made;
  update public.cloud_jobs set status = 'waiting', heartbeat_at = now(), updated_at = now() where id = p_job;
  return made;
end;
$$;

create function public.runner_decision(p_approval uuid) returns table (decision text, answer text)
language sql stable security invoker set search_path = ''
as $$
  select a.decision, a.answer from public.cloud_approvals a where a.id = p_approval;
$$;

revoke all on function public.start_cloud_job(text, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.my_cloud_jobs(uuid[]) from public, anon, authenticated;
revoke all on function public.stop_cloud_job(uuid) from public, anon, authenticated;
revoke all on function public.decide_cloud_approval(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.forget_cloud_job(uuid) from public, anon, authenticated;
revoke all on function public.runner_claim_job() from public, anon, authenticated;
revoke all on function public.runner_update_job(uuid, text, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.runner_ask(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.runner_decision(uuid) from public, anon, authenticated;
grant execute on function public.start_cloud_job(text, jsonb, jsonb, text, text) to authenticated;
grant execute on function public.my_cloud_jobs(uuid[]) to authenticated;
grant execute on function public.stop_cloud_job(uuid) to authenticated;
grant execute on function public.decide_cloud_approval(uuid, boolean, text) to authenticated;
grant execute on function public.forget_cloud_job(uuid) to authenticated;
grant execute on function public.runner_claim_job() to blueberry_runner;
grant execute on function public.runner_update_job(uuid, text, jsonb, text, text, text) to blueberry_runner;
grant execute on function public.runner_ask(uuid, text, text, text, text) to blueberry_runner;
grant execute on function public.runner_decision(uuid) to blueberry_runner;
