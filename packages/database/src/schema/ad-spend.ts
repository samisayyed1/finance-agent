/**
 * Day-5 canonical ad-spend schema. Source-agnostic by design (iron rule #10).
 * Vendor-specific fields land in `sourceMetadata` jsonb; column shape is the
 * same whether the row came from Meta, Google, TikTok, or anything else we
 * add later. Hierarchy via `parentCampaignId` (campaign → ad_set → ad).
 */

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const adCampaigns = pgTable(
  "ad_campaigns",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceCampaignId: text("source_campaign_id").notNull(),
    name: text("name").notNull(),
    status: text("status"),
    objective: text("objective"),
    parentCampaignId: uuid("parent_campaign_id").references(
      (): AnyPgColumn => adCampaigns.id,
      { onDelete: "set null" }
    ),
    level: text("level").notNull(),
    startedAtSource: timestamp("started_at_source", {
      withTimezone: true,
      mode: "date",
    }),
    endedAtSource: timestamp("ended_at_source", {
      withTimezone: true,
      mode: "date",
    }),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    snapshotId: text("snapshot_id"),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("ad_campaigns_org_source_id_level_unique").on(
      t.orgId,
      t.source,
      t.sourceCampaignId,
      t.level
    ),
    index("ad_campaigns_org_level_status_idx").on(t.orgId, t.level, t.status),
    index("ad_campaigns_parent_idx").on(t.parentCampaignId),
  ]
);

export type AdCampaign = typeof adCampaigns.$inferSelect;
export type NewAdCampaign = typeof adCampaigns.$inferInsert;

export const adMetricsDaily = pgTable(
  "ad_metrics_daily",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => adCampaigns.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    currency: text("currency").notNull(),
    spend: numeric("spend", { precision: 14, scale: 2 }).notNull().default("0"),
    impressions: bigint("impressions", { mode: "number" }).notNull().default(0),
    clicks: bigint("clicks", { mode: "number" }).notNull().default(0),
    conversions: numeric("conversions", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    conversionValue: numeric("conversion_value", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    cpc: numeric("cpc", { precision: 8, scale: 4 }),
    ctr: numeric("ctr", { precision: 8, scale: 6 }),
    roasSource: numeric("roas_source", { precision: 10, scale: 4 }),
    sourceMetadata: jsonb("source_metadata").notNull().default({}),
    snapshotId: text("snapshot_id"),
    computedAt: timestamp("computed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("ad_metrics_daily_org_source_campaign_date_unique").on(
      t.orgId,
      t.source,
      t.campaignId,
      t.date
    ),
    index("ad_metrics_daily_org_date_idx").on(t.orgId, t.date),
    index("ad_metrics_daily_org_source_date_idx").on(t.orgId, t.source, t.date),
    index("ad_metrics_daily_campaign_date_idx").on(t.campaignId, t.date),
  ]
);

export type AdMetricDaily = typeof adMetricsDaily.$inferSelect;
export type NewAdMetricDaily = typeof adMetricsDaily.$inferInsert;
