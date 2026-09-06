import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { hasHistoricTimelineDate } from '../src/domain/timeline';
import { spreadsheetSafeCsvCell } from '../server/csv';

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
  'feature_id',
  'feature_name',
  'alternative_names',
  'feature_type',
  'designation_type',
  'statutory_status',
  'evidence_scope',
  'geometry_type',
  'longitude',
  'latitude',
  'location_type',
  'location_confidence',
  'current_date_text',
  'current_date_basis',
  'current_date_confidence',
  'published_review_status',
  'primary_source_organisation',
  'primary_source_name',
  'primary_source_record_id',
  'primary_source_url',
  'source_accessed_at',
  'all_source_record_ids',
  'review_notes',
  'review_action',
];

function primarySource(feature: HeritageFeature): SourceRecord | undefined {
  return (
    feature.sourceRecords.find((source) => source.reliability === 'official_statutory') ??
    feature.sourceRecords.find((source) => source.reliability === 'official_non_statutory') ??
    feature.sourceRecords[0]
  );
}

function row(pkg: ProjectPackage, feature: HeritageFeature): string[] {
  const source = primarySource(feature);
  const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : [];
  return [
    pkg.project.id,
    pkg.project.locality,
    feature.id,
    feature.name,
    feature.alternativeNames.join(' | '),
    feature.featureType,
    feature.designationType,
    feature.statutoryStatus,
    feature.evidenceScope ?? 'parish_evidence',
    feature.geometry?.type,
    coordinates[0],
    coordinates[1],
    feature.locationType,
    feature.locationConfidence,
    feature.documentedDateText,
    feature.dateBasis,
    feature.dateConfidence,
    feature.reviewed ? 'reviewed' : 'unreviewed',
    source?.sourceOrganisation,
    source?.sourceName,
    source?.sourceRecordId,
    source?.sourceUrl,
    source?.accessedAt,
    feature.sourceRecords
      .map((item) => item.sourceRecordId)
      .filter(Boolean)
      .join(' | '),
    feature.reviewNotes,
    'Check the linked source for an explicit date or supported date range; do not infer a construction date from a current map or generic classification.',
  ].map((value) => spreadsheetSafeCsvCell(value));
}

function csv(rows: string[][]): string {
  return `\uFEFF${[headers.map((value) => spreadsheetSafeCsvCell(value, false)), ...rows]
    .map((values) => values.join(','))
    .join('\r\n')}\r\n`;
}

const packages = await Promise.all(
  (projectPaths.length ? projectPaths : defaultProjects).map(
    async (path) => JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  ),
);
await mkdir(outputDirectory, { recursive: true });
const combinedRows: string[][] = [];
for (const pkg of packages) {
  const rows = pkg.features
    .filter(
      (feature) =>
        feature.evidenceScope !== 'out_of_scope' &&
        feature.evidenceScope !== 'related_context' &&
        !hasHistoricTimelineDate(feature) &&
        !feature.tags.includes('current-context'),
    )
    .sort(
      (left, right) =>
        left.featureType.localeCompare(right.featureType) || left.name.localeCompare(right.name),
    )
    .map((feature) => row(pkg, feature));
  combinedRows.push(...rows);
  await writeFile(
    resolve(outputDirectory, `${pkg.project.id}-undated-heritage-review.csv`),
    csv(rows),
    'utf8',
  );
  console.log(
    `Exported ${rows.length} undated historic-evidence review record(s) for ${pkg.project.locality}.`,
  );
}
combinedRows.sort(
  (left, right) =>
    left[1].localeCompare(right[1]) ||
    left[5].localeCompare(right[5]) ||
    left[3].localeCompare(right[3]),
);
await writeFile(
  resolve(outputDirectory, 'all-towns-undated-heritage-review.csv'),
  csv(combinedRows),
  'utf8',
);
console.log(
  `Exported ${combinedRows.length} undated historic-evidence review record(s) in the combined CSV.`,
);
