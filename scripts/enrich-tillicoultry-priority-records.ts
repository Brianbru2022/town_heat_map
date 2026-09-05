import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/tillicoultry.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

function findFeature(id: string): HeritageFeature {
  const feature = pkg.features.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Missing expected Tillicoultry feature: ${id}`);
  return feature;
}

function addSource(feature: HeritageFeature, source: SourceRecord): void {
  if (
    feature.sourceRecords.some(
      (candidate) =>
        candidate.sourceOrganisation === source.sourceOrganisation &&
        candidate.sourceRecordId === source.sourceRecordId,
    )
  )
    return;
  feature.sourceRecords.push(source);
}

// Council's appraisal dates the surviving Popular Institute tower to 1879, while
// the supplied curated source gives 1878. Preserve the small source disagreement
// instead of collapsing it to a false exact year.
const popularInstituteTower = findFeature('curated:hes-lb42050');
Object.assign(popularInstituteTower, {
  documentedDateText:
    'Clock tower added 1878–79 (sources differ); former Popular Institute built 1859 and demolished 1986',
  earliestPossibleYear: 1878,
  latestPossibleYear: 1879,
  datePrecision: 'conflicting contemporary/heritage-source years',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Date review completed: the supplied curated source records 1878 and the Clackmannanshire Council conservation-area appraisal records 1879. The public timeline retains that narrow conflict; the 1859 institute and 1986 demolition are not represented as the tower construction date.',
});

// A dated NRHE photograph establishes that the mill was present by 1926. It does
// not establish a build year, so it deliberately uses present_by wording.
const middletonMills = findFeature('nrhe:48275');
Object.assign(middletonMills, {
  documentedDateText: 'Present by c.1926 (dated NRHE photographs; not a construction date)',
  earliestPossibleYear: 1926,
  latestPossibleYear: 1926,
  datePrecision: 'photographic present-by evidence',
  dateBasis: 'present_by',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Date review completed from the NRHE/Canmore collection listing: several Middleton Mills photographs are dated c.1926. This establishes site presence by that date only.',
});
addSource(middletonMills, {
  sourceName: 'Historic Environment Scotland NRHE/Canmore collection catalogue',
  sourceOrganisation: 'Historic Environment Scotland',
  sourceRecordId: '48275',
  sourceUrl: 'https://canmore.org.uk/site/48275/tillicoultry-middleton-mills?display=collection',
  accessedAt,
  licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
  notes:
    'Collection catalogue lists multiple views of the Middleton Mills entrance offices and machinery as c.1926.',
  reliability: 'official_non_statutory',
});

// The local authority's asset register confirms that the mapped NRHE point is
// Murray Square Clock. The register has no construction date, so the date queue
// remains explicit rather than inventing a year.
const murraySquareClock = findFeature('nrhe:220130');
Object.assign(murraySquareClock, {
  name: 'Murray Square Clock',
  alternativeNames: [
    'Murray Square Clock Tower',
    'Clock Tower, The Howff',
    'Tillicoultry, Murray Square, General',
  ],
  featureType: 'clock_tower',
  designationType: 'NRHE record / council historic structure',
  documentedDateText:
    'Built around 1930 as part of the Murray Square bus-station development (exact year awaiting archive confirmation)',
  earliestPossibleYear: 1928,
  latestPossibleYear: 1932,
  datePrecision: 'circa-year secondary-source evidence',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  shortDescription:
    'Council-owned historic clock structure at Murray Square; the linked NRHE record previously used the generic catalogue title “Tillicoultry, Murray Square, General”.',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Identity and location verified against Clackmannanshire Council asset TIL650 and NRHE record 220130. A secondary local-history source dates the tower to around 1930 as part of the bus-station development; the supplied 1931 year remains an archive-review target and is not presented as exact.',
});
addSource(murraySquareClock, {
  sourceName: 'Clackmannanshire Council Estates Asset Register',
  sourceOrganisation: 'Clackmannanshire Council',
  sourceRecordId: 'TIL650',
  sourceUrl: 'https://www.clacks.gov.uk/form/1367.pdf',
  accessedAt,
  notes: 'Lists Murray Square Clock, Tillicoultry FK13 6DS as an operational historic structure.',
  reliability: 'local_authority',
});
addSource(murraySquareClock, {
  sourceName: 'Undiscovered Scotland: Tillicoultry local-history summary',
  sourceOrganisation: 'Undiscovered Scotland',
  sourceUrl: 'https://www.undiscoveredscotland.co.uk/tillicoultry/tillicoultry/',
  accessedAt,
  notes:
    'Describes the Murray Square tower as built around 1930 as part of the dedicated bus-station development.',
  reliability: 'secondary',
});

// NRHE 364500 is a prehistoric burial-cairn record located at Westertown. It is
// not a record for the historic village itself, so name it accordingly before
// publishing separate, clearly approximate settlement-core evidence.
const westertownCairn = findFeature('nrhe:364500');
Object.assign(westertownCairn, {
  name: 'Westertown (Cairntown) burial cairn',
  alternativeNames: ['Cairntown', 'Cairnton Place', 'Westertown'],
  updatedAt: accessedAt,
  reviewNotes:
    'This NRHE representative point is for a prehistoric burial cairn, not the extent or centre of the historic Westertown settlement.',
});

const westertownSettlementId = 'curated:westertown-historic-core';
const existingWestertownSettlement = pkg.features.find(
  (feature) => feature.id === westertownSettlementId,
);
if (!existingWestertownSettlement) {
  pkg.features.push({
    id: westertownSettlementId,
    projectId: pkg.project.id,
    name: 'Westertown historic settlement core',
    alternativeNames: ['Westertown', 'Cairntown', 'Cairton'],
    countryCode: pkg.project.countryCode,
    region: pkg.project.region,
    locality: pkg.project.locality,
    featureType: 'settlement_pattern',
    designationType: 'Historic settlement evidence',
    significance: 'local',
    // The Council identifies an area, rather than a surveyed point. This point is
    // intentionally approximate at the Burnside/Shillinghill historic core.
    geometry: { type: 'Point', coordinates: [-3.749, 56.156] },
    locationType: 'approximate',
    documentedDateText:
      'Westertown historic core in the Burnside/Shillinghill area; parish cloth manufacture first documented in the 1560s (not a settlement construction date)',
    earliestPossibleYear: 1560,
    latestPossibleYear: 1569,
    datePrecision: 'documented decade / settlement-context evidence',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    locationConfidence: 'low',
    survival: 'heavily_altered',
    shortDescription:
      'Interpretive point for the historic Westertown core, not a surveyed boundary. The settlement developed into modern Tillicoultry.',
    sourceRecords: [
      {
        sourceName: 'Tillicoultry Conservation Area Character Appraisal, February 2018',
        sourceOrganisation: 'Clackmannanshire Council',
        sourceUrl: 'https://www.clacks.gov.uk/document/6454.pdf',
        accessedAt,
        notes:
          'The appraisal identifies Westertown as the early settlement in the Burnside/Shillinghill area and states that the first definite cloth manufacture in the parish dates to the 1560s.',
        reliability: 'local_authority',
      },
    ],
    tags: ['settlement-evidence', 'westertown', 'interpretive-location'],
    createdAt: accessedAt,
    updatedAt: accessedAt,
    reviewed: true,
    reviewNotes:
      'Location is an approximate interpretive point for the Council-described area. It must not be read as a complete settlement boundary or the location of the NRHE burial cairn.',
  });
}

// These two mill sites have direct, named historical evidence in the Council
// appraisal and the official NRHE/Trove record.  They are kept as site date
// ranges rather than pretending every surviving component was built in one year.
const devonvaleMill = findFeature('nrhe:48274');
Object.assign(devonvaleMill, {
  documentedDateText:
    'Established 1846; production transferred here in 1851; surviving main mill building dates from the 1860s',
  earliestPossibleYear: 1846,
  latestPossibleYear: 1869,
  datePrecision: 'documented site-development range',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Date review completed from the official NRHE/Trove record. The range describes the development of the Devonvale Mills site; it is not asserted as a single construction date for every component.',
});
addSource(devonvaleMill, {
  sourceName: 'Historic Environment Scotland NRHE/Trove detailed Devonvale Mills record',
  sourceOrganisation: 'Historic Environment Scotland',
  sourceRecordId: '48274-date-review',
  sourceUrl: 'https://www.trove.scot/place/48274',
  accessedAt,
  licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
  notes:
    'The record dates establishment to 1846, transfer of production to 1851 and the surviving main mill building to the 1860s.',
  reliability: 'official_non_statutory',
});

const craigfootMill = findFeature('nrhe:48283');
Object.assign(craigfootMill, {
  documentedDateText: 'Established in 1806',
  earliestPossibleYear: 1806,
  latestPossibleYear: 1806,
  datePrecision: 'documented year',
  dateBasis: 'documented_construction',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Date review completed from the Clackmannanshire Council conservation-area appraisal. It identifies Craigfoot Mill as established in 1806.',
});
addSource(craigfootMill, {
  sourceName: 'Tillicoultry Conservation Area Character Appraisal, February 2018',
  sourceOrganisation: 'Clackmannanshire Council',
  sourceRecordId: 'craigfoot-mill-date-review',
  sourceUrl: 'https://www.clacks.gov.uk/document/6454.pdf',
  accessedAt,
  notes: 'The appraisal identifies Craigfoot Mill as established in 1806.',
  reliability: 'local_authority',
});

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Enriched Tillicoultry clock-tower identities and priority date evidence.');
