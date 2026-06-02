import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Mounts all Better Auth routes (sign-in, sign-out, token, JWKS, the
// crossDomain one-time-token endpoints, ...) on the Convex .site domain.
// cors:true registers the OPTIONS preflight handlers + CORS headers for the
// trustedOrigins, which the cross-origin SPA (app on a different origin than
// the .site auth domain) needs.
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
