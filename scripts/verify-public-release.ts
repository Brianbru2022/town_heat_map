import { publishedProjectPackages } from '../src/data/publishedProjects';
import { validateProjectPackageSchema } from '../src/domain/packageSchema';
import { assessProjectPackage, publicProjectPackage } from '../src/domain/publication';
import {
  componentLicenceAllowsPublicUse,
  featureLicenceAllowsPublicUse,
  licenceDecisionAllowsPublicUse,
  mapLicenceAllowsPublicUse,
  packageLicenceAllowsPublicUse,
  settlementLicenceAllowsPublicUse,
} from '../src/domain/licensing';

const errors: string[] = [];
let publicFeatureCount = 0;

for (const sourcePackage of publishedProjectPackages) {
  const schema = validateProjectPackageSchema(sourcePackage);
  if (!schema.valid) {
    errors.push(`${sourcePackage.project.id}: schema invalid (${schema.errors.join('; ')})`);
    continue;
  }

  const assessment = assessProjectPackage(sourcePackage);
  if (!packageLicenceAllowsPublicUse(sourcePackage))
    errors.push(`${sourcePackage.project.id}: package licence decision is not approved`);
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

  for (const feature of publicPackage.features) {
    const retained = sourcePackage.features.find((candidate) => candidate.id === feature.id);
    if (!retained || !featureLicenceAllowsPublicUse(retained))
      errors.push(`${sourcePackage.project.id}/${feature.id}: licence decision is not approved`);
  }
  for (const source of publicPackage.sources) {
    const retained = sourcePackage.sources.find((candidate) => candidate.id === source.id);
    if (!retained || !licenceDecisionAllowsPublicUse(retained.licenceDecision, retained.licence))
      errors.push(`${sourcePackage.project.id}/${source.id}: source decision is not approved`);
  }
  for (const map of publicPackage.historicMaps) {
    const retained = sourcePackage.historicMaps.find((candidate) => candidate.id === map.id);
    if (!retained || !mapLicenceAllowsPublicUse(retained))
      errors.push(`${sourcePackage.project.id}/${map.id}: map decision is not approved`);
  }
  for (const polygon of publicPackage.settlementPolygons) {
    const retained = sourcePackage.settlementPolygons.find(
      (candidate) => candidate.id === polygon.id,
    );
    if (!retained || !settlementLicenceAllowsPublicUse(retained))
      errors.push(`${sourcePackage.project.id}/${polygon.id}: polygon decision is not approved`);
  }
  for (const component of sourcePackage.licensingMetadata?.components ?? [])
    if (
      publicPackage.licensingMetadata?.components.some(
        (candidate) => candidate.id === component.id,
      ) &&
      !componentLicenceAllowsPublicUse(component)
    )
      errors.push(
        `${sourcePackage.project.id}/${component.id}: component decision is not approved`,
      );

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
