import { readFile, writeFile } from 'node:fs/promises';
import { centroid } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ProjectPackage } from '../src/domain/models';

const localityName = "Quarrier's Village";
const localityZip = 'data/runtime/reference/nrs-localities-2022.zip';
const outputPath = 'data/projects/quarriers-village.json';

Object.assign(globalThis, { self: globalThis });
const { default: shp } = await import('shpjs');

type LocalityFeature = Feature<Polygon | MultiPolygon, { code?: string; name?: string }>;
type ShapeCollection = { features: LocalityFeature[] };

const parsed = (await shp(await readFile(localityZip))) as ShapeCollection | ShapeCollection[];
const localities = (Array.isArray(parsed) ? parsed : [parsed]).flatMap(
  (collection) => collection.features,
);
const locality = localities.find(
  (feature) =>
    feature.properties?.name?.trim().toLocaleLowerCase() === localityName.toLocaleLowerCase(),
);
if (!locality) throw new Error(`NRS 2022 locality '${localityName}' was not found.`);

const now = new Date().toISOString();
const methodology: ProjectPackage['project']['methodology'] = {
  age: {
    before_1700: 1,
    '1700_1799': 0.9,
    '1800_1849': 0.8,
    '1850_1899': 0.65,
    '1900_1918': 0.5,
    '1919_1945': 0.4,
    '1946_1960': 0.25,
    after_1960: 0.15,
    unknown: 0.2,
  },
  significance: {
    highest_national: 1,
    national: 0.85,
    regional: 0.65,
    local: 0.45,
    recognised: 0.3,
  },
  confidence: { high: 1, medium: 0.75, low: 0.5, unknown: 0.35 },
  survival: {
    substantially_intact: 1,
    altered_recognisable: 0.75,
    heavily_altered: 0.45,
    site_only_or_demolished: 0.2,
    unknown: 0.6,
  },
};

const centre = centroid(locality).geometry.coordinates as [number, number];
const boundary: Feature<Polygon | MultiPolygon, Record<string, unknown>> = {
  type: 'Feature',
  properties: {
    sourceDataset: 'NRS 2022 Census Locality Boundaries',
    localityName,
    localityCode: locality.properties?.code,
  },
  geometry: locality.geometry,
};

const pkg: ProjectPackage = {
  publication: {
    state: 'provisional',
    notes: 'New package; publication approval has not been completed.',
  },
  project: {
    id: 'quarriers-village-scotland',
    name: localityName,
    countryCode: 'GB-SCT',
    country: 'Scotland',
    region: 'Inverclyde',
    locality: localityName,
    centre,
    boundary,
    boundarySource: 'National Records of Scotland 2022 Census Locality Boundaries.',
    boundaryConfidence: 'high',
    sourceLanguage: 'en',
    preferredBasemap: 'openstreetmap',
    createdAt: now,
    timelineStart: 1800,
    timelineEnd: 2026,
    methodology,
    researchNotes:
      "The published study extent is the official NRS 2022 Quarrier's Village locality. It is a modern statistical boundary used for transparent feature selection, not a claimed historic boundary or a substitute for Kilmacolm civil parish.",
  },
  features: [],
  sources: [
    {
      id: 'nrs-locality-boundary',
      name: 'National Records of Scotland 2022 Census Locality Boundaries',
      organisation: 'National Records of Scotland',
      coverage: "Authoritative modern locality boundary for Quarrier's Village (S52000531).",
      accessMethod: 'NRS 2022 Census Geography Products spatial download.',
      sourceUrl: 'https://www.nrscotland.gov.uk/publications/2022-census-geography-products/',
      licence: 'Open Government Licence v3.0.',
      reliability: 'official_statutory',
      limitations:
        'A modern statistical locality boundary. It is not evidence of the historic village footprint or of any construction date.',
    },
  ],
  historicMaps: [],
  settlementPolygons: [],
  validation: [],
  curationMetadata: { importedPacks: [] },
};

await writeFile(outputPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Created ${outputPath} from NRS locality ${localityName}.`);
