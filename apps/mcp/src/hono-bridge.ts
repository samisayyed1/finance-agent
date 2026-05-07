import type { IncomingMessage, ServerResponse } from "node:http";
import { PassThrough } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Context } from "hono";
import { logger } from "./logger";
import { tools } from "./tools";

/**
 * Hono ⇄ MCP Streamable-HTTP bridge.
 *
 * We adopt MCP SDK directly + a thin Hono adapter we own, per the project's
 * Pre-Decision 1 (no upstream @modelcontextprotocol/hono yet). ~80 LOC; trades
 * one Node-stream conversion at the boundary for full control of the MCP
 * lifecycle and OAuth interceptors.
 */

export const buildMcpServer = (): McpServer => {
  const server = new McpServer({ name: "ai-cfo-mcp", version: "0.0.0" });

  // MCP SDK 1.29 still types `inputSchema` as Zod 3 ZodRawShape; we use Zod 4.
  // For Day-0 we register tools without a published input schema (clients see
  // them as schema-less). Each handler still re-parses input via `tool.inputSchema`
  // when it lands real implementation — see packages/agent for the call path.
  for (const [name, tool] of Object.entries(tools)) {
    server.registerTool(
      name,
      { description: tool.description },
      async (input: unknown) => {
        const result = await tool.handler(input as never);
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
  server: McpServer
): Promise<Response> => {
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

  logger.debug({ status: resStatus, bodyBytes: body.length }, "mcp response");
  return new Response(body, { status: resStatus, headers: resHeaders });
};

export type { ToolName } from "./tools";
