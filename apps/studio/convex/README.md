# Convex-Setup für ScriptZ Studio

Dieses Verzeichnis enthält das Backend (Schema + später Queries/Mutations).
Das Schema (`schema.ts`) steht schon; das Convex-Deployment und der
Code-Generator werden per CLI eingerichtet. **Diesen Teil machst du
manuell** - die genauen Schritte stehen in der Repo-Antwort und kurz hier:

## Einmaliges Setup

```bash
# 1. Abhängigkeiten installieren (vom Repo-Root)
pnpm install

# 2. In die Studio-App wechseln
cd apps/studio

# 3. Convex-Dev starten - legt das Deployment an, fragt nach Login,
#    schreibt VITE_CONVEX_URL + CONVEX_DEPLOYMENT in .env.local und
#    generiert convex/_generated/. Läuft als Watcher weiter.
pnpm dev:convex      # entspricht: npx convex dev
```

Beim ersten Lauf führt die CLI durch Login (Browser) und das Anlegen eines
Projekts. Danach pusht sie automatisch `schema.ts` ins Deployment und legt
`convex/_generated/` an (das wird committet).

## Danach (Phase 1, übernehme ich wieder)

- Better Auth via Komponente einrichten:
  `npm install better-auth @convex-dev/better-auth`, `convex/auth.ts` +
  `convex/convex.config.ts` + `auth.config.ts`.
- `ConvexStorageAdapter` in `src/adapters/convex.ts` ausimplementieren und
  in `src/main.tsx` registrieren.
- Login-Screen + App-Tree statt der Phase-0-Platzhalter-UI.

## Hinweise

- `.env.local` ist gitignored (`*.local`) - die Convex-URL landet dort.
- `convex/_generated/` von Convex bitte committen (Standard-Empfehlung).
- Dev-Frontend separat: `pnpm dev:studio` (Port 5174). Convex-Watcher und
  Vite laufen parallel in zwei Terminals.
