import type { HttpRouter } from "convex/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ConvexError } from "convex/values";
import { ZodError } from "zod";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { hashSecret, newSecret } from "./model/agentAuth";
import { agentInstructions, agentToolDescriptions, agentToolSchemas } from "./model/agentTools";

function baseUrl(request: Request) {
  // The deployment's canonical HTTP origin is the issuer and resource audience.
  return process.env.CONVEX_SITE_URL ?? new URL(request.url).origin;
}

function json(data: unknown, status = 200, extra?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "WWW-Authenticate",
      ...extra,
    },
  });
}

function oauthError(error: string, description: string, status = 400) {
  return json({ error, error_description: description }, status);
}

async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 1_048_576)
    throw new Error("Request too large.");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let result = "";
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 1_048_576) {
        await reader.cancel();
        throw new Error("Request too large.");
      }
      result += decoder.decode(part.value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function validRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !url.hash &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

async function limited(ctx: ActionCtx, request: Request, kind: string, limit: number) {
  // Source buckets are best-effort. The independent global bucket bounds
  // registration growth even if a forwarding header is absent or spoofed.
  const source = request.headers.get("cf-connecting-ip");
  // A missing source must not collapse every user into one small IP bucket.
  const allowed = source
    ? await ctx.runMutation(internal.agents.rateLimit, {
        key: `${kind}:${await hashSecret(source)}`,
        limit,
      })
    : true;
  const global = await ctx.runMutation(internal.agents.rateLimit, {
    key: `${kind}:global`,
    limit: limit * 100,
  });
  return allowed && global;
}

function publicEndpoint(handler: (ctx: ActionCtx, request: Request) => Promise<Response>) {
  return httpAction(async (ctx, request) => {
    try {
      return await handler(ctx, request);
    } catch {
      return oauthError(
        "invalid_request",
        "Invalid or oversized request. Restart the connection from your assistant.",
      );
    }
  });
}

export function registerAgentRoutes(http: HttpRouter) {
  http.route({
    path: "/.well-known/oauth-protected-resource",
    method: "GET",
    handler: publicEndpoint(async (_ctx, req) => {
      const base = baseUrl(req);
      return json({
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: ["armin:author"],
        bearer_methods_supported: ["header"],
        resource_name: "Armin",
      });
    }),
  });
  http.route({
    path: "/.well-known/oauth-protected-resource/mcp",
    method: "GET",
    handler: publicEndpoint(async (_ctx, req) => {
      const base = baseUrl(req);
      return json({
        resource: `${base}/mcp`,
        authorization_servers: [base],
        scopes_supported: ["armin:author"],
        bearer_methods_supported: ["header"],
        resource_name: "Armin",
      });
    }),
  });
  http.route({
    path: "/.well-known/oauth-authorization-server",
    method: "GET",
    handler: publicEndpoint(async (_ctx, req) => {
      const base = baseUrl(req);
      return json({
        issuer: base,
        authorization_endpoint: `${base}/oauth/authorize`,
        token_endpoint: `${base}/oauth/token`,
        registration_endpoint: `${base}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: ["armin:author"],
      });
    }),
  });
  http.route({
    path: "/oauth/register",
    method: "POST",
    handler: publicEndpoint(async (ctx, req) => {
      if (!(await limited(ctx, req, "register", 30)))
        return oauthError(
          "temporarily_unavailable",
          "Too many connection attempts. Try again later.",
          429,
        );
      const data = JSON.parse(await body(req)) as Record<string, unknown>;
      if (data.token_endpoint_auth_method && data.token_endpoint_auth_method !== "none")
        return oauthError(
          "invalid_client_metadata",
          "Only public OAuth clients using PKCE are supported.",
        );
      if (
        !Array.isArray(data.redirect_uris) ||
        data.redirect_uris.length < 1 ||
        data.redirect_uris.length > 10 ||
        !data.redirect_uris.every(
          (uri) => typeof uri === "string" && uri.length <= 2048 && validRedirect(uri),
        )
      )
        return oauthError(
          "invalid_redirect_uri",
          "Use exact HTTPS or loopback HTTP redirect URIs.",
        );
      const name =
        typeof data.client_name === "string"
          ? data.client_name.trim().slice(0, 100)
          : "AI assistant";
      const clientId = await ctx.runMutation(internal.agents.register, {
        name: name || "AI assistant",
        redirectUris: data.redirect_uris,
      });
      return json(
        {
          client_id: clientId,
          client_name: name,
          redirect_uris: data.redirect_uris,
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        },
        201,
      );
    }),
  });
  http.route({
    path: "/oauth/authorize",
    method: "GET",
    handler: publicEndpoint(async (ctx, req) => {
      if (!(await limited(ctx, req, "authorize", 100)))
        return oauthError("temporarily_unavailable", "Too many connection attempts.", 429);
      const p = new URL(req.url).searchParams;
      const base = baseUrl(req);
      const client = await ctx.runQuery(internal.agents.client, {
        clientId: p.get("client_id") ?? "",
      });
      const redirectUri = p.get("redirect_uri") ?? "";
      if (!client || client.expiresAt <= Date.now() || !client.redirectUris.includes(redirectUri))
        return oauthError("invalid_request", "Unknown client or unregistered redirect URI.");
      if (
        p.get("response_type") !== "code" ||
        p.get("code_challenge_method") !== "S256" ||
        !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge") ?? "")
      )
        return oauthError("invalid_request", "Authorization code with S256 PKCE is required.");
      if (p.has("resource") && p.get("resource") !== `${base}/mcp`)
        return oauthError("invalid_target", "Unknown resource.");
      if (p.get("scope") && p.get("scope") !== "armin:author")
        return oauthError("invalid_scope", "Only armin:author is supported.");
      if ((p.get("state")?.length ?? 0) > 2048)
        return oauthError("invalid_request", "State is too long.");
      const requestId = newSecret();
      await ctx.runMutation(internal.agents.startAuthorization, {
        requestHash: requestId,
        clientId: client._id,
        redirectUri,
        state: p.get("state") ?? "",
        challenge: p.get("code_challenge")!,
        resource: `${base}/mcp`,
      });
      const consent = new URL("/connect-agent", process.env.SITE_URL);
      consent.searchParams.set("request", requestId);
      return new Response(null, {
        status: 302,
        headers: {
          Location: consent.toString(),
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      });
    }),
  });
  http.route({
    path: "/oauth/token",
    method: "POST",
    handler: publicEndpoint(async (ctx, req) => {
      if (!(await limited(ctx, req, "token", 300)))
        return oauthError("temporarily_unavailable", "Too many token attempts.", 429);
      const p = new URLSearchParams(await body(req));
      const base = baseUrl(req);
      const grant = p.get("grant_type");
      if (grant !== "authorization_code" && grant !== "refresh_token")
        return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
      if (p.has("resource") && p.get("resource") !== `${base}/mcp`)
        return oauthError("invalid_target", "Unknown resource.");
      const verifier = p.get("code_verifier") ?? "";
      if (
        grant === "authorization_code" &&
        (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !p.get("code") || !p.get("redirect_uri"))
      )
        return oauthError("invalid_grant", "Invalid authorization code or PKCE verifier.");
      if (grant === "refresh_token" && !p.get("refresh_token"))
        return oauthError("invalid_grant", "Missing refresh token.");
      const access = newSecret();
      const refresh = newSecret();
      const digest = new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
      );
      const challenge = btoa(String.fromCharCode(...digest))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const ok = await ctx.runMutation(internal.agents.exchange, {
        clientId: p.get("client_id") ?? "",
        resource: `${base}/mcp`,
        accessHash: await hashSecret(access),
        nextRefreshHash: await hashSecret(refresh),
        ...(grant === "authorization_code"
          ? {
              codeHash: await hashSecret(p.get("code")!),
              redirectUri: p.get("redirect_uri")!,
              challenge,
            }
          : { refreshHash: await hashSecret(p.get("refresh_token")!) }),
      });
      if (!ok)
        return oauthError(
          "invalid_grant",
          "This authorization expired, was already used, or was revoked. Reconnect your assistant.",
        );
      return json({
        access_token: access,
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: refresh,
        scope: "armin:author",
      });
    }),
  });

  const mcp = httpAction(async (ctx, req) => {
    const base = baseUrl(req);
    const origin = req.headers.get("origin");
    // Reject browser origins outside the app and supported chat clients.
    // Native OAuth clients normally omit Origin.
    const allowedOrigins = new Set([
      base,
      process.env.SITE_URL,
      "https://chatgpt.com",
      "https://claude.ai",
      "https://claude.com",
      ...(process.env.AGENT_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ]);
    if (origin && !allowedOrigins.has(origin)) return json({ error: "Invalid origin" }, 403);
    const authorization = req.headers.get("authorization") ?? "";
    const token = authorization.match(/^Bearer ([a-f0-9]{64})$/i)?.[1];
    const unauthorized = () =>
      json({ error: "unauthorized" }, 401, {
        "WWW-Authenticate": `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", scope="armin:author"`,
      });
    if (!token) return unauthorized();
    const tokenHash = await hashSecret(token);
    try {
      await ctx.runQuery(internal.agentAuthoring.authenticate, {
        tokenHash,
        resource: `${base}/mcp`,
      });
    } catch {
      return unauthorized();
    }
    if (req.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { Allow: "POST", "Cache-Control": "no-store" },
      });
    let payload: unknown;
    try {
      payload = JSON.parse(await body(req));
    } catch {
      return json({ error: "Invalid or oversized request" }, 400);
    }
    const server = new McpServer(
      { name: "Armin", version: "1.0.0" },
      { instructions: agentInstructions },
    );
    for (const name of Object.keys(agentToolSchemas) as (keyof typeof agentToolSchemas)[]) {
      const readOnly = ["list_decks", "read_deck", "read_prerequisites"].includes(name);
      server.registerTool(
        name,
        {
          description: agentToolDescriptions[name],
          inputSchema: agentToolSchemas[name],
          annotations: {
            readOnlyHint: readOnly,
            destructiveHint: !readOnly && name !== "save_cards",
            idempotentHint: true,
            openWorldHint: false,
          },
        },
        async (args: unknown) => {
          try {
            const result: unknown = readOnly
              ? await ctx.runQuery(internal.agentAuthoring.read, {
                  tokenHash,
                  tool: name,
                  input: args,
                })
              : await ctx.runMutation(internal.agentAuthoring.write, {
                  tokenHash,
                  tool: name,
                  input: args,
                  fingerprint: await hashSecret(JSON.stringify({ tool: name, input: args })),
                });
            return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
          } catch (error) {
            let message = "The operation failed. No changes were saved. Try again later.";
            if (error instanceof ConvexError) message = JSON.stringify(error.data);
            else if (error instanceof ZodError)
              message = error.issues.map((issue) => issue.message).join("; ");
            return { isError: true, content: [{ type: "text" as const, text: message }] };
          }
        },
      );
    }
    const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(req, { parsedBody: payload });
      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "no-store");
      headers.set("X-Content-Type-Options", "nosniff");
      // Buffer the bounded JSON response before closing a per-request server.
      return new Response(await response.arrayBuffer(), { status: response.status, headers });
    } finally {
      await server.close();
    }
  });
  for (const method of ["GET", "POST", "DELETE"] as const)
    http.route({ path: "/mcp", method, handler: mcp });
  for (const path of [
    "/mcp",
    "/oauth/register",
    "/oauth/token",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server",
  ]) {
    http.route({
      path,
      method: "OPTIONS",
      handler: httpAction(
        async () =>
          new Response(null, {
            status: 204,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
              "Access-Control-Allow-Headers":
                "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id",
              "Access-Control-Expose-Headers": "WWW-Authenticate",
              "Access-Control-Max-Age": "600",
            },
          }),
      ),
    });
  }
}
