/**
 * POST /api/agent/chat — browser-side analyst chat.
 *
 * v1: returns a JSON body. SSE streaming is a TODO; the synchronous
 * shape is sufficient for the /analyst surface and keeps client code
 * thin. The agent runtime persists a trace per request so feedback
 * + closed-loop measurement keep working without route-level work.
 */

import {
  anthropicTransport,
  type ChatMessage,
  createAgent,
} from "@ai-cfo/agent";
import { auth } from "@ai-cfo/auth/server";
import { database, eq, organizations } from "@ai-cfo/database";
import { z } from "zod";
import { logger } from "../../../lib/logger";

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
});

const ChatBodySchema = z.object({
  messages: z.array(ChatMessageSchema).max(40),
});

const TOOL_DESCRIPTORS = [
  {
    name: "get_daily_snapshot",
    description:
      "Return the cent-exact daily metrics snapshot for a given date for the requesting org, plus open-flag count and recent anomalies.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_metric_history",
    description:
      "Return a time series of one metric for the last N days. Each row carries snapshot_id for citation.",
    parameters: {
      type: "object",
      properties: {
        metric: { type: "string" },
        days: { type: "number" },
        asOf: { type: "string" },
      },
    },
  },
  {
    name: "list_anomalies",
    description:
      "List anomalies on a given date and the prior 7 days. Each row's anomaly_id is the citation token.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
  },
  {
    name: "get_reconciliation_flags",
    description:
      "List reconciliation flags within a date range, optionally filtered by status.",
    parameters: {
      type: "object",
      properties: {
        date_range: {
          type: "object",
          properties: {
            start: { type: "string" },
            end: { type: "string" },
          },
        },
        status: { type: "string" },
      },
    },
  },
  {
    name: "get_sync_health",
    description:
      "Return the sync status of every connected data source for the requesting org.",
    parameters: { type: "object", properties: {} },
  },
];

const json = (body: unknown, status: number): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export const POST = async (req: Request): Promise<Response> => {
  const { orgId } = await auth();
  if (!orgId) {
    return json({ error: "unauthorized" }, 401);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const parsed = ChatBodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_body", issues: parsed.error.issues }, 400);
  }
  const messages: ChatMessage[] = parsed.data.messages;

  // The MCP transport reads bearer + URL from env. Same dev fallback
  // as packages/jobs — the bearer is per-org so it must include orgId.
  process.env.MCP_BEARER ??= `dev:${orgId}`;

  const orgRows = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const orgName = orgRows[0]?.name ?? "your business";

  const agent = createAgent({
    orgId,
    orgName,
    toolDescriptors: TOOL_DESCRIPTORS,
    // The Anthropic transport drives MCP itself; this stub is only used
    // by the test transport. Production never invokes it.
    invokeTool: () => Promise.resolve({}),
    transport: anthropicTransport,
    persistTrace: true,
  });

  try {
    const result = await agent.chat({ messages });
    logger.info(
      {
        orgId,
        traceId: result.traceId,
        tokenCount: messages.length,
      },
      "agent.chat completed"
    );
    return json(result, 200);
  } catch (err) {
    logger.error({ orgId, err }, "agent.chat failed");
    return json({ error: "agent_chat_failed" }, 500);
  }
};
