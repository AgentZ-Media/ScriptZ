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
