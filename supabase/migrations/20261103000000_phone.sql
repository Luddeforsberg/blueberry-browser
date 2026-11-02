-- The phone page: the flock as the app last shared it, so a job can be sent from the phone as any bird, and the phone's
-- push subscriptions, so the runner can say "Berry needs you" or "Berry finished". Both are the owner's alone. The runner
-- never reads the flock: a job carries its own bird. It reads only where to send a push, for its own owner, through
-- `runner_push_subscriptions`. A push says nothing else, so nothing here holds a prompt, a page or a code. Run it once in
-- the SQL editor, after the cloud jobs'.

-- The birds, as the app shared them: only what a job needs and what the phone draws, never what a bird remembers.
-- Berry isn't here, because the phone always has it.
create table public.cloud_flock (
  owner uuid not null default public.cloud_user() references auth.users (id) on delete cascade,
  id text not null,
  position integer not null,
  name text not null,
  palette text not null,
  accessory text not null,
  instructions text not null,
  sites jsonb not null default '[]',
  tools jsonb not null default '[]',
  from_gallery boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner, id),

  constraint id_shape check (id ~ '^[A-Za-z0-9_-]{1,100}$' and id <> 'berry'),
  constraint position_shape check (position between 0 and 99),
  constraint name_shape check (char_length(name) between 1 and 24),
  constraint look_shape check (
    palette in ('jackdaw', 'robin', 'canary', 'parakeet', 'flamingo', 'kingfisher')
    and accessory in ('none', 'crown', 'cap', 'glasses', 'headphones', 'bow')
  ),
  constraint instructions_shape check (char_length(instructions) between 1 and 2000),
  constraint sites_shape check (jsonb_typeof(sites) = 'array' and jsonb_array_length(sites) <= 20 and octet_length(sites::text) <= 6000),
  constraint tools_shape check (jsonb_typeof(tools) = 'array' and jsonb_array_length(tools) <= 3 and tools <@ '["visit", "click", "type"]'::jsonb)
);
alter table public.cloud_flock enable row level security;
create policy "Users read their own flock" on public.cloud_flock
  for select to authenticated using (owner = public.cloud_user());
revoke all on table public.cloud_flock from public, anon, authenticated;
grant select on table public.cloud_flock to authenticated;

-- Replaces the caller's whole flock with these birds, in this order. A runner has no flock of its own to share.
create function public.sync_cloud_flock(p_birds jsonb) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
  kept integer;
begin
  if me is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner has no flock' using errcode = '42501'; end if;
  if jsonb_typeof(p_birds) <> 'array' or jsonb_array_length(p_birds) > 100 then raise exception 'Not a flock' using errcode = 'P0001'; end if;
  delete from public.cloud_flock where owner = me;
  insert into public.cloud_flock (owner, id, position, name, palette, accessory, instructions, sites, tools, from_gallery)
    select me, b.value ->> 'id', (b.ord - 1)::integer, b.value ->> 'name', b.value ->> 'palette', b.value ->> 'accessory',
      b.value ->> 'instructions', coalesce(b.value -> 'sites', '[]'), coalesce(b.value -> 'tools', '[]'),
      coalesce((b.value ->> 'from_gallery')::boolean, false)
    from jsonb_array_elements(p_birds) with ordinality as b(value, ord);
  get diagnostics kept = row_count;
  return kept;
end;
$$;

-- Where to send a push: one row per phone or browser that turned notifications on. Nobody reads these directly.
create table public.cloud_push_subscriptions (
  endpoint text primary key,
  owner uuid not null default public.cloud_user() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),

  constraint endpoint_shape check (char_length(endpoint) <= 1000 and endpoint ~ '^https://[^/?#@]+/'),
  constraint keys_shape check (p256dh ~ '^[A-Za-z0-9_=-]{20,200}$' and auth ~ '^[A-Za-z0-9_=-]{8,100}$')
);
create index cloud_push_subscriptions_owner on public.cloud_push_subscriptions (owner);
alter table public.cloud_push_subscriptions enable row level security;
revoke all on table public.cloud_push_subscriptions from public, anon, authenticated;

-- The signed-in owner turns notifications on for this browser. The same browser signed in as someone else moves to
-- them. A handful per account at most, and a runner can't have any.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := public.cloud_user();
begin
  if me is null then return false; end if;
  if public.cloud_runner_for() is not null then raise exception 'A runner can''t be notified' using errcode = '42501'; end if;
  perform public.lock_cloud_account(me);
  if (select count(*) from public.cloud_push_subscriptions s where s.owner = me and s.endpoint <> p_endpoint) >= 10 then
    raise exception 'Too many devices with notifications on' using errcode = 'P0001';
  end if;
  insert into public.cloud_push_subscriptions (endpoint, owner, p256dh, auth) values (p_endpoint, me, p_p256dh, p_auth)
    on conflict (endpoint) do update set owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
  return true;
end;
$$;

create function public.forget_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.cloud_push_subscriptions where endpoint = p_endpoint and owner = public.cloud_user();
  return found;
end;
$$;

-- For the runner: where its owner wants a push, and nothing about anyone else.
create function public.runner_push_subscriptions() returns table (endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  return query select s.endpoint, s.p256dh, s.auth from public.cloud_push_subscriptions s where s.owner = owner_of;
end;
$$;

-- The push service said this one is gone, so the runner stops sending to it.
create function public.runner_forget_push_subscription(p_endpoint text) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  delete from public.cloud_push_subscriptions where endpoint = p_endpoint and owner = owner_of;
  return found;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'sync_cloud_flock(jsonb)', 'save_push_subscription(text, text, text)', 'forget_push_subscription(text)',
    'runner_push_subscriptions()', 'runner_forget_push_subscription(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
