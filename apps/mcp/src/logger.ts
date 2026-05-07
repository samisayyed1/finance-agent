import pino from "pino";

export const logger = pino({
  name: "ai-cfo-mcp",
  level: process.env.LOG_LEVEL ?? "info",
  ...(process.env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty" } }
    : {}),
});
