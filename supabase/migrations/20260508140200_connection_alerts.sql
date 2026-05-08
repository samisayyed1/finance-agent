-- Day-6: connection_alerts table for token-expiry / sync-failure / etc.
-- The connection-health Trigger.dev cron writes here once per qualifying
-- event; the dashboard reads from here to show a banner per connection.

create table if not exists public.connection_alerts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  source      text not null,
  kind        text not null check (kind in (
                'token_expiring',
                'token_expired',
                'rate_limited',
                'sync_failed',
                'manual_intervention'
              )),
  severity    text not null default 'medium' check (severity in ('low','medium','high')),
  message     text,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists connection_alerts_org_open_idx
  on public.connection_alerts(org_id, resolved_at, created_at desc);

alter table public.connection_alerts enable row level security;
drop policy if exists connection_alerts_org_isolation on public.connection_alerts;
create policy connection_alerts_org_isolation on public.connection_alerts
  for all to authenticated
  using (org_id = public.requesting_org_id())
  with check (org_id = public.requesting_org_id());

grant select, insert, update, delete on public.connection_alerts to authenticated;
