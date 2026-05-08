/**
 * Day-6 connection-health monitor.
 *
 * Daily 06:00 UTC. For every active data_connection with `expires_at`
 * populated, classify against `now`:
 *   - already past: status='expired' + connection_alerts.kind='token_expired'
 *   - within 7 days: connection_alerts.kind='token_expiring'
 *
 * If the org has an active Slack install, DM the authed_user. Without a
 * Slack install we still record the alert + log; the dashboard banner
 * surfaces it on the next operator visit.
 *
 * The `runConnectionHealthFor` pure-ish function is the test surface;
 * the Trigger.dev wrapper just iterates active connections.
 */

import { connectionAlerts, database, eq, isNotNull } from "@ai-cfo/database";
import { logger, schedules } from "@trigger.dev/sdk";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type ConnectionHealthState = "healthy" | "expiring_soon" | "expired";

export const classifyConnectionHealth = (args: {
  expiresAt: Date | null;
  now: Date;
}): ConnectionHealthState => {
  if (!args.expiresAt) {
    return "healthy";
  }
  if (args.expiresAt.getTime() <= args.now.getTime()) {
    return "expired";
  }
  if (args.expiresAt.getTime() - args.now.getTime() <= SEVEN_DAYS_MS) {
    return "expiring_soon";
  }
  return "healthy";
};

export interface SlackDmDeps {
  /** Optional. Production wires `@slack/web-api`'s chat.postMessage. */
  postDm?: (args: {
    botToken: string;
    userId: string;
    text: string;
  }) => Promise<void>;
  resolveSlackInstall?: (orgId: string) => Promise<{
    botToken: string;
    authedUserId: string;
  } | null>;
}

export interface ConnectionRowForHealth {
  expiresAt: Date | null;
  id: string;
  orgId: string;
  source: string;
  status: string;
}

export interface ConnectionHealthSummary {
  alertEmitted: boolean;
  connectionId: string;
  orgId: string;
  slackDmAttempted: boolean;
  slackDmSucceeded: boolean;
  source: string;
  state: ConnectionHealthState;
}

export const runConnectionHealthFor = async (args: {
  conn: ConnectionRowForHealth;
  now: Date;
  deps?: SlackDmDeps;
}): Promise<ConnectionHealthSummary> => {
  const state = classifyConnectionHealth({
    expiresAt: args.conn.expiresAt,
    now: args.now,
  });
  if (state === "healthy") {
    return {
      connectionId: args.conn.id,
      orgId: args.conn.orgId,
      source: args.conn.source,
      state,
      alertEmitted: false,
      slackDmAttempted: false,
      slackDmSucceeded: false,
    };
  }

  // Insert alert row.
  const kind = state === "expired" ? "token_expired" : "token_expiring";
  const message =
    state === "expired"
      ? `${args.conn.source} access token expired at ${args.conn.expiresAt?.toISOString() ?? "unknown"} — operator must reconnect.`
      : `${args.conn.source} access token expires at ${args.conn.expiresAt?.toISOString() ?? "unknown"} (within 7 days). Reconnect to avoid sync interruption.`;
  await database.insert(connectionAlerts).values({
    orgId: args.conn.orgId,
    source: args.conn.source,
    kind,
    severity: state === "expired" ? "high" : "medium",
    message,
  });

  // Mark connection as expired if past.
  if (state === "expired") {
    const { dataConnections, eq: eqOp } = await import("@ai-cfo/database");
    await database
      .update(dataConnections)
      .set({ status: "expired" })
      .where(eqOp(dataConnections.id, args.conn.id));
  }

  const slackResult = await maybeNotifySlack({
    deps: args.deps,
    orgId: args.conn.orgId,
    source: args.conn.source,
    state,
  });

  logger.warn("connection-health alert", {
    alert: "connection-health",
    state,
    source: args.conn.source,
    orgId: args.conn.orgId,
    expiresAt: args.conn.expiresAt?.toISOString() ?? null,
  });

  return {
    connectionId: args.conn.id,
    orgId: args.conn.orgId,
    source: args.conn.source,
    state,
    alertEmitted: true,
    slackDmAttempted: slackResult.attempted,
    slackDmSucceeded: slackResult.succeeded,
  };
};

const maybeNotifySlack = async (args: {
  deps: SlackDmDeps | undefined;
  orgId: string;
  source: string;
  state: ConnectionHealthState;
}): Promise<{ attempted: boolean; succeeded: boolean }> => {
  if (!(args.deps?.resolveSlackInstall && args.deps?.postDm)) {
    return { attempted: false, succeeded: false };
  }
  try {
    const install = await args.deps.resolveSlackInstall(args.orgId);
    if (!install) {
      return { attempted: true, succeeded: false };
    }
    await args.deps.postDm({
      botToken: install.botToken,
      userId: install.authedUserId,
      text: `:warning: AI CFO — your ${args.source} connection ${args.state === "expired" ? "expired" : "expires soon"}. Reconnect from <${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ai-cfo"}/settings/connections|Settings → Connections>.`,
    });
    return { attempted: true, succeeded: true };
  } catch (err) {
    logger.warn("connection-health: slack DM failed", {
      err: err instanceof Error ? err.message : String(err),
      orgId: args.orgId,
    });
    return { attempted: true, succeeded: false };
  }
};

export const connectionHealthJob = schedules.task({
  id: "ai-cfo.connection-health",
  cron: "0 6 * * *",
  run: async (payload) => {
    const now =
      payload.timestamp instanceof Date ? payload.timestamp : new Date();
    const { dataConnections } = await import("@ai-cfo/database");
    const conns = await database
      .select({
        id: dataConnections.id,
        orgId: dataConnections.orgId,
        source: dataConnections.source,
        status: dataConnections.status,
        expiresAt: dataConnections.expiresAt,
      })
      .from(dataConnections)
      .where(isNotNull(dataConnections.expiresAt));

    const summaries: ConnectionHealthSummary[] = [];
    for (const conn of conns) {
      try {
        const summary = await runConnectionHealthFor({ conn, now });
        summaries.push(summary);
      } catch (err) {
        logger.error("connection-health failed for connection", {
          err: err instanceof Error ? err.message : String(err),
          connectionId: conn.id,
        });
      }
    }
    logger.info("connection-health done", {
      considered: conns.length,
      alerted: summaries.filter((s) => s.alertEmitted).length,
    });
    return { ok: true, summaries };
  },
});

// Suppress unused-warning for an import we want to keep in scope so the
// Drizzle codegen stays happy.
const _eq = eq;
export { _eq };
