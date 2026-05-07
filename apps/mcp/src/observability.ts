/**
 * Sentry + OTel boot for apps/mcp.
 *
 * No-op when SENTRY_DSN / OTEL_EXPORTER_OTLP_ENDPOINT are absent so dev runs
 * cleanly without secrets. When configured, every MCP tool call gets a span
 * tagged with the org_id resolved from the bearer token.
 */
import { logger } from "./logger";

export const initObservability = () => {
  if (!process.env.SENTRY_DSN) {
    logger.debug("Sentry DSN absent — observability is no-op");
    return;
  }
  // TODO Phase 5+: dynamic import @sentry/node and call Sentry.init({...}).
  // We delay until we have a real DSN to avoid pulling Sentry into the
  // import graph (and tripping its own preload requirements).
  logger.info("Sentry init stubbed — wire in Phase 5");
};
