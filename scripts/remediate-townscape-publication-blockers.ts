import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Geometry } from 'geojson';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const reviewedAt = '2026-09-03T00:00:00.000Z';
const hesPortalTerms = 'https://portal.historicenvironment.scot/apex/f?p=PORTAL:termsandconditions';
const hesSpatialService =
  'https://inspire.hes.scot/arcgis/rest/services/HES/HES_Designations/MapServer/2';
const osmCopyright = 'https://www.openstreetmap.org/copyright';
const clacksReuse = 'https://www.clacks.gov.uk/regulation/reuseofpublicsectorinfo/';

const hesOgl =
  'Open Government Licence v3.0 for HES spatial-download data; retain the prescribed Historic Environment Scotland and OS attribution.';
const osmOdbL = 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.';
const localHesSnapshot =
  'data/reference/scotland-hes-library.zip (Listed Buildings spatial snapshot, accessed 2026-07-30)';

type GeometryDecision = {
  id: string;
  decision: 'resolved' | 'unresolved';
  reason: string;
  evidence: string[];
};

const geometryDecisions: Record<string, GeometryDecision[]> = {
  'alloa-scotland': [
    {
      id: 'curated:context-early-street-core-1702',
      decision: 'resolved',
      reason:
        'Current named street-centre lines were checked against the council appraisal’s named 1702 core; the geometry is explicitly a present-day alignment, not an asserted 1702 cadastral boundary.',
      evidence: [
        'Clackmannanshire Council appraisal 6450',
        'OpenStreetMap ways 81231597, 334300358, 334300359, 849664983, 81231602 and 81231593',
      ],
    },
    {
      id: 'curated:context-bedford-place-expansion',
      decision: 'unresolved',
      reason:
        'The appraisal identifies the phase but not a reproducible 1820s–1830s extent; a georeferenced period map is still required.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-railway-arrival',
      decision: 'unresolved',
      reason:
        'The appraisal supports the dates, but not a period-specific branch alignment; the modern railway must not stand in for it.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-glebe-victorian-expansion',
      decision: 'unresolved',
      reason: 'A character-area description is not a surveyed Victorian development polygon.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-mill-street-3-29',
      decision: 'unresolved',
      reason:
        'The appraisal identifies a group, but the constituent buildings have not each been matched to verified current building geometry.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-baronial-buildings',
      decision: 'unresolved',
      reason:
        'The appraisal places it at Coalgate and West Vennel, but the exact building footprint has not been independently matched.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-oakleigh-house',
      decision: 'unresolved',
      reason:
        'No authoritative address-to-footprint match was found for the appraisal’s Oakleigh House reference.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
    {
      id: 'curated:context-alloa-harbour-docks',
      decision: 'unresolved',
      reason:
        'The historic harbour/dock extent and branch alignment require period mapping; no surrogate modern waterfront polygon was used.',
      evidence: ['Clackmannanshire Council appraisal 6450'],
    },
  ],
  'alva-scotland': [
    {
      id: 'curated:context-alva-house',
      decision: 'resolved',
      reason:
        'Matched to the existing HES NRHE Alva House representative point (111955, 1m stated precision).',
      evidence: ['HES NRHE/Trove record 111955'],
    },
    {
      id: 'curated:context-first-mill',
      decision: 'unresolved',
      reason:
        'The history identifies the industrial phase but does not identify a mappable first-mill site.',
      evidence: ['Gazetteer for Scotland history of Alva'],
    },
    {
      id: 'curated:context-glentana',
      decision: 'resolved',
      reason:
        'Matched to HES NRHE Glentana Mills (47074); retained as a representative point because the official record states 100m positional accuracy.',
      evidence: ['HES NRHE/Trove record 47074'],
    },
    {
      id: 'curated:context-railway',
      decision: 'resolved',
      reason:
        'Matched to HES NRHE Alva Station (139051, 1m stated precision), not a reconstructed branch-line alignment.',
      evidence: ['HES NRHE/Trove record 139051'],
    },
    {
      id: 'curated:context-games',
      decision: 'resolved',
      reason:
        'The operator and Council both locate the Games in Johnstone Park; the existing OSM park polygon supplies the location geometry.',
      evidence: [
        'Alva Games Find Us',
        'Clackmannanshire Council Johnstone and Cochrane Parks',
        'OpenStreetMap way 423424487',
      ],
    },
    {
      id: 'curated:context-illuminations',
      decision: 'resolved',
      reason:
        'Recorded as an explicitly representative point for Alva Glen from HES NRHE 47054 (10m stated precision), not as the extent of every illumination installation.',
      evidence: ['HES NRHE/Trove record 47054', 'Alva Glen Heritage Trust source'],
    },
    {
      id: 'curated:context-academy',
      decision: 'resolved',
      reason:
        'Matched to the current Alva Academy campus polygon in OSM; the record describes the continuing institution and labels the geometry as the current campus.',
      evidence: ['OpenStreetMap way 218002833', 'Alva Academy official site'],
    },
    {
      id: 'curated:memorial-carrie-johnstone-fountain',
      decision: 'unresolved',
      reason:
        'Johnstone Park is evidenced, but no source fixes the fountain within the park; a park-wide geometry would falsely imply the fountain’s footprint.',
      evidence: ['Clackmannanshire Council Johnstone and Cochrane Parks'],
    },
    {
      id: 'curated:public-art-river-spirit',
      decision: 'unresolved',
      reason:
        'The Council identifies Collylands Roundabout but no independently verified sculpture coordinate was obtained. The former Geograph citation was a different, Shetland image and has been removed.',
      evidence: ['Clackmannanshire Council River Spirit page'],
    },
  ],
  'culross-scotland': [
    {
      id: 'curated:context-nts-royal-burgh-portfolio',
      decision: 'unresolved',
      reason:
        'This is a portfolio group with several properties, not one mappable asset; it remains a non-public linking record until individual links are modelled.',
      evidence: ['National Trust for Scotland Culross page'],
    },
    {
      id: 'curated:area-culross-conservation',
      decision: 'resolved',
      reason:
        'Imported the current HES Conservation Areas spatial polygon CA143, rather than inferring an area from listed-building density.',
      evidence: ['HES Conservation Areas spatial layer CA143'],
    },
  ],
  'kincardine-on-forth-scotland': [
    {
      id: 'curated:area-kincardine-conservation',
      decision: 'resolved',
      reason: 'Imported the current HES Conservation Areas spatial polygon CA153.',
      evidence: ['HES Conservation Areas spatial layer CA153'],
    },
    {
      id: 'curated:context-burgh-of-barony-1663',
      decision: 'unresolved',
      reason:
        'The burgh history does not establish a bounded 1663 core; a historic-map interpretation remains necessary.',
      evidence: ['Kincardine Conservation Area Appraisal', 'Kincardine Local Place Plan 2024'],
    },
    {
      id: 'curated:context-high-kirk-elphinstone-core',
      decision: 'resolved',
      reason:
        'Current named street-centre lines were imported for the exact streets identified by the appraisal; this is not presented as a historic building polygon.',
      evidence: ['Kincardine Conservation Area Appraisal', 'OpenStreetMap named street ways'],
    },
    {
      id: 'curated:context-power-station',
      decision: 'unresolved',
      reason:
        'No authoritative digitised station/reclamation footprint was located; a contemporary shoreline would be misleading after demolition and reclamation.',
      evidence: ['Kincardine Local Place Plan 2024'],
    },
  ],
  'tillicoultry-scotland': [
    {
      id: 'curated:context-cloth-1560s',
      decision: 'unresolved',
      reason: 'Early cloth manufacture is a diffuse activity, not a named site in the source.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-three-villages',
      decision: 'unresolved',
      reason:
        'The three named settlement components need separately evidenced historic extents; a single broad polygon would invent their limits.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-water-mill',
      decision: 'unresolved',
      reason:
        'The source dates the first water-powered mill but does not identify a mappable site.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-glassford-square',
      decision: 'resolved',
      reason:
        'Matched to the current named Glassford Square street-centre line (OSM way 20353620).',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454', 'OpenStreetMap way 20353620'],
    },
    {
      id: 'curated:context-craigfoot-mill',
      decision: 'resolved',
      reason: 'Matched to HES NRHE Craigfoot Mill 48283 (10m stated precision).',
      evidence: ['HES NRHE/Trove record 48283'],
    },
    {
      id: 'curated:context-high-street',
      decision: 'unresolved',
      reason:
        'The source describes expansion along and south of High Street but does not supply a defensible phase boundary.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-workers-grid',
      decision: 'unresolved',
      reason:
        'The planned-grid extent needs a dated mapped comparison; it cannot be inferred from today’s street pattern alone.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-railway',
      decision: 'unresolved',
      reason:
        'No period-specific Devon Valley line alignment was imported; the current network is not a substitute.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-burgh',
      decision: 'unresolved',
      reason:
        'Police-burgh status is a civic history fact, not a discrete spatial feature in the cited source.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-flood-1883',
      decision: 'unresolved',
      reason:
        'The source establishes the event but not a surveyed impact extent or a single event location.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
    {
      id: 'curated:context-middleton',
      decision: 'resolved',
      reason:
        'Matched to HES NRHE Middleton Mills 48275; the 100m stated precision is retained as a representative point.',
      evidence: ['HES NRHE/Trove record 48275'],
    },
    {
      id: 'curated:mem-eu-ww2',
      decision: 'resolved',
      reason:
        'Matched to the HES NRHE Evangelical Union Congregational Church point 260240 (1m stated precision). IWM material remains citation-only.',
      evidence: ['HES NRHE/Trove record 260240', 'IWM War Memorials Register WMR 85053'],
    },
    {
      id: 'curated:plaque-conn',
      decision: 'unresolved',
      reason:
        'The IWM entry is citation-only and no independently verified precise plaque location was found.',
      evidence: ['IWM War Memorials Register WMR 85116'],
    },
    {
      id: 'curated:mem-walker-fountain',
      decision: 'unresolved',
      reason:
        'The appraisal identifies the fountain but no authoritative coordinate or surveyed footprint was found.',
      evidence: ['Tillicoultry Conservation Area Appraisal 6454'],
    },
  ],
};

function source(
  sourceName: string,
  sourceOrganisation: string,
  sourceRecordId: string,
  sourceUrl: string,
  licence: string,
  notes: string,
  reliability: SourceRecord['reliability'] = 'official_statutory',
): SourceRecord {
  return {
    sourceName,
    sourceOrganisation,
    sourceRecordId,
    sourceUrl,
    accessedAt: reviewedAt,
    licence,
    notes,
    reliability,
  };
}

function byId(pkg: ProjectPackage, id: string): HeritageFeature {
  const feature = pkg.features.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Missing ${id} in ${pkg.project.id}`);
  return feature;
}

function updateLocation(
  feature: HeritageFeature,
  geometry: Geometry,
  locationType: string,
  confidence: HeritageFeature['locationConfidence'],
  locationSource: SourceRecord,
  licence: string,
  note: string,
): void {
  feature.geometry = geometry;
  feature.locationType = locationType;
  feature.locationConfidence = confidence;
  feature.sourceRecords = [
    ...feature.sourceRecords.filter(
      (candidate) => candidate.sourceRecordId !== locationSource.sourceRecordId,
    ),
    locationSource,
  ];
  feature.licence = licence;
  feature.reviewed = true;
  feature.updatedAt = reviewedAt;
  feature.reviewNotes = [feature.reviewNotes, note].filter(Boolean).join(' ');
}

function addUnresolvedReason(feature: HeritageFeature, reason: string): void {
  feature.reviewNotes = [feature.reviewNotes, `Publication geometry review 2026-09-03: ${reason}`]
    .filter(Boolean)
    .join(' ');
  feature.updatedAt = reviewedAt;
}

async function readPackage(path: string): Promise<ProjectPackage> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage;
}

function multiLine(lines: number[][][]): Geometry {
  return { type: 'MultiLineString', coordinates: lines };
}

async function fetchConservationPolygon(reference: string): Promise<Geometry> {
  const body = new URLSearchParams({
    where: `DES_REF = '${reference}'`,
    outFields: 'DES_TITLE,DES_REF,ACCURACY,PRECISION,LINK,DESIGNATED,REDESIG',
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  });
  const response = await fetch(`${hesSpatialService}/query`, { method: 'POST', body });
  if (!response.ok)
    throw new Error(`HES Conservation Areas query for ${reference} failed: ${response.status}`);
  const payload = (await response.json()) as {
    features?: Array<{ geometry?: { rings?: number[][][] } }>;
  };
  const rings = payload.features?.[0]?.geometry?.rings;
  if (!rings?.length || !rings.every((ring) => ring.length >= 4))
    throw new Error(`HES Conservation Areas query for ${reference} returned no valid rings.`);
  // Both reviewed references contain one exterior ring. Retain the HES polygon verbatim in WGS84.
  return { type: 'Polygon', coordinates: rings };
}

const alloaEarlyCore = multiLine([
  [
    [-3.7901053, 56.1154087],
    [-3.7912563, 56.1148858],
  ],
  [
    [-3.7927491, 56.114163],
    [-3.7924791, 56.1142592],
    [-3.7924208, 56.1142983],
    [-3.7919358, 56.1145583],
    [-3.7917825, 56.1146453],
  ],
  [
    [-3.7912563, 56.1148858],
    [-3.7917825, 56.1146453],
  ],
  [
    [-3.7926388, 56.1137823],
    [-3.7927313, 56.1137562],
    [-3.7928274, 56.1137291],
    [-3.7930129, 56.1136438],
    [-3.7931766, 56.1135524],
    [-3.7933524, 56.1134686],
    [-3.7934918, 56.1134188],
    [-3.7935932, 56.1133578],
    [-3.7937058, 56.1132832],
    [-3.7938106, 56.1132031],
  ],
  [
    [-3.7926388, 56.1137823],
    [-3.792572, 56.113972],
    [-3.7925083, 56.1141233],
    [-3.7924791, 56.1142592],
  ],
  [
    [-3.7912209, 56.1141824],
    [-3.7914157, 56.114349],
    [-3.7917825, 56.1146453],
  ],
]);

const kincardineCore = multiLine([
  [
    [-3.7189752, 56.0682999],
    [-3.7187058, 56.0684209],
    [-3.7186096, 56.0684641],
    [-3.7185377, 56.0684652],
    [-3.7185008, 56.0684535],
  ],
  [
    [-3.7180443, 56.0686397],
    [-3.7179668, 56.0686608],
    [-3.7177391, 56.0687866],
    [-3.7176303, 56.0689176],
  ],
  [
    [-3.7186318, 56.0680963],
    [-3.7182992, 56.0683898],
  ],
  [
    [-3.7171995, 56.0691439],
    [-3.717061, 56.0691886],
    [-3.7170265, 56.0692477],
    [-3.7168604, 56.0695317],
    [-3.7166996, 56.0698916],
    [-3.7165733, 56.0701452],
    [-3.71652, 56.0702523],
    [-3.7163502, 56.0706657],
    [-3.7162836, 56.0708048],
  ],
  [
    [-3.7186318, 56.0680963],
    [-3.7189752, 56.0682999],
  ],
  [
    [-3.7189752, 56.0682999],
    [-3.7201539, 56.0686664],
  ],
]);

async function main() {
  const paths = {
    alloa: 'data/projects/alloa.json',
    alva: 'data/projects/alva.json',
    culross: 'data/projects/culross.json',
    kincardine: 'data/projects/kincardine.json',
    tillicoultry: 'data/projects/tillicoultry.json',
  };
  const [alloa, alva, culross, kincardine, tillicoultry] = await Promise.all(
    Object.values(paths).map(readPackage),
  );

  updateLocation(
    byId(alloa, 'curated:context-early-street-core-1702'),
    alloaEarlyCore,
    'street_centre_lines',
    'high',
    source(
      'OpenStreetMap named street-centre lines',
      'OpenStreetMap contributors',
      'ways/81231597,334300358,334300359,849664983,81231602,81231593',
      osmCopyright,
      osmOdbL,
      'Current named Mill Street, Coalgate and Candleriggs lines checked 2026-09-03.',
      'discovery_only',
    ),
    `${osmOdbL} The Council appraisal is cited for historical interpretation only; no Council text or media is redistributed.`,
    'Publication geometry review 2026-09-03: current named street-centre lines retained as a location reference, not as a reconstructed 1702 boundary.',
  );

  updateLocation(
    byId(alva, 'curated:context-alva-house'),
    { type: 'Point', coordinates: [-3.770835205694277, 56.15751612067375] },
    'representative_point',
    'high',
    source(
      'HES NRHE/Trove Alva House spatial record',
      'Historic Environment Scotland',
      '111955',
      'https://www.trove.scot/place/111955',
      hesOgl,
      'Representative point: NRHE states location precision within 1m.',
      'official_non_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: matched to NRHE 111955; the point represents the historic house site.',
  );
  updateLocation(
    byId(alva, 'curated:context-glentana'),
    { type: 'Point', coordinates: [-3.8077595475882626, 56.152434461095446] },
    'representative_point',
    'low',
    source(
      'HES NRHE/Trove Glentana Mills spatial record',
      'Historic Environment Scotland',
      '47074',
      'https://www.trove.scot/place/47074',
      hesOgl,
      'Representative point: NRHE states location precision within 100m.',
      'official_non_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: matched to NRHE 47074 at its stated 100m precision.',
  );
  updateLocation(
    byId(alva, 'curated:context-railway'),
    { type: 'Point', coordinates: [-3.8023945400871284, 56.150293297783435] },
    'representative_point',
    'high',
    source(
      'HES NRHE/Trove Alva Station spatial record',
      'Historic Environment Scotland',
      '139051',
      'https://www.trove.scot/place/139051',
      hesOgl,
      'Representative point: NRHE states location precision within 1m.',
      'official_non_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: matched to the station rather than inventing a branch-line alignment.',
  );
  updateLocation(
    byId(alva, 'curated:context-games'),
    byId(alva, 'osm-park:way-423424487').geometry!,
    'event_venue_polygon',
    'high',
    source(
      'OpenStreetMap Johnstone Park boundary',
      'OpenStreetMap contributors',
      'way/423424487',
      'https://www.openstreetmap.org/way/423424487',
      osmOdbL,
      'Current park boundary used because the operator and Council both identify Johnstone Park as the Games venue.',
      'discovery_only',
    ),
    `Citation and link only for the Alva Games website; no source text or media is redistributed. ${osmOdbL} for the venue geometry.`,
    'Publication geometry review 2026-09-03: operator and Council sources confirm Johnstone Park as the event venue.',
  );
  updateLocation(
    byId(alva, 'curated:context-illuminations'),
    { type: 'Point', coordinates: [-3.800009302285212, 56.15883781450308] },
    'representative_point',
    'medium',
    source(
      'HES NRHE/Trove Alva Glen spatial record',
      'Historic Environment Scotland',
      '47054',
      'https://www.trove.scot/place/47054',
      hesOgl,
      'Representative point: NRHE states location precision within 10m; it is not an extent of every illumination installation.',
      'official_non_statutory',
    ),
    `Citation and link only for the Alva Glen Heritage Trust source; no source text or media is redistributed. ${hesOgl} for the representative location.`,
    'Publication geometry review 2026-09-03: representative Alva Glen point only; no event extent is claimed.',
  );
  updateLocation(
    byId(alva, 'curated:context-academy'),
    {
      type: 'Polygon',
      coordinates: [
        [
          [-3.7927174, 56.1495382],
          [-3.7895916, 56.1499162],
          [-3.789811, 56.1505887],
          [-3.7900524, 56.1513032],
          [-3.7932115, 56.150711],
          [-3.7927174, 56.1495382],
        ],
      ],
    },
    'current_campus_geometry',
    'high',
    source(
      'OpenStreetMap Alva Academy campus',
      'OpenStreetMap contributors',
      'way/218002833',
      'https://www.openstreetmap.org/way/218002833',
      osmOdbL,
      'The current named school campus is represented; it does not assert the historic site of every predecessor building.',
      'discovery_only',
    ),
    `Citation and link only for the Academy website; no source text or media is redistributed. ${osmOdbL} for current-campus geometry.`,
    'Publication geometry review 2026-09-03: current academy campus location verified in OSM; historic relocation remains described separately.',
  );
  // Correct the earlier unrelated Geograph attribution before retaining the record for location review.
  const riverSpirit = byId(alva, 'curated:public-art-river-spirit');
  riverSpirit.sourceRecords = riverSpirit.sourceRecords.filter(
    (record) => record.sourceUrl !== 'https://www.geograph.org.uk/photo/457033',
  );
  riverSpirit.licence =
    'Citation and link only: no Council source text, images or media are redistributed.';
  riverSpirit.reviewNotes = [
    riverSpirit.reviewNotes,
    'Publication provenance review 2026-09-03: removed unrelated Geograph photo 457033 (North Sandwick, Shetland); Council source confirms Collylands Roundabout but no verified point is recorded.',
  ]
    .filter(Boolean)
    .join(' ');

  const culrossPolygon = await fetchConservationPolygon('CA143');
  updateLocation(
    byId(culross, 'curated:area-culross-conservation'),
    culrossPolygon,
    'official_designation_polygon',
    'high',
    source(
      'HES Conservation Areas spatial layer',
      'Historic Environment Scotland',
      'CA143',
      hesSpatialService,
      hesOgl,
      'Current official polygon queried 2026-09-03. HES reports within 5 metres precision.',
      'official_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: imported HES CA143 rather than estimating a boundary.',
  );
  const witchPlaque = byId(culross, 'community:culross-witch-memorial-plaque');
  witchPlaque.licence =
    'CC0 for Wikidata structured data used for the coordinate and basic metadata. Citation and link only for the Women of Scotland source; no source text, images or media are redistributed.';
  witchPlaque.sourceRecords = witchPlaque.sourceRecords.map((record) =>
    record.sourceOrganisation === 'Women of Scotland'
      ? {
          ...record,
          licence: 'Citation and link only: no source text, images or media are redistributed.',
          notes:
            'Reuse terms were not supplied; this source is retained only as a link and is not redistributed.',
        }
      : record,
  );
  witchPlaque.reviewNotes = [
    witchPlaque.reviewNotes,
    'Publication licence review 2026-09-03: public record relies only on CC0 Wikidata structured data for coordinate/metadata; linked Women of Scotland material is not redistributed.',
  ]
    .filter(Boolean)
    .join(' ');
  witchPlaque.updatedAt = reviewedAt;

  const kincardinePolygon = await fetchConservationPolygon('CA153');
  updateLocation(
    byId(kincardine, 'curated:area-kincardine-conservation'),
    kincardinePolygon,
    'official_designation_polygon',
    'high',
    source(
      'HES Conservation Areas spatial layer',
      'Historic Environment Scotland',
      'CA153',
      hesSpatialService,
      hesOgl,
      'Current official polygon queried 2026-09-03. HES reports within 5 metres precision.',
      'official_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: imported HES CA153 rather than estimating a boundary.',
  );
  updateLocation(
    byId(kincardine, 'curated:context-high-kirk-elphinstone-core'),
    kincardineCore,
    'street_centre_lines',
    'high',
    source(
      'OpenStreetMap named street-centre lines',
      'OpenStreetMap contributors',
      'ways/914151055,914151058,914151059,28915063,914151053,914151054',
      osmCopyright,
      osmOdbL,
      'Current named High Street, Kirk Street and Elphinstone Street lines checked 2026-09-03.',
      'discovery_only',
    ),
    `${osmOdbL} The Council appraisal is cited for historical interpretation only; no Council text or media is redistributed.`,
    'Publication geometry review 2026-09-03: current named street-centre lines retained as an interpretable location reference, not historic building footprints.',
  );

  updateLocation(
    byId(tillicoultry, 'curated:context-glassford-square'),
    {
      type: 'LineString',
      coordinates: [
        [-3.7492337, 56.156882],
        [-3.7487336, 56.1569351],
        [-3.7486034, 56.1569395],
        [-3.7477425, 56.1571427],
      ],
    },
    'street_centre_line',
    'high',
    source(
      'OpenStreetMap Glassford Square street-centre line',
      'OpenStreetMap contributors',
      'way/20353620',
      'https://www.openstreetmap.org/way/20353620',
      osmOdbL,
      'Current named street line checked 2026-09-03.',
      'discovery_only',
    ),
    `${osmOdbL} The Council appraisal is cited for historical interpretation only; no Council text or media is redistributed.`,
    'Publication geometry review 2026-09-03: current named Glassford Square line retained as a location reference.',
  );
  updateLocation(
    byId(tillicoultry, 'curated:context-craigfoot-mill'),
    { type: 'Point', coordinates: [-3.751354656788766, 56.1582790524982] },
    'representative_point',
    'medium',
    source(
      'HES NRHE/Trove Craigfoot Mill spatial record',
      'Historic Environment Scotland',
      '48283',
      'https://www.trove.scot/place/48283',
      hesOgl,
      'Representative point: NRHE states location precision within 10m.',
      'official_non_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: matched to NRHE 48283.',
  );
  updateLocation(
    byId(tillicoultry, 'curated:context-middleton'),
    { type: 'Point', coordinates: [-3.7499202241945153, 56.15506445530266] },
    'representative_point',
    'low',
    source(
      'HES NRHE/Trove Middleton Mills spatial record',
      'Historic Environment Scotland',
      '48275',
      'https://www.trove.scot/place/48275',
      hesOgl,
      'Representative point: NRHE states location precision within 100m.',
      'official_non_statutory',
    ),
    hesOgl,
    'Publication geometry review 2026-09-03: matched to NRHE 48275 at its stated 100m precision.',
  );
  updateLocation(
    byId(tillicoultry, 'curated:mem-eu-ww2'),
    { type: 'Point', coordinates: [-3.7395515776589763, 56.153287909230805] },
    'representative_point',
    'high',
    source(
      'HES NRHE/Trove Evangelical Union Church spatial record',
      'Historic Environment Scotland',
      '260240',
      'https://www.trove.scot/place/260240',
      hesOgl,
      'Representative church point: NRHE states location precision within 1m. This does not claim the memorial’s exact fixing within the church.',
      'official_non_statutory',
    ),
    `Citation and link only for IWM War Memorials Register material; no IWM source text, images or media are redistributed. ${hesOgl} for the church location.`,
    'Publication geometry review 2026-09-03: church representative point used; the IWM memorial source remains citation-only.',
  );

  for (const pkg of [alloa, alva, culross, kincardine, tillicoultry]) {
    for (const decision of geometryDecisions[pkg.project.id] ?? []) {
      if (decision.decision === 'unresolved')
        addUnresolvedReason(byId(pkg, decision.id), decision.reason);
    }
  }

  const licenceIds = new Set([
    'hes-listed-building:LB1979',
    'hes-listed-building:LB52529',
    'hes-listed-building:LB13',
    'hes-listed-building:LB14',
    'hes-listed-building:LB15',
    'hes-listed-building:LB16',
    'hes-listed-building:LB1956',
    'hes-listed-building:LB16615',
    'hes-listed-building:LB16617',
    'hes-listed-building:LB16626',
    'hes-listed-building:LB16636',
    'hes-listed-building:LB16637',
    'hes-listed-building:LB16638',
    'hes-listed-building:LB16639',
    'hes-listed-building:LB16640',
    'hes-listed-building:LB16641',
    'hes-listed-building:LB16643',
    'hes-listed-building:LB16648',
    'hes-listed-building:LB16650',
    'hes-listed-building:LB16651',
    'hes-listed-building:LB16652',
    'hes-listed-building:LB17131',
    'hes-listed-building:LB19120',
    'hes-listed-building:LB19123',
    'curated:hes-lb13856',
    'curated:hes-lb19727',
    'curated:hes-lb15204',
    'curated:hes-lb15205',
    'hes-listed-building:LB1935',
    'hes-listed-building:LB1936',
    'hes-listed-building:LB1995',
    'hes-listed-building:LB51095',
  ]);
  const resolvedLicences: Array<{ projectId: string; id: string; name: string }> = [];
  for (const pkg of [alva, culross, tillicoultry]) {
    for (const feature of pkg.features.filter((candidate) => licenceIds.has(candidate.id))) {
      feature.licence = hesOgl;
      feature.sourceRecords = [
        ...feature.sourceRecords.map((record) =>
          record.sourceOrganisation === 'Historic Environment Scotland'
            ? {
                ...record,
                licence: hesOgl,
                notes: [
                  record.notes,
                  `Licence review 2026-09-03: local HES Listed Buildings spatial snapshot retained at ${localHesSnapshot}.`,
                ]
                  .filter(Boolean)
                  .join(' '),
              }
            : record,
        ),
        source(
          'HES local Listed Buildings spatial snapshot',
          'Historic Environment Scotland',
          feature.id.replace(/^.*:/, ''),
          'https://inspire.hes.scot/AtomService/DATA/lb_scotland.zip',
          hesOgl,
          `Verified against ${localHesSnapshot}.`,
          'official_statutory',
        ),
      ];
      delete feature.publication;
      feature.reviewed = true;
      feature.updatedAt = reviewedAt;
      feature.reviewNotes = [
        feature.reviewNotes,
        'Publication licence review 2026-09-03: verified against the locally held HES Listed Buildings spatial snapshot, licensed under OGL v3.0 with HES/OS attribution.',
      ]
        .filter(Boolean)
        .join(' ');
      resolvedLicences.push({ projectId: pkg.project.id, id: feature.id, name: feature.name });
    }
  }

  const packages = [alloa, alva, culross, kincardine, tillicoultry];
  for (const pkg of packages) {
    pkg.validation = validateFeatures(pkg.project, pkg.features);
    const errors = pkg.validation.filter((item) => item.severity === 'error');
    if (errors.length)
      throw new Error(
        `${pkg.project.id} has ${errors.length} validation error(s); refusing to write.`,
      );
  }
  await Promise.all([
    writeFile(resolve(paths.alloa), `${JSON.stringify(alloa, null, 2)}\n`),
    writeFile(resolve(paths.alva), `${JSON.stringify(alva, null, 2)}\n`),
    writeFile(resolve(paths.culross), `${JSON.stringify(culross, null, 2)}\n`),
    writeFile(resolve(paths.kincardine), `${JSON.stringify(kincardine, null, 2)}\n`),
    writeFile(resolve(paths.tillicoultry), `${JSON.stringify(tillicoultry, null, 2)}\n`),
  ]);

  const decisions = Object.entries(geometryDecisions).flatMap(([projectId, entries]) =>
    entries.map((entry) => ({ projectId, ...entry })),
  );
  const report = {
    reviewedAt,
    scope: 'Material publication blockers from the 2026-09-03 Townscape Guides audit.',
    geometry: {
      resolved: decisions.filter((entry) => entry.decision === 'resolved'),
      unresolved: decisions.filter((entry) => entry.decision === 'unresolved'),
    },
    licence: {
      sourceCohorts: [
        {
          source: 'Historic Environment Scotland Listed Buildings spatial snapshot',
          determination:
            'Resolved 33 records against the locally held HES Listed Buildings dataset. The local library, source metadata and current HES Portal terms identify this spatial download as OGL v3.0 with prescribed HES and OS attribution.',
          evidence: [
            localHesSnapshot,
            'data/reference/SCOTLAND_HES_LIBRARY.md',
            hesPortalTerms,
            hesSpatialService,
          ],
          records: resolvedLicences,
        },
        {
          source: 'Women of Scotland memorial record',
          determination:
            'No reuse licence found; retain only a citation link. The Culross plaque’s public coordinate/metadata relies on Wikidata structured data under CC0.',
          evidence: [
            'https://www.wikidata.org/wiki/Q123250198',
            'https://womenofscotland.org.uk/memorials/plaque-alleged-witches-culross',
          ],
          records: [{ projectId: culross.project.id, id: witchPlaque.id, name: witchPlaque.name }],
        },
        {
          source: 'Clackmannanshire Council documents and pages',
          determination:
            'Used as evidence/citation only. The Council reuse page requires a reuse request where needed and flags third-party material; no Council text or media is redistributed by these geometry remediations.',
          evidence: [clacksReuse],
        },
      ],
    },
  };
  const markdown = [
    '# Townscape Guides Publication-blocker Remediation',
    '',
    `Reviewed: ${reviewedAt}`,
    '',
    `Geometry: ${report.geometry.resolved.length} resolved; ${report.geometry.unresolved.length} remains non-publishable.`,
    `Licence: ${resolvedLicences.length} HES Listed Buildings records resolved from the local OGL spatial snapshot; the Culross plaque is retained from CC0 Wikidata metadata with the Women of Scotland record citation-only.`,
    '',
    '## Geometry resolved',
    '',
    ...report.geometry.resolved.map(
      (entry) => `- **${entry.projectId} / ${entry.id}:** ${entry.reason}`,
    ),
    '',
    '## Geometry still non-publishable',
    '',
    ...report.geometry.unresolved.map(
      (entry) => `- **${entry.projectId} / ${entry.id}:** ${entry.reason}`,
    ),
    '',
    '## Licence determinations',
    '',
    '- HES Listed Buildings: the locally held spatial snapshot is the provenance for this cohort and is OGL v3.0; retain the prescribed Historic Environment Scotland and OS attribution.',
    '- Women of Scotland: no reuse licence was obtained; only a link is retained. The Culross plaque coordinate/basic metadata comes from Wikidata CC0 structured data.',
    '- Clackmannanshire Council: treated as evidence/citation only in this remediation; no Council text or media is redistributed.',
    '',
  ].join('\n');
  await Promise.all([
    writeFile(
      resolve('data/review/townscape-publication-remediation-2026-09-03.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(resolve('data/review/townscape-publication-remediation-2026-09-03.md'), markdown),
  ]);
  console.log(
    `Remediated ${report.geometry.resolved.length} geometry records; ${report.geometry.unresolved.length} remain non-publishable; resolved ${resolvedLicences.length} HES local-source licence records.`,
  );
}

await main();
