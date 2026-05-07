import { Hono } from "hono";

/**
 * MCP OAuth 2.1 endpoints — Day-0 stubs.
 *
 * The MCP spec requires PKCE-based OAuth 2.1 for any tool server that exposes
 * authenticated resources. We will implement these against Clerk's hosted
 * OAuth surface (or our own bearer-token issuer) in Phase 5+.
 *
 * For Day-0 we serve the metadata document so MCP clients can discover the
 * server's capabilities without 404-ing, and stub the authorize/token routes.
 */
export const oauthRouter = new Hono();

const WELL_KNOWN_SUFFIX_RE = /\/.well-known.*$/;

oauthRouter.get("/.well-known/oauth-authorization-server", (c) =>
  c.json({
    issuer: c.req.url.replace(WELL_KNOWN_SUFFIX_RE, ""),
    authorization_endpoint: "/authorize",
    token_endpoint: "/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp.read", "mcp.write"],
    token_endpoint_auth_methods_supported: ["none"],
  })
);

oauthRouter.get("/authorize", (c) =>
  c.json(
    { error: "not_implemented", message: "OAuth authorize stubbed in Day-0" },
    501
  )
);

oauthRouter.post("/token", (c) =>
  c.json(
    { error: "not_implemented", message: "OAuth token stubbed in Day-0" },
    501
  )
);
