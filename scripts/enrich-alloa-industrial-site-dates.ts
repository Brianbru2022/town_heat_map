import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  DateBasis,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

interface IndustrialReview {
  id: string;
  date: string;
  earliest: number;
  latest: number;
  basis: DateBasis;
  precision: string;
  note: string;
  source: SourceRecord;
}

function localHistorySource(sourceName: string, sourceUrl: string, notes: string): SourceRecord {
  return {
    sourceName,
    sourceOrganisation: 'Clackmannanshire local-history source',
    sourceUrl,
    accessedAt,
    reliability: 'secondary',
    notes,
  };
}

const minesUrl = 'https://www.clackmannanshire.scot/index.php/history/clackmannanshires-mines';
const reviews: IndustrialReview[] = [
  {
    id: 'nrhe:130814',
    date: 'Devon Colliery operated 1879–1960 (mine-operation period; not a date for every component)',
    earliest: 1879,
    latest: 1960,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to colliery operation, not a single construction phase.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'Lists Devon Colliery as operating from 1879 to March 1960.',
    ),
  },
  {
    id: 'nrhe:133239',
    date: 'Meta (Devon No. 3) Colliery operated 1923–1959 (mine-operation period)',
    earliest: 1923,
    latest: 1959,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to the identified Meta / Devon No. 3 colliery operation.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'Lists Devon No. 3 (Meta) as operating from 1923 to March 1959.',
    ),
  },
  {
    id: 'nrhe:130817',
    date: 'Forthbank 1 and 2 Colliery operated 1947–1958 (mine-operation period)',
    earliest: 1947,
    latest: 1958,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to operation of Forthbank 1 and 2, not every associated structure.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'Lists Forthbank as operating from 1947 to January 1958.',
    ),
  },
  {
    id: 'nrhe:130821',
    date: 'Glenochil Colliery operated 1952–1962 (mine-operation period)',
    earliest: 1952,
    latest: 1962,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to colliery operation, not a single construction phase.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'Lists Glenochil as operating from 1952 to June 1962.',
    ),
  },
  {
    id: 'nrhe:130823',
    date: "King o' Muirs No. 1 Colliery operated 1938–1954 (mine-operation period)",
    earliest: 1938,
    latest: 1954,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to King o’ Muirs No. 1 colliery operation.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      "Lists King o' Muirs No. 1 as operating from 1938 to March 1954.",
    ),
  },
  {
    id: 'nrhe:133242',
    date: "King o' Muirs No. 2 operated 1950–1957 (No. 3 element remains separately undated)",
    earliest: 1950,
    latest: 1957,
    basis: 'documented_date_range',
    precision: 'partially documented multi-component operation range',
    note: 'Industrial date review completed from a named local-history mine register. The source dates No. 2 only; the public wording keeps the No. 3 component explicitly unresolved.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      "Lists King o' Muirs No. 2 as operating from 1950 to May 1957.",
    ),
  },
  {
    id: 'nrhe:279000',
    date: 'Jellyholm Colliery operated 1887–1921 (mine-operation period)',
    earliest: 1887,
    latest: 1921,
    basis: 'documented_date_range',
    precision: 'documented mine-operation range',
    note: 'Industrial date review completed from a named local-history mine register. The dates refer to operation of Jellyholm pit near the west end of Gartmorn Dam.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'Lists Jellyholm Colliery as started in 1887 and closed in 1921.',
    ),
  },
  {
    id: 'nrhe:111966',
    date: 'Collyland Colliery engine pit sunk in 1764; waggonway connection recorded in 1771',
    earliest: 1764,
    latest: 1771,
    basis: 'documented_date_range',
    precision: 'documented early operational milestones',
    note: 'Industrial date review completed from a named local-history mine register. The range records the engine-pit and transport milestones for the colliery site, not construction dates for every later component.',
    source: localHistorySource(
      'Clackmannanshire mines register',
      minesUrl,
      'States that Collyland’s engine pit was sunk in 1764 and it received a waggonway connection in 1771.',
    ),
  },
  {
    id: 'nrhe:111972',
    date: 'Devon Iron Works foundation stone laid 27 July 1792',
    earliest: 1792,
    latest: 1792,
    basis: 'documented_construction',
    precision: 'documented foundation-stone date',
    note: 'Industrial date review completed from a named historical account. This replaces the earlier broad modern tramway classification with a direct date for the Devon Iron Works foundation.',
    source: localHistorySource(
      'Alloa and its Environs historical account',
      'https://www.clackmannanshire.scot/index.php/history/alloa-and-its-environs',
      'States that the foundation stone of the Devon Iron Works was laid on 27 July 1792.',
    ),
  },
  {
    id: 'nrhe:139425',
    date: 'Blackgrange brick and tile works present by 1873 (recorded site evidence; construction date not established)',
    earliest: 1873,
    latest: 1873,
    basis: 'present_by',
    precision: 'documented present-by year',
    note: 'Industrial date review completed from a named local-history mines account. It establishes brick and tile works at the site by 1873, not a construction date.',
    source: localHistorySource(
      'Clackmannanshire mines historical account',
      minesUrl,
      'Records the Hillton Fire Clay Brick and Tile works on the site in 1873.',
    ),
  },
];

function featureFor(id: string): HeritageFeature {
  const feature = pkg.features.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Expected Alloa industrial feature ${id} was not found.`);
  return feature;
}

for (const review of reviews) {
  const feature = featureFor(review.id);
  Object.assign(feature, {
    documentedDateText: review.date,
    earliestPossibleYear: review.earliest,
    latestPossibleYear: review.latest,
    dateBasis: review.basis,
    datePrecision: review.precision,
    dateConfidence: 'medium',
    sourceRecords: [
      ...feature.sourceRecords.filter(
        (source) =>
          !(
            source.sourceOrganisation === review.source.sourceOrganisation &&
            source.sourceUrl === review.source.sourceUrl
          ),
      ),
      review.source,
    ],
    tags: [
      ...new Set(
        [...feature.tags, 'alloa-industrial-date-review'].filter(
          (tag) => tag !== 'curation-priority-named-site',
        ),
      ),
    ],
    reviewed: true,
    updatedAt: accessedAt,
    reviewNotes: feature.reviewNotes?.includes(review.note)
      ? feature.reviewNotes
      : `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}${review.note}`,
  });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Added reviewed industrial date evidence to ${reviews.length} Alloa record(s).`);
