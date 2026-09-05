import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const reviewPath = resolve(
  process.argv[3] ?? 'data/review/alloa-priority-nrhe-period-enrichment.json',
);
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

interface ExtractedDate {
  text: string;
  earliest: number;
  latest: number;
  confidence: 'low' | 'medium';
}

function centuryRange(century: number, qualifier?: string): [number, number] {
  const first = (century - 1) * 100;
  if (qualifier === 'early') return [first, first + 39];
  if (qualifier === 'mid') return [first + 30, first + 69];
  if (qualifier === 'late') return [first + 60, first + 99];
  return [first, first + 99];
}

function classificationFor(feature: HeritageFeature): string | undefined {
  return feature.shortDescription
    ?.replace(/^NRHE classification:\s*/i, '')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

// This intake intentionally excludes broadly located archaeological inventory
// evidence. It accepts only identifiable historic built-environment and
// infrastructure components for which NRHE gives an explicit period.
const builtEnvironmentTerms =
  /\b(?:house|villa|tenement|cottage|church|chapel|cemetery|burial ground|mill|works|factory|foundry|tannery|brewery|distillery|mine|quarry|kiln|warehouse|shop|office|school|court house|county building|drill hall|hospital|bridge|footbridge|waggonway|wagonway|railway|railway station|signal box|level crossing|tunnel|harbour|dock|canal|road|street|pier|lighthouse|farm|farmhouse|farmstead|steading|monument|memorial|cross|engine house|bandstand|tower house|castle|dovecot|gate lodge|walled garden|filter bed|waterworks|dam|pit|prison|airfield|colliery institute|inn|bank|maltings|stable|storehouse|flats|presbytery|water channel|gas holder|telephone exchange|masjid|kingdom hall|housing estate|industrial estate|agricultural landscape|park|golf course|theatre|caravan park|tramway|building)\b/i;
const archaeologicalTerms =
  /\b(?:bronze age|iron age|neolithic|prehistoric|burial cairn|\bcist\b|\burn\b|findspot|\bcoin\b|artefact|cropmark|ring ditch|post hole|stone tool|lithic|flint|rock art|stone circle|socketed stone|coffin|shell midden|rig and furrow)\b/i;
const explicitHistoricPeriod =
  /\b(?:early|mid|late)?\s*(?:1[1-9]|20|21)(?:th|st|nd|rd)\s+century\b|\b(?:early\s+medieval|medieval|post[ -]?medieval|modern|first world war)\b/i;

function isPriorityCandidate(feature: HeritageFeature): boolean {
  const classification = classificationFor(feature);
  return Boolean(
    feature.id.startsWith('nrhe:') &&
    feature.dateBasis === 'unknown' &&
    classification &&
    explicitHistoricPeriod.test(classification) &&
    builtEnvironmentTerms.test(classification) &&
    !archaeologicalTerms.test(classification),
  );
}

function extractDate(classification: string): ExtractedDate | undefined {
  const explicitYears = [...classification.matchAll(/\((1[6-9]\d{2}|20\d{2})\)/g)].map((match) =>
    Number(match[1]),
  );
  if (explicitYears.length) {
    return {
      text: `NRHE classification period: ${classification}`,
      earliest: Math.min(...explicitYears),
      latest: Math.max(...explicitYears),
      confidence: /\(POSSIBLE\)/i.test(classification) ? 'low' : 'medium',
    };
  }
  const ranges: Array<[number, number]> = [];
  for (const match of classification.matchAll(
    /\b(early|mid|late)?\s*(1[1-9]|20|21)(?:th|st|nd|rd)\s+century\b/gi,
  )) {
    ranges.push(centuryRange(Number(match[2]), match[1]?.toLowerCase()));
  }

  // These terms are only accepted after the built-environment gate above. They
  // provide a broad period for a named component, not an invented build year.
  if (/\bearly\s+medieval\b/i.test(classification)) ranges.push([400, 1099]);
  else if (/\bpost[ -]?medieval\b/i.test(classification)) ranges.push([1600, 1899]);
  else if (/\bmedieval\b/i.test(classification)) ranges.push([1100, 1599]);
  if (/\bfirst world war\b/i.test(classification)) ranges.push([1914, 1918]);
  if (/\bmodern\b/i.test(classification)) ranges.push([1900, 1999]);
  if (!ranges.length) return undefined;

  return {
    text: `NRHE classification period: ${classification}`,
    earliest: Math.min(...ranges.map(([start]) => start)),
    latest: Math.max(...ranges.map(([, end]) => end)),
    confidence: /\(POSSIBLE\)/i.test(classification) ? 'low' : 'medium',
  };
}

function sourceFor(feature: HeritageFeature): SourceRecord {
  const recordId = feature.id.split(':').at(-1)!;
  return {
    sourceName: 'Historic Environment Scotland NRHE period classification',
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: recordId,
    sourceUrl: `https://www.trove.scot/place/${recordId}`,
    accessedAt,
    licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
    reliability: 'official_non_statutory',
    notes:
      'Normalised from the official NRHE GIS classification period. It dates the classified component at the mapped site and is not a single construction-date assertion for every component.',
  };
}

function applyDate(feature: HeritageFeature, date: ExtractedDate): void {
  const source = sourceFor(feature);
  Object.assign(feature, {
    documentedDateText: date.text,
    earliestPossibleYear: date.earliest,
    latestPossibleYear: date.latest,
    datePrecision:
      date.earliest === date.latest ? 'NRHE classification year' : 'NRHE classification period',
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: date.confidence,
    sourceRecords: [
      ...feature.sourceRecords.filter(
        (record) =>
          !(
            record.sourceOrganisation === source.sourceOrganisation &&
            record.sourceRecordId === source.sourceRecordId &&
            record.sourceName === source.sourceName
          ),
      ),
      source,
    ],
    tags: [
      ...new Set(
        [...feature.tags, 'nrhe-priority-period-extracted', 'curation-date-enriched'].filter(
          (tag) => tag !== 'curation-priority-named-site',
        ),
      ),
    ],
    updatedAt: accessedAt,
    reviewNotes: `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}Date range normalised from the official NRHE classification period for a named historic built-environment or infrastructure component; curator review remains required for multi-component sites.`,
  });
}

const candidates = pkg.features.filter(isPriorityCandidate);
const enriched: Array<{ id: string; name: string; date: string; range: [number, number] }> = [];
const skipped: Array<{ id: string; name: string; reason: string }> = [];

for (const feature of candidates) {
  const classification = classificationFor(feature)!;
  const date = extractDate(classification);
  if (!date) {
    skipped.push({
      id: feature.id,
      name: feature.name,
      reason: 'No normalisable historic period.',
    });
    continue;
  }
  applyDate(feature, date);
  enriched.push({
    id: feature.id,
    name: feature.name,
    date: date.text,
    range: [date.earliest, date.latest],
  });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);

await mkdir(dirname(reviewPath), { recursive: true });
await writeFile(
  reviewPath,
  `${JSON.stringify(
    {
      projectId: pkg.project.id,
      runAt: accessedAt,
      policy:
        'Only NRHE records with an explicit historic classification period and a named built-environment, industrial, transport, religious or civic component were normalised. Broad archaeological inventory records were deliberately excluded.',
      candidates: candidates.length,
      enriched,
      skipped,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Enriched ${enriched.length} Alloa priority NRHE record(s); ${skipped.length} candidate(s) skipped.`,
);
