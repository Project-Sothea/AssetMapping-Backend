import { createHash } from 'node:crypto';

export function matchesAuditedBaseline(snapshot, baseline, apiFixture = false) {
  // Local rehearsals seed decoded API rows. Remote DDL must match the separately
  // audited raw SQL fingerprint, including NULL versus empty-array distinctions.
  const expected = apiFixture ? baseline.fingerprint : baseline.databaseFingerprint;
  return typeof expected === 'string' && fingerprint(snapshot.pins, snapshot.forms) === expected;
}

export function fingerprint(pins, forms) {
  const normalize = (rows) =>
    rows
      .map((row) =>
        Object.fromEntries(
          Object.keys(row)
            .sort()
            .map((key) => {
              let value = row[key];
              if (value instanceof Date) value = value.toISOString();
              // The API decodes JSON text columns; normalize SQL and API representations equally.
              if (typeof value === 'string' && value.trimStart().startsWith('[')) {
                try {
                  const parsed = JSON.parse(value);
                  if (Array.isArray(parsed)) value = parsed;
                } catch {
                  /* Preserve non-JSON answers. */
                }
              }
              return [key, value];
            })
        )
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  return createHash('sha256')
    .update(JSON.stringify({ pins: normalize(pins), forms: normalize(forms) }))
    .digest('hex');
}
