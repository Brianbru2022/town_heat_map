import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  Confidence,
  DateBasis,
  HeritageFeature,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

interface DateReview {
  id: string;
  documentedDateText: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
  datePrecision: string;
  dateBasis: DateBasis;
  dateConfidence: Confidence;
  survival?: HeritageFeature['survival'];
  reviewNotes: string;
  sources: SourceRecord[];
}

const councilHistory = (sourceName: string, sourceUrl: string, notes: string): SourceRecord => ({
  sourceName,
  sourceOrganisation: 'Clackmannanshire local-history source',
  sourceUrl,
  accessedAt,
  reliability: 'secondary',
  notes,
});

const hesTrove = (recordId: string, notes: string): SourceRecord => ({
  sourceName: 'Historic Environment Scotland NRHE / trove.scot record',
  sourceOrganisation: 'Historic Environment Scotland',
  sourceRecordId: recordId,
  sourceUrl: `https://www.trove.scot/place/${recordId}`,
  accessedAt,
  licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
  reliability: 'official_non_statutory',
  notes,
});

const reviews: DateReview[] = [
  {
    id: 'nrhe:150707',
    documentedDateText:
      'Alloa Brewery Company established in 1810 (historic brewery-site date; individual surviving building dates are not established)',
    earliestPossibleYear: 1810,
    latestPossibleYear: 1810,
    datePrecision: 'documented site-establishment year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. The date refers to establishment of the Alloa Brewery Company/site, not a construction date for each later building or installation.',
    sources: [
      councilHistory(
        'Alloa Brewery historical account',
        'https://clackmannanshire.scot/index.php/industry-and-commerce/alloa-brewery',
        'States that the Alloa Brewery Company was established in Alloa in 1810.',
      ),
    ],
  },
  {
    id: 'nrhe:239988',
    documentedDateText:
      'Craigward Maltings built 1868–69 (two local-history accounts differ by one year)',
    earliestPossibleYear: 1868,
    latestPossibleYear: 1869,
    datePrecision: 'conflicting historic-source years',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed. Two independently published local-history pages give 1868 and 1869 for Craigward Maltings; the public record preserves the one-year conflict instead of selecting a false exact year.',
    sources: [
      councilHistory(
        'Alloa in the 1920s historical walk',
        'https://www.clackmannanshire.scot/index.php/history/alloa-in-the-1920s',
        'Identifies the five-storey Craigward Maltings as built in 1868 for George Younger Son, Brewers.',
      ),
      councilHistory(
        'George Younger and Son historical account',
        'https://www.clackmannanshire.scot/index.php/industry-and-commerce/george-younger-and-son',
        'States that Craigward Maltings, Alloa, were built in 1869.',
      ),
    ],
  },
  {
    id: 'nrhe:47231',
    documentedDateText:
      'Cambus Distillery established in 1806 from conversion of a disused mill (site date; individual warehouse dates are not established)',
    earliestPossibleYear: 1806,
    latestPossibleYear: 1806,
    datePrecision: 'documented site-establishment year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. It dates the conversion and establishment of the distillery site, not every mapped bonded-warehouse component.',
    sources: [
      councilHistory(
        'Cambus Distillery historical account',
        'https://www.clackmannanshire.scot/index.php/industry-and-commerce/cambus-distillery-dcl',
        'States that John Moubray converted a disused mill at Cambus into a malt distillery in 1806.',
      ),
    ],
  },
  {
    id: 'nrhe:47233',
    documentedDateText:
      'Strathmore / North of Scotland Distillery opened in 1957 in the former Forth Brewery buildings',
    earliestPossibleYear: 1957,
    latestPossibleYear: 1957,
    datePrecision: 'documented opening year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. It dates the conversion/opening as a distillery at the mapped former brewery site, not the earlier brewery construction.',
    sources: [
      councilHistory(
        'North of Scotland Distillery historical account',
        'https://clackmannanshire.scot/index.php/industry-and-commerce/north-of-scotland-distillery',
        'States that the North of Scotland Distillery opened in Cambus in 1957 in the former Knox Forth Brewery buildings.',
      ),
    ],
  },
  {
    id: 'nrhe:47215',
    documentedDateText: 'Cambus Iron Bridge constructed in the early 19th century',
    earliestPossibleYear: 1800,
    latestPossibleYear: 1839,
    datePrecision: 'documented early-century range',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. The source gives an early-19th-century construction period, so the public record retains a broad range.',
    sources: [
      councilHistory(
        'Cambus historical account',
        'https://clackmannanshire.scot/index.php/history/cambus-history',
        'Describes the Cambus Iron Bridge as constructed in the early 19th century to span the River Devon.',
      ),
    ],
  },
  {
    id: 'nrhe:140181',
    documentedDateText:
      'Alloa Academy founded in 1824 (institution and historic Claremont-site date; individual building phases require separate verification)',
    earliestPossibleYear: 1824,
    latestPossibleYear: 1824,
    datePrecision: 'documented institution/site year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. The source dates the academy institution, so the wording does not claim that every later Claremont building was constructed in 1824.',
    sources: [
      councilHistory(
        'Alloa in the 1920s historical walk',
        'https://www.clackmannanshire.scot/index.php/history/alloa-in-the-1920s',
        'Identifies the Alloa Academy in the Claremont walk as dating from 1824 and distinguishes later development of the surrounding site.',
      ),
    ],
  },
  {
    id: 'nrhe:220557',
    documentedDateText: 'Arns Brae Pleasure Grounds recorded in 1923',
    earliestPossibleYear: 1923,
    latestPossibleYear: 1923,
    datePrecision: 'documented year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. The source identifies the pleasure grounds by the 1923 date; later landscaping and facilities are not separately dated here.',
    sources: [
      councilHistory(
        'Alloa in the 1920s historical walk',
        'https://www.clackmannanshire.scot/index.php/history/alloa-in-the-1920s',
        'Records the Alloa pleasure grounds as 1923 in its Claremont historical walk.',
      ),
    ],
  },
  {
    id: 'nrhe:278989',
    documentedDateText:
      'Original Gartmorn Dam scheme developed and the hollow flooded by 1700 (later alterations not separately dated)',
    earliestPossibleYear: 1700,
    latestPossibleYear: 1700,
    datePrecision: 'documented historic scheme year',
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named local-history account. The date applies to the original dam scheme and flooding of the hollow, not every surviving engineering component or later alteration.',
    sources: [
      councilHistory(
        'Gartmorn Dam historical account',
        'https://www.clackmannanshire.scot/index.php/history/gartmorn-dam-history',
        'Describes Robert Bald making the dam-head and flooding the hollow at Gartmorn in 1700 for the original scheme.',
      ),
    ],
  },
  {
    id: 'nrhe:47197',
    documentedDateText:
      'Mar Inn built before 1744; recast in the 19th century and later demolished (NRHE)',
    latestPossibleYear: 1744,
    datePrecision: 'documented present-by year; later recast period',
    dateBasis: 'present_by',
    dateConfidence: 'high',
    survival: 'site_only_or_demolished',
    reviewNotes:
      'Date review completed from the linked official NRHE record. The timeline date means the inn is documented as built before 1744; it is not an asserted construction year. The record also describes a 19th-century recasting and later demolition.',
    sources: [
      hesTrove(
        '47197',
        'NRHE record states that the inn was built prior to 1744, recast in the 19th century and apparently demolished, with the western wall surviving.',
      ),
    ],
  },
  {
    id: 'nrhe:141970',
    documentedDateText: "Gray and Harrower's grain mill built in 1731",
    earliestPossibleYear: 1731,
    latestPossibleYear: 1731,
    datePrecision: 'documented construction year',
    dateBasis: 'documented_construction',
    dateConfidence: 'medium',
    reviewNotes:
      'Date review completed from a named Clackmannanshire historical walk. The source identifies the grain mill beside the Brathy Burn as built in 1731; later alterations or replacement fabric are not separately dated.',
    sources: [
      councilHistory(
        'Alloa in the 1920s historical walk',
        'https://www.clackmannanshire.scot/index.php/history/alloa-in-the-1920s',
        "Identifies Gray and Harrower's grain mill on Mill Road as built beside the Brathy Burn in 1731.",
      ),
    ],
  },
];

