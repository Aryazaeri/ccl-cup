# Rollout review

Production remains unchanged. These instructions are a reviewable candidate, not deployment approval.

Use the [release-readiness evidence record](ROLLOUT_READINESS.md) to track the production compatibility, recovery, rehearsal and traffic-control gates before merging #29.

1. Review the working-tree diff and confirmed rules. Preserve the original applied migrations; the October 27 candidate migrations add safeguards and features forward. Do not run seed files on production.
2. Obtain approval for the specific production migration, Edge Function and frontend deployment steps. Inspect actual migration history/schema drift first. Reconcile imported tournament dates, unmatched historical scores and existing roster snapshots without inventing data. The candidate backfills missing starts from the earliest match and labels historical results.
3. Before database changes, take an owner-controlled recovery snapshot including database/Auth and uploaded file bytes, and verify extraction. Off-site account setup is deferred; disclose that limitation before requesting a production rollout. Keep a tested recovery path and the previous deployed frontend artifact.
4. In a maintenance window, apply unapplied candidate migrations in order and deploy the updated frontend and submit-comment Edge Function. The private Storage bucket and signed-image rendering depend on each other: old clients can lose image access during this transition. Do not relax draft privacy to work around an old client.
5. Use production read-only checks first: anonymous default tournament, published fixtures, standings, historical labels, public images and hidden drafts; then signed-in role boundaries and super-admin safeguards. Any production save test needs its own explicit permission.
6. Confirm scheduled-story visibility at the boundary, all manual comment moderation, operator/editor Storage separation and the final-super-admin rule. Compare existing tournament/club/player counts before/after and review only the intended date/rules/result labels backfills.
7. If validation fails, keep staff writes paused and investigate. Prefer a forward correction for database changes. Reverting only the frontend will not reverse the private-bucket or role changes; coordinate rollback or an explicitly approved restore.

Local checks cover the configured rules, fresh migration chain, SQL permissions, real synthetic Auth/Storage and browser workflows. They do not prove remote OAuth/email settings, provider backups, or production writes. See the original audit evidence under the owner's local scratch directory for pre-fix findings.

The audit administrator persona is **Deniz**, using the super-admin role to inspect the full product, with test mutations confined to the isolated local database. The existing second super-admin and intentionally public QA content are expected data, not cleanup targets.
