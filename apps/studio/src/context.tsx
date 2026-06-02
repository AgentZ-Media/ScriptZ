import { createContext, useContext, type ParentProps } from "solid-js";
import { createAuthState, type AuthState } from "./lib/convexAuth";
import { createQuery } from "./lib/convex";
import { api } from "../convex/_generated/api";

export type Role = "agency" | "client" | null;

export interface MeUser {
  id: string | null;
  authId: string;
  email: string;
  name: string;
  role: Role;
}

interface StudioCtx {
  auth: AuthState;
  me: () => MeUser | null | undefined;
  meLoading: () => boolean;
  role: () => Role;
  isAgency: () => boolean;
}

const Ctx = createContext<StudioCtx>();

export function StudioProvider(props: ParentProps) {
  const auth = createAuthState();
  const meQ = createQuery(api.users.me, () =>
    auth.isAuthenticated() && auth.convexReady() ? {} : "skip",
  );
  const me = () => meQ.data() as MeUser | null | undefined;
  const value: StudioCtx = {
    auth,
    me,
    meLoading: () => meQ.loading(),
    role: () => me()?.role ?? null,
    isAgency: () => me()?.role === "agency",
  };
  return <Ctx.Provider value={value}>{props.children}</Ctx.Provider>;
}

export function useStudio(): StudioCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudio() outside StudioProvider");
  return c;
}
