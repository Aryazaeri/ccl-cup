# PR #29 release readiness

This is an evidence record and execution plan, **not permission to change production**. The domain cutover follows a successful #29 rollout as requested by the owner.

## Current evidence

| Gate | Evidence required | Current state |
| --- | --- | --- |
| Candidate code | Exact code revision, green GitHub checks and Vercel preview | Verified for `da06e412d235b08093efd538626badec00d32d7e` |
| Local behavior | Desktop/mobile workflows, connected saves, migration/security regressions | 94 browser checks; 24 existing connected checks plus 2 Turkish workflow checks passed. Prior SQL/Auth/Storage and fresh migration checks are recorded in the PR. |
| Production compatibility | Actual project identity, migration history, schema/policy/function drift review | Read-only production inventory captured on 28 October 2026; all 24 recorded migration definitions reconciled to repository SQL. Live-data upgrade rehearsal and full schema-drift review remain pending. |
| Recovery copy | Encrypted database/Auth export **and actual uploaded bytes**; extraction/hashes verified; copy accessible independently of the database | Pending production snapshot. Automated off-site backups remain explicitly deferred. |
| Upgrade rehearsal | Restore that production snapshot into an isolated compatible database; apply only the reviewed pending migrations; verify data counts, historical scores, roles and files | Pending; fresh seeded tests do not prove an upgrade of existing production data |
| Deployment control | Current production deployment ID and environment target; staged candidate built with production configuration; confirmed mechanism for holding/promotion of traffic | Inspected: Production tracks `main`; current code is `00b6896`; automatic domain assignment is enabled. Owner explicitly chose to leave it unchanged. A production-configured staged artifact has not been created. |
| Maintenance/recovery window | Staff writes paused by agreement, owner available, exact change order and recovery decision recorded | Pending; do not promise uninterrupted image access during private-bucket transition |
| Production acceptance | Read-only checks followed by separately approved saves or owner-performed real setup | Pending deployment; never equate local passes with live acceptance |

Production inspection used read-only inventory queries in explicit read-only transactions. No migration, deployment, role, publication, Storage setting or domain was changed. The checked-in helper was also executed end-to-end in the production SQL editor as a read-only transaction.

A gate is complete only when its evidence has been collected. Update code verification if the candidate code changes. Documentation-only follow-up commits must still pass the PR checks.

## Production inspection findings — 28 October 2026

- The live frontend points to the inspected CCL Supabase project. Counts: 23 tournaments, 133 shared clubs, 360 team entries, 2,405 players, 4,289 memberships, 885 matches, 8,350 events, 7 articles, 3 media items, 2 sponsors and 4 comments. Both staff accounts are super admins. Six tournaments are published and seventeen are drafts; no missing tournament starts or invalid date ranges were found.
- Production records 24 migration versions. Seven definitions matched repository source hashes; the other seventeen matched SQL tokens after comments/formatting normalization. Token comparison is a reconciliation aid, not proof of live schema equivalence. One permission migration was recorded twice, and three initial repository migrations have no history entry. The twelve October 27 candidate versions are absent.
- **Do not run `db push` from the ordinary repository checkout against production.** Its earlier migration IDs differ from the deployed history. A private release workspace has been prepared with the 24 recorded version IDs and the 12 unchanged candidate migrations. It is not linked to production and has not been pushed or dry-run against production. Preserve the original repository migration files and the remote history; do not repair or re-run old migrations merely to make their IDs agree.
- Required existing policies, the match-status constraint and squad-minimum/snapshot triggers were found. Candidate columns were absent, as expected. Production catalog fingerprints were retained privately. This is not a completed rehearsal or a guarantee that every real-data backfill will succeed.
- There are 879 completed matches; 109 have scores differing from the individual goal ledger. Their original scores must survive with the approved historical-result label. No legacy drawn knockout result requiring the additional shootout fallback was found by the candidate's exact predicate.
- The `club-assets` bucket is still public and contains 904 object records, approximately 80 MB by metadata. This is not a verified copy of the bytes. Supabase currently reports no managed backups.
- Vercel currently serves production deployment `9gJrDTg5ajQgSoc2ika6LhMgkGve` (`main`, `00b6896`). Production and Preview both list the two public Supabase configuration variables; secret values were not read. The live runtime's API origin was checked separately. The deployed `submit-comment` function predates this PR. Its screening API secret is present; the optional screening-policy override is absent, so the updated function will use its reviewed strict default. Secret values were not read.
- The owner declined disabling automatic production-domain assignment. **Leave that setting enabled.** Prefer preparing a candidate using the documented staged production CLI flow (`--prod --skip-domain`) after approved deployment authentication is available. Inspect/approve the exact command before use; do not create a deployment from this document. Apply the reviewed backend changes and promote the prepared artifact during the agreed window. Merge only at the coordinated point, remembering that `main` still automatically deploys.

