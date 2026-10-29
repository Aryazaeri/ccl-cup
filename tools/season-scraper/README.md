# Historical CCL season scraper

The user has requested retention for later CCL Cup production use. See
[PRODUCTION_IMPORT_HANDOFF.md](PRODUCTION_IMPORT_HANDOFF.md) for the snapshot
location, source gaps and requirements for the later import.

Read-only exporter for the historical archive linked from [cclcup.com](https://cclcup.com/):
[arsiv.cclcup.com](https://arsiv.cclcup.com/). It writes review files and never connects to Supabase.

## Run

Requires Python 3.10+ and Beautiful Soup. From the project root:

```sh
python3 -m venv tools/season-scraper/.venv
tools/season-scraper/.venv/bin/pip install -r tools/season-scraper/requirements.txt
tools/season-scraper/.venv/bin/python tools/season-scraper/scrape.py --output "/path/to/review-export"
```

All discovered archive seasons are selected by default. The archive's city form discovers
Ankara and İzmir; the menu also links Türkiye Finals. No season IDs or entity ID ranges are guessed.
The current competition on the new main website is outside this historical exporter.

Useful options:

```sh
# Export season indexes, standings, results, statistics and paginated media/news lists.
python3 tools/season-scraper/scrape.py --mode catalog --output "/path/to/review-export"

# Full run: catalog plus all discovered match, article, club and player detail pages.
python3 tools/season-scraper/scrape.py --output "/path/to/review-export"

# Reuse cached HTML from a previous/interrupted run; same command resumes automatically.
# Select one source season for a smoke run, optionally cap live requests.
python3 tools/season-scraper/scrape.py --seasons 1 --max-pages 100 --output "/path/to/smoke-export"

# Reparse a fully populated cache without contacting the source.
python3 tools/season-scraper/scrape.py --offline --output "/path/to/review-export"

# If player-statistics pages stall, collect everything else and list those URLs
# as deferred. Re-run without --statistics team to attempt them later.
python3 tools/season-scraper/scrape.py --statistics team --timeout 10 --attempts 1 --output "/path/to/review-export"

python3 -m unittest discover -s tools/season-scraper -p 'test_*.py'

# Build a readable summary, per-season coverage sheet and deduplicated asset list.
python3 tools/season-scraper/review.py "/path/to/review-export"
```

Do not run two exporters in the same output directory concurrently. Use a new directory to
refresh old snapshots. Requests are sequential with a default 0.75-second minimum spacing;
HTTP 429/temporary server failures retry up to two times by default (`--attempts` changes this).
The default socket timeout is 15 seconds (`--timeout` changes this). A present robots.txt is honored;
unexpected errors reading it stop the run. No login, form registration or source modifications.
The city-selector POST only changes the scraper's anonymous session selection.
`--workers 2` can overlap shared detail reads; season catalogs always run sequentially.
The request-spacing limit applies globally to all workers. Maximum workers: four.
Each worker uses a separate anonymous session and verifies the selected season label;
no browser sessions or credentials are used. A timed-out worker replaces its anonymous
session before its next request. `errors-live.jsonl` records detail failures during a run.

## Review files

- `seasons.json` / `seasons.csv`: discovered source IDs, cities, names, source links.
- `seasons/<id>/catalog.json`: index and pagination pages, all statistics option results,
  content sections, tables with raw cells/tooltips, source timestamps and references.
- `seasons/<id>/fixtures.csv`: names, displayed scores, kickoff dates, groups/rounds and source URLs.
- `seasons/<id>/standings.csv`: original table ranks, played/won/drawn/lost, goals and points.
- `seasons/<id>/teams.csv`: club references from that season's public catalog.
- `details/mac/<id>.json`: full match data, timeline events, recorded lineups, statistics,
  awards, media links and original text/tables.
- `details/takim/<id>.json`, `details/oyuncu/<id>.json`: shared club/player profiles,
  club roster, profile attributes, tooltips, history, images and media references.
- `details/h/<id>.json`: article text, tables and image/media URLs.
- `details/galeri/<id>.json`: full-resolution photo-album links and captions.
- `details/hafta/<id>.json`: weekly goals/saves/clips and their video embed URLs.
- `details/duyuru/<id>.json`: announcements; `f`, `ccl`, `fifex` retain linked archive information pages.
- `match-events.csv`, `match-lineups.csv`: flattened event/lineup review sheets.
- The offline `review.py` command also produces `REVIEW.md`, `season-coverage.csv`,
  `profiles.csv`, `match-coverage.csv`, `media-pages.csv`, `assets.csv` and
  `observed-squads.csv` (match-proven participation, not a complete registration list).
- `cache/`: raw HTML response snapshots, original response timestamps and SHA-256 hashes.
- `manifest.json`, `progress.json`, `errors.json`: mode, counts, coverage, limits and failed URLs.
- `deferred-statistics.json`: every statistics URL intentionally deferred using `--statistics`.

Image/video/document URLs are collected. Binary downloads from photo/video hosting services
are not performed. Hidden HTML tabs are preserved; third-party embedded players are not crawled.

## Before importing

This is a source export, not a ready-to-import database dump. Source IDs are separate from CCL Cup IDs.
Missing fields stay null or raw rather than being invented. Full text/tables retain unmodeled
statistics and media data for later mapping to the app's evolving season/club/squad schema.

1. Club/player pages contain histories and rosters spanning several seasons. Their
   `referenced_in_season_ids` lists discovery evidence, **not** proof of player registration.
   Use `match-lineups.csv` as the evidence of participation in historical matches.
2. Source scores and penalty events can include shootout goals. They are kept as displayed,
   with review flags. Do not turn every penalty event into a regulation-time goal.
3. Source labels are retained even when contradictory (for example a 2017 menu label).
   Check the selected label and actual match dates before finalizing a season.
   Parsed kickoff timestamps retain the displayed local date/time without assigning a timezone.
4. A zero count describes what the archive exposed; it does not prove no historical data exists.
5. `manifest.complete` means the selected **mode** finished without fetch errors. `catalog`
   completeness does not include detail pages. Deferred statistics, request caps/interruption/fetch failures produce
   exit code 2 and an incomplete manifest. Files remain usable for review and resumption.
6. No cross-site linked resource is assumed to be available. Legacy entity links on
   cclcup.com/fifexcup.com are redirected to their observed archive counterparts;
   the original URL is preserved in catalog references.
7. Detail discovery follows recognized archive references recursively. Matches found
   only through a profile/content page carry an empty `season_ids` list and a review
   flag until their season is established from another source.

Generated exports and the virtual environment are ignored by Git. Only scraper source,
documentation, dependency pin and regression tests belong in the repository.

## First live export (12 October 2026)

Review folder on this workspace:
`/Users/aryazaeri/Documents/ChatGPT/Soner Abi - Footy Web App/CCL Historical Seasons Export/`

Collected 19 season catalogs, 872 matches, 121 club profiles, 2,938 player profiles,
392 articles, 401 photo albums, 154 weekly-video pages, 10 announcements and four
linked information pages. Flattened sheets contain 8,733 timeline events and 13,980
recorded lineup entries. All 872 matches have both club references.

Source gaps: the announcement index returns 404 in each season and one old About
link returns 404. Player-statistics option pages are explicitly deferred (247 URLs)
after a goals page failed even in a fresh verified historical-season session; they
have not all been individually classified as failed. Profiles and match data were
collected successfully. The manifest remains incomplete for those source gaps.

`REVIEW.md`, `data-quality.json` and `source-diagnostics.json` document the final
coverage, placeholder fixture dates, unnamed profiles and placeholder portraits.
Nothing was imported into the app or its production database.

## International Corporate Cup replacement (29 October 2026)

This is an independent archive installation. The user requested all available
International Corporate Cup seasons (2022, 2023, 2024) to replace the website's
current dataset. Export it into its own directory:

```sh
python3 tools/season-scraper/scrape.py --source https://arsiv.cclcup.com/internationalcorporatecup/ --seasons 2 3 5 --output tools/season-scraper/output/international --workers 3
python3 tools/season-scraper/prepare_replacement.py tools/season-scraper/output/international tools/season-scraper/output/international-replacement
```

Use a **new empty destination** for another replacement review. The builder never
connects to a database. It preserves full source records alongside candidate
season payloads and writes checksums, reference validation and a cutover review.
`icc:` prefixes every candidate source identity/reference to prevent collisions
with domestic archive IDs. The source menu's broken Türkiye Finals link is not
an International Corporate Cup season.

The selected homepages contain fixtures and compact tables missing from, or
contradicted by, the dedicated index pages. Homepages are preserved and parsed
as competition evidence. English group/standings labels and accented profile
URLs are supported. Unknown countries are not assumed to be Turkey.

The candidate is **not a production import**. The old historical RPC has been
retired and is incompatible with the latest match/event rules. Target-schema
reconciliation, rehearsal, content publication mapping and asset mirroring
remain execution work. Keep archived scores as historical results, flag ambiguous
shootout events, and never invent missing registration or lineup data.

The current snapshot collected 63 match details, 21 club profiles, 188 player
profiles, 22 news pages, two announcements and four information pages. All
statistics options were attempted. Remaining source fetch gaps are three
announcement-index 404s and the old About-page 404. Source records include 297
events and 1,034 lineup slots; 552 lineup slots are blank archive placeholders.
The candidate has 482 identified lineup entries and 140 players with proven
season participation. All 188 player profiles remain in the bundle.

No production data or frontend demo fixtures were changed. The proposed public
cutover is to retain existing data privately and show the three ICC seasons;
review `REPLACEMENT-REVIEW.md` before authorizing that change.

### Live replacement completed — 29 October 2026

The customer explicitly requested permanent deletion of every pre-existing
season except Antalya ICC 2026, then confirmed importing ICC 2022–2024.
The cleanup deleted 24 seasons, 362 season entries and 886 fixtures. This was
actual deletion, not a publication-status change. Shared club/player registrations
and uploaded Storage bytes were retained; season deletion uses the application's
existing cascade/content-draft behavior. The protected ICC 2026 season and
DRAW CEREMONY story were preserved.

A recovery export of competition/editorial tables and import mappings was saved
and its decompressed SHA-256 verified before deletion:
`output/live-cleanup/recovery.json.gz` and `recovery-manifest.json`.
This is a scoped data recovery export, not a full Auth/Storage backup.

The replacement was rehearsed with rollback against the actual schema, then
committed as drafts. Three winner-derived knockout trees were checked before
publication. Live season IDs: 45 (2022), 46 (2023), 47 (2024); protected current
season: 1793259361662. The archive added 26 season team entries, 188 player
profiles, 63 matches, 297 source events and 476 unique recorded lineup entries
(the source contains six duplicate identified lineup slots). All temporarily
suspended historical-import validation triggers were restored before commit;
foreign keys, check constraints and RLS remained enabled.

22 archive news stories were imported as drafts because reliable original
publication dates and season ownership were absent. Album links and cover
images were preserved in those drafts. Historical scores and lineups are marked
legacy; ambiguous shootout statistics still require staff reconciliation.
Three matches labeled FINAL by the archive were classified as third place from
the recorded semi-final losers; original labels remain in the source export.

Execution artifacts and the source-to-live mapping are in `output/live-cleanup/`.
`generate_live_import.py` and `finish_live_import.py` generate rollback-first
scripts, with guards for this one-off replacement. They are **not** general
migration commands and must not be rerun against the populated live database.

### 2024 missing records — rechecked 29 October 2026

Fresh requests to all 22 public 2024 match pages (source season 5) returned a
database query error, zero identified lineup players and zero timeline events.
Scores remain available; for example, the
[ABYROY–KTZH final](https://arsiv.cclcup.com/internationalcorporatecup/mac-65-abyroy-ktzh.html)
records 2–0. Blank player links are placeholders, not player identities.

The customer chose to use the available archive and clearly flag missing
records. Preserve recorded results, show missing roster/lineup/event messages,
and do not borrow another season's players. The scraper now records `data_gaps`
in match detail JSON and `match-coverage.csv`; a fetch can succeed while these
records remain unavailable. Recheck evidence is saved separately under
`output/2024-source-recheck/RESULTS.json` so the original export is unchanged.

### ICC backfill and media move — 29 October 2026

`generate_icc_backfill.py` builds `supabase/migrations/202610290003_icc_archive_backfill.sql`
from `output/international` and the import map. It fills only what the import left empty:
player foot/position/height/weight ("Çift Ayak" = both), starting lineups and goalkeepers,
56 full-match videos (`matches.stream_url`), 52 published highlights, 188 club-registry roster
links, plain-text news bodies and the two announcements. Six archive video links that were
malformed or attached to two different matches were left out for staff review.

`202610290004_icc_media_off_archive.sql` repoints the 21 ICC crests and 21 news covers to
copies in the `club-assets` bucket (`logos/`, `articles/`); no live data references
arsiv.cclcup.com any more. Both were applied to production on 29 October 2026.
The domestic CCL export is not needed and its local copy was deleted.
