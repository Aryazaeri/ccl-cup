# CCL Cup — Project Status

**Status date:** 24 August 2026
**Supersedes:** `PROJECT_REPORT.md` (16 August 2026), which is stale — see §1.
**Method:** full read of `src/`, `supabase/migrations/`, config and git history at `~/Desktop/ZORT/SideProjects/CCL-Cup`. No code was modified.

---

## 0. Update — 24 August 2026 (evening)

Work completed today, after the audit below was written. Items marked **RESOLVED**
in later sections were fixed in this pass.

**Standings engine — built.** `src/lib/standingsUtils.ts` derives P/W/D/L/GF/GA/GD/Pts
from completed results with the Points → GD → Goals Scored → Head-to-Head tie-break,
plus group tables, a five-match form guide, top scorers and points adjustments.
`tests/standings.test.ts` covers it with 60 assertions (`npm test`). Wired into the
public table, a new Standings admin module (no longer a stub), and `App.tsx`.

**Match persistence — fixed.** The repository never worked against the live
database; four independent faults each blocked every write. See §5.1.

**Row-level security — restored.** The `all_access` overrides are dropped; the
designed per-role policies are back in force. See §5.2.

**Credential leak — closed.** See §5.3.

**Role enforcement — added.** The admin panel now hides screens and actions the
signed-in role may not use, mirroring the database policies.

Remaining before the Wednesday demo: seed a believable demo season with real
results, deploy, pin dependencies, single-language pass.

---

## 1. Why this document exists

`PROJECT_REPORT.md` was written on 16 August. Substantial work landed on 16–17 August that it never captured, and several of its statements are now wrong. Corrections:

| `PROJECT_REPORT.md` says | Actually true on 24 Aug |
|---|---|
| "all project deliverables currently appear as untracked files. No commit was created." | **9 commits**, pushed to `origin` = `github.com/Aryazaeri/ccl-cup`. Working tree clean apart from 3 untracked WhatsApp jpegs at repo root. |
| Seasons / Players modules are placeholders | Both are **fully implemented** admin modules. |
| No result entry, no match events | Both **implemented** (`MatchScoreModal`, `MatchEventsModal`). |
| Team editing not implemented | **Implemented**, along with player, match, story and season editing. |
| Local storage key `ccl-cup:data:v2` | Now **`v7`**. |
| "Soft deletion is preferred… teams soft-deleted via `deleted_at`" | **No longer true.** All deletes are hard `DELETE`. See §5. |
| RLS is the security boundary | **No longer true.** Migration `202608160001` replaced the policies with `USING (true) WITH CHECK (true)`. See §5 — this is the most serious open item. |
| No Supabase project connected | An `.env.local` now exists (correctly gitignored). Connection state unverified from here. |
| ~1,541 lines of source | `AdminPanel.tsx` alone is now 3,484 lines / 122 KB. |

It also predates the entire canvas/builder feature set, the global player pool, multi-format seasons, and the logo trimmer.

**Recommendation:** treat `PROJECT_REPORT.md` as a historical discovery record (its §3 legacy-system audit and §12 schema design remain valuable) and this file as current state. Note both it and `ROADMAP_NOTES.md` are listed in `.gitignore`, so neither is in the repo.

---

## 2. What the project is

A tournament management platform replacing a legacy PHP football tournament site and admin panel, for the CCL Cup / Sporfest competition. Requirements came from a WhatsApp thread with **Erdem CTIS** plus a read-only audit of the incumbent system.

Two surfaces in one SPA sharing a single data source:

- `/#site` — public tournament portal
- `/#admin` — role-gated administration panel

**Stack:** React 18, TypeScript, Vite, Supabase (Postgres + Auth), Lucide icons. Deploy configs for both Vercel and Netlify. Hash-based routing; no router library.

**Design language:** navy `#071525`, grass green `#63E35B`, condensed display type, editorial rather than dashboard-y. Concept renders in `design-references/`.

---

## 3. Current state by area

### 3.1 Admin panel — module status

