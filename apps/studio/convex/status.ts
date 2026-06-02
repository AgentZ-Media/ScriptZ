import { v } from "convex/values";

// Shared status machine for ideas and scripts. See docs/studio-spec.md §7.
export const STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "changes_requested",
] as const;
export type ItemStatus = (typeof STATUSES)[number];

export const statusValidator = v.union(
  v.literal("draft"),
  v.literal("in_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested"),
);

/** Enforces who may move an item to which status.
 *  - Agency proposes: may set `draft` or `in_review` from any state
 *    (create, submit, pull back, resubmit after changes).
 *  - Client decides: from `in_review` only, to approved / rejected /
 *    changes_requested. Rejection and change requests need a reason. */
export function assertTransition(
  role: "agency" | "client",
  from: ItemStatus,
  to: ItemStatus,
  decisionNote: string | undefined,
): void {
  if (role === "agency") {
    if (to !== "draft" && to !== "in_review") {
      throw new Error("Diese Entscheidung trifft der Kunde");
    }
    return;
  }
  // client
  if (from !== "in_review") {
    throw new Error("Nur eingereichte Elemente können entschieden werden");
  }
  if (to !== "approved" && to !== "rejected" && to !== "changes_requested") {
    throw new Error("Ungültiger Status für den Kunden");
  }
  if ((to === "rejected" || to === "changes_requested") && !decisionNote?.trim()) {
    throw new Error("Bitte eine kurze Begründung angeben");
  }
}
