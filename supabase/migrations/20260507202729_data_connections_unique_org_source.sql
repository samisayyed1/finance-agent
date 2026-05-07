-- Day-2: an org has exactly one connection per source. Required by the
-- OAuth callback's `INSERT … ON CONFLICT (org_id, source) DO UPDATE` upsert.
-- (We could split a connection across multiple Shopify stores per org later
-- by repurposing the unique constraint to (org_id, source, source_metadata->>shop_domain)
-- — Day-N work; documented in SHOPIFY_PARTNER_APP_SETUP.md.)

create unique index if not exists data_connections_org_source_unique
  on public.data_connections (org_id, source);
