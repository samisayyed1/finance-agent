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
    // MCP's registerTool wants a Zod RAW SHAPE (a record of field name →
    // Zod schema), not a wrapped z.object(). Pulling `.shape` off our
    // top-level Zod object exposes the field schemas in the JSON schema
    // the SDK advertises, so the model can fill in arguments. Without
    // this, the MCP catalog publishes empty `properties: {}` and the
    // model's tool calls go through with `{}` → server-side Zod parse
    // throws "expected string, received undefined" on every required
    // field. Day-3 shipped without this and silently broke every real
    // run.
    // biome-ignore lint/suspicious/noExplicitAny: MCP SDK ships its own pinned Zod and rejects our project's Zod types — the runtime shape is identical, the structural mismatch is purely TypeScript.
    const inputSchemaShape = tool.inputSchema.shape as any;
    server.registerTool(
      name,
      { description: tool.description, inputSchema: inputSchemaShape },
      async (input: unknown) => {
        const result = await tool.handler(ctx, input);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result) },
          ],
        };
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

  // MCP's StreamableHTTPServerTransport reads `rawHeaders` (flat
  // [key, value, key, value, ...] array, the Node http.IncomingMessage shape)
  // not just `headers`, so populate both.
  const rawHeaders: string[] = [];
  for (const [k, v] of Object.entries(headers)) {
    rawHeaders.push(k, v);
  }

  const reqStream = new PassThrough();
  const req = Object.assign(reqStream, {
    method: c.req.method,
    url: c.req.url,
    headers,
    rawHeaders,
  }) as unknown as IncomingMessage;
  reqStream.end(bodyText);

  const resStream = new PassThrough();
  const resHeaders: Record<string, string> = {};
  let resStatus = 200;
  // Capture the underlying PassThrough's native `end` BEFORE we overlay our
  // ServerResponse-shaped polyfill onto the same object. Otherwise our
  // polyfill's `end()` calls `resStream.end()` which is now the polyfill
  // itself — infinite recursion → RangeError on every MCP request.
  const nativeStreamEnd = resStream.end.bind(resStream);
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
      nativeStreamEnd();
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
