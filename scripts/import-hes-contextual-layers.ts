import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { booleanIntersects, booleanPointInPolygon, point as turfPoint } from '@turf/turf';
import type { Feature, Geometry, Point, Polygon, MultiPolygon } from 'geojson';
import type {
  DataSourceDefinition,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';
import { localHesDatasetFiles, type LocalHesDataset } from './lib/reference-data';

const projectPath = resolve(process.argv[2] ?? 'data/projects/culross.json');
const accessedAt = new Date().toISOString();

type ShapeCollection = { features: Array<Feature<Geometry, Record<string, unknown>>> };

const layers: Array<{
  dataset: LocalHesDataset;
  idPrefix: string;
  title: string;
  featureType: HeritageFeature['featureType'];
  significance: NonNullable<HeritageFeature['significance']>;
  statutoryStatus: string;
  sourceId: (properties: Record<string, unknown>) => string | undefined;
  name: (properties: Record<string, unknown>) => string | undefined;
}> = [
  {
    dataset: 'battlefields',
    idPrefix: 'hes-battlefield',
    title: 'Inventory Battlefield',
    featureType: 'military_site',
    significance: 'national',
    statutoryStatus: 'Inventory Battlefield',
    sourceId: (properties) => stringValue(properties.DES_REF),
    name: (properties) => stringValue(properties.DES_TITLE),
  },
  {
    dataset: 'propertiesInCare',
    idPrefix: 'hes-property-in-care',
    title: 'Property in Care',
    featureType: 'historic_building',
    significance: 'national',
    statutoryStatus: 'Property in Care',
    sourceId: (properties) => stringValue(properties.PIC_ID),
    name: (properties) => stringValue(properties.PIC_NAME),
  },
  {
    dataset: 'worldHeritageSites',
    idPrefix: 'hes-world-heritage',
    title: 'World Heritage Site',
    featureType: 'historic_area',
    significance: 'highest_national',
    statutoryStatus: 'World Heritage Site',
    sourceId: (properties) => stringValue(properties.DES_REF),
    name: (properties) => stringValue(properties.DES_TITLE),
  },
  {
    dataset: 'historicMarineProtectedAreas',
    idPrefix: 'hes-hmpa',
    title: 'Historic Marine Protected Area',
    featureType: 'archaeological_site',
    significance: 'national',
    statutoryStatus: 'Historic Marine Protected Area',
    sourceId: (properties) => stringValue(properties.DES_REF),
    name: (properties) => stringValue(properties.DES_TITLE),
  },
];

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function intersectsProject(
  feature: Feature<Geometry, Record<string, unknown>>,
  pkg: ProjectPackage,
): boolean {
  if (feature.geometry.type === 'Point')
    return booleanPointInPolygon(turfPoint(feature.geometry.coordinates), pkg.project.boundary);
  if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')
    return booleanIntersects(feature, pkg.project.boundary);
  return false;
}

async function recordsFor(
  dataset: LocalHesDataset,
  pkg: ProjectPackage,
): Promise<Array<Feature<Geometry, Record<string, unknown>>>> {
  const files = await localHesDatasetFiles(dataset);
  if (!files) throw new Error(`Local HES ${dataset} files are not available.`);
  Object.assign(globalThis, { self: globalThis });
  const { default: shp } = await import('shpjs');
  // The runtime accepts a Shapefile sidecar bundle; its TypeScript declarations only model ZIPs.
  const bundle = {
    shp: await readFile(files.shp),
    dbf: await readFile(files.dbf),
    prj: await readFile(files.prj, 'utf8'),
    cpg: await readFile(files.cpg, 'utf8'),
  };
  const parsed = (await shp(bundle as unknown as Buffer)) as ShapeCollection | ShapeCollection[];
  return (Array.isArray(parsed) ? parsed : [parsed])
    .flatMap((collection) => collection.features)
    .filter((feature) => intersectsProject(feature, pkg));
}

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function existingMatch(
  pkg: ProjectPackage,
  reference: string,
  name: string,
): HeritageFeature | undefined {
  const byReference = pkg.features.find((feature) =>
    feature.sourceRecords.some((source) => source.sourceRecordId === reference),
  );
  if (byReference) return byReference;
  const target = normalise(name);
  return pkg.features
    .filter((feature) => {
      const candidate = normalise(feature.name);
      return candidate === target || candidate.includes(target) || target.includes(candidate);
    })
    .sort((left, right) => {
      const rank = (feature: HeritageFeature) =>
        feature.id.startsWith('curated:') ? 0 : feature.id.startsWith('hes-') ? 1 : 2;
      return rank(left) - rank(right) || left.name.localeCompare(right.name);
    })[0];
}

function sourceRecord(
  layer: (typeof layers)[number],
  properties: Record<string, unknown>,
  reference: string,
): SourceRecord {
  return {
    sourceName: `Historic Environment Scotland ${layer.title} GIS`,
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: reference,
    sourceUrl: stringValue(properties.LINK),
    accessedAt,
    licence:
      'Open Government Licence v3.0; retain Historic Environment Scotland attribution and source link.',
    notes: `Location precision: ${stringValue(properties.PRECISION) ?? 'not stated'}; ${stringValue(properties.ACCURACY) ?? 'accuracy not stated'}.`,
    reliability: 'official_non_statutory',
  };
}

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
let added = 0;
let linked = 0;
const scan = new Map<string, number>();
for (const layer of layers) {
  const records = await recordsFor(layer.dataset, pkg);
  scan.set(layer.dataset, records.length);
  for (const record of records) {
    const reference = layer.sourceId(record.properties);
    const name = layer.name(record.properties);
    if (!reference || !name)
      throw new Error(`HES ${layer.dataset} feature is missing its reference or name.`);
    const source = sourceRecord(layer, record.properties, reference);
    const existing = existingMatch(pkg, reference, name);
    if (existing) {
      existing.sourceRecords = [
        ...existing.sourceRecords.filter((item) => item.sourceRecordId !== reference),
        source,
      ];
      existing.tags = [...new Set([...existing.tags, 'hes-contextual-layer', layer.dataset])];
      existing.updatedAt = accessedAt;
      linked += 1;
      continue;
    }
    pkg.features.push({
      id: `${layer.idPrefix}:${reference.toLocaleLowerCase()}`,
      projectId: pkg.project.id,
      name,
      alternativeNames: [],
      countryCode: pkg.project.countryCode,
      region: pkg.project.region,
      locality: pkg.project.locality,
      featureType: layer.featureType,
      designationType: layer.title,
      statutoryStatus: layer.statutoryStatus,
      significance: layer.significance,
      geometry: record.geometry as Point | Polygon | MultiPolygon,
      locationType: record.geometry.type === 'Point' ? 'exact' : 'representative_point',
      locationConfidence: 'high',
      dateBasis: 'unknown',
      dateConfidence: 'unknown',
      survival: 'unknown',
      shortDescription: `Current HES ${layer.title.toLocaleLowerCase()} spatial record. It does not establish a construction date.`,
      sourceRecords: [source],
      licence: source.licence,
      tags: ['hes-contextual-layer', layer.dataset],
      createdAt: accessedAt,
      updatedAt: accessedAt,
      reviewed: false,
      evidenceScope: 'parish_evidence',
      reviewNotes:
        'Imported from a local HES contextual dataset after exact project-boundary intersection. Review its detailed source record before adding timeline evidence.',
    });
    added += 1;
  }
}

const source: DataSourceDefinition = {
  id: 'hes-contextual-layers',
  name: 'Historic Environment Scotland contextual datasets',
  organisation: 'Historic Environment Scotland',
  coverage: `Exact project-boundary scan of local battlefields, Properties in Care, World Heritage Sites and Historic Marine Protected Areas for ${pkg.project.locality}.`,
  accessMethod: 'Developer-supplied local HES Shapefiles; exact project-boundary intersection',
  sourceUrl: 'https://portal.historicenvironment.scot/downloads',
  licence:
    'Open Government Licence v3.0; retain Historic Environment Scotland attribution and source link.',
  reliability: 'official_non_statutory',
  limitations:
    'A contextual designation or managed-property record is not construction-date evidence. Datasets with no intersecting records are retained as a completed scan, not shown as empty map layers.',
};
pkg.sources = [source, ...pkg.sources.filter((item) => item.id !== source.id)];
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `HES contextual scan: ${added} new feature(s), ${linked} linked record(s). ${[...scan.entries()].map(([id, count]) => `${id}=${count}`).join(', ')}.`,
);
