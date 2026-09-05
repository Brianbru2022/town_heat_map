import { publishedProjectPackages } from '../src/data/publishedProjects';
import { validateProjectPackageSchema } from '../src/domain/packageSchema';
import { assessProjectPackage, publicProjectPackage } from '../src/domain/publication';

const errors: string[] = [];
let publicFeatureCount = 0;

for (const sourcePackage of publishedProjectPackages) {
  const schema = validateProjectPackageSchema(sourcePackage);
  if (!schema.valid) {
    errors.push(`${sourcePackage.project.id}: schema invalid (${schema.errors.join('; ')})`);
    continue;
  }

  const assessment = assessProjectPackage(sourcePackage);
  if (!assessment.canPublishPackage) {
    errors.push(`${sourcePackage.project.id}: catalogue package is not explicitly publishable`);
    continue;
  }

  const publicPackage = publicProjectPackage(sourcePackage);
  if (!publicPackage) {
    errors.push(`${sourcePackage.project.id}: public projection was unexpectedly rejected`);
    continue;
  }

  const expectedIds = assessment.records
    .filter((record) => record.canPublish)
    .map((record) => record.recordId)
    .sort();
  const deliveredIds = publicPackage.features.map((feature) => feature.id).sort();
  if (JSON.stringify(deliveredIds) !== JSON.stringify(expectedIds)) {
    errors.push(
      `${sourcePackage.project.id}: public projection does not match publishable records`,
    );
  }

  for (const record of assessment.records) {
    if (record.canPublish || record.effectiveState === 'withheld') continue;
    if (deliveredIds.includes(record.recordId)) {
      errors.push(
        `${sourcePackage.project.id}/${record.recordId}: non-public ${record.effectiveState} record was delivered`,
      );
    }
  }
  publicFeatureCount += publicPackage.features.length;
}

if (errors.length > 0) throw new Error(`Public release verification failed:\n${errors.join('\n')}`);

console.log(
  `Public release verification passed: ${publishedProjectPackages.length} explicitly publishable packages and ${publicFeatureCount} delivered features.`,
);
