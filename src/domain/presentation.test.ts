import { describe, expect, it } from 'vitest';
import type { HeritageFeature } from './models';
import {
  isArchaeologyEvidenceFeature,
  isMapCatalogueRecord,
  isPublicTownFeature,
} from './presentation';

const feature = (tags: string[]): HeritageFeature => ({
  id: 'test:feature',
  projectId: 'test',
  name: 'Test feature',
  alternativeNames: [],
  countryCode: 'GB',
  featureType: 'other',
  geometry: null,
  locationType: 'unknown',
  dateBasis: 'unknown',
  dateConfidence: 'unknown',
  locationConfidence: 'unknown',
  sourceRecords: [],
  tags,
  createdAt: '',
  updatedAt: '',
  reviewed: false,
});

describe('map presentation categories', () => {
  it('keeps catalogue records off the map while retaining archaeological evidence as a selectable group', () => {
    expect(isMapCatalogueRecord(feature(['catalogue-general-view']))).toBe(true);
    expect(isMapCatalogueRecord(feature(['map-hidden']))).toBe(true);
    expect(isArchaeologyEvidenceFeature(feature(['archaeology-evidence']))).toBe(true);
    expect(isArchaeologyEvidenceFeature(feature(['scheduled_monument']))).toBe(true);
    expect(isArchaeologyEvidenceFeature(feature([]))).toBe(false);
    expect(isPublicTownFeature(feature([]))).toBe(true);
    expect(isPublicTownFeature({ ...feature([]), evidenceScope: 'out_of_scope' })).toBe(false);
  });
});
