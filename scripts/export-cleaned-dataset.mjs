import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import postgres from 'postgres';

import { captureSnapshot, sealSnapshot, openSnapshot, snapshotHash } from './database-snapshot.mjs';

const target = new URL(process.env.DATABASE_URL || '');
if (
  process.argv[2] !== '--confirmed-test-source' ||
  target.hostname !== 'postgres-app-test.railway.internal' ||
  process.env.RAILWAY_ENVIRONMENT_ID !== '72536ee3-2165-4348-8650-f4d825cdcd04' ||
  process.env.RAILWAY_SERVICE_ID !== '3c152b3e-6d17-4145-a509-1e7518104a7c'
)
  throw new Error('Snapshot export is restricted to the audited test service');
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
try {
  const snapshot = await captureSnapshot(sql);
  const pins = snapshot.tables['public.pins'];
  const forms = snapshot.tables['public.forms'];
  const archive = snapshot.tables['public.form_village_archive'];
  if (
    pins.length !== 208 ||
    forms.length !== 268 ||
    archive?.length !== 268 ||
    pins.filter((p) => !p.cityVillage?.trim()).length !== 13 ||
    forms.some(
      (f) =>
        Object.hasOwn(f, 'village') ||
        Object.hasOwn(f, 'otherVillage') ||
        !pins.some((p) => p.id === f.pinId)
    ) ||
    pins.some((p) => {
      try {
        return JSON.parse(p.images || '[]').length > 0;
      } catch {
        return true;
      }
    })
  )
    throw new Error('Source changed from the current audited baseline; stop and re-audit');
  const client = new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION || 'auto',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  const hash = snapshotHash(snapshot);
  const Key = `migration-backups/pin-village-production-2026-11-18/${hash}.enc`;
  const Bucket = process.env.AWS_S3_BUCKET_NAME;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  await client.send(
    new PutObjectCommand({
      Bucket,
      Key,
      Body: sealSnapshot(snapshot, secret),
      ContentType: 'application/octet-stream',
    })
  );
  const verify = await client.send(new GetObjectCommand({ Bucket, Key }));
  if (
    snapshotHash(openSnapshot(Buffer.from(await verify.Body.transformToByteArray()), secret)) !==
    hash
  )
    throw new Error('Encrypted export readback verification failed');
  console.log(
    JSON.stringify({
      snapshotExported: true,
      pins: pins.length,
      forms: forms.length,
      archive: archive.length,
      hash,
      key: Key,
    })
  );
} finally {
  await sql.end();
}
