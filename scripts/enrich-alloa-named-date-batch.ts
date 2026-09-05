import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Confidence, DateBasis, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();
const councilLicence =
  'Open Government Licence v3.0 for Council-held public-sector information; acknowledge Clackmannanshire Council and do not reuse third-party material.';

function councilSource(name: string, url: string, notes: string): SourceRecord {
  return {
    sourceName: name,
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: url,
    accessedAt,
    licence: councilLicence,
    reliability: 'local_authority',
    notes,
  };
}

interface DateReview {
  id: string;
  documentedDateText: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
  datePrecision: string;
  dateBasis: DateBasis;
  dateConfidence: Confidence;
  reviewNotes: string;
  source: SourceRecord;
}

const reviews: DateReview[] = [
  {
    id: 'nrhe:47202',
    documentedDateText:
      'National Bank rebuilding at the Mill Street and High Street corner began in 1861',
    earliestPossibleYear: 1861,
    latestPossibleYear: 1861,
    datePrecision: 'documented rebuilding start year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'The source identifies the National Bank acquiring the corner properties and erecting the bank buildings in 1861. It does not establish the date of later Royal Bank occupation or later alteration.',
    source: councilSource(
      'Alloa sixty years ago',
      'https://clackmannanshire.scot/index.php/history/alloa-60-years-ago',
      'States that the National Bank acquired the Mill Street and High Street corner and began erecting its Scotch Baronial bank buildings in 1861.',
    ),
  },
  {
    id: 'nrhe:47235',
    documentedDateText:
      'Carsebridge distillery site erected and opened in 1799 (office-building date not established)',
    latestPossibleYear: 1799,
    datePrecision: 'documented site opening year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates the creation and opening of the Carsebridge distillery site, not the construction of an individual office building. The date is retained as site evidence only.',
    source: councilSource(
      'Carsebridge Distillery',
      'https://www.clackmannanshire.scot/index.php/industry-and-commerce/carsebridge-distillery',
      'States that Carsebridge Distillery was erected and opened in 1799; later site development is separately described.',
    ),
  },
  {
    id: 'nrhe:47228',
    documentedDateText:
      'West End Park documented as Alloa Athletic’s home ground in 1878 (footbridge construction date not established)',
    latestPossibleYear: 1878,
    datePrecision: 'documented site-use year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates the park’s documented sporting use, not construction of the mapped footbridge. The public wording preserves that distinction.',
    source: councilSource(
      'Alloa Athletic Football Club',
      'https://www.clackmannanshire.scot/index.php/community/alloa-athletic-football-club',
      'States that Alloa Athletic was based at West End Park when the club was founded in 1878.',
    ),
  },
  {
    id: 'nrhe:47229',
    documentedDateText:
      'West End Park documented as Alloa Athletic’s home ground in 1878 (gate construction date not established)',
    latestPossibleYear: 1878,
    datePrecision: 'documented site-use year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates the park’s documented sporting use, not construction of the mapped gates. The public wording preserves that distinction.',
    source: councilSource(
      'Alloa Athletic Football Club',
      'https://www.clackmannanshire.scot/index.php/community/alloa-athletic-football-club',
      'States that Alloa Athletic was based at West End Park when the club was founded in 1878.',
    ),
  },
  {
    id: 'nrhe:141859',
    documentedDateText:
      'Greenfield House estate constructed 1892–94 (stable date not separately documented)',
    earliestPossibleYear: 1892,
    latestPossibleYear: 1894,
    datePrecision: 'documented estate construction range',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates Greenfield House and its estate development, but does not separately date the mapped stables. The public wording makes this a contextual estate date rather than a claimed stable construction date.',
    source: councilSource(
      'Greenfield House',
      'https://clackmannanshire.scot/index.php/history/greenfield-house',
      'States that Greenfield House was designed by A. G. Sydney Mitchell and Wilson and built in 1892–94.',
    ),
  },
  {
    id: 'nrhe:165175',
    documentedDateText:
      'Henderson’s Mill Brewery malt barns at the top of the Auld Brig described in a 1920s Alloa account',
    latestPossibleYear: 1929,
    datePrecision: 'documented decade presence',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source describes the malt barns in its account of 1920s Alloa. This is present-by evidence for the brewery/maltings site, not a construction date for each surviving building.',
    source: councilSource(
      'Alloa in the 1920s historical walk',
      'https://www.clackmannanshire.scot/index.php/history/alloa-in-the-1920s',
      'Describes Henderson’s Mill Brewery beer malt barns at the top of the Auld Brig in its account of 1920s Alloa.',
    ),
  },
  {
    id: 'nrhe:252988',
    documentedDateText:
      'Harland Engineering Company registered at Longcarse Works, Alloa in 1900 (works/building date not established)',
    latestPossibleYear: 1900,
    datePrecision: 'documented business and site year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates the engineering company’s registration and Longcarse Works base, not construction of every later work, foundry or Weir Pumps building at the mapped industrial location.',
    source: councilSource(
      'Harland Engineering Co',
      'https://clackmannanshire.scot/index.php/industry-and-commerce/harland-engineering',
      'States that Harland Engineering Company was registered on 26 May 1900 for electrical engineering manufacture, based at Longcarse Works, Alloa.',
    ),
  },
  {
    id: 'nrhe:252989',
    documentedDateText:
      'R. G. Abercrombie moved to the former Grange Brewery site, accessible from Caledonian Road, in 1965 (site-use date)',
    latestPossibleYear: 1965,
    datePrecision: 'documented industrial-site move year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source dates the company’s move to the former Grange Brewery site in 1965, rather than construction of the Caledonian Road engineering buildings.',
    source: councilSource(
      'R. G. Abercrombie',
      'https://www.clackmannanshire.scot/index.php/industry-and-commerce/r-g-abercrombie',
      'States that R. G. Abercrombie moved from Broad Street Engineering Works to the former Grange Brewery site, by then accessible via Caledonian Road, in 1965.',
    ),
  },
  {
    id: 'nrhe:214774',
    documentedDateText:
      'Norwood recorded as the residence of Thomson Paton by 1910 (building date not established)',
    latestPossibleYear: 1910,
    datePrecision: 'documented residence year',
    dateBasis: 'present_by',
    dateConfidence: 'medium',
    reviewNotes:
      'The source identifies Norwood as Thomson Paton’s residence when it records his death in 1910. It is present-by evidence only and does not assert the house construction date.',
    source: councilSource(
      'Alloa sixty years ago',
      'https://clackmannanshire.scot/index.php/history/alloa-60-years-ago',
      'Records that Thomson Paton died at Norwood on 3 February 1910.',
    ),
  },
];

