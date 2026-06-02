import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { assertClientAccess } from "./rbac";

/** A client's character colour palette, in the shape core's editor expects
 *  (CharacterColorRecord). Scoped to the client so names never leak across
 *  companies. */
export const list = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    await assertClientAccess(ctx, args.clientId);
    const rows = await ctx.db
      .query("characterColors")
      .withIndex("by_client_name", (q) => q.eq("clientId", args.clientId))
      .collect();
    return rows.map((r) => ({
      name: r.name,
      default_color: r.color,
      override_color: null as string | null,
      updated_at: r.updatedAt,
    }));
  },
});

export const setColor = mutation({
  args: { clientId: v.id("clients"), name: v.string(), color: v.string() },
  handler: async (ctx, args) => {
    await assertClientAccess(ctx, args.clientId);
    const name = args.name.trim().toUpperCase();
    if (!name) return [] as string[];
    const existing = await ctx.db
      .query("characterColors")
      .withIndex("by_client_name", (q) =>
        q.eq("clientId", args.clientId).eq("name", name),
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { color: args.color, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("characterColors", {
        clientId: args.clientId,
        name,
        color: args.color,
        updatedAt: Date.now(),
      });
    }
    return [] as string[];
  },
});
