# ADR 0006 — Own a typed MCP server as the agent's trust boundary

## Status
Accepted — 2026-05-07

## Context
The Claude Agent SDK speaks MCP. We could point it at one of the off-the-shelf MCP servers (e.g. an old `@modelcontextprotocol/server-postgres` style adapter), but those reach raw SQL on behalf of the LLM — which violates Iron Rule #1. We also recall an archived `server-postgres` in this ecosystem with a SQLi-shaped CVE. The agent must only see typed tool calls we control.

## Decision
Build and run our own MCP server (`apps/mcp`, Hono + `@modelcontextprotocol/sdk`). Each exposed tool is a Zod-typed function backed by `packages/metrics`, `packages/reconcile`, `packages/anomaly`, etc. The LLM cannot send raw SQL. OAuth 2.1 endpoints + bearer middleware enforce auth at the wire boundary.

Where the MCP SDK lacks an official Hono adapter (`@modelcontextprotocol/hono` is not on npm yet), we implement a ~80 LOC bridge in `apps/mcp/src/hono-bridge.ts` that converts Hono Context → Node `IncomingMessage`/`ServerResponse` for the SDK's `StreamableHTTPServerTransport`. We own the bridge until upstream ships an official adapter.

## Consequences
- The agent's blast radius is bounded by what we typed; no surprise queries.
- The hono-bridge is ours to maintain; it earns its keep by letting us add OAuth interceptors and tracing without forking the SDK.
- We can add or remove tools without coordinating with an external MCP server vendor.
- The cost is one extra service to deploy. Acceptable given the security and auditability gains.