| Module | Status | Detail |
|---|---|---|
| Overview | Working (partly fake) | 4 live metric tiles, upcoming-match table, story pipeline counts, quick actions. **The activity feed is 4 hardcoded rows** with fabricated names and timestamps. |
| Seasons | **Complete** | Search, year filter, pagination, page-size control, backend badge, full CRUD. Three season types drive three different builders. |
| Teams | **Complete** | Table + grid views, search, country/format filters, full CRUD, squad hub, tactical canvas. |
| Players | **Complete** | Search, team filter (incl. Free Agent), position filter, full CRUD, reachable from 3 entry points. |
| Matches | Working | Status filter, create/edit/delete, score entry, event log. No search or pagination. |
| Content | Working | Story list, full CRUD, publish/unpublish toggle. No search, filter or pagination. |
| **Standings** | **Empty stub** | Renders "This prototype includes the module shell…". |
| **Media** | **Empty stub** | Same. |
| **Sponsors** | **Empty stub** | Same. |
| **Users** | **Empty stub** | Same — so roles can only be changed via SQL. |

### 3.2 Season formats and builders

Three season types (`tournament` / `league` / `group_league`), each with a dedicated drag-and-drop builder. All four builders persist to the season's Supabase JSONB columns.

- **BracketCanvasModal** — 4/8/16-team knockout. Drag or click-to-place, random auto-draw, clear.
- **LeagueCanvasModal** — single ordered league table; manual or shuffled ordering.
- **GroupLeagueCanvasModal** — 2/3/4/5/6/8 groups, round-robin auto-distribution, one team per group enforced.
- **SquadCanvasModal** — tactical pitch with 6 hardcoded formations (4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 7v7, 5v5), drag-and-drop from the player pool, auto-fill by position, bench view.

Despite the name, none of these render to an HTML `<canvas>` or export an image — "canvas" is a layout metaphor.

### 3.3 Player pool

Genuine global pool. Any player can be reassigned to any club with one update; "release" writes the sentinel `teamId: 0 / teamName: 'Free Agent'` rather than deleting. Season membership is tracked per player via `activeSeasons`.

### 3.4 Public site

Real data drives: featured/next match, results rail, stories (lead + 3), standings table, next fixtures, and three in-page modals (match details with event timeline, story reader, team roster).

Hardcoded or non-functional: hero copy, the entire media highlights section (3 static cards, no video, no click handler), "View all video" button, story date/category/summary fallbacks, footer links.

No detail *pages* exist for teams, players or matches — only modals. There is no URL for any of them.

---

## 4. Roadmap items — nothing shipped yet

None of `ROADMAP_NOTES.md` is done. Verified absent from `PublicSite.tsx`:

| Requested | State |
|---|---|
| Participant grid with country flags (Euro Business Cup style) | Absent. Flags appear only as single glyphs in standings rows. |
| Season switcher | **Visual only** — the "2026 Season ▾" button has no click handler and no state. |
| Search | Absent entirely. |
| About Us section | Absent (a footer link scrolls to the hero). |
| Live stream link + 🔴 LIVE badge | Badge renders on live matches, but **there is no stream-URL field anywhere** — nothing to link to. |
| Public comments + moderation | Absent, both surfaces. |
| Socials / WhatsApp float | Absent. |
| Auto standings + tie-breakers | Absent — see §5. |
| Auto player/team stat aggregation | Absent — see §5. |
| Auto league-vs-groups rendering (1 group → table, 2+ → A/B/C) | Partially anticipated by the season types, not implemented on the public side. |
| Player cutout over flag backdrop | Absent. |
| Mandatory team logo + flag | Fields exist; **not enforced as required**. |

---

## 5. Open issues, ranked

### P0 — The database was wide open — **RESOLVED 24 Aug**

Migration `202608160001_update_seasons_and_formats.sql` dropped the designed RLS policies and replaced them on `seasons`, `teams`, `players`, `matches` and `articles` with:

```sql
create policy "..._all_access" on public.X for all using (true) with check (true);
```

Combined with the anon key being public by design in a Vite bundle, **anyone who loads the site can insert, update and delete every row in those tables.** The comment in the migration says "for development", but nothing marks it as temporary and it is the newest policy state.

The role architecture from the initial schema — `set_user_role()`, the self-promotion guard, per-role staff policies — is still in the file but no longer governs anything.

**Fix before any public deployment.** Restore the `202608150001` policies, keep anon read-only, and gate writes on the staff-role helper.

### P0 — No role enforcement in the UI — **RESOLVED 24 Aug**

`AuthContext` defines five roles and `canAccessAdmin()` only blocks `viewer`. Inside `AdminPanel`, `profile.role` is rendered as text and never consulted. An `editor` has the same power as a `super_admin`.

