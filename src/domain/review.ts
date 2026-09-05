import type { HeritageFeature, ProjectPackage, ValidationResult } from './models';
import { assessFeaturePublication, type FeaturePublicationAssessment } from './publication';
import { hasHistoricTimelineDate } from './timeline';
import { validateFeatures } from './validation';

export type ReviewFilter =
  'all' | 'publication' | 'date' | 'location' | 'unreviewed' | 'validation';
export type LocalReviewStatus = 'needs_research' | 'approved' | 'excluded';

export interface LocalReviewDecision {
  featureId: string;
  status: LocalReviewStatus;
  note?: string;
  updatedAt: string;
}

export interface ReviewQueueItem {
  feature: HeritageFeature;
  reasons: string[];
  warnings: ValidationResult[];
  publication: FeaturePublicationAssessment;
}

function needsGeometryReview(feature: HeritageFeature): boolean {
  return (
    !feature.geometry ||
    feature.locationConfidence === 'low' ||
    feature.locationConfidence === 'unknown' ||
    /geometry|digitis|alignment|street line|park polygon/i.test(
      `${feature.locationType} ${feature.reviewNotes ?? ''}`,
    )
  );
}

export function buildReviewQueue(
  pkg: ProjectPackage,
  filter: ReviewFilter = 'all',
): ReviewQueueItem[] {
  const liveValidation = validateFeatures(pkg.project, pkg.features);
  const validation = [...liveValidation, ...pkg.validation].filter(
    (item, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.recordId === item.recordId &&
          candidate.field === item.field &&
          candidate.message === item.message,
      ) === index,
  );
  return pkg.features
    .filter((feature) => feature.evidenceScope !== 'out_of_scope')
    .map((feature) => {
      const warnings = validation.filter((warning) => warning.recordId === feature.id);
      const publication = assessFeaturePublication(pkg, feature, validation);
      const missingDate = !hasHistoricTimelineDate(feature);
      const geometryReview = needsGeometryReview(feature);
      const reasons = [
        ...(feature.tags.includes('catalogue-general-view')
          ? ['Catalogue/general-view record is retained for provenance and hidden from the map.']
          : []),
        ...(feature.tags.includes('archaeology-evidence')
          ? ['Broad archaeological evidence is retained without an inferred construction date.']
          : []),
        ...(missingDate ? ['Historic date evidence is needed.'] : []),
        ...(geometryReview ? ['Location or geometry needs review.'] : []),
        ...(!feature.reviewed ? ['Record has not been curator-reviewed.'] : []),
        ...(publication.effectiveState === 'provisional'
          ? ['Publication is provisional and requires evidence review.']
          : []),
        ...(publication.effectiveState === 'verified'
          ? ['Evidence is verified, but the package has not been approved for publication.']
          : []),
        ...(publication.effectiveState === 'withheld'
          ? ['Record is explicitly withheld from publication.']
          : []),
        ...warnings.map((warning) => warning.message),
      ];
      return { feature, reasons, warnings, publication };
    })
    .filter(({ feature, warnings, publication }) => {
      if (filter === 'publication') return !publication.canPublish;
      if (filter === 'date') return !hasHistoricTimelineDate(feature);
      if (filter === 'location') return needsGeometryReview(feature);
      if (filter === 'unreviewed') return !feature.reviewed;
      if (filter === 'validation') return warnings.length > 0;
      return true;
    })
    .filter((item) => item.reasons.length > 0)
    .sort((left, right) => left.feature.name.localeCompare(right.feature.name));
}
