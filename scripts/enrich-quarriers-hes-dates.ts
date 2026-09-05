import { readFile, writeFile } from 'node:fs/promises';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const path = 'data/projects/quarriers-village.json';
const reviewedAt = new Date().toISOString();

type DateEvidence = {
  earliest: number;
  latest: number;
  text: string;
  featureType: HeritageFeature['featureType'];
  description: string;
};

// Dates transcribed from the corresponding HES listed-building descriptions.
// Each keeps its source wording/range rather than inventing a single year.
const evidence: Record<string, DateEvidence> = {
  LB13232: {
    earliest: 1894,
    latest: 1907,
    text: 'Built in stages, 1894–1907; chapel dated 1934',
    featureType: 'hospital',
    description:
      'Former Bridge of Weir tuberculosis hospital founded by William Quarrier; the listed main blocks were built in stages.',
  },
  LB48940: {
    earliest: 1888,
    latest: 1910,
    text: '1888, with additions and alterations circa 1900 and circa 1910',
    featureType: 'church',
    description:
      'Mount Zion Church, the focal church and clock-tower landmark of Quarrier’s Village.',
  },
  LB50021: {
    earliest: 1886,
    latest: 1886,
    text: '1886',
    featureType: 'house',
    description: 'Homelea, William Quarrier’s house and office, designed by Robert Bryden.',
  },
  LB50584: {
    earliest: 1886,
    latest: 1886,
    text: '1886',
    featureType: 'house',
    description: 'Alan Dick Home, a Tudor-Gothic cottage home designed by Robert Alexander Bryden.',
  },
  LB50585: {
    earliest: 1881,
    latest: 1881,
    text: '1881',
    featureType: 'house',
    description:
      'Bethesda, a large villa and the village’s former post office, designed by Robert A Bryden.',
  },
  LB50586: {
    earliest: 1897,
    latest: 1897,
    text: '1897',
    featureType: 'house',
    description: 'Glenfarg, an elaborate late-1890s villa with Baronial and Jacobean details.',
  },
  LB50587: {
    earliest: 1884,
    latest: 1884,
    text: 'Circa 1884',
    featureType: 'house',
    description:
      'Overtoun, a Tudor-Gothic villa home forming a stylistic pair with Alan Dick Home.',
  },
  LB50588: {
    earliest: 1893,
    latest: 1893,
    text: 'Dated 1893',
    featureType: 'house',
    description:
      'Sabbath School Home, a Baronial villa used for children’s arrival and Sunday-school gatherings.',
  },
  LB50589: {
    earliest: 1901,
    latest: 1901,
    text: '1901',
    featureType: 'hospital',
    description:
      'The Marcus Humphrey House, formerly Elise Hospital, an early cottage hospital by Robert A Bryden.',
  },
};

const pkg = JSON.parse(await readFile(path, 'utf8')) as ProjectPackage;
let enriched = 0;
for (const feature of pkg.features) {
  const reference = feature.sourceRecords.find(
    (source) => source.sourceName === 'Historic Environment Scotland Listed Buildings spatial data',
  )?.sourceRecordId;
  const date = reference ? evidence[reference] : undefined;
  if (!date) continue;
  feature.featureType = date.featureType;
  feature.documentedDateText = date.text;
  feature.earliestPossibleYear = date.earliest;
  feature.latestPossibleYear = date.latest;
  feature.datePrecision =
    date.earliest === date.latest ? 'Documented year' : 'Documented construction range';
  feature.dateBasis = 'documented_date_range';
  feature.dateConfidence = 'high';
  feature.shortDescription = date.description;
  feature.sourceRecords = feature.sourceRecords.map((source) =>
    source.sourceRecordId === reference
      ? {
          ...source,
          accessedAt: reviewedAt,
          quotedDateText: date.text,
          notes:
            `${source.notes ?? ''} Construction date reviewed against the HES listed-building description: ${date.text}.`.trim(),
        }
      : source,
  );
  feature.updatedAt = reviewedAt;
  feature.reviewed = true;
  feature.reviewNotes =
    'Construction date transcribed from the linked HES listed-building description; later alterations remain separately stated in the date wording.';
  enriched += 1;
}

if (enriched !== Object.keys(evidence).length)
  throw new Error(
    `Expected to enrich ${Object.keys(evidence).length} HES records but enriched ${enriched}.`,
  );
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Applied reviewed HES construction-date evidence to ${enriched} Quarrier's Village records.`,
);
