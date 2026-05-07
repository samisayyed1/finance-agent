import type { DailyReport } from "@ai-cfo/agent";
import type { KnownBlock } from "@slack/types";

/**
 * Pure renderers. Input: validated DailyReport JSON (already passed grounding).
 * Output: string / object — no side effects, no DB, no network.
 *
 * Day-0 status: signatures are real, content is placeholder.
 */

export const toMarkdown = (report: DailyReport): string =>
  `# AI CFO daily report — ${report.date}\n\n${report.content_md}\n\n_trace ${report.trace_id}_`;

export const toSlackBlocks = (report: DailyReport): KnownBlock[] => [
  {
    type: "header",
    text: { type: "plain_text", text: `Daily report — ${report.date}` },
  },
  { type: "section", text: { type: "mrkdwn", text: report.content_md } },
  {
    type: "actions",
    elements: [
      {
        type: "button",
        text: { type: "plain_text", text: "👍" },
        action_id: `feedback_positive_${report.trace_id}`,
        style: "primary",
      },
      {
        type: "button",
        text: { type: "plain_text", text: "👎" },
        action_id: `feedback_negative_${report.trace_id}`,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "💬 Tell me why" },
        action_id: `feedback_correction_${report.trace_id}`,
      },
    ],
  },
];

/**
 * Renders the report as an HTML email body. We construct the HTML directly to
 * keep this package pure and React-Email-version-independent at the type
 * boundary; consumers use `<Html>` etc. via @react-email/components when they
 * compose a richer template.
 */
export const toEmailHtml = (report: DailyReport): string =>
  `<!doctype html><html><body><h1>Daily report — ${report.date}</h1><pre>${report.content_md}</pre><p style="color:#888;font-size:11px">trace ${report.trace_id}</p></body></html>`;

export interface MonthlyReport {
  month: string; // YYYY-MM
  org_id: string;
  reports: DailyReport[];
}

export const toMonthlyPdf = (_monthly: MonthlyReport): Buffer => {
  throw new Error("@ai-cfo/reports: toMonthlyPdf not implemented (Day-0)");
};
