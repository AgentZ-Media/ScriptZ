import { query } from "./_generated/server";
import { v } from "convex/values";
import { assertClientAccess, clientCanSeeStatus } from "./rbac";

/** Full-text search over a client's script + idea titles (Convex search
 *  index). Scoped to the client and the caller's visibility. */
export const search = query({
  args: { clientId: v.id("clients"), query: v.string() },
  handler: async (ctx, args) => {
    const user = await assertClientAccess(ctx, args.clientId);
    const q = args.query.trim();
    if (!q) return [];

    const scripts = await ctx.db
      .query("scripts")
      .withSearchIndex("search_title", (s) =>
        s.search("title", q).eq("clientId", args.clientId),
      )
      .take(20);
    const ideas = await ctx.db
      .query("ideas")
      .withSearchIndex("search_title", (s) =>
        s.search("title", q).eq("clientId", args.clientId),
      )
      .take(20);

    const visible = (status: string) =>
      user.role === "agency" || clientCanSeeStatus(status);

    return [
      ...scripts
        .filter((s) => visible(s.status))
        .map((s) => ({
          type: "script" as const,
          id: s._id,
          title: s.title,
          status: s.status,
          folderId: s.folderId ?? null,
        })),
      ...ideas
        .filter((i) => visible(i.status) && !i.scriptId)
        .map((i) => ({
          type: "idea" as const,
          id: i._id,
          title: i.title,
          status: i.status,
          folderId: i.folderId ?? null,
        })),
    ];
  },
});
