import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { booleanPointInPolygon, centroid, distance, point } from '@turf/turf';
import type { Point } from 'geojson';
import type {
  DataSourceDefinition,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const overpassUrls = [
  // These two endpoints have been checked against the Scottish town query.
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const accessedAt = new Date().toISOString();

type CommunityCategory =
  | 'food'
  | 'picnic'
  | 'art'
  | 'memorial'
  | 'historic'
  | 'leisure'
  | 'visitor'
  | 'amenities'
  | 'parking'
  | 'nature';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OsmElement[];
}

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
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
  visit((pkg.project.townStudyArea?.bufferedBoundary ?? pkg.project.boundary).geometry.coordinates);
  return [
    Math.min(...positions.map((position) => position[0])),
    Math.min(...positions.map((position) => position[1])),
    Math.max(...positions.map((position) => position[0])),
    Math.max(...positions.map((position) => position[1])),
  ];
}

function categoryFor(tags: Record<string, string>): CommunityCategory | undefined {
  if (
    ['cafe', 'ice_cream', 'restaurant'].includes(tags.amenity ?? '') ||
    ['bakery', 'coffee'].includes(tags.shop ?? '')
  )
    return 'food';
  if (
    ['outdoor_seating', 'picnic_table'].includes(tags.leisure ?? '') ||
    tags.amenity === 'bench' ||
    tags.amenity === 'bbq' ||
    tags.amenity === 'fountain' ||
    tags.tourism === 'picnic_site'
  )
    return 'picnic';
  if (['artwork', 'museum', 'gallery'].includes(tags.tourism ?? '')) return 'art';
  if (tags.historic === 'memorial') return 'memorial';
  if (
    [
      'archaeological_site',
      'wayside_shrine',
      'monument',
      'castle',
      'fort',
      'city_gate',
      'manor',
    ].includes(tags.historic ?? '') ||
    ['obelisk', 'tower', 'lighthouse', 'windmill'].includes(tags.man_made ?? '')
  )
    return 'historic';
  if (
    ['amusement_arcade', 'playground', 'miniature_golf', 'beach_resort'].includes(
      tags.leisure ?? '',
    )
  )
    return 'leisure';
  if (tags.amenity === 'parking' || tags.parking === 'street_side') return 'parking';
  if (['toilets', 'drinking_water'].includes(tags.amenity ?? '')) return 'amenities';
  if (
    tags.tourism === 'information' ||
    ['guidepost', 'board', 'map', 'office', 'terminal', 'audioguide'].includes(
      tags.information ?? '',
    ) ||
    tags.tourism === 'viewpoint' ||
    ['gift', 'souvenir'].includes(tags.shop ?? '')
  )
    return 'visitor';
  if (
    ['cave_entrance', 'volcano'].includes(tags.natural ?? '') ||
    tags.waterway === 'waterfall' ||
    ['wildlife_hide', 'bird_hide'].includes(tags.leisure ?? '')
  )
    return 'nature';
  return undefined;
}

