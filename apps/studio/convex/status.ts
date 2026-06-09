import { v } from "convex/values";

// Shared status machine for ideas and scripts. See docs/studio-spec.md §7.
export const STATUSES = [
  "draft",
  "in_review",
  "approved",
  "rejected",
  "changes_requested",
  "filmed",
] as const;
export type ItemStatus = (typeof STATUSES)[number];

export const statusValidator = v.union(
  v.literal("draft"),
  v.literal("in_review"),
  v.literal("approved"),
  v.literal("rejected"),
  v.literal("changes_requested"),
  v.literal("filmed"),
);

/** Enforces who may move an item to which status.
 *  - Agency has full manual control: it may override an item to ANY
 *    status from ANY state (propose, submit, pull back, mark filmed, and
 *    even set the client's decision states directly). A reason is still
 *    required when setting `rejected` or `changes_requested`, so the note
 *    stays meaningful no matter who set it.
 *  - Client decides: from `in_review` only, to approved / rejected /
 *    changes_requested. Rejection and change requests need a reason. */
export function assertTransition(
  role: "agency" | "client",
  from: ItemStatus,
  to: ItemStatus,
  decisionNote: string | undefined,
): void {
  if (role === "agency") {
    if ((to === "rejected" || to === "changes_requested") && !decisionNote?.trim()) {
      throw new Error("Bitte eine kurze Begründung angeben");
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
