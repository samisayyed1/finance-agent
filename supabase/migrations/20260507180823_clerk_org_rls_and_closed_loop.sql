-- AI Operating CFO — Day-0 schema migration.
--
-- Wires Clerk → Supabase Third-Party Auth (the JWT carries `org_id`) and lays
-- down every closed-loop table required by the product playbook. RLS is on for
-- every single table; the policy is `using (org_id = requesting_org_id())`.
--
-- Idempotent: every CREATE uses IF NOT EXISTS, every policy creation is wrapped
-- in DROP POLICY IF EXISTS first.

----------------------------------------------------------------------
-- 1. EXTENSIONS
----------------------------------------------------------------------

create extension if not exists "uuid-ossp";
create extension if not exists vector;

----------------------------------------------------------------------
-- 2. JWT helper — read org_id from the Clerk-minted Supabase session.
----------------------------------------------------------------------

create or replace function public.requesting_org_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'org_id', '')::uuid
$$;

comment on function public.requesting_org_id() is
'Returns the Clerk org_id claim from the current Supabase JWT, or NULL when anonymous. RLS policies use this to scope every row read to the requesting org.';

----------------------------------------------------------------------
-- 3. EXISTING DEMO TABLE (from next-forge → Drizzle swap).
--    `pages` has no org_id; this is a Day-1 TODO — we keep the table to not
--    break the demo route, but enable RLS with deny-all so it cannot leak.
----------------------------------------------------------------------

do $$
begin
  if to_regclass('public.pages') is not null then
    execute 'alter table public.pages enable row level security';
    execute 'drop policy if exists pages_deny_all on public.pages';
    execute 'create policy pages_deny_all on public.pages for all to authenticated using (false) with check (false)';
  end if;
end$$;
-- TODO: add `org_id uuid` column and replace deny-all with org-scoped policy when `pages` is repurposed.

----------------------------------------------------------------------
-- 4. CORE PRODUCT TABLES
----------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.data_connections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  source                text not null check (source in ('shopify','stripe','meta','google','quickbooks','xero','netsuite','plaid')),
  status                text not null,
  scopes                text[] not null default '{}',
  encrypted_credentials text,
  last_synced_at        timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists data_connections_org_idx on public.data_connections(org_id);

create table if not exists public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  connection_id   uuid not null references public.data_connections(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('webhook','backfill','reconciliation')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  items_processed int not null default 0,
  errors_jsonb    jsonb not null default '[]'::jsonb
);
create index if not exists sync_runs_org_started_idx on public.sync_runs(org_id, started_at desc);

create table if not exists public.raw_payloads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  source      text not null,
  event_id    text not null,
  topic       text,
  received_at timestamptz not null default now(),
  r2_key      text not null,
  unique (org_id, source, event_id)
);
create index if not exists raw_payloads_org_received_idx on public.raw_payloads(org_id, received_at desc);

create table if not exists public.daily_metrics (
  org_id              uuid not null references public.organizations(id) on delete cascade,
  date                date not null,
  snapshot_id         text not null unique,
  revenue_gross       numeric(18,4),
  revenue_net         numeric(18,4),
  refunds             numeric(18,4),
  fees                numeric(18,4),
  ad_spend            numeric(18,4),
  gross_margin        numeric(18,4),
  contribution_profit numeric(18,4),
  roas                numeric(18,6),
  blended_mer         numeric(18,6),
  cac                 numeric(18,4),
  aov                 numeric(18,4),
  orders              integer,
  new_customers       integer,
  refund_rate         numeric(8,6),
  computed_at         timestamptz not null default now(),
  primary key (org_id, date)
);
create index if not exists daily_metrics_org_date_idx on public.daily_metrics(org_id, date desc);

create table if not exists public.anomalies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  anomaly_id      text not null unique,
  date            date not null,
  metric          text not null,
  severity        text not null check (severity in ('low','medium','high')),
  z_score         numeric(10,4),
  prev_value      numeric(18,4),
  current_value   numeric(18,4),
  suggested_cause text,
  created_at      timestamptz not null default now()
);
create index if not exists anomalies_org_date_idx on public.anomalies(org_id, date desc);

create table if not exists public.reconciliation_flags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  flag_id     text not null unique,
  kind        text not null check (kind in ('ORDER_MISSING_PAYMENT','PAYMENT_WITHOUT_ORDER','REFUND_MISMATCH','DUPLICATE_ORDER','FEE_DRIFT','PAYOUT_GAP','PERIOD_GAP')),
  payment_id  text,
  order_id    text,
  expected    numeric(18,4),
  actual      numeric(18,4),
  delta       numeric(18,4),
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists reconciliation_flags_org_status_idx on public.reconciliation_flags(org_id, status);

create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  date            date not null,
  snapshot_id     text not null,
  prompt_version  text not null,
  model           text not null,
  content_jsonb   jsonb not null,
  content_md      text not null,
  delivery_status jsonb not null default '{}'::jsonb,
  ai_trace_id     text,
  created_at      timestamptz not null default now()
);
create index if not exists reports_org_date_idx on public.reports(org_id, date desc);

