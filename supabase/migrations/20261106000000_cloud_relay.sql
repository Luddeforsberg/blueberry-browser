-- The address ChatGPT and Claude connect to, for the owner to see in Settings. The runner serves it and says where it is
-- when it starts. Only an accepted runner can set it, only on its own link, and only an https address. The owner reads it
-- back through `my_cloud_runner`, which now gives it too, and only once the runner has accepted. Nothing else about the
-- relay is kept here. Run it in the SQL editor, after the routines'. Running it again is safe.

alter table public.cloud_runner_links add column if not exists relay_url text;
alter table public.cloud_runner_links drop constraint if exists relay_url_https;
alter table public.cloud_runner_links add constraint relay_url_https check (relay_url is null or (relay_url ~ '^https://[^\s/?#]+/mcp$' and length(relay_url) <= 300));

-- Null clears it, as when the relay is turned off.
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

do $$
declare
  fn text;
begin
  foreach fn in array array['runner_set_relay_url(text)', 'my_cloud_runner()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;
