import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

// The app's public origin (the Solid SPA). Used for trustedOrigins and the
// crossDomain one-time-token handoff. Set per deployment via
// `npx convex env set SITE_URL ...`.
const siteUrl = process.env.SITE_URL ?? "http://localhost:5181";

// Backend integration client for the Better Auth component. Exposes
// adapter(), getAuth(), getAuthUser(), registerRoutes() etc.
export const authComponent = createClient<DataModel>(components.betterAuth);

function buildAuth(ctx: GenericCtx<DataModel>, allowSignUp: boolean) {
  return betterAuth({
    // For a client-side SPA the auth routes live on the Convex .site domain.
    baseURL: process.env.CONVEX_SITE_URL,
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // Public sign-up is closed (invite-only). Account creation happens only
      // through the agency-gated `users.provision` mutation, which uses the
      // privileged `createAuthAdmin` instance below (never exposed over HTTP).
      disableSignUp: !allowSignUp,
    },
    // Allow users to change their own email. Since emails are unverified
    // (no mail infrastructure), Better Auth applies the change directly.
    user: {
      changeEmail: { enabled: true },
    },
    plugins: [
      // Required for the cross-origin (.cloud app / .site auth) SPA setup.
      crossDomain({ siteUrl }),
      // Convex integration - must come last.
      convex({ authConfig }),
    ],
  });
}

/** Public auth instance used by the HTTP routes and auth config. Sign-up is
 *  disabled here, so the public sign-up route is closed. */
export const createAuth = (ctx: GenericCtx<DataModel>) => buildAuth(ctx, false);

/** Privileged auth instance with sign-up enabled. NOT registered on any HTTP
 *  route - only called in-process by agency-gated provisioning + bootstrap. */
export const createAuthAdmin = (ctx: GenericCtx<DataModel>) =>
  buildAuth(ctx, true);
