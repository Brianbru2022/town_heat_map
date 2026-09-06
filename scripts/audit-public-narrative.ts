import { publishedProjectPackages } from '../src/data/publishedProjects';
import {
  claimForCurrentPlaceKey,
  claimIsSupported,
  publicationProfile,
  publicCurrentPlaceClaims,
  publicCurrentPlaceDetails,
} from '../src/domain/claims';
import { publicProjectPackage } from '../src/domain/publication';

const errors: string[] = [];
let publicFeatureCount = 0;
let projectedDetailCount = 0;
let projectedClaimCount = 0;

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
    'quotedDateText',
  ])
    reject(publicText.includes(`"${field}"`), `${sourcePackage.project.id}: ${field}`);

  reject(
    Object.keys(publicPackage.project.boundary.properties ?? {}).length > 0,
    `${sourcePackage.project.id}: boundary properties`,
  );

  for (const feature of publicPackage.features) {
    publicFeatureCount += 1;
    const sourceFeature = sourcePackage.features.find((candidate) => candidate.id === feature.id)!;
    const profile = publicationProfile(sourceFeature);
    const editorial = claimIsSupported(sourceFeature, 'editorial_recommendation');
    const expectedNarrative =
      profile === 'editorial' && editorial
        ? [{ kind: 'recommendation', text: 'Recommended as a visitor stop.' }]
        : [];
    reject(
      JSON.stringify(feature.narrative ?? []) !== JSON.stringify(expectedNarrative),
      `${sourcePackage.project.id}/${feature.id}: narrative components`,
    );
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
    const expectedClaims = sourceFeature.sourceRecords.flatMap((source) =>
      publicCurrentPlaceClaims(sourceFeature, source),
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
    const projectedClaims = feature.currentPlaceClaims ?? [];
    projectedClaimCount += projectedClaims.length;
    reject(
      projectedClaims.some(
        (claim) =>
          !expectedClaims.some((candidate) => JSON.stringify(candidate) === JSON.stringify(claim)),
      ),
      `${sourcePackage.project.id}/${feature.id}: unsupported typed current-place claim`,
    );
  }
}

if (errors.length > 0) {
  throw new Error(`Public narrative audit failed:\n${errors.join('\n')}`);
}

console.log(
  `Public narrative audit passed: ${publishedProjectPackages.length} packages, ${publicFeatureCount} public features, ${projectedDetailCount} mapped identity details and ${projectedClaimCount} typed current-place claims, zero arbitrary internal narrative paths.`,
);
