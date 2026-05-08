-- Day-4 closed-loop measurement.
--
-- One row per (org_id, date). Three KPIs that answer "is the per-org loop
-- actually compounding?": grounding_rate, feature_recall, outcome_accuracy.
-- If any is flat for ≥ 60 days, the loop is broken — measure-closed-loop
-- emits an alert via the structured logger.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, policy DROP-then-CREATE.

create table if not exists public.closed_loop_metrics (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  date                 date not null,
  grounding_rate       numeric(5,4),
  feature_recall       numeric(5,4),
  outcome_accuracy     numeric(5,4),
  traces_count         int not null default 0,
  feedback_count       int not null default 0,
  memories_written     int not null default 0,
  computed_at          timestamptz not null default now(),
  unique (org_id, date)
);

create index if not exists closed_loop_metrics_org_date_idx
  on public.closed_loop_metrics(org_id, date desc);

alter table public.closed_loop_metrics enable row level security;
drop policy if exists closed_loop_metrics_org_isolation on public.closed_loop_metrics;
create policy closed_loop_metrics_org_isolation on public.closed_loop_metrics
  for all to authenticated
  using (org_id = public.requesting_org_id())
  with check (org_id = public.requesting_org_id());

grant select, insert, update, delete on public.closed_loop_metrics to authenticated;
