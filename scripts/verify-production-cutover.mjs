import postgres from 'postgres';
import { createClient } from 'redis';

import { captureSnapshot, snapshotHash } from './database-snapshot.mjs';

const target = new URL(process.env.DATABASE_URL || '');
const redisTarget = new URL(process.env.REDIS_URL || '');
if (
  target.hostname !== 'postgres.railway.internal' ||
  target.pathname !== '/sothea_village_20261118' ||
  redisTarget.hostname !== 'redis.railway.internal' ||
  redisTarget.pathname !== '/1' ||
  process.env.RAILWAY_ENVIRONMENT_ID !== '0b3e11b0-cb55-4d45-bcf6-beaf72810dd1' ||
  process.env.RAILWAY_SERVICE_ID !== '6b0e81c3-116c-450d-a1bb-4d8f17f6fb7f'
)
  throw new Error(
    'Cutover verification requires the prepared production copy and isolated Redis database'
  );
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const redis = createClient({ url: process.env.REDIS_URL });
redis.on('error', () => {});
try {
  const snapshot = await captureSnapshot(sql);
  if (snapshotHash(snapshot) !== 'a68fb6902f1c607a8dc77d5dc5db07f1c96d3e746b684a99de275b0b5798204c')
    throw new Error('Production copy differs from the audited source; do not start');
  await redis.connect();
  if (await redis.dbSize())
    throw new Error('Selected Redis database is not empty; do not reuse another dataset cache');
  console.log(
    JSON.stringify({ productionCopyVerified: true, pins: 208, forms: 268, isolatedCache: true })
  );
} finally {
  await sql.end();
  if (redis.isOpen) await redis.quit();
}