### P0 — Demo credentials were a live backdoor — **RESOLVED 24 Aug**

`AuthContext.signIn` falls through to a hardcoded `admin@ccl.test` account (password redacted here — it is still in git history) granting `super_admin`, and this path runs **even when Supabase is configured** (it triggers when the Supabase call throws). Must be stripped or build-flagged before deployment.

### P1 — Standings and stats were permanently zero — **RESOLVED 24 Aug**

There is no aggregation anywhere in the codebase. Specifically:

- No util reads `matches` to compute P/W/D/L/GF/GA/GD/Pts. `leagueUtils` and `groupLeagueUtils` only shuffle and order teams.
- `TeamModal` has **no input fields** for `played`, `goalDifference` or `points` — it carries forward `initial?.points ?? 0`.
- `tournamentRepository.loadRemote()` **hardcodes `played: 0, goalDifference: 0, points: 0`** on every team, ignoring any DB values.
- Therefore in Supabase mode the standings table shows all zeros, always, and the public sort by points is meaningless.
- Player `goals`/`assists` are stored and displayed but never derived from match events, and there's no field to edit them.
- Saving a goal event does not change the scoreline, and vice versa — the two are unreconciled.
- The public standings sort is `b.points - a.points` only: **no GD or goals-scored tie-break**, contrary to the roadmap's Pts > GD > GF > H2H requirement.

This is the single largest functional gap: it's the core of what a tournament platform does.

### P1 — Silent Supabase fallback masks failures

```js
async load() {
  try { return await loadRemote() } catch { return loadLocal() }
}
```

Any Supabase error — auth, network, schema mismatch — silently serves browser-local data while the admin badge still reads "Supabase". Failures become invisible. Log and surface instead.

### P1 — Match persistence entirely broken — **RESOLVED 24 Aug**

`loadRemote()` orders matches by `kickoff_at` but maps `new Date(String(m.kickoff))`. If the column is `kickoff_at`, every remote match date and time is `Invalid Date`. Worth verifying against the live schema immediately.

### P1 — Draft fixtures leaked to the public site — **RESOLVED 24 Aug**

`loadRemote()` sets `status: 'Scheduled'` on **every** match unconditionally. Since `App.tsx` filters the public site by `status === 'Scheduled'`, draft fixtures are published to the public site in Supabase mode. Similarly, story status collapses to Published/Draft, so the `Scheduled` state is unreachable remotely.

### P1 — Deleting anything is instant and irreversible

Zero confirmation dialogs in the entire admin panel — seasons, teams, players, matches, events and stories all delete on one click. And soft-delete is gone: the repository issues hard `DELETE` on every entity. Deleting a team also cascades away its players locally.

### P2 — Data-model looseness

- **IDs are `Date.now()`** client-side for every entity — collision-prone, and it means clients dictate primary keys.
- **`activeSeasons` is a string array** of display labels (`"2026 - Summer League"`), not season IDs. Renaming a season orphans every player's history. The literal `'2026 - Summer League'` fallback appears ~8 times in `AdminPanel` and again in the repository and migration default.
- **Matches are not season-scoped** — `MatchForm` has no season field, only a free-text `stage` defaulting to `"Group A"`. With concurrent sub-tournaments on the roadmap, this needs fixing early.
- **Match date is free text** (`"18 Aug"`), parsed against the *current* year in UTC. Wrong year at rollover, wrong offset for Istanbul.
- **`tournamentFormat` mismatch:** the Teams filter offers `Champions Cup / Challenge Cup / Open League`, but `TeamModal` writes the season's `fullName` into that field — so the filter will essentially never match saved data.
- Match events never store `teamId`, only `teamName`.
- Substitutions are single-player events with no on/off pairing.

### P2 — Engineering hygiene

- `package.json` uses `"latest"` for react, react-dom, vite, typescript and all of eslint — builds are not reproducible. Pin them.
- `lint` script exists; **no ESLint config file** in the repo, so it fails.
- No tests of any kind. The five `scripts/test-*.mjs` files are ad-hoc DB connection probes, not a suite — and `scripts/` is gitignored.
- Mixed Turkish/English UI: Seasons and all squad/pool UI are Turkish, Teams/Players/Matches/Content English, occasionally in the same view. Phase 1 is meant to be English-only.
- Dead code: unused imports in several files; `onDeletePlayer` threaded into `TeamModal` and `QuickSquadModal` but never called in either; `MatchScoreModal` receives `teams` unused; `SeasonModal` has a duplicate second save path for the builders.
- `bracketUtils.generateEmptyBracket(32)` mislabels its first round as "Round of 16".
- `championSlot` exists in the type and in `generateEmptyBracket` but is never rendered or settable; the podium is decorative.
- No round-to-round progression in brackets — winners do not advance.
- 3 untracked WhatsApp jpegs sitting at repo root.

