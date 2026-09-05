import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const reportPath = resolve(
  process.argv[3] ?? 'data/review/alloa-curation-queue-classification.json',
);
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

function lacksDate(feature: HeritageFeature): boolean {
  return (
    !feature.documentedDateText &&
    feature.earliestPossibleYear === undefined &&
    feature.latestPossibleYear === undefined &&
    !feature.tags.includes('current-context')
  );
}

function classification(feature: HeritageFeature): string {
  return feature.shortDescription ?? '';
}

function addTag(feature: HeritageFeature, tag: string, note: string): void {
  feature.tags = [...new Set([...feature.tags, tag])];
  if (!feature.reviewNotes?.includes(note))
    feature.reviewNotes = `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}${note}`;
  feature.updatedAt = accessedAt;
}

function removeTag(feature: HeritageFeature, tag: string): void {
  feature.tags = feature.tags.filter((candidate) => candidate !== tag);
}

const broadArchaeology =
  /\b(?:findspot|bronze age|iron age|neolithic|prehistoric|\bcist\b|cairn|\bcoin\b|flint|socketed|stone circle|rig and furrow|post hole|burial\b|rock art|midden|coffin)\b/i;
const generalView = /\bgeneral view\b/i;

const categories = {
  catalogueGeneralView: [] as string[],
  broadArchaeology: [] as string[],
  namedResearchPriority: [] as string[],
  otherUndatedEvidence: [] as string[],
  outOfScope: [] as string[],
  researchedNoDate: [] as string[],
};

// A subsequent source-date or statutory-duplicate merge can resolve an item
// after it was first placed in this queue. Keep the queue tag truthful on
// repeatable runs.
for (const feature of pkg.features.filter((feature) => !lacksDate(feature))) {
  removeTag(feature, 'curation-priority-named-site');
}

for (const feature of pkg.features.filter(lacksDate)) {
  if (feature.evidenceScope === 'out_of_scope') {
    removeTag(feature, 'curation-priority-named-site');
    categories.outOfScope.push(feature.id);
    continue;
  }
  if (feature.tags.includes('alloa-date-researched-no-date')) {
    removeTag(feature, 'curation-priority-named-site');
    categories.researchedNoDate.push(feature.id);
    continue;
  }
  const text = classification(feature);
  if (generalView.test(text)) {
    addTag(
      feature,
      'catalogue-general-view',
      'Curation classification: catalogue/general-view record retained for provenance and Data Review, but hidden from the public map because it is not a discrete mapped heritage asset.',
    );
    addTag(
      feature,
      'map-hidden',
      'Curation classification: catalogue/general-view record retained for provenance and Data Review, but hidden from the public map because it is not a discrete mapped heritage asset.',
    );
    categories.catalogueGeneralView.push(feature.id);
  } else if (broadArchaeology.test(text)) {
    removeTag(feature, 'curation-priority-named-site');
    addTag(
      feature,
      'archaeology-evidence',
      'Curation classification: broad archaeological inventory evidence retained without an inferred construction date. It is available through the archaeology-evidence map filter and Data Review.',
    );
    categories.broadArchaeology.push(feature.id);
  } else if (feature.id.startsWith('nrhe:')) {
    removeTag(feature, 'archaeology-evidence');
    addTag(
      feature,
      'curation-priority-named-site',
      'Curation classification: named NRHE built-environment, industrial, transport or place record retained for targeted source-date research.',
    );
    categories.namedResearchPriority.push(feature.id);
  } else {
    addTag(
      feature,
      'curation-other-undated-evidence',
      'Curation classification: undated statutory or contextual evidence retained for separate source review.',
    );
    categories.otherUndatedEvidence.push(feature.id);
  }
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      projectId: pkg.project.id,
      classifiedAt: accessedAt,
      policy:
        'General-view catalogue entries remain public in Data Review but are not public map pins. Broad archaeological evidence stays undated unless a record supplies historic-period evidence. Named period-unassigned NRHE sites are the targeted research queue.',
      categories,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Classified ${categories.catalogueGeneralView.length} general-view, ${categories.broadArchaeology.length} archaeological, ${categories.namedResearchPriority.length} named, ${categories.otherUndatedEvidence.length} other, ${categories.outOfScope.length} outside-locality and ${categories.researchedNoDate.length} reviewed-undated Alloa record(s).`,
);
