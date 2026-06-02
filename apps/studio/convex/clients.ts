import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  requireUser,
  requireAgency,
  assertClientAccess,
  accessibleClientIds,
  clientCanSeeStatus,
} from "./rbac";
import type { Doc, Id } from "./_generated/dataModel";

function visibleItems<T extends { status: string }>(
  items: T[],
  role: "agency" | "client",
): T[] {
  return role === "agency" ? items : items.filter((i) => clientCanSeeStatus(i.status));
}

/** Clients the caller may see, each with lightweight workflow counts for the
 *  dashboard. Agency sees all clients; client users see only their groups. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const ids = await accessibleClientIds(ctx, user);
    const clients: Doc<"clients">[] = [];
    for (const id of ids) {
      const c = await ctx.db.get(id);
      if (c) clients.push(c);
    }
    clients.sort((a, b) => a.name.localeCompare(b.name, "de"));

    const out = [];
    for (const c of clients) {
      const ideas = await ctx.db
        .query("ideas")
        .withIndex("by_client", (q) => q.eq("clientId", c._id))
        .collect();
      const scripts = await ctx.db
        .query("scripts")
        .withIndex("by_client", (q) => q.eq("clientId", c._id))
        .collect();
      // Converted ideas are represented by their script - don't count twice.
      const vi = visibleItems(
        ideas.filter((i) => !i.scriptId),
        user.role,
      );
      const vs = visibleItems(scripts, user.role);
      const all = [...vi, ...vs];
      out.push({
        id: c._id,
        name: c.name,
        createdAt: c._creationTime,
        ideaCount: vi.length,
        scriptCount: vs.length,
        inReview: all.filter((i) => i.status === "in_review").length,
        changesRequested: all.filter((i) => i.status === "changes_requested").length,
      });
    }
    return out;
  },
});

export const get = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await assertClientAccess(ctx, args.clientId);
    const c = await ctx.db.get(args.clientId);
    if (!c) throw new Error("Kunde nicht gefunden");
    return {
      id: c._id,
      name: c.name,
      address: c.address ?? null,
      phone: c.phone ?? null,
      website: c.website ?? null,
      notes: c.notes ?? null,
      createdAt: c._creationTime,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Name darf nicht leer sein");
    return await ctx.db.insert("clients", {
      name,
      address: args.address?.trim() || undefined,
      phone: args.phone?.trim() || undefined,
      website: args.website?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      createdAt: Date.now(),
    });
  },
});

/** Update company master data (agency). Empty strings clear a field. */
export const update = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (!n) throw new Error("Name darf nicht leer sein");
      patch.name = n;
    }
    if (args.address !== undefined) patch.address = args.address.trim() || undefined;
    if (args.phone !== undefined) patch.phone = args.phone.trim() || undefined;
    if (args.website !== undefined) patch.website = args.website.trim() || undefined;
    if (args.notes !== undefined) patch.notes = args.notes.trim() || undefined;
    await ctx.db.patch(args.clientId, patch);
    return null;
  },
});

/** Deletes a client and everything under it (folders, ideas, scripts,
 *  comments, memberships). Agency only. */
export const remove = mutation({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const cid = args.clientId;
    const tables = ["folders", "ideas", "scripts", "comments"] as const;
    for (const table of tables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_client", (q) => q.eq("clientId", cid))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    const members = await ctx.db
      .query("clientMembers")
      .withIndex("by_client", (q) => q.eq("clientId", cid))
      .collect();
    for (const m of members) await ctx.db.delete(m._id);
    await ctx.db.delete(cid);
    return null;
  },
});
