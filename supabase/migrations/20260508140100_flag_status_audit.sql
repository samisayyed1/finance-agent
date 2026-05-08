-- Day-6: bulk-resolve UI audit trail.
--
-- Existing reconciliation_flags grows status-tracking columns. New
-- flag_status_history table records every status transition (who, when,
-- prev → new, optional notes) so operators can prove what was decided
-- and when, even if a flag is later re-opened.

alter table public.reconciliation_flags
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid,
  add column if not exists status_notes text,
  add column if not exists snooze_until timestamptz;

-- Allow status='snoozed' and 'investigating' alongside the Day-3 set.
alter table public.reconciliation_flags
  drop constraint if exists reconciliation_flags_status_check;
alter table public.reconciliation_flags
  add constraint reconciliation_flags_status_check
  check (status in ('open','resolved','dismissed','snoozed','investigating'));

create table if not exists public.flag_status_history (
  id          uuid primary key default gen_random_uuid(),
  flag_id     text not null,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  prev_status text,
  new_status  text not null,
  changed_by  uuid,
  changed_at  timestamptz not null default now(),
  notes       text
);
create index if not exists flag_status_history_flag_idx
  on public.flag_status_history(flag_id, changed_at desc);
create index if not exists flag_status_history_org_changed_idx
  on public.flag_status_history(org_id, changed_at desc);

alter table public.flag_status_history enable row level security;
drop policy if exists flag_status_history_org_isolation on public.flag_status_history;
create policy flag_status_history_org_isolation on public.flag_status_history
  for all to authenticated
  using (org_id = public.requesting_org_id())
  with check (org_id = public.requesting_org_id());

grant select, insert, update, delete on public.flag_status_history to authenticated;
