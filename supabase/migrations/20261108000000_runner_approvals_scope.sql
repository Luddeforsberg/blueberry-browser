-- The runner only reads the approvals of a job it's still on. Before this, it could read every question its owner was
-- ever asked and how they answered, long after the job ended, and so could whichever runner was linked next. Now it's
-- the same as its jobs: a cloud job of its owner's that hasn't finished. Run it in the SQL editor, after the Mac's.
-- Running it again is safe.

drop policy if exists "A runner reads its owner's approvals" on public.cloud_approvals;
create policy "A runner reads its owner's approvals" on public.cloud_approvals
  for select to authenticated using (
    owner = public.cloud_runner_for() and exists (
      select 1 from public.cloud_jobs j
      where j.id = cloud_approvals.job_id and j.owner = public.cloud_runner_for() and j.target = 'cloud' and j.status in ('queued', 'running', 'waiting')
    )
  );

create or replace function public.runner_decision(p_approval uuid) returns table (decision text, answer text)
language sql stable security invoker set search_path = ''
as $$
  select a.decision, a.answer from public.cloud_approvals a
    join public.cloud_jobs j on j.id = a.job_id
    where a.id = p_approval and a.owner = public.cloud_runner_for()
      and j.owner = a.owner and j.target = 'cloud' and j.status in ('queued', 'running', 'waiting');
$$;
revoke all on function public.runner_decision(uuid) from public, anon, authenticated;
grant execute on function public.runner_decision(uuid) to authenticated;
