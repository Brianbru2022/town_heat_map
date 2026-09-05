import type { HeritageFeature } from './models';

export function isMapCatalogueRecord(feature: HeritageFeature): boolean {
  return feature.tags.includes('map-hidden') || feature.tags.includes('catalogue-general-view');
}

/** Records retained only for another town's future project must not leak into this town's map. */
export function isPublicTownFeature(feature: HeritageFeature): boolean {
  return feature.evidenceScope !== 'out_of_scope';
}

export function isArchaeologyEvidenceFeature(feature: HeritageFeature): boolean {
  return (
    feature.tags.includes('archaeology-evidence') || feature.tags.includes('scheduled_monument')
  );
}
