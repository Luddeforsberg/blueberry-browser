-- A missing answer is never taken as proof. A start the app sends again, because its answer was lost, gives back the job
-- the first one made instead of making a second. A relay grant made at sign-in only counts once the app that signed in
-- has exchanged its code, so sign-ins left at the redirect can't push out a connection that works. Run it in the SQL
-- editor, after the mascots' new names, and then redeploy the runner: until then the relay can't take new sign-ins,
-- though connections made before keep working. Running it again is safe.

-- --- Starts sent again ---

-- As before, with `p_id`, the id the sender made for this message. A job with that id already is the caller's, and is
-- given back before anything else is checked, since it was checked when it was made. Someone else's is refused, and so
-- is an id that's already a conversation's, since a new conversation takes its first job's id and that would join it
-- without its checks. Without `p_id`, as from the phone page, the server makes the id.
drop function if exists public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid);
drop function if exists public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid, uuid);
create function public.start_cloud_job(
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
    select j.id into newest from public.cloud_jobs j where j.conversation_id = p_conversation order by j.created_at desc, j.id desc limit 1;
    if newest is distinct from p_after_job then
      raise exception 'This conversation went on since that job' using errcode = '23505';
    end if;
  end if;
  insert into public.cloud_jobs (id, owner, prompt, history, mascot, action_approval, context_id, conversation_id)
    values (made, me, p_prompt, coalesce(p_history, '[]'), p_mascot, coalesce(p_action_approval, 'risky'), nullif(p_context_id, ''), coalesce(p_conversation, made))
    returning id into made;
  return made;
end;
$$;
revoke all on function public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_cloud_job(text, jsonb, jsonb, text, text, uuid, uuid, uuid) to authenticated;

-- --- Relay grants that count once they're used ---

-- When the app that signed in exchanged its code. Null until then, and a grant that's null works for nothing. Grants from
-- before this column were made the old way, at once, and count as taken up when they were made. Only the first run fills
-- them in, so running this again never takes up a grant waiting now.
do $$
begin
  if not exists (
    select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cloud_relay_grants' and column_name = 'activated_at'
  ) then
    alter table public.cloud_relay_grants add column activated_at timestamptz;
    update public.cloud_relay_grants set activated_at = created_at;
  end if;
end;
$$;

-- As before, but the grant waits to be taken up, for as long as the relay keeps a code and a little more. Waiting ones
-- don't count against the connections that work: only a few may wait at once, and one left waiting for ten minutes goes.
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
  update public.cloud_relay_grants set revoked_at = now()
    where id in (
      select g.id from public.cloud_relay_grants g where g.owner = me and g.revoked_at is null and g.activated_at is null
        and (g.created_at < now() - interval '10 minutes' or g.id in (
          select w.id from public.cloud_relay_grants w where w.owner = me and w.revoked_at is null and w.activated_at is null
            order by w.created_at desc offset 4
        ))
    );
  insert into public.cloud_relay_grants (owner, runner, secret_hash) values (me, its_runner, encode(sha256(convert_to(secret, 'UTF8')), 'hex'));
  return secret;
end;
$$;

-- The grant a secret stands for, only for the runner it was made for, once taken up, while it and their link stand.
-- Not callable.
create or replace function public.relay_grant(p_secret text) returns public.cloud_relay_grants
language plpgsql stable security definer set search_path = ''
as $$
declare
  found_grant public.cloud_relay_grants;
begin
  select g.* into found_grant from public.cloud_relay_grants g
    where g.secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex') and g.revoked_at is null and g.runner = auth.uid()
      and g.activated_at is not null
      and exists (select 1 from public.cloud_runner_links l where l.owner = g.owner and l.runner = g.runner and l.accepted);
  if found_grant.id is null or public.cloud_runner_for() is distinct from found_grant.owner then
    raise exception 'Not a grant of this runner' using errcode = '42501';
  end if;
  return found_grant;
end;
$$;
revoke all on function public.relay_grant(text) from public, anon, authenticated;

-- As the runner, when the app that signed in exchanges its code: the grant is taken up, once, within ten minutes of being
-- made. At most 20 work at a time per owner, and the one taken up longest ago goes first.
create or replace function public.relay_activate_grant(p_secret text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants;
begin
  select x.* into g from public.cloud_relay_grants x
    where x.secret_hash = encode(sha256(convert_to(coalesce(p_secret, ''), 'UTF8')), 'hex') and x.revoked_at is null and x.runner = auth.uid()
      and x.activated_at is null and x.created_at > now() - interval '10 minutes'
      and exists (select 1 from public.cloud_runner_links l where l.owner = x.owner and l.runner = x.runner and l.accepted);
  if g.id is null or public.cloud_runner_for() is distinct from g.owner then
    raise exception 'Not a grant waiting for this runner' using errcode = '42501';
  end if;
  perform public.lock_cloud_account(g.owner);
  update public.cloud_relay_grants set activated_at = now() where id = g.id;
  update public.cloud_relay_grants set revoked_at = now()
    where id in (
      select w.id from public.cloud_relay_grants w where w.owner = g.owner and w.revoked_at is null and w.activated_at is not null
        order by w.activated_at desc, w.created_at desc offset 20
    );
  return true;
end;
$$;
revoke all on function public.relay_activate_grant(text) from public, anon, authenticated;
grant execute on function public.relay_activate_grant(text) to authenticated;
