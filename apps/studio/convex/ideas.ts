import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgency, assertClientAccess, clientCanSeeStatus } from "./rbac";
import { assertTransition, statusValidator, type ItemStatus } from "./status";
import { buildSeedFromNotes } from "./seed";

function mapIdea(i: Doc<"ideas">) {
  return {
    id: i._id,
    clientId: i.clientId,
    folderId: i.folderId ?? null,
    title: i.title,
    notes: i.notes,
    status: i.status,
    decisionNote: i.decisionNote ?? null,
    scriptId: i.scriptId ?? null,
    createdAt: i._creationTime,
    updatedAt: i.updatedAt,
  };
}

/** Ideas of a client, optionally scoped to a folder. Pass folderId: null for
 *  the "unfiled" bucket, omit for all. Clients never see drafts. */
export const listByClient = query({
  args: {
    clientId: v.id("clients"),
    folderId: v.optional(v.union(v.id("folders"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await assertClientAccess(ctx, args.clientId);
    let rows = await ctx.db
      .query("ideas")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    // Once an idea has been turned into a script, the script represents it -
    // hide the now-absorbed idea from the list.
    rows = rows.filter((r) => !r.scriptId);
    if (user.role !== "agency") rows = rows.filter((r) => clientCanSeeStatus(r.status));
    if (args.folderId !== undefined) {
      rows = rows.filter((r) => (r.folderId ?? null) === args.folderId);
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return rows.map(mapIdea);
  },
});

export const get = query({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idee nicht gefunden");
    const user = await assertClientAccess(ctx, idea.clientId);
    if (user.role !== "agency" && !clientCanSeeStatus(idea.status)) {
      throw new Error("Forbidden");
    }
    return mapIdea(idea);
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    folderId: v.optional(v.id("folders")),
    title: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const title = args.title.trim();
    if (!title) throw new Error("Titel darf nicht leer sein");
    const now = Date.now();
    return await ctx.db.insert("ideas", {
      clientId: args.clientId,
      folderId: args.folderId ?? undefined,
      title,
      notes: args.notes?.trim() ?? "",
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    ideaId: v.id("ideas"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("folders"), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const t = args.title.trim();
      if (!t) throw new Error("Titel darf nicht leer sein");
      patch.title = t;
    }
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.folderId !== undefined) patch.folderId = args.folderId ?? undefined;
    await ctx.db.patch(args.ideaId, patch);
    return null;
  },
});

export const setStatus = mutation({
  args: {
    ideaId: v.id("ideas"),
    status: statusValidator,
    decisionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idee nicht gefunden");
    const user = await assertClientAccess(ctx, idea.clientId);
    assertTransition(user.role, idea.status as ItemStatus, args.status, args.decisionNote);
    await ctx.db.patch(args.ideaId, {
      status: args.status,
      decisionNote:
        args.status === "rejected" || args.status === "changes_requested"
          ? args.decisionNote?.trim()
          : undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Agency turns an idea into a script (seeded from the idea notes) and links
 *  the two. The new script starts as a draft. */
export const convertToScript = mutation({
  args: { ideaId: v.id("ideas"), folderId: v.optional(v.id("folders")) },
  handler: async (ctx, args): Promise<Id<"scripts">> => {
    await requireAgency(ctx);
    const idea = await ctx.db.get(args.ideaId);
    if (!idea) throw new Error("Idee nicht gefunden");
    if (idea.scriptId) {
      const existing = await ctx.db.get(idea.scriptId);
      if (existing) return idea.scriptId;
    }
    const now = Date.now();
    const scriptId = await ctx.db.insert("scripts", {
      clientId: idea.clientId,
      folderId: args.folderId ?? idea.folderId ?? undefined,
      title: idea.title,
      contentJson: buildSeedFromNotes(idea.notes),
      charactersMeta: "[]",
      highlightingEnabled: null,
      status: "draft",
      pageCount: 1,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.ideaId, { scriptId, updatedAt: now });
    return scriptId;
  },
});

export const remove = mutation({
  args: { ideaId: v.id("ideas") },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "idea").eq("targetId", args.ideaId),
      )
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    await ctx.db.delete(args.ideaId);
    return null;
  },
});