---

## 6. Recommended order of work

**Now, before anything is publicly reachable**

1. Restore real RLS policies; make anon read-only.
2. Remove or build-flag the `admin@ccl.test` fallback.
3. Enforce roles in `AdminPanel`, not just at the admin door.
4. Verify `kickoff` vs `kickoff_at` against the live schema.
5. Add delete confirmations; restore soft-delete for teams and players.

**Then — the actual product gap**

6. Build the standings engine: derive P/W/D/L/GF/GA/GD/Pts from completed matches, with the Pts > GD > GF > H2H tie-break. Stop hardcoding zeros in `loadRemote`.
7. Derive player goals/assists from match events; reconcile events against the scoreline.
8. Build the Standings admin module (override/adjustment, penalties).
9. Season-scope matches; replace free-text dates with a real date-time picker.
10. Migrate `activeSeasons` from labels to season IDs.

**Then — roadmap features**

11. Participant grid with flags; About Us; socials/WhatsApp.
12. Stream URL field + working LIVE link-out.
13. Real routes and detail pages for teams, players and matches (this is also the SPA-vs-Next.js decision point — make it before building more pages).
14. Functional season switcher and search.
15. Comments with moderation; Media and Sponsors modules.

**Then — hardening**

16. Pin dependencies; add the ESLint config; add tests.
17. Single-language pass (English for phase 1), then i18n.
18. Surface Supabase errors instead of silently falling back.
19. SEO/social metadata; accessibility audit.

---

## 7. File map

```
src/
  App.tsx                     view routing, repository orchestration, admin guard
  types.ts                    all shared TS models
  data.ts                     local seed dataset
  auth/AuthContext.tsx        Supabase + demo auth, roles
  services/tournamentRepository.ts   dual local/Supabase persistence (21 KB)
  lib/
    bracketUtils.ts           empty-bracket generation, random seeding
    leagueUtils.ts            league slot ordering (no standings math)
    groupLeagueUtils.ts       group generation, round-robin distribution
    countries.ts, presetLogos.ts, imageTrimmer.ts
    supabase.ts               guarded client init
  components/
    AdminPanel.tsx            122 KB — every admin module and modal
    PublicSite.tsx            public portal + 3 detail modals
    SquadCanvasModal.tsx      tactical pitch / formation builder
    BracketCanvasModal.tsx    knockout builder
    LeagueCanvasModal.tsx     single-table builder
    GroupLeagueCanvasModal.tsx multi-group builder
    ImageTrimmerModal.tsx     logo crop/pan/zoom/rotate → 512px data URL
    TeamLogoPicker.tsx        upload (8 MB cap) or preset gallery
    LoginPage.tsx, Modal.tsx, Brand.tsx, TeamMark.tsx
  styles.css                  97 KB design system

supabase/
  migrations/202608150001_initial_schema.sql        13 tables, constraints, indexes, real RLS
  migrations/202608160001_update_seasons_and_formats.sql   format columns + OPEN RLS (see §5)
  migrations/202608170001_update_players_table.sql  stats, captain, nationality, activeSeasons
  seed.sql
```

`AdminPanel.tsx` at 3,484 lines holds ten modules and roughly a dozen modal components. Splitting it per module is worth doing before the remaining four modules are built.

---

## 8. Running it

```bash
cd ~/Desktop/ZORT/SideProjects/CCL-Cup
npm install
npm run dev
```

Public site `http://127.0.0.1:5173/#site` · Admin `http://127.0.0.1:5173/#admin`

Backend selects itself: real `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` in `.env.local` → Supabase; placeholder or missing → browser-local mode under key `ccl-cup:data:v7`.

---

## 9. One-line summary

A capable, visually finished tournament **admin tool** with real multi-format season builders and a working player pool — sitting on a database whose row-level security is currently disabled, and still missing the standings/statistics engine that is the point of the product.
