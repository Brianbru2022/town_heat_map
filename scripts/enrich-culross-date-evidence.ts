import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const normaliseSourcesOnly = process.argv.includes('--normalise-sources-only');
const nrheOnly = process.argv.includes('--nrhe-only');
const positionalArgs = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
const projectPath = resolve(positionalArgs[0] ?? 'data/projects/culross.json');
const reviewPath = resolve(positionalArgs[1] ?? 'data/review/culross-batch-date-enrichment.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

interface ExtractedDate {
  text: string;
  earliest: number;
  latest: number;
  confidence?: 'low' | 'medium';
}

function hasDate(feature: HeritageFeature): boolean {
  return (
    feature.earliestPossibleYear !== undefined ||
    feature.latestPossibleYear !== undefined ||
    Boolean(feature.documentedDateText)
  );
}

function hesDesignationReference(feature: HeritageFeature): string | undefined {
  const sourceReference = feature.sourceRecords
    .map((source) => source.sourceRecordId)
    .find((reference): reference is string => /^LB\d+$/i.test(reference ?? ''));
  if (sourceReference) return sourceReference.toUpperCase();

  const idReference = feature.id.match(/LB\d+/i)?.[0];
  return idReference?.toUpperCase();
}

function isHesDesignationCandidate(feature: HeritageFeature): boolean {
  return (
    feature.id.startsWith('hes-') ||
    (feature.designationType === 'Listed Building' && Boolean(hesDesignationReference(feature)))
  );
}

const normalisedReliability = pkg.features.reduce((count, feature) => {
  for (const source of feature.sourceRecords) {
    if ((source.reliability as string) === 'official_archaeological_inventory') {
      source.reliability = 'official_non_statutory';
      count += 1;
    }
  }
  return count;
}, 0);

if (normaliseSourcesOnly) {
  await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`Normalised ${normalisedReliability} source reliability value(s).`);
  process.exit(0);
}

