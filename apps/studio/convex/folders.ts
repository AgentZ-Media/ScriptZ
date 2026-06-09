import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgency, assertClientAccess, clientCanSeeStatus } from "./rbac";
import type { Doc } from "./_generated/dataModel";

/** Folders ("Zeiträume") under a client, each with progress counts that
 *  respect the caller's visibility (clients don't see drafts). */
export const listByClient = query({
  args: { clientId: v.id("clients") },
  handler: async (ctx, args) => {
    const user = await assertClientAccess(ctx, args.clientId);
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    const scripts = await ctx.db
      .query("scripts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    // Converted ideas are represented by their script; don't double-count.
    const activeIdeas = ideas.filter((i) => !i.scriptId);
    const items = [...activeIdeas, ...scripts].filter(
      (i) => user.role === "agency" || clientCanSeeStatus(i.status),
    );

    const mapFolder = (f: Doc<"folders"> | null) => {
      const fid = f?._id ?? null;
      const inFolder = items.filter((i) => (i.folderId ?? null) === fid);
      return {
        total: inFolder.length,
        // Filmed items stay counted as approved so progress never regresses.
        approved: inFolder.filter((i) => i.status === "approved" || i.status === "filmed").length,
        inReview: inFolder.filter((i) => i.status === "in_review").length,
      };
    };

    const result = folders
      .sort((a, b) => {
        // newest date range first, fall back to creation time
        const ad = a.startDate ?? "";
        const bd = b.startDate ?? "";
        if (ad !== bd) return bd.localeCompare(ad);
        return b._creationTime - a._creationTime;
      })
      .map((f) => ({
        id: f._id,
        name: f.name,
        startDate: f.startDate ?? null,
        endDate: f.endDate ?? null,
        targetCount: f.targetCount ?? null,
        createdAt: f._creationTime,
        ...mapFolder(f),
      }));

    // Synthetic "no folder" bucket so loose items remain reachable.
    const loose = mapFolder(null);
    return {
      folders: result,
      unfiled: loose.total > 0 ? loose : null,
    };
  },
});

export const get = query({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    const f = await ctx.db.get(args.folderId);
    if (!f) throw new Error("Ordner nicht gefunden");
    await assertClientAccess(ctx, f.clientId);
    return {
      id: f._id,
      clientId: f.clientId,
      name: f.name,
      startDate: f.startDate ?? null,
      endDate: f.endDate ?? null,
      targetCount: f.targetCount ?? null,
    };
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    name: v.string(),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    targetCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Name darf nicht leer sein");
    const now = Date.now();
    return await ctx.db.insert("folders", {
      clientId: args.clientId,
      name,
      startDate: args.startDate || undefined,
      endDate: args.endDate || undefined,
      targetCount: args.targetCount ?? undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    startDate: v.optional(v.union(v.string(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    targetCount: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      const n = args.name.trim();
      if (!n) throw new Error("Name darf nicht leer sein");
      patch.name = n;
    }
    if (args.startDate !== undefined) patch.startDate = args.startDate ?? undefined;
    if (args.endDate !== undefined) patch.endDate = args.endDate ?? undefined;
    if (args.targetCount !== undefined) patch.targetCount = args.targetCount ?? undefined;
    await ctx.db.patch(args.folderId, patch);
    return null;
  },
});

/** Deletes a folder. Contained ideas/scripts are kept but unfiled. */
export const remove = mutation({
  args: { folderId: v.id("folders") },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const f = await ctx.db.get(args.folderId);
    if (!f) return null;
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    for (const i of ideas) await ctx.db.patch(i._id, { folderId: undefined });
    const scripts = await ctx.db
      .query("scripts")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    for (const s of scripts) await ctx.db.patch(s._id, { folderId: undefined });
    await ctx.db.delete(args.folderId);
    return null;
  },
});
