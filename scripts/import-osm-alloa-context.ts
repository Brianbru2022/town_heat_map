import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LineString, Polygon } from 'geojson';
import type { ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const apiRoot = 'https://api.openstreetmap.org/api/0.6';
const wayIds = [1232931048, 81231595, 92218706];

interface OSMWay {
  type: 'way';
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}
interface OSMNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
}
interface OSMResponse {
  elements?: Array<OSMWay | OSMNode>;
}

function coordinates(way: OSMWay, nodes: Map<number, OSMNode>): [number, number][] {
  const result = way.nodes.map((id) => nodes.get(id)).filter(Boolean) as OSMNode[];
  if (result.length !== way.nodes.length)
    throw new Error(`OSM way ${way.id} has incomplete geometry.`);
  return result.map((point) => [point.lon, point.lat]);
}

const packageJson = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const replies = await Promise.all(
  wayIds.map(async (id) => {
    const response = await fetch(`${apiRoot}/way/${id}/full.json`, {
      headers: { 'User-Agent': 'HistoricTownExplorer/0.1 local curated data import' },
    });
    if (!response.ok) throw new Error(`OpenStreetMap way ${id} request failed: ${response.status}`);
    return (await response.json()) as OSMResponse;
  }),
);
const elements = replies.flatMap((reply) => reply.elements ?? []);
const ways = new Map(
  elements.filter((item): item is OSMWay => item.type === 'way').map((way) => [way.id, way]),
);
const nodes = new Map(
  elements.filter((item): item is OSMNode => item.type === 'node').map((node) => [node.id, node]),
);
const marStreetWays = [1232931048, 81231595].map((id) => ways.get(id)).filter(Boolean) as OSMWay[];
const westEndPark = ways.get(92218706);
if (marStreetWays.length !== 2 || !westEndPark)
  throw new Error('Expected Alloa OSM ways were not returned.');

const accessedAt = new Date().toISOString();
const attribution: SourceRecord = {
  sourceName: 'OpenStreetMap current geometry',
  sourceOrganisation: 'OpenStreetMap contributors',
  sourceRecordId: 'way/81231595; way/1232931048; way/92218706',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  accessedAt,
  licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
  notes:
    'Current geometry only. It does not establish historic extent, alignment, or construction date.',
  reliability: 'discovery_only',
};
const marStreet = packageJson.features.find(
  (feature) => feature.id === 'curated:context-mar-street-1785',
);
const park = packageJson.features.find((feature) => feature.id === 'curated:context-west-end-park');
if (!marStreet || !park) throw new Error('The expected curated context feature is missing.');

const streetCoordinates = marStreetWays.flatMap((way, index) => {
  const part = coordinates(way, nodes);
  return index ? part.slice(1) : part;
});
marStreet.geometry = { type: 'LineString', coordinates: streetCoordinates } as LineString;
marStreet.locationType = 'current_geometry';
marStreet.locationConfidence = 'high';
marStreet.sourceRecords = [
  ...marStreet.sourceRecords.filter((source) => source.sourceName !== attribution.sourceName),
  attribution,
];
marStreet.tags = [...new Set([...marStreet.tags, 'osm-current-geometry'])];
marStreet.updatedAt = accessedAt;
marStreet.reviewed = true;
marStreet.reviewNotes =
  'Current OSM centre-line geometry imported on review. Historic alignment and 1785 date remain separately evidenced by the council appraisal.';

const parkCoordinates = coordinates(westEndPark, nodes);
if (parkCoordinates.length < 4) throw new Error('West End Park OSM boundary is not usable.');
park.geometry = { type: 'Polygon', coordinates: [parkCoordinates] } as Polygon;
park.locationType = 'current_geometry';
park.locationConfidence = 'high';
park.sourceRecords = [
  ...park.sourceRecords.filter((source) => source.sourceName !== attribution.sourceName),
  attribution,
];
park.tags = [...new Set([...park.tags, 'osm-current-geometry'])];
park.updatedAt = accessedAt;
park.reviewed = true;
park.reviewNotes =
  'Current OSM park boundary imported on review. The historic 1878 date is separately evidenced by the council appraisal; historic extent still requires map comparison.';

packageJson.validation = validateFeatures(packageJson.project, packageJson.features);
const errors = packageJson.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log('Imported current OSM geometry for Mar Street and West End Park.');
