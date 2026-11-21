-- Which job of a conversation is newest no longer depends on the clock. Each job has a turn: 1 for the first of its
-- conversation, and one more than the newest for each that follows, given in `start_cloud_job` under the account's lock.
-- Before, two jobs made in the same instant were told apart by their random ids, so a follow-up built on the older one
-- could be taken. Jobs already there get their turns in the order the old rule saw them. Run it in the SQL editor, after
-- the cloud's confirmed starts and before the app or the phone page that read the turn, since they can't read a
-- conversation without it. Running it again is safe.

alter table public.cloud_jobs add column if not exists turn integer;
-- Oldest first, a tie going to the lower id, so the newest is the one `start_cloud_job` took as newest until now. A job
-- from before conversations is the first of its own.
update public.cloud_jobs j set turn = n.turn
  from (select id, row_number() over (partition by coalesce(conversation_id, id) order by created_at, id) as turn from public.cloud_jobs) n
  where j.id = n.id and j.turn is null;
-- Routines, the relay and the Mac each start a conversation with every job. A follow-up made anywhere but in
-- `start_cloud_job` would be a second turn 1, which the index refuses.
alter table public.cloud_jobs alter column turn set default 1;
alter table public.cloud_jobs alter column turn set not null;
create unique index if not exists cloud_jobs_turn on public.cloud_jobs (conversation_id, turn);

-- As before, with the newest job the one with the highest turn, and the new one a turn after it.
create or replace function public.start_cloud_job(
  p_prompt text, p_history jsonb, p_mascot jsonb, p_action_approval text, p_context_id text, p_conversation uuid default null,
  p_after_job uuid default null, p_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  made uuid := coalesce(p_id, gen_random_uuid());
  earlier_owner uuid;
  newest uuid;
  newest_turn integer;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  perform public.lock_cloud_account(me);
  -- A runner works on its owner's jobs and has none of its own.
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t start jobs' using errcode = '42501'; end if;
  if p_id is not null then
    select j.owner into earlier_owner from public.cloud_jobs j where j.id = p_id;
    if earlier_owner = me then return p_id; end if;
    if earlier_owner is not null then raise exception 'Not a job of yours' using errcode = '42501'; end if;
    if exists (select 1 from public.cloud_jobs j where j.conversation_id = p_id) then
      raise exception 'That id is a conversation''s' using errcode = '42501';
    end if;
  end if;
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
    select j.id, j.turn into newest, newest_turn from public.cloud_jobs j where j.conversation_id = p_conversation order by j.turn desc limit 1;
    if newest is distinct from p_after_job then
      raise exception 'This conversation went on since that job' using errcode = '23505';
    end if;
  end if;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id, turn)
    values (
      made, me, p_prompt, coalesce(p_history, '[]'), p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''),
      coalesce(p_conversation, made), coalesce(newest_turn, 0) + 1
    )
    returning id into made;
  return made;
end;
$$;
revoke all on function public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid, uuid) to authenticated;