function typeLabel(tags: Record<string, string>, category: CommunityCategory): string {
  if (tags.amenity === 'ice_cream') return 'Ice-cream shop';
  if (tags.amenity === 'cafe') return 'Café';
  if (tags.amenity === 'restaurant') return 'Restaurant';
  if (tags.shop === 'bakery') return 'Bakery';
  if (tags.shop === 'coffee') return 'Coffee shop';
  if (tags.amenity === 'bench') return 'Bench';
  if (tags.amenity === 'bbq') return 'Barbecue';
  if (tags.tourism === 'picnic_site') return 'Picnic site';
  if (tags.leisure === 'outdoor_seating') return 'Outdoor seating';
  if (tags.leisure === 'picnic_table') return 'Picnic table';
  if (tags.tourism === 'artwork') return tags.artwork_type === 'statue' ? 'Statue' : 'Artwork';
  if (tags.tourism === 'museum') return 'Museum';
  if (tags.tourism === 'gallery') return 'Art gallery';
  if (tags.historic === 'memorial') {
    if (tags.memorial === 'plaque' || tags.memorial === 'blue_plaque') return 'Memorial plaque';
    if (tags.memorial === 'statue') return 'Memorial statue';
    if (tags.memorial === 'stone') return 'Memorial stone';
    if (tags.memorial === 'bust') return 'Memorial bust';
    return 'Memorial';
  }
  if (tags.historic === 'castle')
    return tags.castle_type === 'palace' || tags.castle_type === 'stately'
      ? 'Palace or stately home'
      : 'Castle';
  if (tags.historic === 'fort') return 'Historic fort';
  if (tags.historic === 'city_gate') return 'City gate';
  if (tags.historic === 'manor') return 'Manor house';
  if (tags.man_made === 'obelisk') return 'Obelisk';
  if (tags.man_made === 'tower') {
    if (tags['tower:type'] === 'observation') return 'Observation tower';
    if (['bell', 'bell_tower'].includes(tags['tower:type'] ?? '')) return 'Bell tower';
    return 'Tower';
  }
  if (tags.man_made === 'lighthouse') return 'Lighthouse';
  if (tags.man_made === 'windmill') return 'Windmill';
  if (tags.leisure === 'playground') return 'Playground';
  if (tags.leisure === 'amusement_arcade') return 'Amusement arcade';
  if (tags.leisure === 'miniature_golf') return 'Miniature golf';
  if (tags.leisure === 'beach_resort') return 'Managed beach';
  if (tags.amenity === 'fountain') return 'Fountain';
  if (tags.amenity === 'toilets') return 'Public toilets';
  if (tags.amenity === 'drinking_water') return 'Drinking water';
  if (tags.amenity === 'parking' || tags.parking === 'street_side') return 'Parking';
  if (tags.tourism === 'information' || tags.information) {
    const information = tags.information;
    if (information === 'guidepost') return 'Guidepost';
    if (information === 'board') return 'Information board';
    if (information === 'map') return 'Map or model board';
    if (information === 'office') return 'Tourist information';
    if (information === 'terminal') return 'Information terminal';
    if (information === 'audioguide') return 'Audio guide';
    return 'Visitor information';
  }
  if (tags.tourism === 'viewpoint') return 'Viewpoint';
  if (['gift', 'souvenir'].includes(tags.shop ?? '')) return 'Gift or souvenir shop';
  if (tags.natural === 'cave_entrance') return 'Cave entrance';
  if (tags.natural === 'volcano') return 'Volcano';
  if (tags.waterway === 'waterfall') return 'Waterfall';
  return category === 'art'
    ? 'Art or culture'
    : category === 'memorial'
      ? 'Memorial or plaque'
      : category === 'historic'
        ? 'Historic place'
        : category === 'visitor'
          ? 'Visitor information'
          : category === 'amenities'
            ? 'Amenity'
            : category === 'nature'
              ? 'Natural sight'
              : category === 'leisure'
                ? 'Leisure place'
                : 'Recreation or picnic spot';
}

function coordinates(element: OsmElement): [number, number] | undefined {
  const latitude = element.lat ?? element.center?.lat;
  const longitude = element.lon ?? element.center?.lon;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? [longitude as number, latitude as number]
    : undefined;
}

function sourceRecord(element: OsmElement, tags: Record<string, string>): SourceRecord {
  const detailKeys = [
    'amenity',
    'shop',
    'leisure',
    'tourism',
    'historic',
    'memorial',
    'artwork_type',
    'castle_type',
    'man_made',
    'tower:type',
    'information',
    'parking',
    'natural',
    'waterway',
    'cuisine',
    'opening_hours',
    'opening_hours:description',
    'wheelchair',
    'toilets',
    'operator',
    'website',
    'phone',
    'contact:phone',
    'wikipedia',
    'description',
  ];
  return {
    sourceName: 'OpenStreetMap current community places',
    sourceOrganisation: 'OpenStreetMap contributors',
    sourceRecordId: `${element.type}/${element.id}`,
    sourceUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    accessedAt,
    licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
    notes: `Current OSM details: ${Object.entries(tags)
      .filter(([key]) => detailKeys.includes(key))
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')}.`,
    reliability: 'discovery_only',
  };
}

