import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alva.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

function feature(id: string): HeritageFeature {
  const result = pkg.features.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing Alva feature ${id}.`);
  return result;
}

function addSource(target: HeritageFeature, source: SourceRecord): void {
  if (
    target.sourceRecords.some(
      (candidate) =>
        candidate.sourceOrganisation === source.sourceOrganisation &&
        candidate.sourceRecordId === source.sourceRecordId,
    )
  )
    return;
  target.sourceRecords.push(source);
}

function apply(
  target: HeritageFeature,
  values: Partial<HeritageFeature>,
  source: SourceRecord,
): void {
  Object.assign(target, values, {
    // A reviewed historic date supersedes the prior inventory-recording date;
    // otherwise the UI intentionally suppresses it from timeline evidence.
    tags: target.tags.filter((tag) => tag !== 'inventory-presence-date'),
    updatedAt: accessedAt,
    reviewed: true,
  });
  addSource(target, source);
}

apply(
  feature('nrhe:111955'),
  {
    documentedDateText:
      'Alva House present by 1866 (first-edition OS map evidence; later demolished)',
    earliestPossibleYear: undefined,
    latestPossibleYear: 1866,
    datePrecision: 'first-mapped present-by evidence',
    dateBasis: 'first_mapped',
    dateConfidence: 'medium',
    survival: 'site_only_or_demolished',
    reviewNotes:
      'HES/Trove records Alva House as roofed on the first-edition OS 6-inch map (1866) and later demolished. Robert Adam produced an incomplete 1789 design, which is retained as architectural history but is not used as a construction date.',
  },
  {
    sourceName: 'Historic Environment Scotland NRHE/Trove detailed Alva House record',
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: '111955-date-review',
    sourceUrl: 'https://www.trove.scot/place/111955',
    accessedAt,
    licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
    reliability: 'official_non_statutory',
    notes:
      'NRHE archaeology note states that Alva House is shown roofed on the first-edition OS 6-inch map (Perth and Clackmannan 1866); architecture note records a partly unexecuted Robert Adam design of 1789.',
  },
);

apply(
  feature('nrhe:47070'),
  {
    documentedDateText:
      'Ochilvale Mill: late nineteenth-century mill; 1922 mill shop is a later component',
    earliestPossibleYear: 1860,
    latestPossibleYear: 1899,
    datePrecision: 'documented broad period',
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    reviewNotes:
      'HES/Trove architecture note identifies the principal Ochilvale Mill block as late nineteenth century and its mill shop as dating from 1922. The public range describes the principal mill, not the later shop.',
  },
  {
    sourceName: 'Historic Environment Scotland NRHE/Trove detailed Ochilvale Mill record',
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: '47070-date-review',
    sourceUrl: 'https://www.trove.scot/place/47070',
    accessedAt,
    licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
    reliability: 'official_non_statutory',
    notes:
      'NRHE architecture note describes the principal mill as late nineteenth century and the associated mill shop as dating from 1922.',
  },
);

apply(
  feature('nrhe:47074'),
  {
    documentedDateText:
      'Glentana Mills dates from the mid-1870s; rebuilt as a one-storey block after the 1941 fire',
    earliestPossibleYear: 1873,
    latestPossibleYear: 1877,
    datePrecision: 'mid-decade authoritative-source evidence',
    dateBasis: 'estimated_from_authoritative_source',
    dateConfidence: 'medium',
    reviewNotes:
      'HES/Trove architecture note dates the mill from the mid 1870s and records destruction by fire in 1941 followed by rebuilding. The narrow range expresses the source’s mid-decade wording rather than a claimed exact construction year.',
  },
  {
    sourceName: 'Historic Environment Scotland NRHE/Trove detailed Glentana Mills record',
    sourceOrganisation: 'Historic Environment Scotland',
    sourceRecordId: '47074-date-review',
    sourceUrl: 'https://www.trove.scot/place/47074',
    accessedAt,
    licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
    reliability: 'official_non_statutory',
    notes:
      'NRHE architecture note dates the original mill from the mid 1870s and records a 1941 fire followed by rebuilding.',
  },
);

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Enriched three Alva priority records with direct HES/Trove evidence.');
