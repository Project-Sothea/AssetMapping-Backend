# Production Village Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the verified cleaned village dataset to production with recoverable database and application rollback, push both repositories to main, and prepare Expo/iOS builds.

**Architecture:** Copy the migrated test dataset into a separate database on the existing production Postgres service. Keep the original production database and photo bucket intact. Change the production backend connection only after a restore rehearsal, exact row comparisons, and source/production stability checks; isolate Redis in a different logical database.

**Tech Stack:** PostgreSQL 18, postgres.js, Railway, encrypted S3 snapshot, Expo SDK 54, EAS Build.

**Spec:** User authorization on 2026-11-18, plus frontend `docs/superpowers/specs/2026-11-12-pin-villages-and-form-village-design.md` and existing native update evidence.

## Global Constraints

- Preserve the original production database, backend artifact, connection settings, Redis database and all photo objects.
- Preserve all source survey fields exactly, including SQL NULL versus empty array text and timestamp precision.
- Do not relax the existing test-only migration guards or run the conflicted old production dataset through migration 0004.
- Existing blank villages remain valid; all new pins require a village; forms derive village through the parent FK.
- Keep credentials and survey snapshots out of Git and logs; encrypt snapshots placed in object storage.
- Retain the production bundle identifier and app data; no reinstall or clear-data step.
- User explicitly authorized production cutover and main pushes; execute inline without repeated confirmation.

## Review Focus

- Interrupted imports and retries must leave the original database untouched and never partially expose the new dataset.
- NULL answers and timestamp precision must survive snapshots and restores without API transformations.
- The old application/database/cache connections must remain usable together for rollback.
- EAS cloud archives must include shared types without relying on a sibling checkout being present remotely.
- Production mobile builds must point at production and preserve the existing iOS application identity.

### Task 1: Snapshot and restore tooling

Files: backend `scripts/database-snapshot.mjs`, `scripts/export-cleaned-dataset.mjs`, `scripts/promote-cleaned-dataset.mjs`, tests and rollout documentation.

- [ ] Add failing tests for encrypted snapshot roundtrip, tamper refusal, exact NULL/timestamp preservation and restore refusal on a nonempty target.
- [ ] Implement repeatable-read snapshots of application tables and migration journal, encrypted export to the existing test bucket, strict source guard, and restore into a new named production database only.
- [ ] Rehearse a fresh restore and injected failure/retry; compare every row and migration/schema contract. Save the original production snapshot privately and encrypted in existing storage.

### Task 2: Production cutover

- [ ] Export the current source from inside the test environment; verify 208 pins, 268 forms, 13 blank villages, no orphans, no active form village columns and archived villages preserved.
- [ ] Populate a new production database and verify exact fingerprints, full survey answers, FK and journal. Recheck source and original production have not changed.
- [ ] Record the production artifact/config privately. Switch production DATABASE_URL to the new database, Redis URL to an unused logical DB, and predeploy to ordinary Drizzle migrations against the already migrated copy.
- [ ] Deploy the tested backend revision, confirm health and full API equality, then push backend main and verify its automatic deployment. Retain original database and rollback artifact.

### Task 3: Main and mobile release preparation

- [ ] Run backend build/tests/lint and frontend tests/TypeScript/lint; preserve the user's EAS production environment setting.
- [ ] Make the shared-types package available in a standalone EAS archive; inspect a clean install/archive and production API environment.
- [ ] Review the final branch changes, merge/push frontend main, then run the requested Expo/iOS build preparation using the existing app identity and production API.
- [ ] Record build IDs/status and rollback instructions; report any account/provisioning blockers accurately. Do not submit a public App Store release without an explicit request.