function nearbyMatchingFeature(
  features: HeritageFeature[],
  name: string,
  location: [number, number],
): HeritageFeature | undefined {
  const wanted = normalise(name);
  return features.find((feature) => {
    if (normalise(feature.name) !== wanted || !feature.geometry) return false;
    const featureCentre = centroid(feature.geometry).geometry.coordinates as [number, number];
    return distance(point(location), point(featureCentre), { units: 'kilometers' }) <= 0.05;
  });
}

function query(south: number, west: number, north: number, east: number): string {
  const area = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:60];(
    nwr["amenity"~"^(cafe|ice_cream|restaurant|bench|bbq|fountain|toilets|drinking_water|parking)$"]${area};
    nwr["shop"~"^(bakery|coffee|gift|souvenir)$"]${area};
    nwr["leisure"~"^(outdoor_seating|picnic_table|amusement_arcade|playground|miniature_golf|beach_resort|wildlife_hide|bird_hide)$"]${area};
    nwr["tourism"~"^(picnic_site|artwork|museum|gallery|information|viewpoint)$"]${area};
    nwr["information"~"^(guidepost|board|map|office|terminal|audioguide)$"]${area};
    nwr["historic"~"^(memorial|archaeological_site|wayside_shrine|monument|castle|fort|city_gate|manor)$"]${area};
    nwr["man_made"~"^(obelisk|tower|lighthouse|windmill)$"]${area};
    nwr["parking"="street_side"]${area};
    nwr["natural"~"^(cave_entrance|volcano)$"]${area};
    nwr["waterway"="waterfall"]${area};
  );out center tags;`;
}

async function fetchOverpass(queryText: string): Promise<OverpassResponse> {
  let lastStatus = 'no response';
  for (const endpoint of overpassUrls) {
    const controller = new AbortController();
    // Town-wide queries include nodes, ways and relations. Give a busy public
    // Overpass instance enough time to finish once, then fall back cleanly.
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent':
            'Historic Town Explorer local curation/1.0 (read-only current-place import)',
        },
        body: new URLSearchParams({ data: queryText }),
        signal: controller.signal,
      });
    } catch (error) {
      lastStatus = `${endpoint}: ${error instanceof Error ? error.name : 'request failed'}`;
      continue;
    } finally {
      clearTimeout(timeout);
    }
    if (response.ok) return (await response.json()) as OverpassResponse;
    lastStatus = `${endpoint}: ${response.status}`;
    // A single bounded retry on a separate public read-only instance is less
    // disruptive than repeatedly retrying a busy server.
    if (!([429, 502, 503, 504] as number[]).includes(response.status)) break;
  }
  throw new Error(`Overpass community-place query failed (${lastStatus}).`);
}

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const [west, south, east, north] = bounds(pkg);
const elements = (await fetchOverpass(query(south, west, north, east))).elements ?? [];
const studyArea = pkg.project.townStudyArea?.bufferedBoundary ?? pkg.project.boundary;
let added = 0;
let linked = 0;
let outsideStudyArea = 0;
let withoutCoordinates = 0;
const totals: Record<CommunityCategory, number> = {
  food: 0,
  picnic: 0,
  art: 0,
  memorial: 0,
  historic: 0,
  leisure: 0,
  visitor: 0,
  amenities: 0,
  parking: 0,
  nature: 0,
};

for (const element of elements) {
  const tags = element.tags ?? {};
  const category = categoryFor(tags);
  const location = coordinates(element);
  if (!category) continue;
  if (!location) {
    withoutCoordinates += 1;
    continue;
  }
  const geometry: Point = { type: 'Point', coordinates: location };
  if (!booleanPointInPolygon(geometry, studyArea)) {
    outsideStudyArea += 1;
    continue;
  }
  const label = typeLabel(tags, category);
  const source = sourceRecord(element, tags);
  const sourceId = source.sourceRecordId as string;
  const existingBySource = pkg.features.find((feature) =>
    feature.sourceRecords.some((record) => record.sourceRecordId === sourceId),
  );
  if (existingBySource) {
    existingBySource.sourceRecords = [
      ...existingBySource.sourceRecords.filter((record) => record.sourceRecordId !== sourceId),
      source,
    ];
    existingBySource.updatedAt = accessedAt;
    if (existingBySource.tags.includes('osm-community-place')) {
      existingBySource.tags = [
        ...existingBySource.tags.filter((tag) => !tag.startsWith('osm-community-')),
        'osm-community-place',
        `osm-community-${category}`,
      ];
      existingBySource.featureType = label.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '_');
      existingBySource.shortDescription = `Current OpenStreetMap ${label.toLocaleLowerCase()}. It is a present-day community/place reference, not historic-date evidence.`;
    }
    linked += 1;
    continue;
  }
  const name = tags.name?.trim() || label;
  const matchingRecord = tags.name
    ? nearbyMatchingFeature(pkg.features, name, location)
    : undefined;
  if (matchingRecord) {
    matchingRecord.sourceRecords = [...matchingRecord.sourceRecords, source];
    matchingRecord.updatedAt = accessedAt;
    matchingRecord.reviewNotes =
      `${matchingRecord.reviewNotes ?? ''} Current OSM community-place record ${sourceId} is linked for present-day reference; it is not a separate duplicate feature.`.trim();
    linked += 1;
    continue;
  }
  const isWithinProjectBoundary = booleanPointInPolygon(geometry, pkg.project.boundary);
  pkg.features.push({
    id: `osm-community:${element.type}-${element.id}`,
    projectId: pkg.project.id,
    name,
    alternativeNames: [],
    countryCode: pkg.project.countryCode,
    region: pkg.project.region,
    locality: pkg.project.locality,
    featureType: label.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, '_'),
    significance: 'recognised',
    geometry,
    locationType: element.type === 'node' ? 'exact' : 'representative_point',
    locationConfidence: element.type === 'node' ? 'high' : 'medium',
    dateBasis: 'unknown',
    dateConfidence: 'unknown',
    survival: 'unknown',
    shortDescription: `Current OpenStreetMap ${label.toLocaleLowerCase()}. It is a present-day community/place reference, not historic-date evidence.`,
    sourceRecords: [source],
    licence: source.licence,
    tags: ['current-context', 'osm-community-place', `osm-community-${category}`],
    createdAt: accessedAt,
    updatedAt: accessedAt,
    reviewed: false,
    reviewNotes:
      'Imported from OpenStreetMap for an optional present-day icon layer. Excluded from historic timeline filtering, heat scoring, historic feature totals and heritage exports.',
    evidenceScope: isWithinProjectBoundary ? 'parish_evidence' : 'related_context',
  });
  totals[category] += 1;
  added += 1;
}

const sourceDefinition: DataSourceDefinition = {
  id: 'osm-current-community-places',
  name: 'OpenStreetMap current community places',
  organisation: 'OpenStreetMap contributors',
  coverage: `Food and drink, picnic/rest, art, memorial, historic, leisure, visitor, amenity, parking and natural-sight places within the ${pkg.project.townStudyArea?.localityName ?? pkg.project.locality} study area plus its ${pkg.project.townStudyArea?.bufferMetres ?? 0}m buffer.`,
  accessMethod:
    'Read-only Overpass API query, then exact point-in-study-area filtering and source-ID/name-proximity deduplication.',
  sourceUrl: 'https://www.openstreetmap.org/copyright',
  licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
  reliability: 'discovery_only',
  limitations:
    'Current voluntary mapping only. Tags, names and locations may change; this optional icon layer is excluded from historic evidence, dates, heat scoring, totals and historic exports.',
};
pkg.sources = [
  sourceDefinition,
  ...pkg.sources.filter((source) => source.id !== sourceDefinition.id),
];
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Imported ${added} OSM community place(s) (${Object.entries(totals)
    .map(([category, count]) => `${category}=${count}`)
    .join(
      ', ',
    )}); linked ${linked}; excluded ${outsideStudyArea} outside study area and ${withoutCoordinates} without coordinates.`,
);