function findFeature(id: string): HeritageFeature {
  const feature = pkg.features.find((candidate) => candidate.id === id);
  if (!feature) throw new Error(`Expected Alloa feature ${id} was not found.`);
  return feature;
}

for (const review of reviews) {
  const feature = findFeature(review.id);
  if (review.earliestPossibleYear === undefined) delete feature.earliestPossibleYear;
  else feature.earliestPossibleYear = review.earliestPossibleYear;
  if (review.latestPossibleYear === undefined) delete feature.latestPossibleYear;
  else feature.latestPossibleYear = review.latestPossibleYear;
  Object.assign(feature, {
    documentedDateText: review.documentedDateText,
    datePrecision: review.datePrecision,
    dateBasis: review.dateBasis,
    dateConfidence: review.dateConfidence,
    ...(review.survival ? { survival: review.survival } : {}),
    sourceRecords: [
      ...feature.sourceRecords.filter(
        (existing) =>
          !review.sources.some(
            (incoming) =>
              existing.sourceOrganisation === incoming.sourceOrganisation &&
              existing.sourceUrl === incoming.sourceUrl,
          ),
      ),
      ...review.sources,
    ],
    tags: [
      ...new Set(
        [...feature.tags, 'alloa-reviewed-site-date'].filter(
          (tag) => tag !== 'curation-priority-named-site',
        ),
      ),
    ],
    updatedAt: accessedAt,
    reviewed: true,
    reviewNotes: feature.reviewNotes?.includes(review.reviewNotes)
      ? feature.reviewNotes
      : `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}${review.reviewNotes}`,
  });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Added reviewed source-backed date evidence to ${reviews.length} Alloa site record(s).`,
);
