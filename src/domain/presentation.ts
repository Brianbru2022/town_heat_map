import type { PublicFeature } from './publicDto';

export function isMapCatalogueRecord(feature: PublicFeature): boolean {
  return feature.tags.includes('map-hidden') || feature.tags.includes('catalogue-general-view');
}

/** Records retained only for another town's future project must not leak into this town's map. */
export function isPublicTownFeature(feature: PublicFeature): boolean {
  return feature.evidenceScope !== 'out_of_scope';
}

export function isArchaeologyEvidenceFeature(feature: PublicFeature): boolean {
  return (
    feature.tags.includes('archaeology-evidence') || feature.tags.includes('scheduled_monument')
  );
}
