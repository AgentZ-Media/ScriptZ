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
 *  - Agency proposes: may set `draft` or `in_review` from any state
 *    (create, submit, pull back, resubmit after changes). Once the
 *    client has approved, the agency also tracks production: it may mark
 *    an `approved` item as `filmed`, or undo that back to `approved`.
 *  - Client decides: from `in_review` only, to approved / rejected /
 *    changes_requested. Rejection and change requests need a reason. */
export function assertTransition(
  role: "agency" | "client",
  from: ItemStatus,
  to: ItemStatus,
  decisionNote: string | undefined,
): void {
  if (role === "agency") {
    if (to === "draft" || to === "in_review") return;
    // Production tracking: only an approved item can become filmed, and
    // filmed can be undone back to approved if it was marked by mistake.
    if (to === "filmed" && from === "approved") return;
    if (to === "approved" && from === "filmed") return;
    throw new Error("Diese Entscheidung trifft der Kunde");
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
