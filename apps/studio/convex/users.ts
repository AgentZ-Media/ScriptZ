import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { createAuthAdmin } from "./auth";
import { getAppUser, requireAgency, requireUser } from "./rbac";

/** The authenticated caller's profile (app role + identity), or null if not
 *  signed in. The client uses this to decide agency vs client UI. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const appUser = await getAppUser(ctx);
    if (!appUser) {
      // Authenticated with Better Auth but not provisioned in the app yet.
      return {
        id: null,
        authId: identity.subject,
        email: identity.email ?? "",
        name: (identity.name as string | undefined) ?? "",
        role: null as null,
      };
    }
    return {
      id: appUser._id,
      authId: appUser.authId,
      email: appUser.email,
      name: appUser.name,
      role: appUser.role,
    };
  },
});

/** Lists all app users (agency-only) for the admin screen, with their client
 *  memberships resolved to names. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAgency(ctx);
    const users = await ctx.db.query("users").collect();
    const clients = await ctx.db.query("clients").collect();
    const clientName = new Map(clients.map((c) => [c._id, c.name] as const));
    const memberships = await ctx.db.query("clientMembers").collect();
    return users.map((u) => ({
      id: u._id,
      authId: u.authId,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u._creationTime,
      clients: memberships
        .filter((m) => m.userId === u._id)
        .map((m) => ({ id: m.clientId, name: clientName.get(m.clientId) ?? "?" })),
    }));
  },
});

/** Provision a new login (agency-only). Agency users are Better Auth admins,
 *  so auth.api.createUser is permitted. Client users are additionally linked
 *  to their client group(s). Returns the new app user id. */
export const provision = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
    role: v.union(v.literal("agency"), v.literal("client")),
    clientIds: v.optional(v.array(v.id("clients"))),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);

    const email = args.email.trim().toLowerCase();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("Ein Benutzer mit dieser E-Mail existiert bereits");

    // Privileged in-process auth instance (sign-up enabled) creates the
    // credential. The public HTTP routes still have sign-up disabled.
    const auth = createAuthAdmin(ctx);
    const created = await auth.api.signUpEmail({
      body: { email, password: args.password, name: args.name },
    });
    const authId =
      (created as { user?: { id?: string }; id?: string }).user?.id ??
      (created as { id?: string }).id;
    if (!authId) throw new Error("Better Auth lieferte keine User-ID zurück");

    const userId = await ctx.db.insert("users", {
      authId,
      email,
      name: args.name,
      role: args.role,
    });

    if (args.role === "client") {
      const clientIds = args.clientIds ?? [];
      for (const clientId of clientIds) {
        await ctx.db.insert("clientMembers", { clientId, userId });
      }
    }

    return { id: userId, authId };
  },
});

/** People (logins) belonging to a company (agency-only). */
export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const members = await ctx.db
      .query("clientMembers")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const out = [];
    for (const m of members) {
      const u = await ctx.db.get(m.userId);
      if (u) out.push({ id: u._id, name: u.name, email: u.email, createdAt: u._creationTime });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, "de"));
    return out;
  },
});

/** Rename a person (agency). */
export const updateName = mutation({
  args: { userId: v.id("users"), name: v.string() },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const n = args.name.trim();
    if (!n) throw new Error("Name darf nicht leer sein");
    await ctx.db.patch(args.userId, { name: n });
    return null;
  },
});

/** Revoke a person's access (agency): removes the app profile + memberships.
 *  The underlying credential can no longer reach any data. */
export const removeAccess = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireAgency(ctx);
    if (args.userId === me._id) throw new Error("Du kannst dich nicht selbst entfernen");
    const mems = await ctx.db
      .query("clientMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const m of mems) await ctx.db.delete(m._id);
    await ctx.db.delete(args.userId);
    return null;
  },
});

/** Self-service: update one's own display name / email mirror (called after a
 *  Better Auth email change so the app profile stays in sync). */
export const updateOwnProfile = mutation({
  args: { name: v.optional(v.string()), email: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const u = await requireUser(ctx);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (!n) throw new Error("Name darf nicht leer sein");
      patch.name = n;
    }
    if (args.email !== undefined) patch.email = args.email.trim().toLowerCase();
    if (Object.keys(patch).length) await ctx.db.patch(u._id, patch);
    return null;
  },
});

/** Update which client groups a client-user belongs to (agency-only). */
export const setClientMemberships = mutation({
  args: { userId: v.id("users"), clientIds: v.array(v.id("clients")) },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Benutzer nicht gefunden");
    const existing = await ctx.db
      .query("clientMembers")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    for (const m of existing) await ctx.db.delete(m._id);
    for (const clientId of args.clientIds) {
      await ctx.db.insert("clientMembers", { clientId, userId: args.userId });
    }
    return null;
  },
});