function decodeHtml(value: string): string {
  return value
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll('&ndash;', '–')
    .replaceAll('&mdash;', '—')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function centuryRange(century: number, qualifier?: string): [number, number] {
  const first = (century - 1) * 100;
  if (qualifier === 'early') return [first, first + 39];
  if (qualifier === 'mid') return [first + 30, first + 69];
  if (qualifier === 'late') return [first + 60, first + 99];
  return [first, first + 99];
}

function extractExplicitDate(text: string): ExtractedDate | undefined {
  const context = text.trim();
  if (
    /\b(?:currently|condition|survey(?:ed)?|inspected|amended|revised|updated)\b[^.!?]{0,50}\b(?:1[2-9]|20)\d{2}\b/i.test(
      context,
    )
  )
    return undefined;
  const century = context.match(
    /\b(?:(early|mid|late)\s+)?(1[1-9]|20|21)(?:th|st|nd|rd)(?:\s*\/\s*(1[1-9]|20|21)(?:th|st|nd|rd)?)?\s+century\b/i,
  );
  if (century) {
    const [firstStart, firstEnd] = centuryRange(Number(century[2]), century[1]?.toLowerCase());
    const [, secondEnd] = century[3] ? centuryRange(Number(century[3])) : [firstStart, firstEnd];
    return { text: context, earliest: firstStart, latest: secondEnd };
  }
  const range = context.match(
    /\b(?:c\.?|circa|about|dated)?\s*((?:1[2-9]|20)\d{2})\s*(?:-|–|to)\s*((?:1[2-9]|20)\d{2})\b/i,
  );
  if (range) return { text: context, earliest: Number(range[1]), latest: Number(range[2]) };
  const year = context.match(
    /\b(?:c\.?|circa|about|dated)?\s*((?:1[2-9]|20)\d{2})\b(?!\s*(?:BC|BCE)\b)/i,
  );
  return year ? { text: context, earliest: Number(year[1]), latest: Number(year[1]) } : undefined;
}

function descriptionsFromHtml(html: string): string[] {
  const section = html.match(/<section id="description"[\s\S]*?<\/section>/i)?.[0];
  if (!section) return [];
  return [...section.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter(Boolean);
}

function extractDateFromHesDescription(html: string): ExtractedDate | undefined {
  const paragraphs = descriptionsFromHtml(html);
  for (const paragraph of paragraphs) {
    const sentences = paragraph.match(/[^.!?]+[.!?]?/g) ?? [paragraph];
    for (const sentence of sentences) {
      const date = extractExplicitDate(sentence);
      if (date) return date;
    }
  }
  return undefined;
}

function nrhePeriodDate(feature: HeritageFeature): ExtractedDate | undefined {
  const classification = feature.shortDescription?.replace(/^NRHE classification:\s*/i, '');
  if (!classification) return undefined;
  const ranges: Array<[number, number]> = [];
  for (const match of classification.matchAll(
    /\b(early|mid|late)?\s*(1[1-9]|20|21)(?:th|st|nd|rd)\s+century\b/gi,
  ))
    ranges.push(centuryRange(Number(match[2]), match[1]?.toLowerCase()));

  // These are intentionally broad archaeological periods. They describe the classified component,
  // not a claimed construction date for every structure at the mapped point.
  if (/\bearly\s+medieval\b/i.test(classification)) ranges.push([400, 1099]);
  else if (/\bpost[ -]?medieval\b/i.test(classification)) ranges.push([1600, 1899]);
  else if (/\bmedieval\b/i.test(classification)) ranges.push([1100, 1599]);
  // Broad archaeological periods are retained as classification evidence, not converted into a
  // falsely precise construction year. Ranges use conventional Scottish archaeological periods.
  if (/\bneolithic\b/i.test(classification)) ranges.push([-4000, -2501]);
  if (/\bbronze\s+age\b/i.test(classification)) ranges.push([-2500, -801]);
  if (/\biron\s+age\b/i.test(classification)) ranges.push([-800, 399]);
  if (/\broman\b/i.test(classification)) ranges.push([43, 410]);
  if (
    /\bprehistoric\b/i.test(classification) &&
    !/\bneolithic|bronze\s+age|iron\s+age\b/i.test(classification)
  )
    ranges.push([-4000, 399]);
  if (/\bmodern\b/i.test(classification)) ranges.push([1900, 1999]);
  if (!ranges.length) return undefined;
  return {
    text: `NRHE classification period: ${classification}`,
    earliest: Math.min(...ranges.map(([start]) => start)),
    latest: Math.max(...ranges.map(([, end]) => end)),
    confidence: /\(POSSIBLE\)/i.test(classification) ? 'low' : 'medium',
  };
}

function setDate(
  feature: HeritageFeature,
  date: ExtractedDate,
  source: SourceRecord,
  tag: string,
  reviewNote: string,
): void {
  Object.assign(feature, {
    documentedDateText: date.text,
    earliestPossibleYear: date.earliest,
    latestPossibleYear: date.latest,
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: date.confidence ?? 'medium',
    sourceRecords: [
      ...feature.sourceRecords.filter((record) => record.sourceName !== source.sourceName),
      source,
    ],
    tags: [...new Set([...feature.tags, tag])],
    updatedAt: accessedAt,
    reviewNotes: `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}${reviewNote}`,
  });
}

let discardedNonHistoricDates = 0;
for (const feature of pkg.features) {
  const extractedSource = feature.sourceRecords.some(
    (source) =>
      source.sourceName === 'Historic Environment Scotland designation description date extraction',
  );
  if (
    !extractedSource ||
    !feature.documentedDateText ||
    extractExplicitDate(feature.documentedDateText)
  )
    continue;
  delete feature.documentedDateText;
  delete feature.earliestPossibleYear;
  delete feature.latestPossibleYear;
  feature.sourceRecords = feature.sourceRecords.filter(
    (source) =>
      source.sourceName !== 'Historic Environment Scotland designation description date extraction',
  );
  feature.tags = feature.tags.filter((tag) => tag !== 'hes-date-extracted');
  feature.updatedAt = accessedAt;
  feature.reviewNotes = `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}A modern condition or record date was removed from automatic date evidence; individual curator review remains required.`;
  discardedNonHistoricDates += 1;
}

const nrheCandidates = pkg.features.filter(
  (feature) => feature.id.startsWith('nrhe:') && !hasDate(feature),
);
let nrheEnriched = 0;
for (const feature of nrheCandidates) {
  const date = nrhePeriodDate(feature);
  if (!date) continue;
  const id = feature.id.split(':').at(-1)!;
  setDate(
    feature,
    date,
    {
      sourceName: 'Historic Environment Scotland NRHE period classification',
      sourceOrganisation: 'Historic Environment Scotland',
      sourceRecordId: id,
      sourceUrl: `https://www.trove.scot/place/${id}`,
      accessedAt,
      licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
      reliability: 'official_non_statutory',
      notes:
        'Normalised from the official NRHE GIS classification period. It identifies the dated component at the mapped site and is not a construction-date assertion for unrelated components.',
    },
    'nrhe-period-extracted',
    'Date range normalised from the official NRHE classification period; curator review remains required for multi-component sites.',
  );
  nrheEnriched += 1;
}

const hesCandidates = nrheOnly
  ? []
  : pkg.features.filter((feature) => isHesDesignationCandidate(feature) && !hasDate(feature));
const hesFailures: Array<{ id: string; sourceUrl: string; reason: string }> = [];
let hesEnriched = 0;

async function enrichHes(feature: HeritageFeature): Promise<void> {
  const reference = hesDesignationReference(feature) ?? feature.id.split(':').at(-1)!;
  const sourceUrl = `https://portal.historicenvironment.scot/designation/${reference}`;
  try {
    const response = await fetch(sourceUrl, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (!descriptionsFromHtml(html).length)
      throw new Error('No designation description paragraph found.');
    const date = extractDateFromHesDescription(html);
    if (!date) throw new Error('No explicit AD date or century in the designation description.');
    setDate(
      feature,
      date,
      {
        sourceName: 'Historic Environment Scotland designation description date extraction',
        sourceOrganisation: 'Historic Environment Scotland',
        sourceRecordId: reference,
        sourceUrl,
        accessedAt,
        licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
        reliability: 'official_statutory',
        notes:
          'An explicit date expression in the official designation description was normalised automatically. It is date evidence, not necessarily the original construction date where the description records later alteration.',
      },
      'hes-date-extracted',
      'Date normalised from an explicit HES designation-description date expression; curator review remains required.',
    );
    hesEnriched += 1;
  } catch (error) {
    hesFailures.push({
      id: feature.id,
      sourceUrl,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

for (let index = 0; index < hesCandidates.length; index += 3)
  await Promise.all(hesCandidates.slice(index, index + 3).map(enrichHes));

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
await mkdir(dirname(reviewPath), { recursive: true });
await writeFile(
  reviewPath,
  `${JSON.stringify(
    {
      projectId: pkg.project.id,
      generatedAt: accessedAt,
      processed: { nrhe: nrheCandidates.length, hes: hesCandidates.length },
      enriched: { nrhe: nrheEnriched, hes: hesEnriched },
      discardedNonHistoricDates,
      remainingUndated: pkg.features.filter((feature) => !hasDate(feature)).length,
      hesReviewRequired: hesFailures,
      note: 'NRHE records without an official period classification and HES records without a conservative opening-description date remain undated. No date has been inferred from generic feature type, modern mapping or place name.',
    },
    null,
    2,
  )}\n`,
  'utf8',
);
console.log(
  `Processed ${nrheCandidates.length + hesCandidates.length} undated records: ${nrheEnriched} NRHE and ${hesEnriched} HES dates added; ${hesFailures.length} HES records remain for individual review.`,
);
