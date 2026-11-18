# Production village cutover

Authorized by Jerry on 18 November 2026: promote the cleaned dataset to production with rollback, push both main branches, and start a production iOS build.

## Prepared database copies

Production Railway project: `533b3081-a0af-4253-ab93-46fd334a4d0c`; environment: `0b3e11b0-cb55-4d45-bcf6-beaf72810dd1`; backend service: `6b0e81c3-116c-450d-a1bb-4d8f17f6fb7f`.

The existing production Postgres service remains in use. Its original database `railway` is preserved with **248 pins / 226 forms**. The cleaned dataset is restored into a separate database **`sothea_village_20261118`** on that same server, with **208 pins / 268 forms / 268 archived village answers**, 13 existing blank villages and no orphan forms. The separate data-guy database service is untouched.

Source export: test deployment `751d3803-6ac1-44a1-9d31-86841b3d541f`. The immediate pre-cutover raw re-export `70e817f9-16cc-493f-8528-3b936ec7eaff` returned the same full hash at 06:22:09 UTC; the original production full hash also matched at 06:22:28 UTC. Full source and promoted-copy snapshot hash:
`a68fb6902f1c607a8dc77d5dc5db07f1c96d3e746b684a99de275b0b5798204c`.

Original production backup hash:
`61d8b496af88ee9d884a3bf70f4ac698e68a411ef0427349e129d96803bba0ee`.

Encrypted snapshots were written to the existing source and production buckets beneath `migration-backups/`, verified by reading back and decrypting, and retained privately locally. AES-256-GCM keys derive from the respective bucket's secret credential with a random salt and fixed context; preserve those credentials securely when rotating them if these snapshots are still required. The ciphertext contains no publicly readable survey values. No bucket objects or original photo files were removed. All 27 old production photo references belong to pins omitted from the cleaned dataset.

The original-production restoration was rehearsed on a disposable local PostgreSQL database. All rows, columns, indexes and constraint semantics matched. PostgreSQL 18 separately catalogs NOT NULL constraints; the PostgreSQL 16 rehearsal compares column nullability and the remaining constraints, while the actual PostgreSQL 18 production copy matched the source's entire snapshot hash exactly. Snapshot JSON is assembled inside PostgreSQL to preserve SQL NULL, answer text and microsecond timestamps.

## Deployment order and rollback

1. Before switching, re-export the raw source database and require its full snapshot hash above, and recheck the original production hash for intervening writes. Abort on a change; never discard new data to force the baseline.
2. Configure the backend's `DATABASE_URL` to the new database path on its existing private Postgres connection; set `REDIS_URL` to logical database **1**. Leave the original Redis database **0** untouched. The initial predeploy `node scripts/verify-production-cutover.mjs` refuses an unexpected dataset/target or a nonempty Redis database.
3. Deploy the feature revision, then verify production health and every API pin/form against the cleaned source. Change predeploy back to `npm run migrate` for subsequent ordinary deployments. Push backend main and verify its automatic deployment. Do not leave the one-time exact-snapshot/cache-empty guard enabled after real traffic resumes.
4. Rollback before accepting new writes: restore the saved original `DATABASE_URL` (`railway`) and original `REDIS_URL` (database 0), restore ordinary `npm run migrate`, then redeploy original production artifact **`636a936b-0c76-481a-a2e3-39863ee3fa04`** (snapshot `ffa87cbe-e936-47c1-9e61-bfe029de180c`, commit `dc3131d4ba65f025873e0a6712f82ac9d866d7a7`). A new CLI upload or source build should be used if Railway's redeploy action reuses historical environment/config snapshots; verify the actual resulting database before declaring rollback complete. No destructive down migration of the cleaned copy is needed.
5. Once new production writes exist, stop writes and back up the cleaned database before any rollback. New records remain in the cleaned database and require reconciliation into the old schema before returning users to it. Switching back alone does not copy those new records into the original database.

Private local execution records and credential files are under `/tmp/sothea-production-cutover` (restricted permissions). An independently retained copy of both encrypted snapshots, their recovery secrets and original service settings is stored outside both repositories at workspace-root `.migration-backups/2026-11-18` (directory 0700, files 0600). Both retained ciphertexts were read back and decrypted against their expected hashes. This protects recovery even if the app storage endpoints delete or overwrite a bucket copy. The original production database is also retained intact. The `/tmp` copies are supplemental and temporary. Never commit the private files.

## Mobile rollout

The iOS bundle identifier remains `com.anonymous.AssetMapApp`; update the installed application through TestFlight. The native SQLite migration was already verified without uninstalling or clearing data.

**A binary update preserves device data; it does not reconcile an old production cache with the replacement dataset.** All 268 cleaned form IDs differ from the old 226 production form IDs. Existing production users must check there are no pending/failed uploads or unsynced changes, then use the app's **Clear Local Data** and **Download** controls once to load the cleaned dataset. Do not upload an old cached snapshot into the new dataset. If any unsynced records are found, retain/export the device database and reconcile them before clearing anything. No reinstall is needed. Devices already using the cleaned test dataset should change their saved API setting to production when ready; a saved URL overrides the build default.

EAS production environment already points to `https://assetmapping-backend.up.railway.app`. A committed npm archive under frontend `vendor/` replaces the sibling-checkout dependency so an isolated Expo build can install all shared types. Run `npm run types:vendor` after backend shared-type changes and commit both the archive and lockfile.

## Verification and deployment record

- Backend: build, Node regression tests, lint; local snapshot restore/failure/retry/FK tests; original production restore rehearsal.
- Frontend: 19 suites / 125 tests, TypeScript and lint before release changes; standalone EAS archive install, tests, types and iOS export after packaging change.
- Initial production deployment, automatic main deployment and iOS build IDs: pending completion below.