----------------------------------------------------------------------
-- 5. CLOSED-LOOP TABLES — the moat.
----------------------------------------------------------------------

create table if not exists public.agent_traces (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  trace_id       text not null unique,
  tool           text not null,
  input_jsonb    jsonb not null,
  output_jsonb   jsonb not null,
  latency_ms     integer,
  input_tokens   integer,
  output_tokens  integer,
  snapshot_ids   text[] not null default '{}',
  anomaly_ids    text[] not null default '{}',
  flag_ids       text[] not null default '{}',
  model          text,
  prompt_version text,
  created_at     timestamptz not null default now()
);
create index if not exists agent_traces_org_created_idx on public.agent_traces(org_id, created_at desc);

create table if not exists public.agent_memories (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('pattern','preference','correction','outcome','vendor_quirk','threshold_override')),
  content         text not null,
  embedding       vector(1536),
  valid_from      timestamptz not null default now(),
  valid_until     timestamptz,
  source_trace_id text,
  confidence      numeric(4,3),
  created_at      timestamptz not null default now()
);
create index if not exists agent_memories_org_validity_idx on public.agent_memories(org_id, valid_from desc, valid_until);
create index if not exists agent_memories_embedding_hnsw on public.agent_memories using hnsw (embedding vector_cosine_ops);

create table if not exists public.agent_feedback (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  trace_id         text not null,
  signal           text not null check (signal in ('positive','negative','correction')),
  operator_user_id text,
  message          text,
  channel          text not null check (channel in ('slack','email','dashboard','whatsapp')),
  created_at       timestamptz not null default now()
);
create index if not exists agent_feedback_org_trace_idx on public.agent_feedback(org_id, trace_id);

create table if not exists public.agent_outcomes (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  recommendation_id    text not null,
  was_taken            boolean,
  measured_impact_usd  numeric(18,4),
  measured_at          timestamptz,
  notes                text,
  created_at           timestamptz not null default now()
);
create index if not exists agent_outcomes_org_recommendation_idx on public.agent_outcomes(org_id, recommendation_id);

create table if not exists public.org_eval_set (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  fixture_date        date not null,
  expected_features   text[] not null default '{}',
  captured_from_trace_id text,
  label               text not null check (label in ('typical','profit_drop','roas_spike','refund_spike','reconciliation_gap','custom')),
  created_at          timestamptz not null default now()
);
create index if not exists org_eval_set_org_label_idx on public.org_eval_set(org_id, label);

create table if not exists public.org_thresholds (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  metric          text not null,
  threshold_kind  text not null check (threshold_kind in ('z_score','wow_pct','floor','ceiling')),
  threshold_value numeric(18,6) not null,
  last_tuned_at   timestamptz,
  tune_method     text,
  created_at      timestamptz not null default now(),
  unique (org_id, metric, threshold_kind)
);

create table if not exists public.org_settings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null unique references public.organizations(id) on delete cascade,
  daily_report_time           time not null default '07:00:00',
  daily_report_timezone       text not null default 'America/New_York',
  delivery_email_enabled      boolean not null default true,
  delivery_slack_enabled      boolean not null default false,
  delivery_whatsapp_enabled   boolean not null default false,
  slack_channel_id            text,
  whatsapp_number             text,
  monthly_pdf_enabled         boolean not null default true,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

----------------------------------------------------------------------
-- 6. RLS — enable on every product/closed-loop table and apply
--    `using (org_id = requesting_org_id())` to all CRUD.
----------------------------------------------------------------------

do $$
declare
  t text;
  org_scoped_tables text[] := array[
    'organizations',
    'data_connections',
    'sync_runs',
    'raw_payloads',
    'daily_metrics',
    'anomalies',
    'reconciliation_flags',
    'reports',
    'agent_traces',
    'agent_memories',
    'agent_feedback',
    'agent_outcomes',
    'org_eval_set',
    'org_thresholds',
    'org_settings'
  ];
begin
  foreach t in array org_scoped_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_org_isolation on public.%I;', t, t);
    if t = 'organizations' then
      -- A user can only see/modify their own org row (matched by id = jwt.org_id).
      execute format($pol$
        create policy %I_org_isolation on public.%I
        for all to authenticated
        using (id = public.requesting_org_id())
        with check (id = public.requesting_org_id());
      $pol$, t, t);
    else
      execute format($pol$
        create policy %I_org_isolation on public.%I
        for all to authenticated
        using (org_id = public.requesting_org_id())
        with check (org_id = public.requesting_org_id());
      $pol$, t, t);
    end if;
  end loop;
end$$;

----------------------------------------------------------------------
-- 7. SAFETY: revoke broad anon/authenticated grants so policies are the
--    only way data flows out. Service-role retains full access (it bypasses
--    RLS by design — used only inside trusted server code).
----------------------------------------------------------------------

revoke all on schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;

-- end of migration
