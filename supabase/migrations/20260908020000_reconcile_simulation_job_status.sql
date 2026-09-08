-- Keep the deployed database status vocabulary aligned with packages/shared/src/status.ts.
-- Older environments used pending/running, while the worker now claims queued jobs
-- and advances them through the explicit pipeline phases.

alter table simulation_jobs
  drop constraint if exists simulation_jobs_status_check;

-- Normalize legacy rows before installing the stricter current constraint.
update simulation_jobs
set status = case status
  when 'pending' then 'queued'
  when 'running' then 'generating_personas'
  else status
end
where status in ('pending', 'running');

alter table simulation_jobs
  add constraint simulation_jobs_status_check check (status in (
    'queued', 'generating_personas', 'independent_phase', 'clustering',
    'crosstalk_phase', 'synthesizing', 'completed', 'failed'
  ));

alter table simulation_jobs
  alter column status set default 'queued';
