import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { requireAgency, assertClientAccess, clientCanSeeStatus } from "./rbac";
import { assertTransition, statusValidator, type ItemStatus } from "./status";
import { buildEmptySeed } from "./seed";

interface ScriptCharacter {
  name: string;
  color: string;
  share?: number;
}

function parseChars(raw: string): ScriptCharacter[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ScriptCharacter[]) : [];
  } catch {
    return [];
  }
}

/** Maps a script doc to the shape core's editor expects (`Script`). */
function mapFullScript(s: Doc<"scripts">) {
  return {
    id: s._id,
    clientId: s.clientId,
    title: s.title,
    content_json: s.contentJson,
    characters: parseChars(s.charactersMeta),
    highlighting_enabled:
      s.highlightingEnabled === null || s.highlightingEnabled === undefined
        ? null
        : s.highlightingEnabled
          ? 1
          : 0,
    created_at: s._creationTime,
    updated_at: s.updatedAt,
    archived_at: null as number | null,
    page_count: s.pageCount,
    word_count: s.wordCount,
    dialog_word_count: -1,
    direction_block_count: -1,
    folder_id: s.folderId ?? null,
    status: s.status,
    decisionNote: s.decisionNote ?? null,
  };
}

function mapSummary(s: Doc<"scripts">) {
  return {
    id: s._id,
    clientId: s.clientId,
    folderId: s.folderId ?? null,
    title: s.title,
    status: s.status,
    decisionNote: s.decisionNote ?? null,
    wordCount: s.wordCount,
    pageCount: s.pageCount,
    characters: parseChars(s.charactersMeta),
    createdAt: s._creationTime,
    updatedAt: s.updatedAt,
  };
}

export const listByClient = query({
  args: {
    clientId: v.id("clients"),
    folderId: v.optional(v.union(v.id("folders"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await assertClientAccess(ctx, args.clientId);
    let rows = await ctx.db
      .query("scripts")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .collect();
    if (user.role !== "agency") rows = rows.filter((r) => clientCanSeeStatus(r.status));
    if (args.folderId !== undefined) {
      rows = rows.filter((r) => (r.folderId ?? null) === args.folderId);
    }
    rows.sort((a, b) => b._creationTime - a._creationTime);
    return rows.map(mapSummary);
  },
});

/** Full script incl. content for the editor. Used by the ConvexStorageAdapter
 *  (agency, editable) and the client read-only view. */
export const get = query({
  args: { scriptId: v.id("scripts") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.scriptId);
    if (!s) throw new Error("Skript nicht gefunden");
    const user = await assertClientAccess(ctx, s.clientId);
    if (user.role !== "agency" && !clientCanSeeStatus(s.status)) {
      throw new Error("Forbidden");
    }
    // The idea this script was created from (if any), for reference.
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_client", (q) => q.eq("clientId", s.clientId))
      .collect();
    const origin = ideas.find((i) => i.scriptId === s._id);
    return {
      ...mapFullScript(s),
      originIdea: origin
        ? { id: origin._id, title: origin.title, notes: origin.notes }
        : null,
    };
  },
});

export const create = mutation({
  args: {
    clientId: v.id("clients"),
    folderId: v.optional(v.id("folders")),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const title = args.title.trim() || "Unbenannt";
    const now = Date.now();
    return await ctx.db.insert("scripts", {
      clientId: args.clientId,
      folderId: args.folderId ?? undefined,
      title,
      contentJson: buildEmptySeed(),
      charactersMeta: "[]",
      highlightingEnabled: null,
      status: "draft",
      pageCount: 1,
      wordCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateMeta = mutation({
  args: {
    scriptId: v.id("scripts"),
    title: v.optional(v.string()),
    folderId: v.optional(v.union(v.id("folders"), v.null())),
    highlightingEnabled: v.optional(v.union(v.boolean(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title.trim() || "Unbenannt";
    if (args.folderId !== undefined) patch.folderId = args.folderId ?? undefined;
    if (args.highlightingEnabled !== undefined)
      patch.highlightingEnabled = args.highlightingEnabled;
    await ctx.db.patch(args.scriptId, patch);
    return null;
  },
});

/** Persists editor content. Called by the autosave loop via the adapter.
 *  characters + word count are computed client-side (core lex utils). */
export const updateContent = mutation({
  args: {
    scriptId: v.id("scripts"),
    contentJson: v.string(),
    charactersMeta: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    pageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const s = await ctx.db.get(args.scriptId);
    if (!s) throw new Error("Skript nicht gefunden");
    const patch: Record<string, unknown> = {
      contentJson: args.contentJson,
      updatedAt: Date.now(),
    };
    if (args.charactersMeta !== undefined) patch.charactersMeta = args.charactersMeta;
    if (args.wordCount !== undefined) patch.wordCount = args.wordCount;
    if (args.pageCount !== undefined) patch.pageCount = args.pageCount;
    await ctx.db.patch(args.scriptId, patch);
    return { characters: parseChars(args.charactersMeta ?? s.charactersMeta) };
  },
});

export const setStatus = mutation({
  args: {
    scriptId: v.id("scripts"),
    status: statusValidator,
    decisionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.scriptId);
    if (!s) throw new Error("Skript nicht gefunden");
    const user = await assertClientAccess(ctx, s.clientId);
    assertTransition(user.role, s.status as ItemStatus, args.status, args.decisionNote);
    await ctx.db.patch(args.scriptId, {
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

export const remove = mutation({
  args: { scriptId: v.id("scripts") },
  handler: async (ctx, args) => {
    await requireAgency(ctx);
    const s = await ctx.db.get(args.scriptId);
    if (!s) return null;
    const comments = await ctx.db
      .query("comments")
      .withIndex("by_target", (q) =>
        q.eq("targetType", "script").eq("targetId", args.scriptId),
      )
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);
    // Unlink any idea that produced this script.
    const ideas = await ctx.db
      .query("ideas")
      .withIndex("by_client", (q) => q.eq("clientId", s.clientId))
      .collect();
    for (const i of ideas) {
      if (i.scriptId === args.scriptId) await ctx.db.patch(i._id, { scriptId: undefined });
    }
    await ctx.db.delete(args.scriptId);
    return null;
  },
});
