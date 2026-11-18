import { createHash } from 'node:crypto';

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
