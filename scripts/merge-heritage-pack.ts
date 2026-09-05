import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Geometry } from 'geojson';
import type {
  Confidence,
  DataSourceDefinition,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { hasEstablishedDate } from '../src/domain/timeline';
import { validateFeatures } from '../src/domain/validation';

interface PackRecord {
  id: string;
  name: string;
  alternativeNames?: string[];
  region?: string;
  locality?: string;
  featureType?: string;
  designationType?: string | null;
  designationCategory?: string | null;
  statutoryStatus?: string | null;
  designationReference?: string | null;
  geometry?: unknown;
  locationType?: string;
  documentedDateText?: string | null;
  earliestPossibleYear?: number | null;
  latestPossibleYear?: number | null;
  datePrecision?: string | null;
  dateBasis?: HeritageFeature['dateBasis'];
  dateConfidence?: Confidence;
  locationConfidence?: Confidence;
  shortDescription?: string | null;
  fullDescription?: string | null;
  sourceRecords?: unknown[];
  licence?: string;
  tags?: string[];
  reviewed?: boolean;
  reviewNotes?: string | null;
  extantStatus?: 'extant' | 'ruin' | 'demolished';
  architectOrDesigner?: string | null;
  designerOrMaker?: string | null;
  scope?: string | null;
  isCommunityRecord?: boolean;
}
interface Pack {
  datasetId?: string;
  title: string;
  description?: string;
  records: PackRecord[];
  memorialPublicArtRecords?: PackRecord[];
  historicMaps?: Array<Record<string, unknown>>;
  settlementEvidence?: Array<Record<string, unknown>>;
  methodology?: Record<string, unknown>;
  licensingAndAttribution?: Record<string, unknown>;
  sourceRegistry?: {
    sources?: Array<{
      id: string;
      organisation: string;
      dataset?: string;
      accessMethod: string;
      sourceUrl?: string | null;
      layerUrl?: string | null;
      licence?: string;
      reliability?: string;
      limitations?: string;
    }>;
  };
}

const projectPath = resolve(process.argv[2] ?? 'data/projects/culross.json');
const packPath = resolve(
  process.argv[3] ??
    'data/imports/culross_full_heritage_pack_v1/culross_full_heritage_pack/culross_full_heritage_pack.json',
);
const project = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const pack = JSON.parse(await readFile(packPath, 'utf8')) as Pack;
const now = new Date().toISOString();

const confidenceRank: Record<Confidence, number> = { unknown: 0, low: 1, medium: 2, high: 3 };

function sourceKey(source: SourceRecord): string {
  return (
    source.sourceRecordId ?? source.sourceUrl ?? `${source.sourceOrganisation}:${source.sourceName}`
  );
}
function normaliseSourceRecord(value: unknown): SourceRecord {
  if (typeof value === 'object' && value !== null) {
    const record = value as Partial<SourceRecord>;
    return {
      sourceName: record.sourceName ?? 'Unspecified source',
      sourceOrganisation: record.sourceOrganisation ?? 'Unspecified organisation',
      sourceRecordId: record.sourceRecordId,
      sourceUrl: record.sourceUrl,
      accessedAt: record.accessedAt ?? now,
      licence: record.licence,
      quotedDateText: record.quotedDateText,
      notes: record.notes,
      reliability: reliability(record.reliability),
    };
  }
  if (typeof value !== 'string')
    return {
      sourceName: 'Unspecified source',
      sourceOrganisation: 'Unspecified organisation',
      accessedAt: now,
      reliability: 'secondary',
    };
  // Some PowerShell-generated packs serialise source objects as "@{key=value; ...}" strings.
  // Recover their fields rather than publishing unusable source text in feature cards.
  const values = new Map<string, string>();
  for (const match of value.matchAll(/(?:^@?\{|;\s*)([^=;]+)=([\s\S]*?)(?=;\s*[^=;]+?=|\}$)/g))
    values.set(match[1].trim(), match[2].trim());
  return {
    sourceName: values.get('sourceName') ?? 'Unspecified source',
    sourceOrganisation: values.get('sourceOrganisation') ?? 'Unspecified organisation',
    sourceRecordId: values.get('sourceRecordId') || undefined,
    sourceUrl: values.get('sourceUrl') || undefined,
    accessedAt: values.get('accessedAt') ?? now,
    licence: values.get('licence') || undefined,
    notes: values.get('notes') || undefined,
    reliability: reliability(values.get('reliability')),
  };
}
function sourcesFor(record: PackRecord): SourceRecord[] {
  return (record.sourceRecords ?? []).map(normaliseSourceRecord);
}
function geometryFor(record: PackRecord): Geometry | null {
  if (!record.geometry || typeof record.geometry !== 'object') return null;
  const geometry = record.geometry as { type?: string; coordinates?: unknown };
  if (geometry.type === 'Point' && typeof geometry.coordinates === 'string') {
    const coordinates = geometry.coordinates.trim().split(/\s+/).map(Number);
    if (coordinates.length === 2 && coordinates.every(Number.isFinite))
      return { type: 'Point', coordinates: [coordinates[0], coordinates[1]] };
    return null;
  }
  return geometry as Geometry;
}
function tagsFor(record: PackRecord): string[] {
  const tags = new Set(record.tags ?? []);
  if (!record.isCommunityRecord) return [...tags];
  tags.add('community-layer');
  if (/public.?art/i.test(record.featureType ?? '')) tags.add('public-art');
  else {
    tags.add('community-memorial');
    if (/plaque/i.test(record.featureType ?? '')) tags.add('plaque');
  }
  return [...tags];
}
function designationReferenceFor(record: PackRecord): string | undefined {
  if (record.designationReference) return record.designationReference;
  return sourcesFor(record)
    .map((source) => source.sourceRecordId)
    .find((reference) => /^(LB|SM|GDL|CA)\d+$/i.test(reference ?? ''));
}
function mergeSources(existing: SourceRecord[], incoming: SourceRecord[]): SourceRecord[] {
  const merged = new Map(existing.map((source) => [sourceKey(source), source]));
  incoming.forEach((source) => merged.set(sourceKey(source), source));
  return [...merged.values()];
}
function reliability(value?: string): DataSourceDefinition['reliability'] {
  const accepted: DataSourceDefinition['reliability'][] = [
    'official_statutory',
    'official_non_statutory',
    'academic',
    'local_authority',
    'archival',
    'secondary',
    'discovery_only',
  ];
  return accepted.includes(value as DataSourceDefinition['reliability'])
    ? (value as DataSourceDefinition['reliability'])
    : 'archival';
}
function significance(category?: string | null): HeritageFeature['significance'] {
  return category?.toUpperCase() === 'A'
    ? 'highest_national'
    : category
      ? 'national'
      : 'recognised';
}
function survival(status?: PackRecord['extantStatus']): HeritageFeature['survival'] {
  return status === 'demolished'
    ? 'site_only_or_demolished'
    : status === 'ruin'
      ? 'heavily_altered'
      : 'unknown';
}
function pendingLocationType(value?: string): string {
  if (!value || value === 'linked_asset_group') return 'geometry_to_link_to_existing_assets';
  return value.includes('geometry_to_') || value.includes('polygon_to_')
    ? value
    : value.includes('geometry') || value.includes('polygon')
      ? value.replace('geometries_to_', 'geometry_to_')
      : 'geometry_pending_review';
}
function appendText(existing?: string, incoming?: string | null): string | undefined {
  if (!incoming) return existing;
  if (!existing || existing.includes(incoming)) return incoming || existing;
  return `${existing}\n\n${incoming}`;
}
function shouldUseIncomingDate(existing: HeritageFeature, incoming: PackRecord): boolean {
  if (!hasEstablishedDate(incoming as HeritageFeature)) return false;
  if (!hasEstablishedDate(existing)) return true;
  return (
    confidenceRank[incoming.dateConfidence ?? 'unknown'] > confidenceRank[existing.dateConfidence]
  );
}
function targetFor(record: PackRecord): HeritageFeature | undefined {
  const reference = designationReferenceFor(record);
  return project.features.find(
    (feature) =>
      feature.id === `curated:${record.id}` ||
      // A curated pack must not overwrite or become dependent on a generated
      // HES feature. Create/retain its own curated record, then allow the HES
      // importer to merge the direct statutory geometry into that record.
      (feature.id.startsWith('curated:') &&
        reference !== undefined &&
        feature.sourceRecords.some((source) => source.sourceRecordId === reference)),
  );
}
function designationReferences(feature: HeritageFeature): string[] {
  return feature.sourceRecords
    .flatMap((source) => (source.sourceRecordId ? [source.sourceRecordId] : []))
    .filter(Boolean);
}
function consolidateOfficialDuplicates(): number {
  const references = new Map<string, HeritageFeature[]>();
  for (const feature of project.features) {
    for (const reference of designationReferences(feature))
      references.set(reference, [...(references.get(reference) ?? []), feature]);
  }
  const duplicateIds = new Set<string>();
  for (const matches of references.values()) {
    if (matches.length < 2) continue;
    const curated = matches.find((feature) => feature.id.startsWith('curated:'));
    const official = matches.find((feature) => feature.id.startsWith('hes-'));
    if (!curated || !official || curated.id === official.id) continue;
    // The curated record owns the researched narrative and date evidence. The live official
    // record owns current designation geometry and location precision.
    if (official.geometry) {
      curated.geometry = official.geometry;
      curated.locationType = official.locationType;
      curated.locationConfidence = official.locationConfidence;
    }
    curated.designationType ??= official.designationType;
    curated.designationCategory ??= official.designationCategory;
    curated.statutoryStatus = official.statutoryStatus ?? curated.statutoryStatus;
    curated.sourceRecords = mergeSources(curated.sourceRecords, official.sourceRecords);
    curated.tags = [...new Set([...curated.tags, ...official.tags])];
    curated.licence ??= official.licence;
    curated.updatedAt = now;
    curated.reviewNotes = appendText(
      curated.reviewNotes,
      'Current official HES designation geometry merged with curated date evidence.',
    );
    duplicateIds.add(official.id);
  }
  if (duplicateIds.size)
    project.features = project.features.filter((feature) => !duplicateIds.has(feature.id));
  return duplicateIds.size;
}
function newFeature(record: PackRecord): HeritageFeature {
  const geometry = geometryFor(record);
  return {
    id: `curated:${record.id}`,
    projectId: project.project.id,
    name: record.name,
    alternativeNames: record.alternativeNames ?? [],
    countryCode: project.project.countryCode,
    region: record.region ?? project.project.region,
    locality: record.locality ?? project.project.locality,
    featureType: record.featureType ?? 'other',
    designationType: record.designationType ?? undefined,
    designationCategory: record.designationCategory
      ? `Category ${record.designationCategory}`
      : undefined,
    significance: significance(record.designationCategory),
    statutoryStatus: record.statutoryStatus ?? undefined,
    geometry,
    locationType: geometry
      ? (record.locationType ?? 'unknown')
      : pendingLocationType(record.locationType),
    documentedDateText: record.documentedDateText ?? undefined,
    earliestPossibleYear: record.earliestPossibleYear ?? undefined,
    latestPossibleYear: record.latestPossibleYear ?? undefined,
    datePrecision: record.datePrecision ?? undefined,
    dateBasis: record.dateBasis ?? 'unknown',
    dateConfidence: record.dateConfidence ?? 'unknown',
    locationConfidence: record.locationConfidence ?? 'unknown',
    survival: survival(record.extantStatus),
    shortDescription: record.shortDescription ?? undefined,
    fullDescription: appendText(
      record.fullDescription ?? undefined,
      (record.architectOrDesigner ?? record.designerOrMaker)
        ? `Architect or designer: ${record.architectOrDesigner ?? record.designerOrMaker}.`
        : undefined,
    ),
    sourceRecords: sourcesFor(record),
    licence: record.licence,
    tags: tagsFor(record),
    createdAt: now,
    updatedAt: now,
    reviewed: record.reviewed ?? false,
    reviewNotes: geometry
      ? (record.reviewNotes ?? undefined)
      : appendText(
          record.reviewNotes ?? undefined,
          'No verified geometry was supplied. Retained for source review only and not rendered, counted, heat-scored, or treated as a settlement polygon.',
        ),
    evidenceScope: /nearby|outside/i.test(record.scope ?? '') ? 'related_context' : undefined,
  };
}

let enriched = 0;
let added = 0;
let datesUpdated = 0;
const records = [
  ...pack.records,
  ...(pack.memorialPublicArtRecords ?? []).map((record) => ({
    ...record,
    isCommunityRecord: true,
  })),
];
for (const record of records) {
  const existing = targetFor(record);
  if (!existing) {
    project.features.push(newFeature(record));
    added += 1;
    continue;
  }
  const incomingSources = sourcesFor(record);
  const useIncomingDate = shouldUseIncomingDate(existing, record);
  existing.alternativeNames = [
    ...new Set([
      ...existing.alternativeNames,
      ...(record.alternativeNames ?? []),
      ...(record.name === existing.name ? [] : [record.name]),
    ]),
  ];
  existing.sourceRecords = mergeSources(existing.sourceRecords, incomingSources);
  existing.tags = [...new Set([...existing.tags, ...tagsFor(record)])];
  existing.featureType =
    existing.featureType === 'other' && record.featureType
      ? record.featureType
      : existing.featureType;
  existing.shortDescription = existing.shortDescription ?? record.shortDescription ?? undefined;
  existing.fullDescription = appendText(existing.fullDescription, record.fullDescription);
  if (record.architectOrDesigner ?? record.designerOrMaker)
    existing.fullDescription = appendText(
      existing.fullDescription,
      `Architect or designer: ${record.architectOrDesigner ?? record.designerOrMaker}.`,
    );
  existing.reviewed ||= record.reviewed ?? false;
  existing.licence ??= record.licence;
  if (useIncomingDate) {
    Object.assign(existing, {
      documentedDateText: record.documentedDateText ?? undefined,
      earliestPossibleYear: record.earliestPossibleYear ?? undefined,
      latestPossibleYear: record.latestPossibleYear ?? undefined,
      datePrecision: record.datePrecision ?? undefined,
      dateBasis: record.dateBasis ?? 'unknown',
      dateConfidence: record.dateConfidence ?? 'unknown',
    });
    datesUpdated += 1;
  }
  existing.reviewNotes = appendText(
    existing.reviewNotes,
    `Enriched from ${pack.title}; current official geometry retained to avoid duplicate or stale map locations.`,
  );
  existing.updatedAt = now;
  enriched += 1;
}

const packSource: DataSourceDefinition = {
  id: pack.datasetId ?? 'heritage-pack',
  name: pack.title,
  organisation: 'Curated project pack',
  coverage: `${project.project.locality} / ${project.project.region ?? project.project.country}`,
  accessMethod: 'Curated JSON import',
  licence: 'See individual source records; official attribution retained.',
  reliability: 'academic',
  limitations: pack.description ?? 'Curated records require ongoing source review.',
};
project.sources = [packSource, ...project.sources.filter((source) => source.id !== packSource.id)];
for (const source of pack.sourceRegistry?.sources ?? []) {
  const importedSource: DataSourceDefinition = {
    id: source.id,
    name: source.dataset ?? source.id,
    organisation: source.organisation,
    coverage: `${project.project.locality} / ${project.project.country}`,
    accessMethod: source.accessMethod,
    sourceUrl: source.sourceUrl ?? source.layerUrl ?? undefined,
    licence: source.licence,
    reliability: reliability(source.reliability),
    limitations: source.limitations,
  };
  project.sources = [
    importedSource,
    ...project.sources.filter((item) => item.id !== importedSource.id),
  ];
}
const packId = pack.datasetId ?? 'heritage-pack';
project.curationMetadata ??= { importedPacks: [] };
project.curationMetadata.importedPacks = [
  {
    datasetId: packId,
    title: pack.title,
    importedAt: now,
    historicMapCatalogue: pack.historicMaps,
    settlementEvidence: pack.settlementEvidence,
    methodology: pack.methodology,
    licensingAndAttribution: pack.licensingAndAttribution,
  },
  ...project.curationMetadata.importedPacks.filter((item) => item.datasetId !== packId),
];
project.features.forEach((feature) => {
  feature.sourceRecords = mergeSources([], feature.sourceRecords);
});
const consolidated = consolidateOfficialDuplicates();
project.validation = validateFeatures(project.project, project.features);
const errors = project.validation.filter((item) => item.severity === 'error');
if (errors.length) {
  console.error(JSON.stringify(errors, null, 2));
  throw new Error(`Refusing to write ${errors.length} validation error(s).`);
}
await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
console.log(
  `Merged ${records.length} pack records: ${enriched} enriched, ${added} added, ${datesUpdated} date records upgraded, ${consolidated} official duplicate(s) consolidated.`,
);
