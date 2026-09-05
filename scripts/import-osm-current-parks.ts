import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { booleanIntersects } from '@turf/turf';
import type { Feature, Polygon } from 'geojson';
import type { DataSourceDefinition, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const osmMapUrl = 'https://api.openstreetmap.org/api/0.6/map';
const accessedAt = new Date().toISOString();

interface OsmWay {
  id: number;
  tags?: Record<string, string>;
  geometry: Array<[number, number]>;
}

function bounds(pkg: ProjectPackage): [number, number, number, number] {
  const positions: Array<[number, number]> = [];
  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      value.every((item) => typeof item === 'number')
    )
      positions.push(value as [number, number]);
    else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(pkg.project.boundary.geometry.coordinates);
  return [
    Math.min(...positions.map((position) => position[0])),
    Math.min(...positions.map((position) => position[1])),
    Math.max(...positions.map((position) => position[0])),
    Math.max(...positions.map((position) => position[1])),
  ];
}

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function attribute(markup: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(markup);
  return match ? decodeXml(match[1]) : undefined;
}

function parseOsmWays(xml: string): OsmWay[] {
  const nodes = new Map<string, [number, number]>();
  for (const match of xml.matchAll(/<node\b([^>]*)\/?>(?:<\/node>)?/g)) {
    const id = attribute(match[1], 'id');
    const latitude = Number(attribute(match[1], 'lat'));
    const longitude = Number(attribute(match[1], 'lon'));
    if (id && Number.isFinite(latitude) && Number.isFinite(longitude))
      nodes.set(id, [longitude, latitude]);
  }
  const ways: OsmWay[] = [];
  for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) {
    const id = Number(attribute(match[1], 'id'));
    const tags = Object.fromEntries(
      [...match[2].matchAll(/<tag\b([^>]*)\/?>(?:<\/tag>)?/g)]
        .map((tag) => [attribute(tag[1], 'k'), attribute(tag[1], 'v')] as const)
        .filter((tag): tag is [string, string] => Boolean(tag[0] && tag[1])),
    );
    if (
      !Number.isFinite(id) ||
      !tags.name ||
      !(
        tags.leisure === 'park' ||
        tags.leisure === 'garden' ||
        tags.landuse === 'recreation_ground'
      )
    )
      continue;
    const geometry = [...match[2].matchAll(/<nd\b([^>]*)\/?>(?:<\/nd>)?/g)]
      .map((node) => attribute(node[1], 'ref'))
      .map((reference) => (reference ? nodes.get(reference) : undefined));
    if (geometry.every((position): position is [number, number] => Boolean(position)))
      ways.push({ id, tags, geometry });
  }
  return ways;
}

function sourceRecord(way: OsmWay): SourceRecord {
  return {
    sourceName: 'OpenStreetMap current parks and gardens',
    sourceOrganisation: 'OpenStreetMap contributors',
    sourceRecordId: `way/${way.id}`,
    sourceUrl: `https://www.openstreetmap.org/way/${way.id}`,
    accessedAt,
    licence: 'Open Database Licence (ODbL); © OpenStreetMap contributors.',
    notes: `Current OSM tags: leisure=${way.tags?.leisure ?? 'not set'}; landuse=${way.tags?.landuse ?? 'not set'}.`,
    reliability: 'discovery_only',
  };
}

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const townArea = pkg.project.townStudyArea?.bufferedBoundary ?? pkg.project.boundary;
const [west, south, east, north] = bounds({
  ...pkg,
  project: { ...pkg.project, boundary: townArea },
});
const response = await fetch(
  `${osmMapUrl}?${new URLSearchParams({ bbox: `${west},${south},${east},${north}` })}`,
  {
    headers: { 'user-agent': 'Historic Town Explorer local curator/1.0' },
  },
);
if (!response.ok) throw new Error(`OpenStreetMap current-context query failed: ${response.status}`);
const elements = parseOsmWays(await response.text());
let added = 0;
let linked = 0;
let outsideBoundary = 0;
let invalidGeometry = 0;
for (const way of elements) {
  const name = way.tags?.name?.trim();
  const coordinates = way.geometry;
  if (!name || !coordinates || coordinates.length < 4) {
    invalidGeometry += 1;
    continue;
  }
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!last || first[0] !== last[0] || first[1] !== last[1]) {
    invalidGeometry += 1;
    continue;
  }
  const geometry: Polygon = { type: 'Polygon', coordinates: [coordinates] };
  const geojson: Feature<Polygon> = { type: 'Feature', properties: {}, geometry };
  if (!booleanIntersects(geojson, pkg.project.boundary)) {
    outsideBoundary += 1;
    continue;
  }
  const source = sourceRecord(way);
  const existing = pkg.features.find(
    (feature) =>
      feature.sourceRecords.some((item) => item.sourceRecordId === source.sourceRecordId) ||
      (feature.featureType === 'park' && normalise(feature.name) === normalise(name)),
  );
  if (existing) {
    existing.sourceRecords = [
      ...existing.sourceRecords.filter((item) => item.sourceRecordId !== source.sourceRecordId),
      source,
    ];
    existing.tags = [...new Set([...existing.tags, 'current-context', 'osm-current-park'])];
    existing.updatedAt = accessedAt;
    linked += 1;
    continue;
  }
  pkg.features.push({
    id: `osm-park:way-${way.id}`,
    projectId: pkg.project.id,
    name,
    alternativeNames: [],
    countryCode: pkg.project.countryCode,
    region: pkg.project.region,
    locality: pkg.project.locality,
    featureType: 'park',
    significance: 'local',
    geometry,
    locationType: 'exact',
    locationConfidence: 'high',
    dateBasis: 'unknown',
    dateConfidence: 'unknown',
    survival: 'unknown',
    shortDescription:
      'Current mapped park, garden or recreation ground. This is a present-day context layer, not historic-date evidence.',
    sourceRecords: [source],
    licence: source.licence,
    tags: ['current-context', 'osm-current-park'],
    createdAt: accessedAt,
    updatedAt: accessedAt,
    reviewed: false,
    reviewNotes:
      'Imported from OpenStreetMap as current landscape context. Confirm an authoritative historic source before adding any historic date or heat-map contribution.',
  });
  added += 1;
}

const source: DataSourceDefinition = {
  id: 'osm-current-parks',
  name: 'OpenStreetMap current parks and gardens',
  organisation: 'OpenStreetMap contributors',
  coverage: `Named leisure=park, leisure=garden and landuse=recreation_ground ways intersecting the ${pkg.project.locality} project boundary.`,
  accessMethod:
    'OpenStreetMap API map call for the NRS locality plus 500m buffer; exact project-boundary intersection',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  licence: 'Open Database Licence (ODbL); © OpenStreetMap contributors.',
  reliability: 'discovery_only',
  limitations:
    'Current voluntary mapping only. It is not a historic park register, cannot establish dates or boundaries in the past, and is excluded from historic heat scoring.',
};
pkg.sources = [source, ...pkg.sources.filter((item) => item.id !== source.id)];
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Imported ${added} current park(s), linked ${linked}; ${outsideBoundary} outside boundary and ${invalidGeometry} invalid geometry candidate(s) excluded.`,
);