for (const review of reviews) {
  const feature = pkg.features.find((candidate) => candidate.id === review.id);
  if (!feature) throw new Error('Expected Alloa feature ' + review.id + ' was not found.');
  if (review.earliestPossibleYear === undefined) delete feature.earliestPossibleYear;
  else feature.earliestPossibleYear = review.earliestPossibleYear;
  if (review.latestPossibleYear === undefined) delete feature.latestPossibleYear;
  else feature.latestPossibleYear = review.latestPossibleYear;
  feature.documentedDateText = review.documentedDateText;
  feature.datePrecision = review.datePrecision;
  feature.dateBasis = review.dateBasis;
  feature.dateConfidence = review.dateConfidence;
  feature.sourceRecords = [
    ...feature.sourceRecords.filter(
      (source) =>
        !(
          source.sourceOrganisation === review.source.sourceOrganisation &&
          source.sourceUrl === review.source.sourceUrl
        ),
    ),
    review.source,
  ];
  feature.tags = [
    ...new Set(
      [...feature.tags, 'alloa-reviewed-named-date'].filter(
        (tag) => tag !== 'curation-priority-named-site',
      ),
    ),
  ];
  feature.reviewed = true;
  feature.updatedAt = accessedAt;
  if (!feature.reviewNotes?.includes(review.reviewNotes))
    feature.reviewNotes = [feature.reviewNotes, review.reviewNotes].filter(Boolean).join(' ');
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error('Refusing to write ' + errors.length + ' validation error(s).');
await writeFile(projectPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log('Added source-backed date evidence to ' + reviews.length + ' named Alloa record(s).');
