# apps/mcp — AI Operating CFO MCP server

A Hono server that exposes the AI CFO's deterministic truth-layer tools to the Claude Agent SDK via the Model Context Protocol (Streamable HTTP transport).

## Day-0 status

- 9 typed MCP tools registered (Zod input schemas), all returning `{ error: "not implemented" }` from their handlers.
- OAuth 2.1 metadata document served at `/.well-known/oauth-authorization-server`; `/authorize` and `/token` stub 501.
- Bearer-token middleware: dev mode accepts any bearer, attaches `org_id: "dev-stub-org"`. Production mode 501s until OAuth lands in Phase 5+.
- MCP-Hono bridge implemented locally in `src/hono-bridge.ts` (~80 LOC). Per the project's Pre-Decision 1: `@modelcontextprotocol/hono` doesn't exist on npm yet, so we own the bridge until upstream ships an official adapter.

## Run

```sh
bun --filter mcp dev
# → listens on http://localhost:4000
```

## Architecture

```
┌─────────────────┐    HTTPS+JSON-RPC    ┌──────────────────────┐
│ Claude Agent SDK │ ───────────────────→ │  apps/mcp (Hono)     │
│  in apps/slack,  │                      │   ├ /mcp (tools)     │
│  daily-report    │                      │   ├ OAuth endpoints  │
│  cron, etc.      │                      │   └ Bearer middleware│
└─────────────────┘                      └──────────┬───────────┘
                                                    │ Drizzle / Supabase
                                                    ▼
                                            ┌──────────────┐
                                            │  Postgres    │
                                            │  (RLS by org)│
                                            └──────────────┘
```
