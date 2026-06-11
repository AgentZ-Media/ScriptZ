// Studio handoff: the editor holds a permanent connect code (generated in
// Studio's admin UI, pasted once into the settings). From it we learn the
// Studio base URL + the Bearer key, load the destination list (clients +
// folders) for the send dialog, and POST the selected scripts/ideas as a
// bundle into the destination the user picked.
//
// Core stays domain-agnostic: the target URL + key come entirely from the
// stored code at runtime. This file knows nothing about Convex, a specific
// domain, or a database - it speaks the generic "JSON + Bearer" protocol.

import { getPlatformAdapter } from "./platform";
import { getStorageAdapter } from "./storage";
import { serializeBundle, type IdeaForBundle, type ScriptForBundle } from "./scriptzFile";
import { t } from "../i18n";

/** Connect codes are `scriptzk1_` + base64url(JSON {u,k}). The old one-time
 *  pairing codes used `scriptz1_` - they are gone; pasting one fails. */
const CODE_PREFIX = "scriptzk1_";

/** The decoded permanent connection. */
export interface StudioConnection {
  /** Studio base URL (https, or http://localhost for dev). The transfer
   *  endpoints live under `<baseUrl>/transfer`. */
  baseUrl: string;
  /** Permanent (revocable) bearer key. */
  key: string;
}

/** A malformed / insecure connect code. The settings UI surfaces this inline
 *  on the code input. */
export class ConnectCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectCodeError";
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
  // UTF-8 decode so non-ASCII content survives.
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Parses + validates a connect code. Throws `ConnectCodeError` with a
 *  translated message on anything malformed or insecure. */
export function parseConnectCode(raw: string): StudioConnection {
  const code = raw.trim();
  if (!code.startsWith(CODE_PREFIX)) {
    throw new ConnectCodeError(t("settings.studio.error.badCode"));
  }
  let obj: unknown;
  try {
    obj = JSON.parse(decodeBase64Url(code.slice(CODE_PREFIX.length)));
  } catch {
    throw new ConnectCodeError(t("settings.studio.error.badCode"));
  }
  const o = obj as Record<string, unknown>;
  const baseUrl = typeof o?.u === "string" ? o.u.replace(/\/+$/, "") : "";
  const key = typeof o?.k === "string" ? o.k : "";
  if (!baseUrl || !key) throw new ConnectCodeError(t("settings.studio.error.badCode"));

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new ConnectCodeError(t("settings.studio.error.badCode"));
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new ConnectCodeError(t("settings.studio.error.insecureUrl"));
  }
  return { baseUrl, key };
}

/** The host shown to the user ("studio.example.com"). */
export function connectionHost(conn: StudioConnection): string {
  try {
    return new URL(conn.baseUrl).host;
  } catch {
    return conn.baseUrl;
  }
}

export interface TransferFolder {
  id: string;
  name: string;
}

export interface TransferClient {
  id: string;
  name: string;
  folders: TransferFolder[];
}

/** Maps a server error code to a translated, user-facing message. */
function mapServerError(code: string): string {
  switch (code) {
    case "invalid_key":
    case "missing_key":
      return t("handoff.error.invalidKey");
    case "key_revoked":
      return t("handoff.error.keyRevoked");
    case "invalid_target":
      return t("handoff.error.invalidTarget");
    case "too_many_items":
      return t("handoff.error.tooManyItems");
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

/** Loads the destination list (clients with their folders) from Studio.
 *  Doubles as the settings dialog's connection test. Throws `HandoffError`
 *  with a translated message on any failure. */
export async function fetchTargets(conn: StudioConnection): Promise<TransferClient[]> {
  const res = await getPlatformAdapter().httpGetJson(
    `${conn.baseUrl}/transfer/targets`,
    conn.key,
  );
  if (res.status === 0) throw new HandoffError(t("handoff.error.network"));
  if (!res.ok) throw new HandoffError(mapServerError(errorCodeFromBody(res.body)));

  let clients: unknown;
  try {
    clients = (JSON.parse(res.body) as { clients?: unknown }).clients;
  } catch {
    throw new HandoffError(t("handoff.error.rejected"));
  }
  if (!Array.isArray(clients)) throw new HandoffError(t("handoff.error.rejected"));
  return clients
    .filter(
      (c): c is { id: string; name: string; folders?: unknown } =>
        typeof (c as { id?: unknown })?.id === "string" &&
        typeof (c as { name?: unknown })?.name === "string",
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      folders: (Array.isArray(c.folders) ? c.folders : []).filter(
        (f): f is TransferFolder =>
          typeof (f as { id?: unknown })?.id === "string" &&
          typeof (f as { name?: unknown })?.name === "string",
      ),
    }));
}

export interface HandoffSelection {
  scriptIds: string[];
  ideaIds: string[];
}

/** Where the items should land in Studio. `folderId: null` means the client's
 *  inbox ("unfiled"). */
export interface HandoffDestination {
  clientId: string;
  folderId: string | null;
}

export interface HandoffResult {
  acceptedScriptIds: string[];
  acceptedIdeaIds: string[];
  /** How many items were sent. If accepted < total, it was a partial transfer. */
  total: number;
}

/** Collects the selection, sends it to the chosen destination, and (if
 *  `deleteAfter`) archives scripts / deletes ideas that the receiver
 *  acknowledged. Throws `HandoffError` on failure WITHOUT deleting anything
 *  (safe failure: data duplicated beats data lost). */
export async function sendHandoff(
  conn: StudioConnection,
  destination: HandoffDestination,
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

  const bundle = {
    ...serializeBundle(scripts, ideas),
    clientId: destination.clientId,
    folderId: destination.folderId ?? undefined,
  };
  const res = await getPlatformAdapter().httpPostJson(
    `${conn.baseUrl}/transfer`,
    conn.key,
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
