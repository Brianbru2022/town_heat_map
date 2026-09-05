import { buffer, lineString } from '@turf/turf';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { LineString, Polygon } from 'geojson';
import type { HeritageFeature, ProjectPackage, SettlementAgePolygon } from '../src/domain/models';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;

function requiredFeature(id: string): HeritageFeature {
  const feature = pkg.features.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Missing curated evidence feature: ${id}`);
  return feature;
}

const marStreet = requiredFeature('curated:context-mar-street-1785');
const westEndPark = requiredFeature('curated:context-west-end-park');
if (marStreet.geometry?.type !== 'LineString')
  throw new Error('Mar Street needs reviewed current centre-line geometry.');
if (westEndPark.geometry?.type !== 'Polygon')
  throw new Error('West End Park needs reviewed current boundary geometry.');

const marStreetCorridor = buffer(lineString((marStreet.geometry as LineString).coordinates), 20, {
  units: 'meters',
});
if (!marStreetCorridor || marStreetCorridor.geometry.type !== 'Polygon') {
  throw new Error('Expected a polygon corridor for Mar Street.');
}

const sharedMethod =
  'Published after curator review of the cited date evidence and current OSM geometry. This is a current-geometry evidence area, not a surveyed historic boundary.';
const polygons: SettlementAgePolygon[] = [
  {
    id: 'alloa-mar-street-corridor-1785',
    projectId: pkg.project.id,
    geometry: marStreetCorridor.geometry as Polygon,
    earliestEvidenceYear: 1785,
    latestEvidenceYear: 1785,
    category: 'developed_by_1800',
    evidenceMapIds: ['nls-os-six-inch-1888-1913'],
    evidenceDescription:
      'A narrow corridor around present-day Mar Street. The Alloa Glebe appraisal states that Mar Street was laid out in 1785; the geometry indicates the modern street alignment only and is not a complete 1785 town extent.',
    confidence: 'low',
    digitisationMethod: `${sharedMethod} The 20 m buffer is derived from the reviewed current OSM Mar Street centre-line.`,
    sourceRecords: marStreet.sourceRecords,
    reviewed: true,
  },
  {
    id: 'alloa-west-end-park-1878',
    projectId: pkg.project.id,
    geometry: westEndPark.geometry as Polygon,
    earliestEvidenceYear: 1878,
    latestEvidenceYear: 1878,
    category: 'developed_by_1900',
    evidenceMapIds: ['nls-os-six-inch-1888-1913'],
    evidenceDescription:
      'Current West End Park boundary. The Alloa Glebe appraisal records that the park was laid out in 1878; its historic boundary still requires comparison with a licensed historic map.',
    confidence: 'low',
    digitisationMethod: `${sharedMethod} The boundary is the reviewed current OSM park polygon.`,
    sourceRecords: westEndPark.sourceRecords,
    reviewed: true,
  },
];

const generatedIds = new Set(polygons.map((polygon) => polygon.id));
pkg.settlementPolygons = [
  ...polygons,
  ...pkg.settlementPolygons.filter((polygon) => !generatedIds.has(polygon.id)),
];
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Published ${polygons.length} reviewed, low-confidence settlement-age evidence areas.`);
