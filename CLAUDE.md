# CCL-Cup

Vite + React 19 + TypeScript single-page app for running a football cup competition
(groups, league tables, knockout bracket). Supabase (Postgres) is the backend.
Deployed as a static SPA — `netlify.toml` and `vercel.json` both rewrite all routes
to `index.html`.

## Commands

- Dev: `npm run dev` (vite, bound to 127.0.0.1)
- Build: `npm run build` (`tsc -b && vite build` — type errors fail the build)
- Lint: `npm run lint` (`eslint .`)
- Test: `npm test` (`tsx tests/standings.test.ts && tsx tests/bracket.test.ts`)
- Preview a build: `npm run preview`

There is no vitest/jest here — tests are plain `tsx` scripts over the pure helpers.

## Layout

- `src/components/` — UI: `AdminPanel.tsx`, `PublicSite.tsx`, and the canvas/export
  modals (bracket, league, group league, squad)
- `src/lib/` — pure helpers: `standingsUtils.ts`, `bracketUtils.ts`, `leagueUtils.ts`,
  `groupLeagueUtils.ts`, plus image trimming and preset logos. This is the layer the
  tests cover; keep new logic here rather than in components.
- `src/services/tournamentRepository.ts` — all Supabase reads/writes go through here
- `src/auth/AuthContext.tsx` — auth state
- `supabase/migrations/` — schema; `supabase/seed.sql` and `seed_demo_season.sql` — fixtures

## Notes

- Config comes from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Real values are in
  `.env.local`, which is gitignored — do not read, print, or copy it; `.env.example`
  documents the key names.
- `scripts/` is gitignored: local one-off Supabase probe scripts, not part of the build.
- Schema changes belong in a new file under `supabase/migrations/`, never by editing an
  applied migration.
