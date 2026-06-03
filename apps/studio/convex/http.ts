import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Mounts all Better Auth routes (sign-in, sign-out, token, JWKS, the
// crossDomain one-time-token endpoints, ...) on the Convex .site domain.
// cors:true registers the OPTIONS preflight handlers + CORS headers for the
// trustedOrigins, which the cross-origin SPA (app on a different origin than
// the .site auth domain) needs.
authComponent.registerRoutes(http, createAuth, { cors: true });

// --- Offline-editor handoff endpoint -------------------------------------
// The editor (desktop/web) POSTs a ScriptzBundle here with a one-time token as
// a Bearer credential. Authorization is the token itself (no cookies), so a
// wildcard CORS origin is safe and lets ANY self-hosted editor instance send.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

http.route({
  path: "/transfer",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: CORS_HEADERS })),
});

http.route({
  path: "/transfer",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) return json(401, { error: "missing_token" });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (typeof body !== "object" || body === null) {
      return json(400, { error: "invalid_bundle" });
    }
    const b = body as Record<string, unknown>;
    if (b.format !== "scriptz-bundle") return json(400, { error: "invalid_bundle" });
    const scripts = Array.isArray(b.scripts) ? b.scripts : [];
    const ideas = Array.isArray(b.ideas) ? b.ideas : [];
    if (scripts.length === 0 && ideas.length === 0) {
      return json(400, { error: "empty_bundle" });
    }

    try {
      const result = await ctx.runMutation(internal.transfer.redeemAndImport, {
        token,
        // The internalMutation's validators enforce the precise item shape;
        // a malformed item surfaces as a thrown error -> 400 below.
        scripts: scripts as never,
        ideas: ideas as never,
      });
      return json(200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "import_failed";
      // Map the known token errors to a 400 (the editor maps them to a toast);
      // everything else is also a client-visible 400 with the raw code.
      return json(400, { error: message });
    }
  }),
});

export default http;
