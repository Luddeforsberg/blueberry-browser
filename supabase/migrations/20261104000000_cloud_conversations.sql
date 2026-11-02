-- Conversations: a follow-up to a cloud job is a new job in the same conversation, carrying the messages before it as its
-- history, as a runner chat in the app always has. Each job keeps its own row, so the runner, its checks and its
-- approvals are unchanged. Only one job in a conversation may be going at once. The app and the phone both read a
-- conversation from the owner's own rows, so either can go on with one the other started. Run it once in the SQL editor,
-- after the phone page's.

-- Null for a job from before conversations, which is one on its own until something follows it up.
alter table public.cloud_jobs add column conversation_id uuid;
create index cloud_jobs_conversation on public.cloud_jobs (owner, conversation_id, created_at);
-- The real rule behind "one at a time": two going in one conversation can't both be written.
create unique index cloud_jobs_one_going on public.cloud_jobs (conversation_id) where status in ('queued', 'running', 'waiting');

-- As before, with the conversation it belongs to. Null starts a new one under the job's own id. An id nobody uses yet
-- starts one under that id, which is how the app knows its chat's before the job is made. One with jobs must be the
-- caller's own, and must have none going.
drop function public.start_cloud_job(text, jsonb, jsonb, text, text);
create function public.start_cloud_job(p_prompt text, p_history jsonb, p_mascot jsonb, p_action_approval text, p_context_id text, p_conversation uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  made uuid := gen_random_uuid();
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.lock_cloud_account(me);
  -- A runner works on its owner's jobs and has none of its own.
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t start jobs' using errcode = '42501'; end if;
  if not exists (select 1 from public.cloud_runner_links l where l.owner = me and l.accepted) then
    raise exception 'No runner has accepted a link to this account' using errcode = 'P0001';
  end if;
  if (select count(*) from public.cloud_jobs j where j.owner = me and j.status in ('queued', 'running', 'waiting')) >= 5 then
    raise exception 'Too many cloud jobs at once' using errcode = 'P0001';
  end if;
  if p_conversation is not null then
    if exists (select 1 from public.cloud_jobs j where (j.conversation_id = p_conversation or j.id = p_conversation) and j.owner <> me) then
      raise exception 'Not a conversation of yours' using errcode = '42501';
    end if;
    -- A job from before conversations becomes the first of this one.
    update public.cloud_jobs set conversation_id = id where id = p_conversation and owner = me and conversation_id is null;
    if exists (select 1 from public.cloud_jobs j where j.conversation_id = p_conversation and j.status in ('queued', 'running', 'waiting')) then
      raise exception 'This conversation already has a job going' using errcode = '23505';
    end if;
  end if;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id)
    values (made, me, p_prompt, coalesce(p_history, '[]'), p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''), coalesce(p_conversation, made))
    returning id into made;
  return made;
end;
$$;

-- Deleting a chat in the app deletes every job of its conversation, so it can't come back as a chat started elsewhere.
-- As the caller, so row-level security keeps it to their own.
create function public.forget_cloud_conversation(p_conversation uuid) returns integer
language sql security invoker set search_path = ''
as $$
  with gone as (delete from public.cloud_jobs where conversation_id = p_conversation or id = p_conversation returning id) select count(*)::integer from gone;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['start_cloud_job(text, jsonb, jsonb, text, text, uuid)', 'forget_cloud_conversation(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
