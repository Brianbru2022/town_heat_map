import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/tillicoultry.json');
const reportPath = resolve(
  process.argv[3] ?? 'data/review/tillicoultry-source-licence-review.json',
);
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const reviewedAt = new Date().toISOString();

const councilLicence =
  'Open Government Licence v3.0 for Council-held public-sector information; acknowledge Clackmannanshire Council and do not reuse third-party material.';
const iwmRestriction =
  'No reuse licence is confirmed for IWM material. Citation and link only: do not redistribute IWM images, record text or other IWM media.';

function licenceFor(source: SourceRecord): string | undefined {
  if (source.sourceOrganisation === 'Clackmannanshire Council') return councilLicence;
  if (source.sourceOrganisation === 'Imperial War Museums — War Memorials Register')
    return iwmRestriction;
  return undefined;
}

const decisions: Array<{ id: string; name: string; policy: 'ogl' | 'citation_only' }> = [];
for (const feature of pkg.features) {
  if (feature.evidenceScope === 'out_of_scope' || feature.licence) continue;
  const licences = [...new Set(feature.sourceRecords.map(licenceFor).filter(Boolean))] as string[];
  if (!licences.length) continue;
  const citationOnly = licences.includes(iwmRestriction);
  feature.sourceRecords = feature.sourceRecords.map((source) => {
    const licence = licenceFor(source);
    const note =
      source.sourceOrganisation === 'Clackmannanshire Council'
        ? 'Licence review: Council reuse policy applies to Council-held information; do not reuse third-party material in the appraisal.'
        : 'Licence review: factual record is cited by link only; no IWM content is redistributed.';
    return licence
      ? { ...source, licence, notes: [source.notes, note].filter(Boolean).join(' ') }
      : source;
  });
  feature.licence = citationOnly ? iwmRestriction : councilLicence;
  feature.tags = [
    ...new Set([
      ...feature.tags,
      ...(citationOnly ? ['source-use-restricted'] : ['source-licence-reviewed']),
    ]),
  ];
  feature.reviewed = true;
  feature.updatedAt = reviewedAt;
  const note = citationOnly
    ? 'Licence review complete: IWM source is linked for provenance only; IWM media and record text are not redistributed.'
    : 'Licence review complete: Council-held textual information is reusable under the Council reuse policy with attribution; third-party material is excluded.';
  if (!feature.reviewNotes?.includes(note))
    feature.reviewNotes = [feature.reviewNotes, note].filter(Boolean).join(' ');
  decisions.push({
    id: feature.id,
    name: feature.name,
    policy: citationOnly ? 'citation_only' : 'ogl',
  });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error('Refusing to write ' + errors.length + ' validation error(s).');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  JSON.stringify(
    {
      projectId: pkg.project.id,
      reviewedAt,
      councilReusePolicy: 'https://www.clacks.gov.uk/regulation/reuseofpublicsectorinfo/',
      iwmTerms:
        'https://www.iwm.org.uk/sites/default/files/files/2023-01/IWM%20Terms%20and%20Conditions%202023.CQ%20%28002%29.pdf',
      decisions: decisions.sort((left, right) => left.name.localeCompare(right.name)),
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
await writeFile(projectPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
console.log(
  'Reviewed source-use terms for ' +
    decisions.length +
    ' Tillicoultry record(s): ' +
    decisions.filter((decision) => decision.policy === 'ogl').length +
    ' OGL, ' +
    decisions.filter((decision) => decision.policy === 'citation_only').length +
    ' citation-only.',
);
