-- Day-5 canonical ad-spend schema. Source-agnostic, hierarchical.
-- Mirrors the orders/payments pattern: vendor-specific fields go in
-- source_metadata jsonb. Iron rule #10: NO Meta/Google-specific
-- assumptions in this schema or anything that consumes it.

create table if not exists public.ad_campaigns (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  source               text not null check (source in (
                          'meta','google','tiktok','shopify','stripe',
                          'klaviyo','quickbooks','xero','netsuite','plaid'
                       )),
  source_campaign_id   text not null,
  name                 text not null,
  status               text,
  objective            text,
  parent_campaign_id   uuid references public.ad_campaigns(id) on delete set null,
  level                text not null check (level in (
                          'campaign','ad_set','ad_group','ad','keyword'
                       )),
  started_at_source    timestamptz,
  ended_at_source      timestamptz,
  source_metadata      jsonb not null default '{}'::jsonb,
  snapshot_id          text,
  computed_at          timestamptz not null default now(),
  unique (org_id, source, source_campaign_id, level)
);
create index if not exists ad_campaigns_org_level_status_idx
  on public.ad_campaigns(org_id, level, status);
create index if not exists ad_campaigns_parent_idx
  on public.ad_campaigns(parent_campaign_id) where parent_campaign_id is not null;

create table if not exists public.ad_metrics_daily (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  source               text not null,
  campaign_id          uuid not null references public.ad_campaigns(id) on delete cascade,
  date                 date not null,
  currency             text not null,
  spend                numeric(14,2) not null default 0,
  impressions          bigint not null default 0,
  clicks               bigint not null default 0,
  conversions          numeric(12,2) not null default 0,
  conversion_value     numeric(14,2) not null default 0,
  cpc                  numeric(8,4),
  ctr                  numeric(8,6),
  roas_source          numeric(10,4),
  source_metadata      jsonb not null default '{}'::jsonb,
  snapshot_id          text,
  computed_at          timestamptz not null default now(),
  unique (org_id, source, campaign_id, date)
);
create index if not exists ad_metrics_daily_org_date_idx
  on public.ad_metrics_daily(org_id, date desc);
create index if not exists ad_metrics_daily_org_source_date_idx
  on public.ad_metrics_daily(org_id, source, date desc);
create index if not exists ad_metrics_daily_campaign_date_idx
  on public.ad_metrics_daily(campaign_id, date desc);

alter table public.ad_campaigns enable row level security;
drop policy if exists ad_campaigns_org_isolation on public.ad_campaigns;
create policy ad_campaigns_org_isolation on public.ad_campaigns
  for all to authenticated
  using (org_id = public.requesting_org_id())
  with check (org_id = public.requesting_org_id());

alter table public.ad_metrics_daily enable row level security;
drop policy if exists ad_metrics_daily_org_isolation on public.ad_metrics_daily;
create policy ad_metrics_daily_org_isolation on public.ad_metrics_daily
  for all to authenticated
  using (org_id = public.requesting_org_id())
  with check (org_id = public.requesting_org_id());

grant select, insert, update, delete on public.ad_campaigns to authenticated;
grant select, insert, update, delete on public.ad_metrics_daily to authenticated;
