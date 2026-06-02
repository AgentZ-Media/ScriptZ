import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";

// Without explicit `jwks`, getAuthConfigProvider points the provider at the
// JWKS route served on the Convex .site domain (CONVEX_SITE_URL is provided
// automatically inside the deployment). Convex fetches the public keys from
// there to verify Better Auth's JWTs.
export default {
  providers: [getAuthConfigProvider()],
};