Private inventories and the release migration manifest are retained in the owner's audit scratch directory, outside Git. They contain schema/history metadata; no backup has been created by this inspection.

## Read-only preflight

1. Confirm the Supabase project is the one used by the current public deployment and the Vercel project is `ccl-cup`. Record identifiers privately; do not reveal environment-variable values or keys.
2. Run [the read-only SQL inventory](../tools/rollout-preflight.sql). It collects counts and catalog fingerprints in a read-only transaction. It does not certify schema equivalence. If migration history exists, read its versions with the separately supplied query.
3. Compare the deployed schema, policy definitions and relevant function definitions with the migration baseline in a private workspace. Fingerprints help identify changes; matching version numbers alone do not rule out manual schema changes.
4. Produce the exact unapplied migration list. The candidate adds `202610270001`–`202610270012`, but **do not assume all twelve are absent** or that every earlier migration is recorded. Stop on divergence; do not repair migration history to silence an error.
5. In a separately prepared, correctly targeted CLI workspace, review `supabase migration list` and the migration dry run. Do not link the disposable test workspace to production. Never use production reset or seed commands.
6. Inspect the current `submit-comment` deployment and the presence/scope of its required environment settings without exposing secret values. Anonymous comments must remain pending until staff approval.
7. In Vercel, inspect the production branch, current deployment, production/preview environment scopes and traffic assignment controls. Do not merge until the chosen release sequence prevents an incompatible frontend from receiving traffic early.

## Recovery and rehearsal

- Use the existing [backup tooling and restore runbook](BACKUP_RESTORE.md) with privately supplied server credentials. Do not read `.env.local`, put secrets in command arguments/history, or transmit them in chat. An S3 account is not required for a one-off encrypted local export; retain an owner-controlled copy and the separately recoverable passphrase.
- Pause editorial/file changes during the recovery snapshot; database and Storage API exports are not atomic together. Record its timestamp and the agreed potential loss window.
- Extraction/checksum verification is necessary but is not a full restore. Restore into an isolated compatible project/database, recreate Storage buckets/policies, upload actual file bytes and compare the expected data before calling recovery verified.
- Rehearse the upgrade on that restored copy. Verify preserved historical scores, the expected date backfills, new registry/history records, role protections, draft-file privacy and published-image rendering.
- Record the previous Vercel deployment ID. Reverting only the frontend does not undo schema or Storage privacy changes. Agree a forward-fix/restore decision before release.

## Approved release sequence

1. Keep automatic domain assignment enabled, following the owner’s explicit decision. Present the owner with the exact migration list, target project, staged frontend artifact, Edge Function version, expected backfills, recovery copy and maintenance window. Obtain approval for each production change under the owner's existing rule.
2. Stage the production-configured frontend without assigning production traffic, using a mechanism verified for this Vercel project. Changing deployment settings or creating/promoting the staged build also needs the owner's approval.
3. During the agreed window, pause staff writes, apply the reviewed migrations in order and record each successful migration. Stop and inspect on failure; do not continue blindly after a partial upgrade.
4. Deploy the reviewed `submit-comment` function and promote the matching frontend in the same window. The bucket becomes private during this upgrade; old browser sessions can need a reload. Do not reopen the bucket to compensate for an old frontend.
5. Squash-merge #29 at the coordinated point in this sequence, with automatic traffic assignment understood and controlled. A squash commit has a new SHA; verify the deployed code tree matches the reviewed candidate and record the final SHA/artifact ID.
6. Verify public default/older published tournament browsing, hidden Archived/draft tournaments, fixtures, standings, historical labels, images, stories and mobile loading. Check Turkish/English staff navigation and appropriate role access.
7. For save acceptance, observe owner-performed real setup or obtain specific approval for each test write and any cleanup. Verify a new season, club/team entry with the required squad, group assignment, fixture/broadcast, player-attributed result, draft/published/scheduled story and comment moderation as applicable. Do not create or delete production fixtures from this document alone.
8. Reconcile pre/post counts and expected backfills, review errors, record acceptance and resume normal staff work. Only then confirm customer readiness.

## Existing-domain follow-up

After production acceptance, confirm the exact domain, DNS provider and preferred apex/`www` address. Inspect existing web/email DNS before proposing changes. Add the domain to the verified Vercel production project, apply its prescribed DNS records with separate approval, verify HTTPS and redirects, and review Supabase Auth URL settings and any site links that use the old hostname. Preserve existing email records. Verify the new address before redirecting or retiring any existing address. No domain or DNS changes are authorized by this plan.

References: [Supabase migration workflow](https://supabase.com/docs/guides/local-development/cli-workflows), [Vercel staged production promotion](https://vercel.com/docs/deployments/promoting-a-deployment), [Vercel existing-domain configuration](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
