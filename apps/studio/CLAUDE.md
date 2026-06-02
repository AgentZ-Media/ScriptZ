# ScriptZ Studio - Cloud-Agentur-Tool

Eigenständige vierte App-Schale neben Desktop/Web/Landing. **Verwendet den
unveränderten ScriptZ-Editor aus `@scriptz/core`** (wie Desktop/Web), legt
aber Cloud-Backend, Auth und einen Agentur-Kunden-Workflow drumherum.
Nur für unsere Agentur (invite-only), kein offenes SaaS. Konzept-Doku:
[`docs/studio-spec.md`](../../docs/studio-spec.md).

## Architektur

- **Frontend:** Solid + Vite + `@solidjs/router` (Port 5174). Reaktiver
  Convex-Client-Wrapper für Solid in [`src/lib/convex.ts`](src/lib/convex.ts)
  (`ConvexClient.onUpdate` -> Solid-Signal).
- **Backend:** Convex (`convex/`), nur das **Production**-Deployment
  (`precise-flamingo-802`). Dev-Deployment wird nicht genutzt - immer
  `npx convex deploy` bzw. `--prod`.
- **Auth:** Better Auth via `@convex-dev/better-auth` (Email/Passwort,
  crossDomain-SPA, CORS an). Invite-only: öffentliche Registrierung ist zu;
  Accounts legt die Agentur über die privilegierte In-Process-Instanz
  `createAuthAdmin` an (siehe [`convex/auth.ts`](convex/auth.ts)). Rollen
  (`agency`/`client`) liegen in der eigenen `users`-Tabelle, RBAC in
  [`convex/rbac.ts`](convex/rbac.ts), server-seitig erzwungen.
- **Editor-Persistenz:** [`src/adapters/convex.ts`](src/adapters/convex.ts)
  implementiert das core-`StorageAdapter` gegen Convex (Skript laden/sichern,
  Character-Farben **pro Kunde** via `setCurrentClient`, Settings/AppState in
  localStorage). Andere Studio-Daten laufen direkt über die Convex-API, nicht
  über den Adapter.

## Datenmodell ([`convex/schema.ts`](convex/schema.ts))

`users` (authId+role), `clients` (Firma + optionale Stammdaten),
`clientMembers` (mehrere Logins pro Firma), `folders` (Zeiträume),
`ideas`, `scripts`, `comments`, `characterColors` (pro Kunde). Status-Maschine
in [`convex/status.ts`](convex/status.ts): draft -> in_review ->
approved/rejected/changes_requested (Agentur stellt vor, Kunde entscheidet).

## Befehle

```bash
pnpm dev:studio              # vite dev (Port 5174)
pnpm build:studio            # statisches Bundle nach apps/studio/dist
cd apps/studio && npx convex deploy   # Backend auf Prod deployen
```

Env: `.env.local` zeigt auf Prod (`VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`,
`VITE_SITE_URL`). Auf der Convex-Prod gesetzt: `BETTER_AUTH_SECRET`,
`SITE_URL` (für echten Launch auf die Live-Domain umstellen). Die TTF-Fonts
unter `public/fonts/` werden für den PDF-Export gebraucht.

Ersten Agentur-User einmalig anlegen: `npx convex run --prod
bootstrap:seedFirstAgency '{"email":"...","password":"...","name":"..."}'`.

---

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
