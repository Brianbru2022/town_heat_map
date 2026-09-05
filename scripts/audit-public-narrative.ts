import { publishedProjectPackages } from '../src/data/publishedProjects';
import {
  claimForCurrentPlaceKey,
  claimIsSupported,
  publicationProfile,
  publicCurrentPlaceDetails,
} from '../src/domain/claims';
import { publicProjectPackage } from '../src/domain/publication';

const errors: string[] = [];
let publicFeatureCount = 0;
let projectedDetailCount = 0;

function reject(condition: unknown, message: string): void {
  if (condition) errors.push(message);
}

for (const sourcePackage of publishedProjectPackages) {
  const publicPackage = publicProjectPackage(sourcePackage);
  if (!publicPackage) {
    errors.push(`${sourcePackage.project.id}: publishable source package was rejected`);
    continue;
  }

  const publicText = JSON.stringify(publicPackage);
  for (const field of [
    'researchNotes',
    'townStudyArea',
    'curationMetadata',
    'reviewNotes',
    'claimEvidence',
    'sourceRecordRefs',
    'sourceRecordId',
    'createdAt',
    'updatedAt',
    'importedAt',
    'localPath',
    'legalReviewNote',
    'geographicScope',
    'osmElement',
    'changesetId',
    'publicationSummary',
    'validation',
  ])
    reject(publicText.includes(`"${field}"`), `${sourcePackage.project.id}: ${field}`);

  for (const feature of publicPackage.features) {
    publicFeatureCount += 1;
    const sourceFeature = sourcePackage.features.find((candidate) => candidate.id === feature.id)!;
    const profile = publicationProfile(sourceFeature);
    const editorial = claimIsSupported(sourceFeature, 'editorial_recommendation');
    if (profile && !editorial) {
      reject(
        feature.shortDescription !==
          'Mapped present-day context; availability and visitor facilities are not implied.',
        `${sourcePackage.project.id}/${feature.id}: non-editorial narrative`,
      );
      reject(
        publicText.includes(`"fullDescription"`),
        `${sourcePackage.project.id}: full description`,
      );
    }
    const expectedDetails = sourceFeature.sourceRecords.flatMap((source) =>
      publicCurrentPlaceDetails(sourceFeature, source),
    );
    const projected = feature.currentPlaceDetails ?? [];
    for (const detail of projected) {
      projectedDetailCount += 1;
      const claim = claimForCurrentPlaceKey(detail.key);
      reject(
        !claim || !claimIsSupported(sourceFeature, claim),
        `${sourcePackage.project.id}/${feature.id}: unsupported ${detail.key}`,
      );
    }
    reject(
      projected.some(
        (detail) =>
          !expectedDetails.some(
            (candidate) => candidate.key === detail.key && candidate.value === detail.value,
          ),
      ),
      `${sourcePackage.project.id}/${feature.id}: unsupported projected current-place detail`,
    );
  }
}

if (errors.length > 0) {
  throw new Error(`Public narrative audit failed:\n${errors.join('\n')}`);
}

console.log(
  `Public narrative audit passed: ${publishedProjectPackages.length} packages, ${publicFeatureCount} public features, ${projectedDetailCount} allowlisted current-place details, zero arbitrary internal narrative paths.`,
);
