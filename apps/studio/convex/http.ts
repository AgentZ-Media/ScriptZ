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

// --- Offline-editor handoff endpoints -------------------------------------
// The editor (desktop/web) authenticates with the permanent connect key as a
// Bearer credential: GET /transfer/targets lists clients + folders for the
// destination picker, POST /transfer imports a ScriptzBundle into the chosen
// destination. Authorization is the key itself (no cookies), so a wildcard
// CORS origin is safe and lets ANY self-hosted editor instance send.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function bearerKey(req: Request): string {
  const authHeader = req.headers.get("Authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

/** Auth failures are a 401, everything else a client-visible 400 with the raw
 *  code - the editor maps both to translated toasts. */
function errorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : "import_failed";
  const status = message === "invalid_key" || message === "key_revoked" ? 401 : 400;
  return json(status, { error: message });
}

const preflight = httpAction(
  async () => new Response(null, { status: 204, headers: CORS_HEADERS }),
);

http.route({ path: "/transfer", method: "OPTIONS", handler: preflight });
http.route({ path: "/transfer/targets", method: "OPTIONS", handler: preflight });

http.route({
  path: "/transfer/targets",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const key = bearerKey(req);
    if (!key) return json(401, { error: "missing_key" });
    try {
      const result = await ctx.runQuery(internal.transfer.listTargetsForKey, { key });
      return json(200, result);
    } catch (err) {
      return errorResponse(err);
    }
  }),
});

http.route({
  path: "/transfer",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const key = bearerKey(req);
    if (!key) return json(401, { error: "missing_key" });

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
    if (typeof b.clientId !== "string" || !b.clientId) {
      return json(400, { error: "invalid_target" });
    }
    const scripts = Array.isArray(b.scripts) ? b.scripts : [];
    const ideas = Array.isArray(b.ideas) ? b.ideas : [];
    if (scripts.length === 0 && ideas.length === 0) {
      return json(400, { error: "empty_bundle" });
    }

    try {
      const result = await ctx.runMutation(internal.transfer.importWithKey, {
        key,
        clientId: b.clientId,
        folderId: typeof b.folderId === "string" && b.folderId ? b.folderId : undefined,
        // The internalMutation's validators enforce the precise item shape;
        // a malformed item surfaces as a thrown error -> 400 below.
        scripts: scripts as never,
        ideas: ideas as never,
      });
      return json(200, result);
    } catch (err) {
      return errorResponse(err);
    }
  }),
});

export default http;
