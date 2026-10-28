# Backup and recovery

**Activation is deferred at the owner's request. No production backup job or bucket has been activated.** The intended schedule is daily, retaining encrypted archives for 30 days. Off-site storage requires an owner-controlled S3-compatible bucket and credentials. The current app does not use vector/analytics Storage buckets.

## Create an archive

Run `npm run backup` in a trusted server environment. Supply secrets through the runner's private secret store; never put them in browser variables, source files, command history or chat.

Required environment names:

- `CCL_BACKUP_DATABASE_URL`: direct/session-pooler database connection usable by Supabase CLI.
- `CCL_BACKUP_SUPABASE_URL` and `CCL_BACKUP_SERVICE_KEY`: server-only Storage access.
- `CCL_BACKUP_PASSPHRASE`: at least 24 characters; keep a separate recoverable copy in the owner's password manager.
- `CCL_BACKUP_OUTPUT`: a new path for the encrypted `.cclbak` file.

Optional off-site configuration: `CCL_BACKUP_BUCKET`, `CCL_BACKUP_S3_ENDPOINT` (HTTPS), `CCL_BACKUP_S3_REGION`, `CCL_BACKUP_ACCESS_KEY_ID`, `CCL_BACKUP_SECRET_ACCESS_KEY`. The dedicated prefix is `ccl-backups/`. `CCL_BACKUP_MAX_BYTES` defaults to 9 GB; exceeding it fails without deleting existing backups. This is a storage guard, not a provider billing guarantee.

Requirements: Node 22+, Docker and Supabase CLI. The tool captures roles, application schema/data, Auth records, Storage schema/policies for review, bucket configuration and actual object bytes. Storage internal table rows are deliberately excluded from the data restore: uploading the saved bytes recreates their object metadata. Database backups alone do not include file bytes. Avoid concurrent editorial/file changes while taking a recovery snapshot; the database dump and Storage API export are not one atomic snapshot.

Plaintext temporary exports are removed after encryption. Archives use AES-256-GCM with a scrypt-derived key and fresh salt/nonce. File hashes are in the encrypted manifest. An upload must succeed before retention cleanup; failed cleanup is reported as a job failure. Use a dedicated bucket, keep provider caps/alerts enabled, and verify retention includes object versions.

## Review and restore into an isolated project first

1. Download one archive privately. Set `CCL_RESTORE_ARCHIVE`, `CCL_BACKUP_PASSPHRASE`, and a **new** `CCL_RESTORE_DIRECTORY`; run `npm run backup:extract`. It authenticates the archive, rejects links/path traversal, and verifies SQL and file hashes. Extraction never connects to a database. Treat the extracted Auth records and dumps as secrets.
2. Prepare a new Supabase project with compatible Postgres, Auth and Storage versions. Match extensions and service configuration; database dumps do not restore dashboard secrets, OAuth settings, Edge Function secrets or deployment environment variables.
3. Review `roles.sql`, `schema.sql`, `data.sql` against Supabase's current restore procedure. Restore custom roles/schema/data in a transaction with triggers disabled **only during the approved restore**. Existing tables require an explicit reset/merge plan. Never run a destructive reset on production as a trial. Keep the original source available.
4. Review `storage-schema.sql` and restore the application's custom Storage policies/grants. Do not overwrite Supabase-managed Storage tables/functions wholesale. Create buckets from `manifest.json` through the Storage API, preserving private/public settings and file restrictions. Upload each `objects/<hash>` to its recorded bucket/path/content type using server credentials. This recreates object metadata and stored canonical URLs. Fail on missing bytes/checksum errors.
5. Compare table counts, sample historical scores, goal ledgers, player memberships, roles and every restored object hash. Run the database security, competition and suspension regressions plus connected UI/Storage checks against that isolated project. Verify anonymous draft files remain private and published files display.
6. Only after an isolated restore passes, obtain the owner's explicit approval for a production restore/cutover. Remove extracted plaintext once verification is complete. Record restore date, archive timestamp, elapsed restore time and any loss window.

The local implementation was exercised with encrypted dump extraction and a real uploaded file. Off-site upload, provider retention and a complete hosted-project disaster recovery drill remain unverified until activation.

References: [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Supabase project cloning](https://supabase.com/docs/guides/platform/clone-project). Recheck the current hosted restore procedure before use.
