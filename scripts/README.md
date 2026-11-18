# Pin-owned village migration

Only the audited **migration-test** app/database may run these scripts remotely. Production is deliberately rejected by host, environment ID, service ID and complete dataset fingerprint. Do not replace the fingerprint to bypass a failed audit.

The original API and direct SQL fingerprints are both recorded. A read-only deployment audit (`80d21412-3667-4901-a5bd-bf190008d2c4`) verified that their only differences are NULL array-answer columns decoded as `[]` by the API. Remote migration requires the exact raw SQL fingerprint, preserving that distinction; localhost rehearsals use the API fingerprint because their rows were seeded from the decoded API. `audit-village-baseline.mjs` is diagnostic only and intentionally exits before migration/startup.

Forward migration (Railway pre-deploy, using the service's existing DATABASE_URL):

```sh
node scripts/migrate-pin-village.mjs --confirmed-test-target
```

The transaction locks pins/forms, verifies 208 pins, 268 forms, 13 blank pins and zero conflicts/orphans/otherVillage answers, and copies **all** pins/forms into a unique `village_backup_<timestamp>_<random>` schema in the same database. It archives the retired fields separately, removes them from active forms, and compares every remaining form field before committing. A failure rolls back the database changes. Repeated successful execution is harmless. JSON/SQL snapshots in `/tmp` are supplementary and ephemeral; the database backup schema is the durable rollback copy. No backup data is logged.

Rollback (stop app writes first, execute from this revision with the same test service variables):

```sh
node scripts/rollback-pin-village.mjs --confirmed-test-target
```

Then clear the migration pre-deploy command and restore the previous backend artifact `463ee2bc-e52a-4a8c-b794-1c14b078df08`. Restore the old source/build/deploy settings as recorded in the frontend rollout record. Do not run the forward pre-deploy command again while restoring the old backend. Rollback retains newly collected forms and other current answers, restores archived villages for unchanged parents and uses the current pin village for new forms or edited parents. Backup schemas remain intact. Older app versions and the new schema must not be mixed.

A reapply after rollback is accepted only if the complete dataset still matches the audited baseline. New data requires a fresh audit, not bypassing this guard.

Local verification, on an **empty disposable localhost database**, with the old test API still available:

```sh
npm run build
node --test tests/village-contract.test.mjs
TEST_DATABASE_URL=postgres://127.0.0.1:55434/empty_database node scripts/test-village-migration.mjs
```

This test refuses nonempty databases. It exercises full-data preservation, conflicting/changed baseline refusal, failure after backup, retry, idempotence, rollback, reapply, new-form preservation and post-migration parent-village edits. It fetches the legacy baseline API, so run it before the remote rollout or supply a separately restored legacy test dataset.
