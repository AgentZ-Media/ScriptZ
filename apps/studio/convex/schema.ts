import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Shared status machine for ideas and scripts. The agency proposes
// (draft -> in_review), the client decides (approved / rejected /
// changes_requested). See docs/studio-spec.md section 7.
export const itemStatus = v.union(
  v.literal("draft"), // agency-only, not visible to the client
  v.literal("in_review"), // submitted - client can see + decide
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested"), // bounced back to the agency
);

export default defineSchema({
  // App profile per logged-in user. The actual auth tables (sessions,
  // accounts, ...) are owned by the @convex-dev/better-auth component;
  // this table only carries the role and links to the auth subject.
  users: defineTable({
    authId: v.string(), // subject from Better Auth
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("agency"), v.literal("client")),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"]),

  // A client = a company/brand, which may have several logins. Only `name`
  // is required; the rest is optional company master data.
  clients: defineTable({
    name: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }),

  clientMembers: defineTable({
    clientId: v.id("clients"),
    userId: v.id("users"),
  })
    .index("by_client", ["clientId"])
    .index("by_user", ["userId"]),

  // "Zeitraum" / content batch under a client. Freely named, with an
  // optional date range and target count (e.g. "Q3 - 90 videos").
  folders: defineTable({
    clientId: v.id("clients"),
    name: v.string(),
    startDate: v.optional(v.string()), // YYYY-MM-DD
    endDate: v.optional(v.string()),
    targetCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_client", ["clientId"]),

  ideas: defineTable({
    clientId: v.id("clients"),
    folderId: v.optional(v.id("folders")),
    title: v.string(),
    notes: v.string(),
    status: itemStatus,
    decisionNote: v.optional(v.string()), // reason on reject / changes
    scriptId: v.optional(v.id("scripts")), // set once converted
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_folder", ["folderId"])
    .index("by_client_status", ["clientId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["clientId"],
    }),

  scripts: defineTable({
    clientId: v.id("clients"),
    folderId: v.optional(v.id("folders")),
    title: v.string(),
    // Serialised Lexical state - identical format to the existing app's
    // content_json, so the core editor loads it unchanged.
    contentJson: v.string(),
    charactersMeta: v.string(), // JSON ScriptCharacter[]
    highlightingEnabled: v.union(v.boolean(), v.null()),
    status: itemStatus,
    decisionNote: v.optional(v.string()),
    pageCount: v.number(),
    wordCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_client", ["clientId"])
    .index("by_folder", ["folderId"])
    .index("by_client_status", ["clientId", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["clientId"],
    }),

  comments: defineTable({
    clientId: v.id("clients"),
    targetType: v.union(v.literal("idea"), v.literal("script")),
    targetId: v.string(), // id of the idea/script being commented on
    blockId: v.optional(v.string()), // optional block anchor (Phase 4b)
    authorId: v.id("users"),
    body: v.string(),
    resolved: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_target", ["targetType", "targetId"])
    .index("by_client", ["clientId"]),

  // Character colour palette, scoped PER CLIENT so a character name (e.g.
  // "KEVIN") at one company never leaks its colour to another company.
  // clientId is optional only so pre-existing global rows stay schema-valid;
  // all reads/writes go through (clientId, name). Upper-cased name.
  characterColors: defineTable({
    clientId: v.optional(v.id("clients")),
    name: v.string(),
    color: v.string(),
    updatedAt: v.number(),
  }).index("by_client_name", ["clientId", "name"]),
});
