import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAgency } from "./rbac";

// Hard cap on how many items one bundle may carry, so a single import
// stays well within Convex's per-mutation write limits.
const MAX_ITEMS = 100;
// More keys than this never exist (rotation revokes the predecessor), but
// bound the scan anyway so a runaway table can't blow up the query.
const MAX_KEY_ROWS = 100;

/** 32 bytes of CSPRNG entropy, base64url-encoded (no padding). This raw value
 *  is the Bearer credential; only its hash is persisted. */
function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the raw key as lowercase hex. Runs in the default Convex
 *  runtime (Web Crypto is available). */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Resolves the Bearer key to its active apiKeys row. Throws the error codes
 *  the editor maps to user-facing messages. */
async function requireActiveKey(ctx: QueryCtx, rawKey: string): Promise<Doc<"apiKeys">> {
  const hash = await sha256Hex(rawKey);
  const row = await ctx.db
    .query("apiKeys")
    .withIndex("by_hash", (q) => q.eq("keyHash", hash))
    .unique();
  if (!row) throw new Error("invalid_key");
  if (row.revokedAt) throw new Error("key_revoked");
  return row;
}

/** The currently active key's metadata for the Studio admin UI - never the
 *  key itself (only its hash is stored). Null when no active key exists. */
export const keyStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAgency(ctx);
    const rows = await ctx.db.query("apiKeys").order("desc").take(MAX_KEY_ROWS);
    const active = rows.find((r) => !r.revokedAt);
    if (!active) return null;
    const creator = await ctx.db.get(active.createdBy);
    return {
      createdAt: active.createdAt,
      createdByName: creator?.name ?? "?",
    };
  },
});

/** Agency creates (or rotates) the editor connect key. Any previously active
 *  key is revoked in the same transaction, so exactly one key works at a time.
 *  Returns the RAW key exactly once - it is never stored or retrievable
 *  again. The Studio UI wraps it into a `scriptzk1_...` connect code. */
export const rotateKey = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireAgency(ctx);
    const rows = await ctx.db.query("apiKeys").order("desc").take(MAX_KEY_ROWS);
    const now = Date.now();
    for (const row of rows) {
      if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: now });
    }
    const rawKey = generateRawKey();
    await ctx.db.insert("apiKeys", {
      keyHash: await sha256Hex(rawKey),
      createdBy: user._id,
      createdAt: now,
    });
    return { rawKey, createdAt: now };
  },
});

/** Agency kills the active key without a replacement. Editors with the old
 *  connect code get "key revoked" until a new key is entered. */
export const revokeKey = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAgency(ctx);
    const rows = await ctx.db.query("apiKeys").order("desc").take(MAX_KEY_ROWS);
    const now = Date.now();
    for (const row of rows) {
      if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: now });
    }
    return null;
  },
});

/** Internal: the destination picker data for the editor's send dialog -
 *  every client with its folders. Called only from the /transfer/targets
 *  httpAction; auth is the connect key. */
export const listTargetsForKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    await requireActiveKey(ctx, args.key);
    const clients = await ctx.db.query("clients").collect();
    clients.sort((a, b) => a.name.localeCompare(b.name, "de"));
    const out = [];
    for (const c of clients) {
      const folders = await ctx.db
        .query("folders")
        .withIndex("by_client", (q) => q.eq("clientId", c._id))
        .collect();
      folders.sort((a, b) => a.name.localeCompare(b.name, "de"));
      out.push({
        id: c._id,
        name: c.name,
        folders: folders.map((f) => ({ id: f._id, name: f.name })),
      });
    }
    return { clients: out };
  },
});

// A script entry inside the transfer bundle. `contentJson` is a parsed Lexical
// state object (v.any) - the editor ships it parsed, we re-stringify on insert.
const bundleScript = v.object({
  localId: v.string(),
  title: v.string(),
  contentJson: v.any(),
  characters: v.array(
    v.object({
      name: v.string(),
      color: v.string(),
      share: v.optional(v.number()),
    }),
  ),
  highlightingEnabled: v.union(v.number(), v.null()),
  createdAt: v.optional(v.string()),
  updatedAt: v.optional(v.string()),
});

const bundleIdea = v.object({
  localId: v.string(),
  title: v.string(),
  notes: v.string(),
  createdAt: v.optional(v.string()),
});

/** Internal: validates the key + destination and imports the bundle in ONE
 *  transaction. The destination (client + optional folder) is chosen by the
 *  editor per transfer - ids arrive as plain strings from HTTP and are
 *  normalized here. Called only from the /transfer httpAction (which has no
 *  db access). Returns the localIds the editor may now safely delete. */
export const importWithKey = internalMutation({
  args: {
    key: v.string(),
    clientId: v.string(),
    folderId: v.optional(v.string()),
    scripts: v.array(bundleScript),
    ideas: v.array(bundleIdea),
  },
  handler: async (ctx, args) => {
    if (args.scripts.length + args.ideas.length > MAX_ITEMS) {
      throw new Error("too_many_items");
    }
    await requireActiveKey(ctx, args.key);

    const clientId = ctx.db.normalizeId("clients", args.clientId);
    if (!clientId || !(await ctx.db.get(clientId))) throw new Error("invalid_target");

    let folderId: Id<"folders"> | undefined = undefined;
    if (args.folderId) {
      const normalized = ctx.db.normalizeId("folders", args.folderId);
      if (!normalized) throw new Error("invalid_target");
      const folder = await ctx.db.get(normalized);
      if (!folder || folder.clientId !== clientId) throw new Error("invalid_target");
      folderId = normalized;
    }

    const now = Date.now();
    const accepted: string[] = [];

    for (const s of args.scripts) {
      await ctx.db.insert("scripts", {
        clientId,
        folderId,
        title: s.title.trim() || "Unbenannt",
        // Schema stores contentJson as a string; the bundle ships it parsed.
        contentJson: JSON.stringify(s.contentJson),
        charactersMeta: JSON.stringify(s.characters ?? []),
        // Editor uses number|null (0/1/null); Studio schema uses boolean|null.
        highlightingEnabled:
          s.highlightingEnabled === 1
            ? true
            : s.highlightingEnabled === 0
              ? false
              : null,
        status: "draft",
        // pageCount/wordCount stay 1/0 like convertToScript; the first editor
        // save in Studio recomputes them.
        pageCount: 1,
        wordCount: 0,
        createdAt: now,
        updatedAt: now,
      });
      accepted.push(s.localId);
    }

    for (const idea of args.ideas) {
      await ctx.db.insert("ideas", {
        clientId,
        folderId,
        title: idea.title.trim() || "Unbenannt",
        notes: idea.notes ?? "",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      });
      accepted.push(idea.localId);
    }

    return { accepted };
  },
});
