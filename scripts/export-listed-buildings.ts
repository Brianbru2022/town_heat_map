import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { publicProjectPackage } from '../src/domain/publication';

const projectPaths = process.argv.slice(2);
const defaultProjects = [
  'data/projects/alloa.json',
  'data/projects/alva.json',
  'data/projects/culross.json',
  'data/projects/kincardine.json',
  'data/projects/tillicoultry.json',
  'data/projects/quarriers-village.json',
  'data/projects/biggar.json',
  'data/projects/killin.json',
];
const outputDirectory = resolve('data/exports');
const headers = [
  'project_id',
  'town',
  'selection_class',
  'hes_designation_reference',
  'feature_id',
  'listed_building_title',
  'statutory_title',
  'category',
  'designation_type',
  'statutory_status',
  'longitude',
  'latitude',
  'location_precision',
  'documented_date',
  'date_basis',
  'date_confidence',
  'source_url',
  'source_accessed_at',
  'source_attribution',
];

function escapeCsv(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function selectionClass(feature: HeritageFeature): string {
  if (feature.tags.includes('town-selection-inside-locality')) return 'inside_locality';
  if (feature.tags.includes('town-selection-heritage-buffer')) return 'heritage_buffer';
  return 'existing_project_record';
}
function hesSource(feature: HeritageFeature): SourceRecord | undefined {
  return feature.sourceRecords.find(
    (source) =>
      source.sourceOrganisation === 'Historic Environment Scotland' &&
      /^LB\d+$/i.test(source.sourceRecordId ?? ''),
  );
}
function listedBuilding(feature: HeritageFeature): boolean {
  // Some curated records retain a former LB reference after a later scheduling
  // decision. The statutory CSV must contain only current listed buildings.
  return (
    (feature.tags.includes('hes-listed-building') || Boolean(hesSource(feature))) &&
    feature.statutoryStatus === 'Listed Building' &&
    (feature.tags.includes('town-selection-inside-locality') ||
      feature.tags.includes('town-selection-heritage-buffer') ||
      feature.tags.includes('town-selection-manual-included'))
  );
}
function preferredListedBuilding(
  current: HeritageFeature | undefined,
  candidate: HeritageFeature,
): HeritageFeature {
  if (!current) return candidate;
  const rank = (feature: HeritageFeature): number =>
    Number(/listed building/i.test(feature.designationType ?? '')) * 4 +
    Number(/(?:^|:)hes-lb/i.test(feature.id)) * 2 +
    Number(Boolean(feature.documentedDateText));
  return rank(candidate) > rank(current) ? candidate : current;
}
function row(pkg: ProjectPackage, feature: HeritageFeature): string[] {
  const source = hesSource(feature);
  const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
  return [
    pkg.project.id,
    pkg.project.locality,
    selectionClass(feature),
    source?.sourceRecordId,
    feature.id,
    feature.name,
    feature.shortDescription,
    feature.designationCategory,
    feature.designationType,
    feature.statutoryStatus,
    coordinates[0],
    coordinates[1],
    feature.locationConfidence,
    feature.documentedDateText,
    feature.dateBasis,
    feature.dateConfidence,
    source?.sourceUrl,
    source?.accessedAt,
    source?.sourceOrganisation,
  ].map(escapeCsv);
}
function csv(rows: string[][]): string {
  return `\uFEFF${[headers, ...rows].map((values) => values.join(',')).join('\r\n')}\r\n`;
}

const packages = await Promise.all(
  (projectPaths.length ? projectPaths : defaultProjects).map(
    async (path) => JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  ),
);
await mkdir(outputDirectory, { recursive: true });
const combinedRows: string[][] = [];
for (const pkg of packages) {
  const publicPackage = publicProjectPackage(pkg);
  if (!publicPackage) {
    console.log(`Withheld listed-building export for ${pkg.project.locality}.`);
    continue;
  }
  const uniqueByReference = new Map<string, HeritageFeature>();
  for (const feature of publicPackage.features.filter(listedBuilding)) {
    const reference = hesSource(feature)?.sourceRecordId;
    if (reference)
      uniqueByReference.set(
        reference,
        preferredListedBuilding(uniqueByReference.get(reference), feature),
      );
  }
  const rows = [...uniqueByReference.values()]
    .sort((left, right) => {
      const leftSource = hesSource(left)?.sourceRecordId ?? left.id;
      const rightSource = hesSource(right)?.sourceRecordId ?? right.id;
      return leftSource.localeCompare(rightSource, 'en', { numeric: true });
    })
    .map((feature) => row(publicPackage, feature));
  combinedRows.push(...rows);
  await writeFile(
    resolve(outputDirectory, `${publicPackage.project.id}-listed-buildings.csv`),
    csv(rows),
    'utf8',
  );
  console.log(`Exported ${rows.length} publishable listed buildings for ${pkg.project.locality}.`);
}
combinedRows.sort(
  (left, right) =>
    left[0].localeCompare(right[0]) || left[3].localeCompare(right[3], 'en', { numeric: true }),
);
await writeFile(
  resolve(outputDirectory, 'all-towns-listed-buildings.csv'),
  csv(combinedRows),
  'utf8',
);
console.log(`Exported ${combinedRows.length} listed buildings in the combined audit CSV.`);
