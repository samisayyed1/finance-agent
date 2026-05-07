import { agentTraces, database, eq } from "@ai-cfo/database";
import { recordFeedback } from "@ai-cfo/feedback";
import { z } from "zod";
import { logger } from "../../../lib/logger";

/**
 * GET /api/feedback/inbound?trace=<trace_id>&signal=positive|negative|correction
 *
 * Email feedback links land here. We resolve the org_id from
 * `agent_traces.trace_id` (the trace was issued for that org by definition),
 * record the feedback, and render a tiny thank-you HTML page.
 *
 * Iron rule echo (#9): the resolved org_id must match the trace's org_id —
 * the link itself is opaque enough that we don't accept query-param org_id.
 */

const querySchema = z.object({
  trace: z.string().min(1),
  signal: z.enum(["positive", "negative", "correction"]),
});

const renderHtml = (title: string, body: string): string =>
  `<!doctype html>
<html>
<head><meta charset="utf-8" /><title>${title}</title></head>
<body style="font-family:-apple-system,sans-serif;padding:64px 32px;text-align:center;color:#222;">
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;">${title}</h1>
  <p style="color:#555;font-size:14px;">${body}</p>
</body>
</html>`;

export const GET = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    trace: url.searchParams.get("trace"),
    signal: url.searchParams.get("signal"),
  });
  if (!parsed.success) {
    return new Response(
      renderHtml("Invalid feedback link", "The feedback link looks malformed."),
      { status: 400, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const traceRows = await database
    .select({ orgId: agentTraces.orgId })
    .from(agentTraces)
    .where(eq(agentTraces.traceId, parsed.data.trace))
    .limit(1);
  const orgId = traceRows[0]?.orgId;
  if (!orgId) {
    return new Response(
      renderHtml(
        "Trace not found",
        "We couldn't find that report — it may have been generated more than 30 days ago."
      ),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  try {
    await recordFeedback({
      orgId,
      traceId: parsed.data.trace,
      signal: parsed.data.signal,
      channel: "email",
    });
  } catch (err) {
    logger.error(
      { err, traceId: parsed.data.trace },
      "feedback inbound: recordFeedback failed"
    );
    return new Response(
      renderHtml(
        "Couldn't record that",
        "Something broke on our side. Try again from the email or ping support."
      ),
      { status: 500, headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  const verbs: Record<typeof parsed.data.signal, string> = {
    positive: "appreciated",
    negative: "noted",
    correction: "captured",
  };
  const verb = verbs[parsed.data.signal];
  return new Response(
    renderHtml("Thanks", `Feedback ${verb}. The agent learns from this.`),
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
  );
};
