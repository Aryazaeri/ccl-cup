# CCL Cup

Football tournament administration and public results portal, built with React 19, TypeScript, Vite and Supabase (Postgres, Auth and Storage).

The app supports single leagues, groups and knockout competitions, shared club/player identities, tournament squads, match-specific lineups, player-attributed scoring, staff suspensions, editorial publishing, moderated comments and staff permissions. The [confirmed competition rules](docs/COMPETITION_RULES.md) define the intended behavior.

## Local development

Use Node 22.12 or newer, then `npm ci`. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using `.env.example`. These are browser configuration values; never put database passwords, service-role keys or provider secrets in `VITE_` variables.

Apply migrations from `supabase/migrations/` in filename order to a disposable local Supabase project. `supabase/seed.sql` is a rule-compliant development fixture; **never run it against production**. `npm run dev` starts the app at `http://127.0.0.1:5173`: public portal `/#site`, staff panel `/#admin`.

For an isolated demo without reading project environment files, use `node tools/test-server.mjs 5180`. Demo changes stay in browser localStorage and do not verify server permissions. A configured backend failure is shown with a Retry action rather than substituted sample data.

## Competition workflow

Register a club independently, then enter it into a tournament with a new squad of at least five. Save league/group assignments or knockout seeds in the canvas. In Matches, select the tournament and use Plan fixtures to preview one meeting per pair before saving. Every fixture in a published tournament is public.

Select actual match starters/substitutes from the club default, record player goal events, then explicitly mark the match completed. Normal scores are calculated; staff forfeits are separate decisions. Complete table games before qualification. Configure the qualifier count and first-round pairings per tournament; generate later knockout rounds once opponents are known. Unresolved football ties require staff-recorded drawing-of-lots order.

Use **Broadcast URL** when scheduling or editing a match. A specific YouTube video or live-event link adds an embedded player before kickoff and promotes the next scheduled broadcast on the public page. Visitors press Play to load YouTube; its scripts are absent from the initial page load. Live broadcasts take priority, and postponed matches are not promoted. Other broadcast services retain an external link.

The public portal loads the tournament list plus the selected tournament's records, and fetches another tournament when selected or opened through a shared detail link. Initial reads are deduplicated, pagination uses exact counts to avoid empty final requests, and Storage image signatures are batched. Staff login loads its workspace only after the profile is verified. Connection failures remain visible with Retry; they never substitute sample data.

Stories and media start as drafts. Scheduled stories use an Istanbul publication date/time. Uploaded draft files remain private. Visitor comments always require a human moderator.

## Verification

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:browser
```

Browser tests exercise desktop/mobile workflows with isolated local data. Their server explicitly avoids `.env.local`. API/Storage tests require a separate disposable local Supabase stack and synthetic staff accounts; set `CCL_TEST_WORKDIR` to its workdir, then run `npm run test:connected`. The runner rejects a linked or remote project. Never direct these mutation tests at production.

Database regression files `tests/database-security.sql`, `tests/database-competition.sql` and `tests/database-clock-suspensions.sql` run as the local database owner and roll back their synthetic data. `tests/storage-security.mjs` and `tests/role-concurrency.py` additionally verify real Auth/Storage and concurrent role changes in that disposable stack.

## Deployment and recovery

Build with `npm run build`; publish `dist/`. Vercel and Netlify SPA routing files are included. Review the [rollout checklist](docs/ROLLOUT.md) before applying changes to an existing database. Frontend, database policies and the submit-comment Edge Function must be deployed together in a controlled window.

The owner requires separate approval for every production change. Nothing in this local work authorizes deployment or production data changes.

Daily encrypted off-site backups with 30-day retention are prepared but activation is deferred. See the [backup and restore runbook](docs/BACKUP_RESTORE.md). Backups must include actual uploaded bytes, and a hosted restore drill remains required after setup.
