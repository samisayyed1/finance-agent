-- Day-1: source-agnostic canonical tables for orders / line items / payments
-- / refunds / payouts. Vendor-specific fields go in `source_metadata jsonb`.
-- Universal-extensibility (Iron Rule #10): adding Stripe / QuickBooks /
-- Xero / NetSuite / Plaid is a new connector, not a schema migration.

----------------------------------------------------------------------
-- 0. AUGMENT existing tables for Day-1 ingestion.
--    raw_payloads.processed_at — normalize job marks rows as processed.
--    data_connections.source_metadata — vendor-specific connection state
--      (e.g. shop_domain for Shopify, account_id for Stripe).
----------------------------------------------------------------------
alter table public.raw_payloads
  add column if not exists processed_at timestamptz;
create index if not exists raw_payloads_org_pending_idx
  on public.raw_payloads (org_id, received_at)
  where processed_at is null;

alter table public.data_connections
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;
create index if not exists data_connections_shop_domain_idx
  on public.data_connections ((source_metadata ->> 'shop_domain'))
  where source = 'shopify';


----------------------------------------------------------------------
-- ORDERS
----------------------------------------------------------------------
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  source              text not null check (source in ('shopify','stripe','meta','google','quickbooks','xero','netsuite','plaid')),
  source_order_id     text not null,
  order_number        text,
  customer_email      text,
  currency            text not null,
  subtotal            numeric(14,2) not null,
  total_tax           numeric(14,2) not null default 0,
  total_shipping      numeric(14,2) not null default 0,
  total_discount      numeric(14,2) not null default 0,
  total               numeric(14,2) not null,
  financial_status    text,
  fulfillment_status  text,
  created_at_source   timestamptz not null,
  cancelled_at_source timestamptz,
  source_metadata     jsonb not null default '{}'::jsonb,
  snapshot_id         text,
  computed_at         timestamptz not null default now(),
  unique (org_id, source, source_order_id)
);
create index if not exists orders_org_created_idx
  on public.orders (org_id, created_at_source desc);
create index if not exists orders_org_finstatus_active_idx
  on public.orders (org_id, financial_status)
  where cancelled_at_source is null;

----------------------------------------------------------------------
-- ORDER LINE ITEMS
----------------------------------------------------------------------
create table if not exists public.order_line_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders(id) on delete cascade,
  org_id               uuid not null references public.organizations(id) on delete cascade,
  source_line_item_id  text not null,
  sku                  text,
  product_id           text,
  title                text,
  quantity             integer not null,
  unit_price           numeric(14,2) not null,
  total_discount       numeric(14,2) not null default 0,
  tax_amount           numeric(14,2) not null default 0,
  source_metadata      jsonb not null default '{}'::jsonb,
  unique (org_id, order_id, source_line_item_id)
);
create index if not exists order_line_items_order_idx
  on public.order_line_items (order_id);

----------------------------------------------------------------------
-- PAYMENTS
----------------------------------------------------------------------
create table if not exists public.payments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  source            text not null,
  source_payment_id text not null,
  order_id          uuid references public.orders(id),
  gross_amount      numeric(14,2) not null,
  fee_amount        numeric(14,2) not null default 0,
  net_amount        numeric(14,2) not null,
  currency          text not null,
  status            text,
  processed_at      timestamptz,
  payout_id         uuid,
  source_metadata   jsonb not null default '{}'::jsonb,
  unique (org_id, source, source_payment_id)
);
create index if not exists payments_org_processed_idx
  on public.payments (org_id, processed_at desc);
create index if not exists payments_order_idx on public.payments (order_id);

----------------------------------------------------------------------
-- REFUNDS
----------------------------------------------------------------------
create table if not exists public.refunds (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  source           text not null,
  source_refund_id text not null,
  order_id         uuid references public.orders(id),
  payment_id       uuid references public.payments(id),
  amount           numeric(14,2) not null,
  currency         text not null,
  reason           text,
  processed_at     timestamptz not null,
  source_metadata  jsonb not null default '{}'::jsonb,
  unique (org_id, source, source_refund_id)
);
create index if not exists refunds_org_processed_idx
  on public.refunds (org_id, processed_at desc);

----------------------------------------------------------------------
-- PAYOUTS
----------------------------------------------------------------------
create table if not exists public.payouts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  source              text not null,
  source_payout_id    text not null,
  gross_amount        numeric(14,2) not null,
  fee_amount          numeric(14,2) not null default 0,
  net_amount          numeric(14,2) not null,
  currency            text not null,
  status              text,
  period_start        date,
  period_end          date,
  expected_arrival_at timestamptz,
  arrived_at          timestamptz,
  source_metadata     jsonb not null default '{}'::jsonb,
  unique (org_id, source, source_payout_id)
);
create index if not exists payouts_org_period_idx
  on public.payouts (org_id, period_start desc);

----------------------------------------------------------------------
-- Wire up payments.payout_id → payouts.id once payouts exists.
----------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_payout_id_fkey'
  ) then
    alter table public.payments
      add constraint payments_payout_id_fkey
      foreign key (payout_id) references public.payouts(id);
  end if;
end$$;

----------------------------------------------------------------------
-- RLS — every canonical table is org-scoped via requesting_org_id().
----------------------------------------------------------------------
do $$
declare
  t text;
  canonical_tables text[] := array[
    'orders',
    'order_line_items',
    'payments',
    'refunds',
    'payouts'
  ];
begin
  foreach t in array canonical_tables loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_org_isolation on public.%I;', t, t);
    execute format($pol$
      create policy %I_org_isolation on public.%I
      for all to authenticated
      using (org_id = public.requesting_org_id())
      with check (org_id = public.requesting_org_id());
    $pol$, t, t);
  end loop;
end$$;

----------------------------------------------------------------------
-- Authenticated grants — service role bypasses RLS by design.
----------------------------------------------------------------------
grant select, insert, update, delete on public.orders            to authenticated;
grant select, insert, update, delete on public.order_line_items  to authenticated;
grant select, insert, update, delete on public.payments          to authenticated;
grant select, insert, update, delete on public.refunds           to authenticated;
grant select, insert, update, delete on public.payouts           to authenticated;

-- end of migration
