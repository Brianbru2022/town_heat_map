import { publishedProjectPackages } from '../src/data/publishedProjects';
import {
  claimForCurrentPlaceKey,
  claimIsSupported,
  parseCurrentPlaceDetails,
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

  reject(
    publicPackage.project.researchNotes,
    `${sourcePackage.project.id}: project research notes`,
  );
  reject(
    publicPackage.project.townStudyArea,
    `${sourcePackage.project.id}: town-study working notes`,
  );
  reject(publicPackage.curationMetadata, `${sourcePackage.project.id}: curation metadata`);
  reject(
    publicPackage.publication?.notes,
    `${sourcePackage.project.id}: package publication notes`,
  );
  reject(
    publicPackage.sources.some((source) => source.limitations),
    `${sourcePackage.project.id}: source limitation notes`,
  );
  reject(
    publicPackage.historicMaps.some((map) => map.notes || map.publication?.notes),
    `${sourcePackage.project.id}: historic-map internal notes`,
  );
  reject(
    publicPackage.settlementPolygons.some(
      (polygon) =>
        polygon.publication?.notes || polygon.sourceRecords.some((source) => source.notes),
    ),
    `${sourcePackage.project.id}: settlement-polygon internal notes`,
  );

  for (const feature of publicPackage.features) {
    publicFeatureCount += 1;
    reject(feature.reviewNotes, `${sourcePackage.project.id}/${feature.id}: review notes`);
    reject(
      feature.publication?.notes,
      `${sourcePackage.project.id}/${feature.id}: publication notes`,
    );
    reject(
      feature.claimEvidence?.some((evidence) => evidence.notes),
      `${sourcePackage.project.id}/${feature.id}: claim-evidence notes`,
    );

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
        feature.fullDescription,
        `${sourcePackage.project.id}/${feature.id}: full description`,
      );
    }

    for (const source of feature.sourceRecords) {
      reject(
        source.notes && !source.notes.startsWith('Public claim details:'),
        `${sourcePackage.project.id}/${feature.id}/${source.sourceName}: arbitrary source notes`,
      );
      const parsed = parseCurrentPlaceDetails(source.notes);
      const projected = publicCurrentPlaceDetails(feature, source);
      reject(
        JSON.stringify(parsed) !== JSON.stringify(projected),
        `${sourcePackage.project.id}/${feature.id}/${source.sourceName}: unprojected details`,
      );
      for (const detail of projected) {
        projectedDetailCount += 1;
        const claim = claimForCurrentPlaceKey(detail.key);
        reject(
          !claim || !claimIsSupported(feature, claim),
          `${sourcePackage.project.id}/${feature.id}/${source.sourceName}: unsupported ${detail.key}`,
        );
      }
    }
  }
}

if (errors.length > 0) {
  throw new Error(`Public narrative audit failed:\n${errors.join('\n')}`);
}

console.log(
  `Public narrative audit passed: ${publishedProjectPackages.length} packages, ${publicFeatureCount} public features, ${projectedDetailCount} allowlisted current-place details, zero arbitrary internal narrative paths.`,
);
