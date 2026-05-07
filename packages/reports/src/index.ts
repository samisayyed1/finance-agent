import type { DailyReport } from "@ai-cfo/agent";

export { type EmailRenderOptions, toEmailHtml } from "./email-html";
export { toMarkdown } from "./markdown";
export { toSlackBlocks } from "./slack-blocks";

export interface MonthlyReport {
  month: string;
  org_id: string;
  reports: DailyReport[];
}

export const toMonthlyPdf = (_monthly: MonthlyReport): Buffer => {
  throw new Error("@ai-cfo/reports: toMonthlyPdf not implemented (Day-5)");
};
