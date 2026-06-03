import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { createAuthAdmin } from "./auth";

// One-time bootstrap of the very first agency user. Runs only via
// `npx convex run --prod bootstrap:seedFirstAgency '{...}'` (internal -> not
// part of the public API). Uses the privileged createAuthAdmin instance, so
// no env flag is needed and the public sign-up route stays closed.
export const seedFirstAgency = internalMutation({
  args: { email: v.string(), password: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) return { authId: existing.authId, note: "already exists" };

    const auth = createAuthAdmin(ctx);
    const res = await auth.api.signUpEmail({
      body: { email, password: args.password, name: args.name },
    });
    const authId =
      (res as { user?: { id?: string }; id?: string }).user?.id ??
      (res as { id?: string }).id;
    if (!authId) throw new Error("signUpEmail returned no user id");

    await ctx.db.insert("users", {
      authId,
      email,
      name: args.name,
      role: "agency",
    });
    return { authId };
  },
});

// One-time password reset for an already-provisioned account. There is no
// public reset flow (no mail infrastructure), so for an account that already
// exists we set the credential directly via Better Auth's own context, the
// same way the reset-password route does (hash -> updatePassword, or create
// the credential account if none exists yet). Internal only.
export const resetPassword = internalMutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new Error(`no app user for ${email}`);

    const auth = createAuthAdmin(ctx);
    const context = await auth.$context;
    const hashed = await context.password.hash(args.password);
    const accounts = await context.internalAdapter.findAccounts(user.authId);
    if (!accounts.find((a) => a.providerId === "credential")) {
      await context.internalAdapter.createAccount({
        userId: user.authId,
        providerId: "credential",
        password: hashed,
        accountId: user.authId,
      });
    } else {
      await context.internalAdapter.updatePassword(user.authId, hashed);
    }
    return { authId: user.authId, note: "password set" };
  },
});
