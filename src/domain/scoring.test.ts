import { describe, expect, it } from 'vitest';
import { ageBand, historicCharacterScore } from './scoring';
import type { HeritageFeature } from './models';

const feature = {
  id: 'x',
  projectId: 'p',
  name: 'X',
  alternativeNames: [],
  countryCode: 'GB',
  featureType: 'other',
  geometry: { type: 'Point', coordinates: [0, 0] },
  locationType: 'exact',
  latestPossibleYear: 1800,
  dateBasis: 'documented_construction',
  dateConfidence: 'high',
  locationConfidence: 'high',
  significance: 'highest_national',
  survival: 'substantially_intact',
  sourceRecords: [],
  tags: [],
  createdAt: '',
  updatedAt: '',
  reviewed: true,
} satisfies HeritageFeature;
describe('scoring', () => {
  it('uses normalised factors with stronger weight for older evidence', () => {
    expect(historicCharacterScore(feature)).toBeCloseTo(0.8 ** 1.5);
    expect(historicCharacterScore({ ...feature, latestPossibleYear: 1600 })).toBeGreaterThan(
      historicCharacterScore({ ...feature, latestPossibleYear: 1900 }),
    );
  });
  it('handles unknown dates', () => expect(ageBand()).toBe('unknown'));
  it('excludes related context from parish heat scoring', () =>
    expect(historicCharacterScore({ ...feature, evidenceScope: 'related_context' })).toBe(0));
  it('excludes present-day context from historic heat scoring', () =>
    expect(historicCharacterScore({ ...feature, tags: ['current-context'] })).toBe(0));
});
