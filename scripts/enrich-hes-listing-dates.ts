import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');

interface DateEvidence {
  reference: string;
  featureId?: string;
  sourceName?: string;
  sourceOrganisation?: string;
  sourceUrl?: string;
  sourceLicence?: string;
  sourceNotes?: string;
  sourceReliability?: SourceRecord['reliability'];
  additionalSources?: Array<Omit<SourceRecord, 'accessedAt'> & { sourceRecordId?: string }>;
  documentedDateText: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
  dateBasis: HeritageFeature['dateBasis'];
  dateConfidence: HeritageFeature['dateConfidence'];
}

// Reviewed from authoritative HES/NRHE records and explicitly attributed
// first-party sources on 28 July 2026. Dates for alterations, commemorated
// events and unverified components are deliberately excluded.
const dateEvidence: DateEvidence[] = [
  {
    reference: 'LB1982',
    documentedDateText: '1841–1842',
    earliestPossibleYear: 1841,
    latestPossibleYear: 1842,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB1983',
    documentedDateText: 'Circa 1830',
    earliestPossibleYear: 1830,
    latestPossibleYear: 1830,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB20960',
    documentedDateText: 'Circa 1853',
    earliestPossibleYear: 1853,
    latestPossibleYear: 1853,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB20963',
    documentedDateText: '1874–1875',
    earliestPossibleYear: 1874,
    latestPossibleYear: 1875,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB20965',
    documentedDateText: '1909',
    earliestPossibleYear: 1909,
    latestPossibleYear: 1909,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB20968',
    documentedDateText: 'Circa 1825–1830',
    earliestPossibleYear: 1825,
    latestPossibleYear: 1830,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB20971',
    documentedDateText: '1938',
    earliestPossibleYear: 1938,
    latestPossibleYear: 1938,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB20972',
    documentedDateText: 'Circa 1843',
    earliestPossibleYear: 1843,
    latestPossibleYear: 1843,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB20996',
    documentedDateText: '1875',
    earliestPossibleYear: 1875,
    latestPossibleYear: 1875,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21006',
    documentedDateText: 'Circa 1830',
    earliestPossibleYear: 1830,
    latestPossibleYear: 1830,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21007',
    documentedDateText: '1908–1909 (later additions excluded)',
    earliestPossibleYear: 1908,
    latestPossibleYear: 1909,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21011',
    documentedDateText: 'Circa 1850',
    earliestPossibleYear: 1850,
    latestPossibleYear: 1850,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21012',
    documentedDateText: '1905',
    earliestPossibleYear: 1905,
    latestPossibleYear: 1905,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21013',
    documentedDateText: 'Circa 1902',
    earliestPossibleYear: 1902,
    latestPossibleYear: 1902,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21014',
    documentedDateText: '1902',
    earliestPossibleYear: 1902,
    latestPossibleYear: 1902,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21015',
    documentedDateText: '1912–1913',
    earliestPossibleYear: 1912,
    latestPossibleYear: 1913,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21017',
    documentedDateText: '1912–1913',
    earliestPossibleYear: 1912,
    latestPossibleYear: 1913,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21018',
    documentedDateText: '1924–1926',
    earliestPossibleYear: 1924,
    latestPossibleYear: 1926,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21020',
    documentedDateText: 'Circa 1900',
    earliestPossibleYear: 1900,
    latestPossibleYear: 1900,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21021',
    documentedDateText: 'Circa 1900',
    earliestPossibleYear: 1900,
    latestPossibleYear: 1900,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21025',
    documentedDateText: '1925',
    earliestPossibleYear: 1925,
    latestPossibleYear: 1925,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21028',
    documentedDateText: '1882',
    earliestPossibleYear: 1882,
    latestPossibleYear: 1882,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21029',
    documentedDateText: 'Circa 1900',
    earliestPossibleYear: 1900,
    latestPossibleYear: 1900,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB46269',
    documentedDateText: '1904',
    earliestPossibleYear: 1904,
    latestPossibleYear: 1904,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB49529',
    documentedDateText: 'Circa 1925',
    earliestPossibleYear: 1925,
    latestPossibleYear: 1925,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB49530',
    documentedDateText: '1911 (extended 1925)',
    earliestPossibleYear: 1911,
    latestPossibleYear: 1911,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB49859',
    documentedDateText: '1931–1932',
    earliestPossibleYear: 1931,
    latestPossibleYear: 1932,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB49983',
    documentedDateText: '1895',
    earliestPossibleYear: 1895,
    latestPossibleYear: 1895,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB51622',
    documentedDateText: '1864 (wings added 1900)',
    earliestPossibleYear: 1864,
    latestPossibleYear: 1864,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB51623',
    documentedDateText: '1873',
    earliestPossibleYear: 1873,
    latestPossibleYear: 1873,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB52460',
    documentedDateText: '1959',
    earliestPossibleYear: 1959,
    latestPossibleYear: 1959,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21022',
    documentedDateText: 'Around 1799',
    earliestPossibleYear: 1799,
    latestPossibleYear: 1799,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: 'LB21023',
    documentedDateText: 'Components probably late 18th to mid-19th century',
    earliestPossibleYear: 1780,
    latestPossibleYear: 1860,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    sourceNotes:
      'The HES description dates the brick garden wall to the late 18th or early 19th century, the garden house to the early 19th century, and other walls to the mid-19th century. The normalised range describes the listed ensemble, not one construction event.',
  },
  {
    reference: 'LB50151',
    documentedDateText: 'Late 19th-century villa; extension of 1913',
    earliestPossibleYear: 1870,
    latestPossibleYear: 1899,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    sourceNotes:
      'The HES description identifies the original villa as late 19th century and a later neo-Georgian extension as 1913. The original house has no precise documented construction year, so the normalised range is deliberately broad.',
  },
  {
    reference: 'LB51392',
    documentedDateText: 'Later 19th century',
    earliestPossibleYear: 1870,
    latestPossibleYear: 1899,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    sourceNotes:
      'The HES description dates the former school building to the later 19th century and attributes it probably to Adam Frame. The normalised range retains that uncertainty rather than asserting a single year.',
  },
  {
    reference: 'LB1969',
    documentedDateText: '1885',
    earliestPossibleYear: 1885,
    latestPossibleYear: 1885,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB1968',
    documentedDateText: '1885',
    earliestPossibleYear: 1885,
    latestPossibleYear: 1885,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB1967',
    documentedDateText: '1885 (later additions excluded)',
    earliestPossibleYear: 1885,
    latestPossibleYear: 1885,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: 'LB1975',
    documentedDateText: 'Present by 1770',
    latestPossibleYear: 1770,
    dateBasis: 'present_by',
    dateConfidence: 'high',
  },
  {
    reference: 'LB21024',
    documentedDateText: 'Probably dating from the Roman occupation of Egypt',
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'low',
    sourceNotes:
      'The HES description identifies the object as an antique Roman Doric column probably dating from the Roman occupation of Egypt. It does not provide a defensible calendar-year construction range, so the cited period wording is retained without one.',
  },
  {
    reference: 'LB1984',
    documentedDateText: 'Early Christian cross slab',
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    sourceNotes:
      'The HES description identifies the Hawk Hill cross slab as Early Christian. The record does not give a defensible calendar-year range, so the cited period wording is retained without one.',
  },
  {
    reference: '47210',
    featureId: 'nrhe:47210',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/47210/alloa-glasshouse-loan-alloa-glass-works',
    sourceNotes:
      'The HES NRHE record states that Alloa Glassworks was founded circa 1750; this is a foundation date for the works, not a date for every surviving structure.',
    sourceReliability: 'official_non_statutory',
    documentedDateText: 'Founded circa 1750',
    earliestPossibleYear: 1750,
    latestPossibleYear: 1750,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: '47214',
    featureId: 'nrhe:47214',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/47214/?tab=details',
    sourceNotes:
      'The official NRHE record describes the mill complex as having early-19th-century origins, with its oldest surviving mill building dating from the 1860s. The normalised range refers to the origin of the mill complex, not every surviving building.',
    sourceReliability: 'official_non_statutory',
    documentedDateText:
      'Early-19th-century mill origins; oldest surviving mill building dates from the 1860s',
    earliestPossibleYear: 1800,
    latestPossibleYear: 1839,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: '47217',
    featureId: 'nrhe:47217',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/47217/?tab=details',
    sourceNotes:
      'The official NRHE record cites a 1798 Scottish Record Office memorandum for repairs and improvements to Alloa Harbour. This proves the harbour was present by 1798; it does not establish its original construction date.',
    sourceReliability: 'official_non_statutory',
    documentedDateText: 'Alloa Harbour was being repaired and improved in 1798',
    latestPossibleYear: 1798,
    dateBasis: 'present_by',
    dateConfidence: 'high',
  },
  {
    reference: '74672',
    featureId: 'nrhe:74672',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/74672/?tab=details',
    sourceNotes:
      'The official NRHE record distinguishes the earlier Alloa House, largely designed around 1700 and destroyed by fire in 1800, from the successor country house built in 1834–1838. The normalised date applies to that 19th-century successor represented by this record.',
    sourceReliability: 'official_non_statutory',
    documentedDateText: 'Successor Alloa House built 1834–1838',
    earliestPossibleYear: 1834,
    latestPossibleYear: 1838,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: '178524',
    featureId: 'nrhe:178524',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/178524/?tab=details',
    sourceNotes:
      'The official NRHE record states that the Stirling and Dunfermline Railway opened the station on 28 August 1850. Later name changes and the 1968 passenger closure are not used as construction dates.',
    sourceReliability: 'official_non_statutory',
    documentedDateText: 'Opened 28 August 1850',
    earliestPossibleYear: 1850,
    latestPossibleYear: 1850,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: '250878',
    featureId: 'nrhe:250878',
    sourceName: 'Historic Environment Scotland NRHE detailed record date review',
    sourceUrl: 'https://canmore.org.uk/site/250878/?tab=details',
    sourceNotes:
      'The official NRHE architecture note describes the Jaeger factory as a late-20th-century clothing factory and records the announcement of its closure in August 1999. The normalised range retains that broad dating rather than asserting a construction year.',
    sourceReliability: 'official_non_statutory',
    documentedDateText: 'Late-20th-century clothing factory (closed in 1999)',
    earliestPossibleYear: 1970,
    latestPossibleYear: 1999,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
  {
    reference: '252986',
    featureId: 'nrhe:252986',
    sourceName: 'Alloa Athletic FC history',
    sourceOrganisation: 'Alloa Athletic Football Club',
    sourceUrl: 'https://www.alloaathletic.co.uk/history-of-alloa-athletic/',
    sourceLicence:
      'Website content consulted as a first-party reference; retain the source link and do not redistribute its text.',
    sourceNotes:
      "The club's published history records Recreation Park as its home from 1895. The official NRHE record independently classifies the ground as 19th century.",
    sourceReliability: 'secondary',
    documentedDateText: 'Recreation Park in use by Alloa Athletic from 1895',
    earliestPossibleYear: 1895,
    latestPossibleYear: 1895,
    dateBasis: 'present_by',
    dateConfidence: 'high',
  },
  {
    reference: '47209',
    featureId: 'nrhe:47209',
    sourceName: 'Clackmannanshire Council: Alloa history',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clackmannanshire.scot/index.php/history/alloa-history',
    sourceLicence:
      'Council web content consulted as a local-authority reference; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The Council history states that a gas works was built in Alloa in 1828. This date is applied to the mapped Alloa Gasworks record.',
    sourceReliability: 'local_authority',
    documentedDateText: 'Gas works built in 1828',
    earliestPossibleYear: 1828,
    latestPossibleYear: 1828,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: '295517',
    featureId: 'nrhe:295517',
    sourceName: 'Ordnance Gazetteer of Scotland (National Library of Scotland scan)',
    sourceOrganisation: 'National Library of Scotland',
    sourceUrl: 'https://deriv.nls.uk/dcn23/9736/97368777.23.pdf',
    sourceLicence:
      'Historic gazetteer scan consulted through the National Library of Scotland; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The gazetteer records that the Big Pow was converted into a wet dock in 1861–63. The date is retained as a range for the Old Wet Dock feature.',
    sourceReliability: 'archival',
    documentedDateText: 'Converted into a wet dock, 1861–1863',
    earliestPossibleYear: 1861,
    latestPossibleYear: 1863,
    dateBasis: 'documented_date_range',
    dateConfidence: 'medium',
  },
  {
    reference: '381494',
    featureId: 'nrhe:381494',
    sourceName: 'Alloa Glebe Conservation Area Character Appraisal',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clacks.gov.uk/document/6450.pdf',
    sourceLicence:
      'Council planning document consulted as a local-authority reference; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The Conservation Area Character Appraisal dates Alloa West Church to 1863–64 and identifies later alterations separately.',
    sourceReliability: 'local_authority',
    documentedDateText: 'Built 1863–1864',
    earliestPossibleYear: 1863,
    latestPossibleYear: 1864,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: '307635',
    featureId: 'nrhe:307635',
    sourceName: 'Clackmannanshire Council: Clackmannanshire health care',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clackmannanshire.scot/index.php/history/health-care',
    sourceLicence:
      'Council web content consulted as a local-authority reference; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The Council history describes construction of a hospital at Ashley Terrace in 1868, later named Clackmannan County Hospital.',
    sourceReliability: 'local_authority',
    additionalSources: [
      {
        sourceName: 'Historic Hospitals gazetteer',
        sourceOrganisation: 'Historic Hospitals',
        sourceRecordId: 'clackmannan-county-hospital-alloa',
        sourceUrl: 'https://historic-hospitals.com/gazetteer/stirlingshire-alloa-and-falkirk/',
        licence:
          'Reference consulted for its dated gazetteer entry; retain the source link and do not redistribute its text.',
        notes:
          'The gazetteer instead records Clackmannan County Hospital at Ashley Terrace as opening in 1899 for accident cases.',
        reliability: 'secondary',
      },
    ],
    documentedDateText:
      'Conflicting sources: hospital at Ashley Terrace, 1868; County Hospital opening, 1899',
    earliestPossibleYear: 1868,
    latestPossibleYear: 1899,
    dateBasis: 'documented_date_range',
    dateConfidence: 'low',
  },
  {
    reference: '381495',
    featureId: 'nrhe:381495',
    sourceName: 'Alloa illustrated family almanac, 1887 (National Library of Scotland scan)',
    sourceOrganisation: 'National Library of Scotland',
    sourceUrl: 'https://deriv.nls.uk/dcn23/9415/94151198.23.pdf',
    sourceLicence:
      'Historic directory scan consulted through the National Library of Scotland; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The 1887 directory identifies the Baptist Chapel at Ludgate Place and records that it opened on 2 October 1881.',
    sourceReliability: 'archival',
    documentedDateText: 'Opened 2 October 1881',
    earliestPossibleYear: 1881,
    latestPossibleYear: 1881,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
  },
  {
    reference: '47199',
    featureId: 'nrhe:47199',
    sourceName: 'Forth coastal assessment',
    sourceOrganisation: 'SCAPE Trust',
    sourceUrl: 'https://scapetrust.org/wp-content/uploads/reports/forth2.pdf',
    sourceLicence:
      'Assessment report consulted as a secondary heritage reference; retain the source link and do not redistribute its text.',
    sourceNotes:
      'The coastal assessment describes 7 and 8 The Shore as 18th-century houses and records their historic Category C listing status.',
    sourceReliability: 'secondary',
    documentedDateText: '18th-century houses',
    earliestPossibleYear: 1700,
    latestPossibleYear: 1799,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
  },
];

const packageJson = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();
let enriched = 0;
for (const evidence of dateEvidence) {
  const feature = evidence.featureId
    ? packageJson.features.find((item) => item.id === evidence.featureId)
    : packageJson.features.find((item) =>
        item.sourceRecords.some((source) => source.sourceRecordId === evidence.reference),
      );
  if (!feature) throw new Error(`No feature found for ${evidence.reference}.`);
  const source: SourceRecord = {
    sourceName:
      evidence.sourceName ?? 'Historic Environment Scotland listing description date review',
    sourceOrganisation: evidence.sourceOrganisation ?? 'Historic Environment Scotland',
    sourceRecordId: evidence.reference,
    sourceUrl:
      evidence.sourceUrl ??
      `https://portal.historicenvironment.scot/designation/${evidence.reference}`,
    accessedAt,
    licence:
      evidence.sourceLicence ??
      'Open Government Licence v3.0; retain Historic Environment Scotland attribution and source link.',
    notes:
      evidence.sourceNotes ??
      'Construction-date evidence reviewed from the listing description. Listing descriptions are supplementary information and date wording is retained conservatively.',
    reliability: evidence.sourceReliability ?? 'official_statutory',
  };
  const sources = [
    source,
    ...(evidence.additionalSources ?? []).map((additionalSource, index): SourceRecord => ({
      ...additionalSource,
      sourceRecordId:
        additionalSource.sourceRecordId ?? `${evidence.reference}-support-${index + 1}`,
      accessedAt,
    })),
  ];
  feature.documentedDateText = evidence.documentedDateText;
  feature.earliestPossibleYear = evidence.earliestPossibleYear;
  feature.latestPossibleYear = evidence.latestPossibleYear;
  feature.dateBasis = evidence.dateBasis;
  feature.dateConfidence = evidence.dateConfidence;
  feature.sourceRecords = [
    ...feature.sourceRecords.filter(
      (item) => !sources.some((candidate) => candidate.sourceName === item.sourceName),
    ),
    ...sources,
  ];
  feature.tags = [
    ...new Set([
      ...feature.tags,
      'date-reviewed',
      ...(source.sourceOrganisation === 'Historic Environment Scotland'
        ? ['hes-date-reviewed']
        : []),
    ]),
  ];
  feature.reviewed = true;
  feature.updatedAt = accessedAt;
  enriched += 1;
}
packageJson.validation = validateFeatures(packageJson.project, packageJson.features);
const errors = packageJson.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(`Enriched ${enriched} feature(s) with reviewed date evidence.`);
