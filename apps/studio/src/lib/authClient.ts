import { createAuthClient } from "better-auth/solid";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

// Better Auth client (SolidJS variant). baseURL points at the Convex .site
// domain, where the auth routes are mounted. The convexClient plugin adds
// authClient.convex.token(); crossDomainClient stores the session token
// client-side (bearer) since the app and auth live on different origins.
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_CONVEX_SITE_URL as string,
  plugins: [convexClient(), crossDomainClient()],
});
