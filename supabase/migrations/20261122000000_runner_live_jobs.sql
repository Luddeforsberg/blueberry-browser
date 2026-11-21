-- Which of a runner's jobs are still live, so a runner ends a cloud session left from a job only once that job is over.
-- Another runner on the same account, as while a redeploy overlaps, may still be working in it. Run it in the SQL
-- editor before redeploying the runner: until then the runner can't tell, and ends nothing it finds. Running it again is
-- safe.

-- As the runner: those of `p_jobs` that are its owner's cloud jobs, running or waiting, with a heartbeat inside the two
-- minutes a claim waits before taking one over. Judged by the server's clock, so the runner's own can't stretch a lease.
create or replace function public.runner_live_jobs(p_jobs uuid[]) returns setof uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  owner_of uuid := public.cloud_runner_for();
begin
  if owner_of is null then raise exception 'Not a linked runner' using errcode = '42501'; end if;
  return query
    select j.id from public.cloud_jobs j
    where j.id = any(coalesce(p_jobs, '{}')) and j.owner = owner_of and j.target = 'cloud'
      and j.status in ('running', 'waiting') and j.heartbeat_at >= now() - interval '2 minutes';
end;
$$;
revoke all on function public.runner_live_jobs(uuid[]) from public, anon, authenticated;
grant execute on function public.runner_live_jobs(uuid[]) to authenticated;
