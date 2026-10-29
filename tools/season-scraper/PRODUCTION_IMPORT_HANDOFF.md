# Retained historical data for CCL Cup production

On 12 October 2026, the user requested that the scraper and historical export be
kept for later use in CCL Cup production: https://ccl-cup.vercel.app/.
The current scope is retention for later use. No production import has been performed.

## Retained files

- Scraper source and instructions: this directory and `README.md`.
- Export snapshot: `/Users/aryazaeri/Documents/ChatGPT/Soner Abi - Footy Web App/CCL Historical Seasons Export/`.
- Begin with `REVIEW.md`, `manifest.json`, `data-quality.json` and `source-diagnostics.json` in that export folder.
- Raw HTML, timestamps and hashes are retained in `cache/`; parsed records are in `details/` and `seasons/`.
- Review CSVs include season coverage, fixtures, standings, profiles, match events,
  recorded lineups, observed squads, media pages and asset references.

The snapshot contains 19 season catalogs, 872 matches, 121 clubs, 2,938 player
profiles, 392 articles, 401 albums, 154 weekly-video pages, 10 announcements and
four linked information pages. It contains 8,733 timeline events and 13,980
recorded lineup entries. Image/video/document URLs are retained; binary assets
were not downloaded. The export is local and outside the Git repository.

## Known source gaps

- 247 player-statistics URLs are explicitly deferred after a representative goals
  page timed out in a fresh verified season session. They are not all confirmed failures.
- The announcement index returns HTTP 404 in all 19 season contexts; an old About
  page also returns HTTP 404. Individual announcements were collected.
- Eight fixtures have placeholder dates. Three player profiles have no name
  (source IDs 65, 1919 and 2328). 1,992 portraits are missing or placeholders.
- Season IDs 2, 6 and 10 expose no fixtures in the archive catalog.
- `manifest.complete` remains false for these source gaps; the detail pass finished
  without interruption and all discovered football detail pages were collected.

## Requirements for the later import

1. Preserve this snapshot. Use a separate working copy or output directory for
   retries and import preparation so later source changes cannot overwrite the evidence.
2. Inspect the then-current production schema and existing records. Source IDs
   are not production IDs; maintain an explicit mapping and prevent duplicate imports.
3. Reuse club identities across seasons with separate seasonal squads/results.
   Shared source profile rosters are not proven historical squads. Recorded match
   lineups provide historical participation evidence; `observed-squads.csv` is not
   a complete registration history. Historical match pages must retain their own squads.
4. Preserve the club recorded for historical events and transfers. Reconcile
   regulation scores, shootouts and penalty events before using score synchronization;
   displayed source scores can include shootout goals.
5. Leave unknown dates, names, portraits and attributes unresolved until reviewed.
   Parsed source kickoff times have no assigned timezone. Do not invent missing data.
6. Prepare a concrete import preview and validation results before production writes.
   Handle the five-player squad minimum and season visibility according to the app's
   confirmed requirements. Do not change the current season as an incidental import step.

No database credentials are included in these artifacts. Do not read, print or
copy `.env.local`; follow the repository's credential instructions when import
work is requested.
