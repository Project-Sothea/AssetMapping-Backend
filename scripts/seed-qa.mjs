import { randomUUID } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';
import { createClient } from 'redis';

const loaded = loadEnv({ path: '.env.qa' });
if (loaded.error) {
  throw new Error('Could not load .env.qa. Copy .env.qa.example to .env.qa first.');
}

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
const redisUrl = new URL(process.env.REDIS_URL ?? '');
if (
  databaseUrl.hostname !== '127.0.0.1' ||
  databaseUrl.port !== '55433' ||
  databaseUrl.pathname !== '/soform_qa' ||
  databaseUrl.username !== 'soform_qa'
) {
  throw new Error('Refusing to seed: DATABASE_URL must point to the local soform_qa database.');
}
if (redisUrl.hostname !== '127.0.0.1' || redisUrl.port !== '16380' || redisUrl.pathname !== '/0') {
  throw new Error('Refusing to seed: REDIS_URL must point to the local QA Redis database.');
}

const scale = Number(process.argv[2] ?? process.env.QA_SCALE ?? 1);
if (![1, 2, 5, 10].includes(scale)) {
  throw new Error('QA scale must be one of: 1, 2, 5, 10.');
}

const basePinCount = 209;
const baseFormCount = 278;
const pinRows = Array.from({ length: basePinCount * scale }, (_, index) => {
  const number = String(index + 1).padStart(4, '0');
  const baseIndex = index % basePinCount;
  const batch = Math.floor(index / basePinCount);
  const north = baseIndex < 105;
  const gridIndex = north ? baseIndex : baseIndex - 105;
  const clusterLat = (north ? 37.7749 : 37.7849) + batch * 0.01;
  const clusterLng = (north ? -122.4194 : -122.4094) + batch * 0.01;
  return {
    id: randomUUID(),
    lat: clusterLat + Math.floor(gridIndex / 15) * 0.0005,
    lng: clusterLng + (gridIndex % 15) * 0.0005,
    name: 'QA-PIN-' + number,
    cityVillage: north ? 'QA North' : 'QA South',
    description: 'Synthetic QA map pin ' + number,
    type: 'household',
    status: 'synced',
    images: '[]',
  };
});

const formPinIndexes = [];
for (let index = 0; index < 48; index += 1) formPinIndexes.push(0);
for (let pinIndex = 1; pinIndex <= 50; pinIndex += 1) {
  formPinIndexes.push(pinIndex, pinIndex);
}
for (let pinIndex = 51; pinIndex <= 180; pinIndex += 1) formPinIndexes.push(pinIndex);
if (formPinIndexes.length !== baseFormCount) {
  throw new Error('The base synthetic form distribution must contain 278 forms.');
}
const scaledFormPinIndexes = Array.from({ length: scale }, (_, batch) =>
  formPinIndexes.map((pinIndex) => pinIndex + batch * basePinCount)
).flat();

const arrayColumns = [
  'longTermConditions',
  'managementMethods',
  'conditionDifficultyReasons',
  'selfCareActions',
  'medicinePurchaseLocations',
  'noToothbrushOrToothpasteReasons',
  'diarrhoeaDefinition',
  'diarrhoeaActions',
  'commonColdSymptoms',
  'commonColdActions',
  'mskInjuryDefinition',
  'mskInjuryActions',
  'hypertensionDefinition',
  'hypertensionActions',
  'unhealthyFoodReasons',
  'highCholesterolDefinition',
  'highCholesterolActions',
  'diabetesDefinition',
  'diabetesActions',
  'waterSources',
  'unsafeWaterTypes',
  'waterFilterNonUseReasons',
];
const formColumns = [
  'id',
  'pinId',
  'status',
  'villageId',
  'name',
  'village',
  'gender',
  'age',
  'dataCollectionDate',
  'householdNumber',
  'canAttendHealthScreening',
  'handwashingBeforeMeals',
  'pressingHealthNeed',
  ...arrayColumns,
];

const formRows = scaledFormPinIndexes.map((pinIndex, index) => {
  const number = String(index + 1).padStart(4, '0');
  const pin = pinRows[pinIndex];
  const row = {
    id: randomUUID(),
    pinId: pin.id,
    status: 'synced',
    villageId: 'QA-' + number,
    name: 'QA Synthetic Household ' + number,
    village: pin.cityVillage,
    gender: ['Female', 'Male', 'Unspecified'][index % 3],
    age: 1 + (index % 85),
    dataCollectionDate: '2026-10-' + String(1 + (index % 28)).padStart(2, '0'),
    householdNumber: 'QA-' + number,
    canAttendHealthScreening: [true, false, null][index % 3],
    handwashingBeforeMeals: ['Yes', 'No', null][index % 3],
    pressingHealthNeed:
      index === 277 ? 'Synthetic long answer for QA stress '.repeat(40) : 'Synthetic QA answer',
  };
  for (const column of arrayColumns) row[column] = '[]';
  row.medicinePurchaseLocations =
    index % 4 === 0 ? JSON.stringify(['QA synthetic market']) : '[]';
  row.waterSources = index % 5 === 0 ? JSON.stringify(['QA synthetic source']) : '[]';
  row.longTermConditions = index % 7 === 0 ? JSON.stringify(['QA synthetic condition']) : '[]';
  return row;
});

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const redis = createClient({ url: process.env.REDIS_URL });

async function insertRows(tx, table, columns, rows) {
  const columnSql = columns.map((column) => '"' + column + '"').join(', ');
  const maxRowsPerInsert = Math.floor(60000 / columns.length);
  for (let start = 0; start < rows.length; start += maxRowsPerInsert) {
    const batch = rows.slice(start, start + maxRowsPerInsert);
    const rowSql = batch
      .map((_, rowIndex) => {
        const placeholders = columns
          .map((_, columnIndex) => '$' + (rowIndex * columns.length + columnIndex + 1))
          .join(', ');
        return '(' + placeholders + ')';
      })
      .join(', ');
    const values = batch.flatMap((row) => columns.map((column) => row[column]));
    await tx.unsafe('INSERT INTO ' + table + ' (' + columnSql + ') VALUES ' + rowSql, values);
  }
}

try {
  await sql.begin(async (tx) => {
    await tx.unsafe('DELETE FROM forms');
    await tx.unsafe('DELETE FROM pins');
    await insertRows(
      tx,
      'pins',
      ['id', 'lat', 'lng', 'name', 'cityVillage', 'description', 'type', 'status', 'images'],
      pinRows
    );
    await insertRows(tx, 'forms', formColumns, formRows);
  });

  await redis.connect();
  await redis.flushDb();
  console.log(
    'Seeded',
    pinRows.length,
    'synthetic pins and',
    formRows.length,
    'synthetic forms at',
    scale + 'x.'
  );
  console.log('Empty pin for the offline-save pilot:', pinRows[basePinCount - 1].id);
  console.log('Each 209-pin batch has 48 forms on its first pin and 28 pins with no forms.');
} finally {
  if (redis.isOpen) await redis.quit();
  await sql.end();
}
