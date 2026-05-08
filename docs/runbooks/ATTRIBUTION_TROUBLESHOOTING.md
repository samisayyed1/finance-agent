# Attribution troubleshooting (operator-facing)

When AI CFO surfaces an `ATTRIBUTION_MISMATCH` flag, it means the ad platform reported more (or fewer) conversions than your Shopify orders carrying that platform's UTM. The usual culprits, in rough order of frequency:

## 1. Pixel double-fire (Meta)

Meta Pixel installed twice — once via the Shopify Meta sales channel, once via a custom GTM tag, once embedded in theme.liquid. Each purchase fires Pixel twice; Meta deduplicates only when both fires share an `event_id` and `external_id`.

**Diagnose:** install the Meta Pixel Helper Chrome extension, place a real test order, see if the `Purchase` event fires once or twice.

**Fix:** disable the duplicate. The Shopify-native Meta channel is canonical for SMBs; remove GTM/theme variants.

## 2. iOS 14.5+ tracking gap

After Apple's App Tracking Transparency rollout, ~30-50% of iOS users opt out of ad tracking. Meta and Google still report attributed conversions via Aggregated Event Measurement (AEM) and modeled conversions, which means **reported > observed UTM**. This is structural — not a bug.

**Diagnose:** check `metrics.cpc` × `metrics.clicks` ≈ `metrics.cost_micros`. If it does, click-through is being tracked accurately; conversion attribution is the gap. Check `data_connections.source_metadata.app_event_match_rate` once Day-7 ships that.

**Fix:** consider this expected drift. Set the org-specific `min_drift_pct` higher (40-50%) via `org_thresholds`. Don't dismiss the flag — let it ride; the *trend* is what matters, not the absolute number.

## 3. Attribution-window mismatch

Meta default = 7-day click + 1-day view. Google default = 30-day click. Shopify last-click = whatever last touched the visitor before purchase. So a customer who clicks Meta on Mon, browses, comes back via Google on Sat, and buys: Meta claims conversion (7d-click), Shopify shows Google UTM, Google also claims it. Result: reported 2, observed 1.

**Diagnose:** look at `metrics.action_attribution_windows` in the raw R2 payload (Meta) or `metrics.attribution_model` (Google).

**Fix:** standardize. Pick a single window — typically Meta 7-day-click only (matches Shopify last-click better). Apply per ad account in the Meta Ads Manager → Attribution Settings.

## 4. CDN / browser stripping UTMs

Some popular CDNs (Cloudflare's Bot Fight Mode, parts of Fastly's WAF), browser privacy modes, and password-manager redirects strip query parameters from URLs. The customer lands on `/products/widget` instead of `/products/widget?utm_source=facebook&...` — Shopify never sees the UTM.

**Diagnose:** in the Shopify Admin, open a known Meta-source order, check the **Customer journey** section. If it shows "Direct" or "Unknown" instead of Meta, the UTM was stripped before Shopify recorded it.

**Fix:** test from incognito on multiple browsers. If it's a CDN issue, allow-list `utm_*` params in the rule that's stripping. If it's a privacy extension (e.g. Brave's Aggressive mode, uBlock) — there's no fix client-side; this is the structural drift floor.

## 5. UTM consistency on the ad side

Meta auto-generates UTMs based on a template you can configure per ad. If templates are inconsistent ("utm_source=facebook" vs "utm_source=fb" vs "utm_source=Facebook"), our `inferMarketingSource` heuristic catches the common variants but operators sometimes invent novel ones. Same for Google with `gclid`-based attribution.

**Diagnose:** `select distinct source_metadata->'attribution'->>'utm_source' from orders where org_id = '<uuid>' and created_at > now() - interval '30 days';`

**Fix:** standardize to lowercase canonical values in your Meta/Google ad URL templates: `utm_source=facebook` and `utm_source=google` (with `utm_medium=cpc` for paid).

## When to investigate vs dismiss vs resolve

| Action | Use when |
|---|---|
| **Investigate** | The drift is unusual for this brand (>2× their normal range). Sets status='investigating' so the flag stays visible while you debug. |
| **Snooze 7d** | You know the cause (e.g. "iOS 14.5 gap, structural"). Reappears next week if drift persists. |
| **Resolve** | You ran a Pixel debug + verified things are healthy now. Auditable in `flag_status_history`. |
| **Dismiss** | Won't-fix — the drift is acceptable for this brand size and you don't want it surfaced again. Reappears only if drift gets significantly worse. |

Day-7+ will gain "Help me investigate" — clicking that opens an agent thread that reads the relevant traces, pulls the right ad-platform diagnostic data, and proposes specific next steps.
