import { mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAgency, assertClientAccess } from "./rbac";

// Token time-to-live: a pairing code is valid for 15 minutes and a single
// successful redemption. After that the editor must request a fresh code.
const TOKEN_TTL_MS = 15 * 60 * 1000;
// Hard cap on how many items one bundle may carry, so a single redemption
// stays well within Convex's per-mutation write limits.
const MAX_ITEMS = 100;

/** 32 bytes of CSPRNG entropy, base64url-encoded (no padding). This raw value
 *  is the Bearer credential; only its hash is persisted. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the raw token as lowercase hex. Runs in the default Convex
 *  runtime (Web Crypto is available). */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Agency creates a single-use handoff token bound to a client (+ optional
 *  folder). Returns the RAW token exactly once - it is never stored or
 *  retrievable again. The Studio UI wraps it into a `scriptz1_...` code. */
export const createTransferToken = mutation({
  args: {
    clientId: v.id("clients"),
    folderId: v.optional(v.id("folders")),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireAgency(ctx);
    // requireAgency already grants all-client access, but assert explicitly so
    // a non-existent / cross-tenant clientId is rejected consistently.
    await assertClientAccess(ctx, args.clientId);
    const rawToken = generateToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = Date.now() + TOKEN_TTL_MS;
    await ctx.db.insert("transferTokens", {
      clientId: args.clientId,
      folderId: args.folderId ?? undefined,
      tokenHash,
      label: args.label?.trim() || undefined,
      createdBy: user._id,
      expiresAt,
    });
    return { rawToken, expiresAt };
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

/** Internal: validates + consumes a token and imports the bundle in ONE
 *  transaction. Either every item lands and the token is burned, or nothing
 *  changes. Called only from the /transfer httpAction (which has no db access).
 *  Returns the localIds the editor may now safely delete. */
export const redeemAndImport = internalMutation({
  args: {
    token: v.string(),
    scripts: v.array(bundleScript),
    ideas: v.array(bundleIdea),
  },
  handler: async (ctx, args) => {
    if (args.scripts.length + args.ideas.length > MAX_ITEMS) {
      throw new Error("too_many_items");
    }
    const hash = await sha256Hex(args.token);
    const tok = await ctx.db
      .query("transferTokens")
      .withIndex("by_hash", (q) => q.eq("tokenHash", hash))
      .unique();
    if (!tok) throw new Error("invalid_token");
    if (tok.usedAt) throw new Error("token_used");
    if (tok.expiresAt < Date.now()) throw new Error("token_expired");

    // Burn the token in the same transaction as the inserts: a partial failure
    // rolls back the usedAt flag too, so a retry is safe.
    await ctx.db.patch(tok._id, { usedAt: Date.now() });

    const now = Date.now();
    const accepted: string[] = [];

    for (const s of args.scripts) {
      await ctx.db.insert("scripts", {
        clientId: tok.clientId,
        folderId: tok.folderId ?? undefined,
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
        clientId: tok.clientId,
        folderId: tok.folderId ?? undefined,
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
