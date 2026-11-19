-- The mascots' own names on the server. What the phone page's migration called the flock is the mascots now:
--
--   cloud_flock (table)                    -> cloud_mascots, with its policy "Users read their own mascots"
--   sync_cloud_flock(p_birds jsonb)        -> sync_cloud_mascots(p_mascots jsonb)
--   relay_flock(p_secret text)             -> relay_mascots(p_secret text)
--   'A runner has no flock', 'Not a flock' -> 'A runner has no mascots', 'Not a list of mascots'
--
-- Nothing else changes: the same columns, constraints, grants, row-level security and `cloud_runner_for()` check.
--
-- The old names keep working for apps, runners and phone pages from before, until each is redeployed: `cloud_flock` is a
-- view with `security_invoker`, so the table's row-level security still decides what each caller reads, and the old
-- functions are `security invoker` wrappers that call the new ones, so they can do nothing the caller couldn't do
-- through the new name. Each keeps its old grants: select or execute to `authenticated` only. What they read back has a
-- look's old palette id, as 20261119000000_berry_palettes.sql calls them, since a client from before reads only those.
--
-- Order: apply 20261119000000_berry_palettes.sql and this, then deploy the site (the phone page reads `cloud_mascots`),
-- then redeploy the runner (`relay_mascots`), then ship the app (`sync_cloud_mascots`, and the new palette ids). The
-- wrappers can go once the runner is redeployed and the app that calls `sync_cloud_mascots` has been out long enough
-- that nobody still runs an older one: at the earliest a month after it ships, and only once the API logs show no call
-- to `cloud_flock`, `sync_cloud_flock` or `relay_flock` for a week. Then drop the view and both old functions in a
-- migration of their own, as step 10 of docs/quality-plan.md says. Run this once in the SQL editor, after the others.

alter table public.cloud_flock rename to cloud_mascots;
alter index public.cloud_flock_pkey rename to cloud_mascots_pkey;
alter policy "Users read their own flock" on public.cloud_mascots rename to "Users read their own mascots";

-- Replaces the caller's mascots with these, in this order. A runner has none of its own to share.
create function public.sync_cloud_mascots(p_mascots jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  kept integer;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner has no mascots' using errcode = '42501'; end if;
  if jsonb_typeof(p_mascots) <> 'array' or jsonb_array_length(p_mascots) > 100 then
    raise exception 'Not a list of mascots' using errcode = 'P0001';
  end if;
  delete from public.cloud_mascots where owner = me;
  insert into public.cloud_mascots (owner, id, position, name, palette, accessory, instructions, sites, tools, from_gallery)
    select me, m.value ->> 'id', (m.ord - 1)::integer, m.value ->> 'name', m.value ->> 'palette', m.value ->> 'accessory',
      m.value ->> 'instructions', coalesce(m.value -> 'sites', '[]'), coalesce(m.value -> 'tools', '[]'),
      coalesce((m.value ->> 'from_gallery')::boolean, false)
    from jsonb_array_elements(p_mascots) with ordinality as m(value, ord);
  get diagnostics kept = row_count;
  return kept;
end;
$$;

create function public.relay_mascots(p_secret text)
returns table (id text, name text, palette text, accessory text, instructions text, sites jsonb, tools jsonb, from_gallery boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  g public.cloud_relay_grants := public.relay_grant(p_secret);
begin
  return query select m.id, m.name, m.palette, m.accessory, m.instructions, m.sites, m.tools, m.from_gallery
    from public.cloud_mascots m where m.owner = g.owner order by m.position;
end;
$$;

-- --- The old names, until every client has moved ---

create view public.cloud_flock with (security_invoker = true) as
  select owner, id, position, name,
    case palette when 'blueberry' then 'kingfisher' when 'lingon' then 'robin' when 'cloudberry' then 'canary'
    when 'gooseberry' then 'parakeet' when 'raspberry' then 'flamingo' when 'currant' then 'jackdaw' else palette end as palette,
    accessory, instructions, sites, tools, from_gallery, updated_at
  from public.cloud_mascots;
comment on view public.cloud_flock is 'The old name of cloud_mascots, for clients from before 20261120000000_mascot_names.sql.';
revoke all on table public.cloud_flock from public, anon, authenticated;
grant select on table public.cloud_flock to authenticated;

create or replace function public.sync_cloud_flock(p_birds jsonb) returns integer
language sql security invoker set search_path = ''
as $$ select public.sync_cloud_mascots(p_birds) $$;
comment on function public.sync_cloud_flock(jsonb) is 'The old name of sync_cloud_mascots, for clients from before 20261120000000_mascot_names.sql.';

create or replace function public.relay_flock(p_secret text)
returns table (id text, name text, palette text, accessory text, instructions text, sites jsonb, tools jsonb, from_gallery boolean)
language sql stable security invoker set search_path = ''
as $$
  select id, name,
    case palette when 'blueberry' then 'kingfisher' when 'lingon' then 'robin' when 'cloudberry' then 'canary'
    when 'gooseberry' then 'parakeet' when 'raspberry' then 'flamingo' when 'currant' then 'jackdaw' else palette end,
    accessory, instructions, sites, tools, from_gallery
  from public.relay_mascots(p_secret)
$$;
comment on function public.relay_flock(text) is 'The old name of relay_mascots, for clients from before 20261120000000_mascot_names.sql.';

do $$
declare
  fn text;
begin
  foreach fn in array array['sync_cloud_mascots(jsonb)', 'relay_mascots(text)', 'sync_cloud_flock(jsonb)', 'relay_flock(text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
