import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Context } from "hono";
import { logger } from "./logger";
import { type ToolHandlerCtx, tools } from "./tools";

/**
 * Hono ⇄ MCP Streamable-HTTP bridge.
 *
 * Day-3: each request builds a fresh McpServer instance with `orgId` baked
 * into every tool handler. This trades a tiny per-request allocation for a
 * clean RLS-scoping model and zero thread-local plumbing. We can pool
 * McpServers later if profiling demands it.
 */

export const buildMcpServerForOrg = (ctx: ToolHandlerCtx): McpServer => {
  const server = new McpServer({ name: "ai-cfo-mcp", version: "0.0.0" });
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      { description: tool.description },
      async (input: unknown) => {
        const result = await tool.handler(ctx, input);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
  }
  return server;
};

/**
 * Convert a Hono `Context` request into a Node `IncomingMessage` and a
 * `ServerResponse` that the MCP SDK's `StreamableHTTPServerTransport` can
 * drive directly. The bridge collects the response into a Hono Response.
 */
export const handleMcpRequest = async (
  c: Context,
  ctx: ToolHandlerCtx
): Promise<Response> => {
  const server = buildMcpServerForOrg(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  const bodyText = c.req.header("content-length") ? await c.req.text() : "";
  const headers = Object.fromEntries(
    Object.entries(c.req.header()).filter(
      ([_, v]) => typeof v === "string"
    ) as [string, string][]
  );

  const reqStream = new PassThrough();
  const req = Object.assign(reqStream, {
    method: c.req.method,
    url: c.req.url,
    headers,
  }) as unknown as IncomingMessage;
  reqStream.end(bodyText);

  const resStream = new PassThrough();
  const resHeaders: Record<string, string> = {};
  let resStatus = 200;
  const res = Object.assign(resStream, {
    writeHead(status: number, hdrs?: Record<string, string>) {
      resStatus = status;
      if (hdrs) {
        for (const [k, v] of Object.entries(hdrs)) {
          resHeaders[k] = v;
        }
      }
      return res;
    },
    setHeader(k: string, v: string) {
      resHeaders[k] = v;
    },
    getHeader(k: string) {
      return resHeaders[k];
    },
    end(chunk?: string | Uint8Array) {
      if (chunk) {
        resStream.write(chunk);
      }
      resStream.end();
    },
  }) as unknown as ServerResponse;

  await transport.handleRequest(
    req,
    res,
    bodyText ? JSON.parse(bodyText) : undefined
  );

  const chunks: Buffer[] = [];
  for await (const chunk of resStream) {
    chunks.push(Buffer.from(chunk));
  }
  const body = Buffer.concat(chunks);

  logger.debug(
    { status: resStatus, bodyBytes: body.length, orgId: ctx.orgId },
    "mcp response"
  );
  return new Response(body, { status: resStatus, headers: resHeaders });
};

export type { ToolName } from "./tools";
