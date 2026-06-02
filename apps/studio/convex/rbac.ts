import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export type AnyCtx = QueryCtx | MutationCtx;

/** The app `users` row for the authenticated caller, or null. Identity comes
 *  from the verified Better Auth JWT (ctx.auth.getUserIdentity()); we never
 *  trust a user id passed as an argument. */
export async function getAppUser(ctx: AnyCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.subject))
    .unique();
}

export async function requireUser(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await getAppUser(ctx);
  if (!user) throw new Error("Not authenticated");
  return user;
}

/** Requires an agency-role user. Agency users may do everything. */
export async function requireAgency(ctx: AnyCtx): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role !== "agency") throw new Error("Forbidden: agency only");
  return user;
}

/** Returns the set of client ids the caller may access. Agency users get all
 *  clients; client users get the clients they are a member of. */
export async function accessibleClientIds(
  ctx: AnyCtx,
  user: Doc<"users">,
): Promise<Id<"clients">[]> {
  if (user.role === "agency") {
    const clients = await ctx.db.query("clients").collect();
    return clients.map((c) => c._id);
  }
  const memberships = await ctx.db
    .query("clientMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  return memberships.map((m) => m.clientId);
}

/** Throws unless the caller may access the given client. Agency: always.
 *  Client user: must be a member of that client. */
export async function assertClientAccess(
  ctx: AnyCtx,
  clientId: Id<"clients">,
): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (user.role === "agency") return user;
  const membership = await ctx.db
    .query("clientMembers")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .collect();
  if (!membership.some((m) => m.clientId === clientId)) {
    throw new Error("Forbidden: no access to this client");
  }
  return user;
}

/** Whether a client-role user is allowed to see an item in this status.
 *  Drafts stay with the agency; clients only see submitted items onward. */
export function clientCanSeeStatus(status: string): boolean {
  return status !== "draft";
}
