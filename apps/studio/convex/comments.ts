import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { requireUser, assertClientAccess, clientCanSeeStatus } from "./rbac";

const targetTypeValidator = v.union(v.literal("idea"), v.literal("script"));

async function loadTarget(
  ctx: QueryCtx | MutationCtx,
  targetType: "idea" | "script",
  targetId: string,
): Promise<{ clientId: Id<"clients">; status: string } | null> {
  if (targetType === "idea") {
    const d = await ctx.db.get(targetId as Id<"ideas">);
    return d ? { clientId: d.clientId, status: d.status } : null;
  }
  const d = await ctx.db.get(targetId as Id<"scripts">);
  return d ? { clientId: d.clientId, status: d.status } : null;
}

export const listForTarget = query({
  args: { targetType: targetTypeValidator, targetId: v.string() },
  handler: async (ctx, args) => {
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) return [];
    const user = await assertClientAccess(ctx, target.clientId);
    if (user.role !== "agency" && !clientCanSeeStatus(target.status)) return [];

    const rows = await ctx.db
      .query("comments")
      .withIndex("by_target", (q) =>
        q.eq("targetType", args.targetType).eq("targetId", args.targetId),
      )
      .collect();
    rows.sort((a, b) => a._creationTime - b._creationTime);

    const names = new Map<Id<"users">, { name: string; role: string }>();
    for (const id of new Set(rows.map((r) => r.authorId))) {
      const u = await ctx.db.get(id);
      if (u) names.set(id, { name: u.name, role: u.role });
    }
    return rows.map((r) => ({
      id: r._id,
      body: r.body,
      blockId: r.blockId ?? null,
      resolved: r.resolved,
      createdAt: r._creationTime,
      authorName: names.get(r.authorId)?.name ?? "?",
      authorRole: names.get(r.authorId)?.role ?? null,
      mine: r.authorId === user._id,
    }));
  },
});

export const add = mutation({
  args: {
    targetType: targetTypeValidator,
    targetId: v.string(),
    body: v.string(),
    blockId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new Error("Ziel nicht gefunden");
    const user = await assertClientAccess(ctx, target.clientId);
    if (user.role !== "agency" && !clientCanSeeStatus(target.status)) {
      throw new Error("Forbidden");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Kommentar darf nicht leer sein");
    return await ctx.db.insert("comments", {
      clientId: target.clientId,
      targetType: args.targetType,
      targetId: args.targetId,
      blockId: args.blockId,
      authorId: user._id,
      body,
      resolved: false,
      createdAt: Date.now(),
    });
  },
});

export const setResolved = mutation({
  args: { commentId: v.id("comments"), resolved: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.get(args.commentId);
    if (!c) throw new Error("Kommentar nicht gefunden");
    await assertClientAccess(ctx, c.clientId);
    if (user.role !== "agency" && c.authorId !== user._id) throw new Error("Forbidden");
    await ctx.db.patch(args.commentId, { resolved: args.resolved });
    return null;
  },
});

export const remove = mutation({
  args: { commentId: v.id("comments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const c = await ctx.db.get(args.commentId);
    if (!c) return null;
    if (user.role !== "agency" && c.authorId !== user._id) throw new Error("Forbidden");
    await ctx.db.delete(args.commentId);
    return null;
  },
});
