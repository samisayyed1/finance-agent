-- Day-5 → Day-6 corrections.
--
-- 1. ATTRIBUTION_MISMATCH joins the reconciliation_flags.kind enum.
-- 2. data_connections grows an `expires_at` column for the Meta long-token
--    monitor (60-day TTL). Day-5 stored expiry inside source_metadata.token_expires_at
--    as a string; Day-6 promotes it to a typed column so a B-tree index makes
--    the connection-health cron's `where expires_at < now() + 7d` cheap.
-- 3. refund_rate is already numeric(8,6) on this DB — no change needed.

alter table public.reconciliation_flags
  drop constraint if exists reconciliation_flags_kind_check;
alter table public.reconciliation_flags
  add constraint reconciliation_flags_kind_check
  check (kind in (
    'ORDER_MISSING_PAYMENT',
    'PAYMENT_WITHOUT_ORDER',
    'REFUND_MISMATCH',
    'DUPLICATE_ORDER',
    'FEE_DRIFT',
    'PAYOUT_GAP',
    'PERIOD_GAP',
    'ATTRIBUTION_MISMATCH'
  ));

alter table public.data_connections
  add column if not exists expires_at timestamptz;

create index if not exists data_connections_expires_at_idx
  on public.data_connections(expires_at)
  where expires_at is not null;
