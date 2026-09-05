import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectPackage, Reliability, SourceRecord } from '../src/domain/models';
import { setFeaturePublicationState } from '../src/domain/publication';

interface CurationEntry {
  featureId: string;
  summary: string;
  openingHours?: string;
  rating?: number;
  ratingCount?: number;
  ratingProvider?: string;
  sourceName: string;
  sourceOrganisation: string;
  sourceUrl: string;
  accessedAt: string;
  reliability?: Reliability;
}

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const curationPath = resolve(process.argv[3] ?? 'data/curation/alloa-current-place-curation.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const entries = JSON.parse(await readFile(curationPath, 'utf8')) as CurationEntry[];

function validate(entry: CurationEntry): void {
  if (!entry.featureId || !entry.summary || entry.summary.length > 360)
    throw new Error(`Invalid current-place summary for ${entry.featureId || 'unknown feature'}.`);
  if (!/^https:\/\//.test(entry.sourceUrl))
    throw new Error(`A secure source URL is required for ${entry.featureId}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.accessedAt))
    throw new Error(`An ISO access date is required for ${entry.featureId}.`);
  if (entry.rating !== undefined && (entry.rating < 0 || entry.rating > 5))
    throw new Error(`Rating must be between 0 and 5 for ${entry.featureId}.`);
}

for (const entry of entries) {
  validate(entry);
  const feature = pkg.features.find((candidate) => candidate.id === entry.featureId);
  if (!feature?.tags.includes('osm-community-place'))
    throw new Error(`Curation entry ${entry.featureId} must match an imported current OSM place.`);
  const notes = [
    `description=${entry.summary}`,
    entry.openingHours ? `opening_hours=${entry.openingHours}` : undefined,
    entry.rating !== undefined ? `rating=${entry.rating}/5` : undefined,
    entry.ratingCount !== undefined ? `rating_count=${entry.ratingCount}` : undefined,
    entry.ratingProvider ? `rating_provider=${entry.ratingProvider}` : undefined,
  ]
    .filter(Boolean)
    .join('; ');
  const source: SourceRecord = {
    sourceName: entry.sourceName,
    sourceOrganisation: entry.sourceOrganisation,
    sourceRecordId: `current-place-curation:${entry.featureId}`,
    sourceUrl: entry.sourceUrl,
    accessedAt: `${entry.accessedAt}T00:00:00.000Z`,
    notes: `Current-place curation: ${notes}.`,
    reliability: entry.reliability ?? 'secondary',
  };
  feature.shortDescription = entry.summary;
  feature.sourceRecords = [
    ...feature.sourceRecords.filter((record) => record.sourceRecordId !== source.sourceRecordId),
    source,
  ];
  feature.updatedAt = new Date().toISOString();
  feature.reviewed = true;
  setFeaturePublicationState(
    feature,
    'verified',
    `${entry.accessedAt}T00:00:00.000Z`,
    `Current-place evidence checked against ${entry.sourceOrganisation}.`,
  );
  feature.reviewNotes =
    `${feature.reviewNotes ?? ''} Current-place web information reviewed against ${entry.sourceOrganisation} on ${entry.accessedAt}.`.trim();
}

await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Applied ${entries.length} source-backed current-place curation entr${entries.length === 1 ? 'y' : 'ies'}.`,
);
