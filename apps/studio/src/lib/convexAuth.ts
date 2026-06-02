import { createEffect, createSignal } from "solid-js";
import { convex } from "./convex";
import { authClient } from "./authClient";

// Replicates what the React ConvexBetterAuthProvider does: feed a fresh JWT
// from Better Auth into the Convex client via setAuth, and clear it on logout.

let cachedToken: string | null = null;
let pending: Promise<string | null> | null = null;

async function fetchAccessToken({
  forceRefreshToken = false,
}: { forceRefreshToken?: boolean } = {}): Promise<string | null> {
  if (cachedToken && !forceRefreshToken) return cachedToken;
  if (!forceRefreshToken && pending) return pending;
  pending = authClient.convex
    .token({ fetchOptions: { throw: false } })
    .then((res: { data?: { token?: string } | null }) => {
      cachedToken = res?.data?.token ?? null;
      return cachedToken;
    })
    .catch(() => {
      cachedToken = null;
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export interface AuthState {
  isPending: () => boolean;
  isAuthenticated: () => boolean;
  /** True once Convex has accepted (or we've cleared) the auth token. */
  convexReady: () => boolean;
  user: () => { id: string; email: string; name: string } | null;
}

export function createAuthState(): AuthState {
  const session = authClient.useSession();
  const [convexReady, setConvexReady] = createSignal(false);

  createEffect(() => {
    const s = session();
    const loggedIn = Boolean(s?.data?.session);
    if (loggedIn) {
      cachedToken = null;
      setConvexReady(false);
      convex.setAuth(fetchAccessToken, () => setConvexReady(true));
    } else if (!s?.isPending) {
      cachedToken = null;
      // Clear auth by handing Convex a fetcher that returns no token.
      convex.setAuth(async () => null);
      setConvexReady(true);
    }
  });

  return {
    isPending: () => session()?.isPending ?? true,
    isAuthenticated: () => Boolean(session()?.data?.session),
    convexReady,
    user: () => {
      const u = session()?.data?.user;
      return u ? { id: u.id, email: u.email, name: u.name } : null;
    },
  };
}

/** Email/password sign-in. Returns an error message or null on success. */
export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    const res = await authClient.signIn.email({ email: email.trim(), password });
    if (res.error) return res.error.message ?? "Anmeldung fehlgeschlagen";
    cachedToken = null;
    return null;
  } catch (e) {
    return (e as Error)?.message ?? "Netzwerkfehler bei der Anmeldung";
  }
}

/** Change the signed-in user's email (Better Auth). Returns error or null.
 *  Emails are unverified, so the change applies directly. */
export async function changeEmail(newEmail: string): Promise<string | null> {
  try {
    const res = await authClient.changeEmail({ newEmail: newEmail.trim().toLowerCase() });
    if (res.error) return res.error.message ?? "E-Mail-Änderung fehlgeschlagen";
    cachedToken = null;
    return null;
  } catch (e) {
    return (e as Error)?.message ?? "E-Mail-Änderung fehlgeschlagen";
  }
}

/** Change the signed-in user's password (Better Auth). Returns error or null. */
export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<string | null> {
  try {
    const res = await authClient.changePassword({ currentPassword, newPassword });
    if (res.error) return res.error.message ?? "Passwort-Änderung fehlgeschlagen";
    return null;
  } catch (e) {
    return (e as Error)?.message ?? "Passwort-Änderung fehlgeschlagen";
  }
}

export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    cachedToken = null;
    convex.setAuth(async () => null);
  }
}

/** Consume a crossDomain one-time-token from the URL (OAuth-style redirect
 *  handoff). Harmless no-op for plain email/password sign-in. */
export async function consumeOttFromUrl(): Promise<void> {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("ott");
  if (!token) return;
  url.searchParams.delete("ott");
  window.history.replaceState({}, "", url);
  try {
    const res = (await authClient.crossDomain.oneTimeToken.verify({ token })) as {
      data?: { session?: { token?: string } };
    };
    const sessionToken = res?.data?.session?.token;
    if (sessionToken) {
      await authClient.getSession({
        fetchOptions: { headers: { Authorization: `Bearer ${sessionToken}` } },
      });
    }
  } catch (e) {
    console.warn("[studio] ott verify failed", e);
  }
}
