// Studio handoff: collect selected scripts/ideas, POST them as a bundle to a
// URL the user pasted (learned from a pairing code), and - on a fully
// acknowledged 200 - optionally remove them locally.
//
// Core stays domain-agnostic: the target URL + token come entirely from the
// pasted code at runtime. This file knows nothing about Convex, a specific
// domain, or a database - it speaks the generic "POST JSON + Bearer" protocol.

import { getPlatformAdapter } from "./platform";
import { getStorageAdapter } from "./storage";
import { serializeBundle, type IdeaForBundle, type ScriptForBundle } from "./scriptzFile";
import { t } from "../i18n";

/** Pairing codes are `scriptz1_` + base64url(JSON {u,t,l?}). */
const CODE_PREFIX = "scriptz1_";

/** The decoded handoff target. */
export interface PairingTarget {
  /** Receiver endpoint (https, or http://localhost for dev). */
  url: string;
  /** One-time bearer token. */
  token: string;
  /** Human-readable destination ("Client X / Q3"), for the confirm dialog. */
  label: string | null;
}

/** A malformed / insecure pairing code. The dialog surfaces this inline on the
 *  code input rather than as a transfer failure. */
export class PairingCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairingCodeError";
  }
}

/** A transfer that reached the collect/send stage but failed. */
export class HandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffError";
  }
}

function decodeBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  // UTF-8 decode so non-ASCII labels (umlauts) survive.
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Parses + validates a pairing code. Throws `PairingCodeError` with a
 *  translated message on anything malformed or insecure. */
export function parsePairingCode(raw: string): PairingTarget {
  const code = raw.trim();
  if (!code.startsWith(CODE_PREFIX)) {
    throw new PairingCodeError(t("handoff.error.badCode"));
  }
  let obj: unknown;
  try {
    obj = JSON.parse(decodeBase64Url(code.slice(CODE_PREFIX.length)));
  } catch {
    throw new PairingCodeError(t("handoff.error.badCode"));
  }
  const o = obj as Record<string, unknown>;
  const url = typeof o?.u === "string" ? o.u : "";
  const token = typeof o?.t === "string" ? o.t : "";
  const label = typeof o?.l === "string" && o.l.trim() ? o.l.trim() : null;
  if (!url || !token) throw new PairingCodeError(t("handoff.error.badCode"));

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PairingCodeError(t("handoff.error.badCode"));
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new PairingCodeError(t("handoff.error.insecureUrl"));
  }
  return { url, token, label };
}

/** The host shown to the user before sending ("studio.example.com"). */
export function targetHost(target: PairingTarget): string {
  try {
    return new URL(target.url).host;
  } catch {
    return target.url;
  }
}

export interface HandoffSelection {
  scriptIds: string[];
  ideaIds: string[];
}

export interface HandoffResult {
  acceptedScriptIds: string[];
  acceptedIdeaIds: string[];
  /** How many items were sent. If accepted < total, it was a partial transfer. */
  total: number;
}

/** Maps a server error code to a translated, user-facing message. */
function mapServerError(code: string): string {
  switch (code) {
    case "invalid_token":
      return t("handoff.error.invalidToken");
    case "token_used":
      return t("handoff.error.tokenUsed");
    case "token_expired":
      return t("handoff.error.tokenExpired");
    case "too_many_items":
      return t("handoff.error.tooManyItems");
    case "missing_token":
    case "empty_bundle":
    case "invalid_bundle":
    case "invalid_json":
      return t("handoff.error.rejected");
    default:
      return t("handoff.error.generic", { code });
  }
}

function errorCodeFromBody(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    return typeof parsed?.error === "string" ? parsed.error : "";
  } catch {
    return "";
  }
}

/** Collects the selection, sends it, and (if `deleteAfter`) archives scripts /
 *  deletes ideas that the receiver acknowledged. Throws `HandoffError` on
 *  failure WITHOUT deleting anything (safe failure: data duplicated beats data
 *  lost). */
export async function sendHandoff(
  target: PairingTarget,
  selection: HandoffSelection,
  opts: { deleteAfter: boolean },
): Promise<HandoffResult> {
  const storage = getStorageAdapter();

  const scripts: ScriptForBundle[] = [];
  for (const id of selection.scriptIds) {
    const s = await storage.getScript(id);
    scripts.push({
      localId: s.id,
      title: s.title,
      content_json: s.content_json,
      characters: s.characters ?? [],
      highlighting_enabled: s.highlighting_enabled,
      created_at: s.created_at,
      updated_at: s.updated_at,
    });
  }

  let ideas: IdeaForBundle[] = [];
  if (selection.ideaIds.length > 0) {
    const wanted = new Set(selection.ideaIds);
    const all = await storage.listIdeas();
    ideas = all
      .filter((i) => wanted.has(i.id))
      .map((i) => ({
        localId: i.id,
        title: i.title,
        notes: i.notes,
        created_at: i.created_at,
      }));
  }

  const total = scripts.length + ideas.length;
  if (total === 0) throw new HandoffError(t("handoff.error.empty"));

  const bundle = serializeBundle(scripts, ideas);
  const res = await getPlatformAdapter().httpPostJson(
    target.url,
    target.token,
    JSON.stringify(bundle),
  );

  if (res.status === 0) throw new HandoffError(t("handoff.error.network"));
  if (!res.ok) throw new HandoffError(mapServerError(errorCodeFromBody(res.body)));

  let accepted: string[] = [];
  try {
    const parsed = JSON.parse(res.body) as { accepted?: unknown };
    if (Array.isArray(parsed?.accepted)) {
      accepted = parsed.accepted.filter((x): x is string => typeof x === "string");
    }
  } catch {
    /* fall through with empty accepted */
  }
  const acceptedSet = new Set(accepted);
  const acceptedScriptIds = selection.scriptIds.filter((id) => acceptedSet.has(id));
  const acceptedIdeaIds = selection.ideaIds.filter((id) => acceptedSet.has(id));

  if (acceptedScriptIds.length + acceptedIdeaIds.length === 0) {
    // 200 but nothing acknowledged - treat as a failure, delete nothing.
    throw new HandoffError(t("handoff.error.rejected"));
  }

  if (opts.deleteAfter) {
    // Archive (not purge) scripts so an unnoticed partial leaves a safety net.
    for (const id of acceptedScriptIds) {
      try {
        await storage.archiveScript(id);
      } catch {
        /* leave it; the item is safely in Studio either way */
      }
    }
    for (const id of acceptedIdeaIds) {
      try {
        await storage.deleteIdea(id);
      } catch {
        /* leave it */
      }
    }
  }

  return { acceptedScriptIds, acceptedIdeaIds, total };
}
