import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

interface SourceRecord {
  sourceName?: string;
  sourceOrganisation?: string;
  sourceUrl?: string;
}
interface PackRecord {
  id?: string;
  name?: string;
  documentedDateText?: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
  dateBasis?: string;
  dateConfidence?: string;
  sourceRecords?: SourceRecord[];
}
interface HeritagePack {
  title?: string;
  records?: PackRecord[];
  memorialPublicArtRecords?: PackRecord[];
  dateCompleteness?: {
    allRecordsDated?: boolean;
    allHeritageRecordsDated?: boolean;
    allMemorialPublicArtRecordsDated?: boolean;
  };
}
interface Manifest {
  entrypoint?: string;
  files?: string[];
  validationPassed?: boolean;
  allRecordsDated?: boolean;
  allHeritageRecordsDated?: boolean;
  allMemorialPublicArtRecordsDated?: boolean;
}

const packPath = resolve(process.argv[2] ?? '');
const manifestPath = process.argv[3] ? resolve(process.argv[3]) : undefined;
const expectedCount = process.argv[4] ? Number(process.argv[4]) : undefined;
if (!packPath)
  throw new Error('Usage: validate-heritage-pack <pack.json> [manifest.json] [record-count]');
if (expectedCount !== undefined && (!Number.isInteger(expectedCount) || expectedCount < 1))
  throw new Error('Expected record count must be a positive integer.');

const pack = JSON.parse(await readFile(packPath, 'utf8')) as HeritagePack;
const records = [...(pack.records ?? []), ...(pack.memorialPublicArtRecords ?? [])];
const errors: string[] = [];
const ids = new Set<string>();
for (const [index, record] of records.entries()) {
  const label = record.id ?? `record ${index + 1}`;
  if (!record.id || ids.has(record.id)) errors.push(`${label}: record IDs must be unique.`);
  ids.add(record.id ?? '');
  if (!record.name) errors.push(`${label}: a name is required.`);
  if (
    !record.documentedDateText ||
    record.earliestPossibleYear === undefined ||
    record.latestPossibleYear === undefined
  )
    errors.push(`${label}: complete date text and numeric bounds are required.`);
  if (!record.dateBasis || !record.dateConfidence)
    errors.push(`${label}: date basis and confidence are required.`);
  if ((record.sourceRecords ?? []).length === 0)
    errors.push(`${label}: at least one source record is required.`);
  if (
    record.earliestPossibleYear !== undefined &&
    record.latestPossibleYear !== undefined &&
    record.earliestPossibleYear > record.latestPossibleYear
  )
    errors.push(`${label}: earliest year is after latest year.`);
}
if (expectedCount !== undefined && records.length !== expectedCount)
  errors.push(`Expected ${expectedCount} records but found ${records.length}.`);

if (manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
  if (manifest.entrypoint !== basename(packPath))
    errors.push('Manifest entrypoint does not identify the supplied pack.');
  if (!manifest.files?.includes(basename(packPath)))
    errors.push('Manifest file list does not include the supplied pack.');
  if (manifest.validationPassed !== true)
    errors.push('Manifest does not report a passed validation.');
  const allDated =
    manifest.allRecordsDated === true ||
    (manifest.allHeritageRecordsDated === true &&
      manifest.allMemorialPublicArtRecordsDated === true) ||
    pack.dateCompleteness?.allRecordsDated === true ||
    (pack.dateCompleteness?.allHeritageRecordsDated === true &&
      pack.dateCompleteness?.allMemorialPublicArtRecordsDated === true) ||
    records.every(
      (record) =>
        Boolean(record.documentedDateText) &&
        record.earliestPossibleYear !== undefined &&
        record.latestPossibleYear !== undefined,
    );
  if (!allDated) errors.push('Manifest does not report all records dated.');
}
if (errors.length) throw new Error(`Heritage-pack validation failed:\n- ${errors.join('\n- ')}`);
console.log(`Validated ${records.length} records in ${pack.title ?? basename(packPath)}.`);
