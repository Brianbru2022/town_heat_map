import type { ScoringMethodology } from './models';
import type { PublicFeature } from './publicDto';

export const defaultMethodology: ScoringMethodology = {
  age: {
    before_1700: 1,
    '1700_1799': 0.9,
    '1800_1849': 0.8,
    '1850_1899': 0.65,
    '1900_1918': 0.5,
    '1919_1945': 0.4,
    '1946_1960': 0.25,
    after_1960: 0.15,
    unknown: 0.2,
  },
  significance: {
    highest_national: 1,
    national: 0.85,
    regional: 0.65,
    local: 0.45,
    recognised: 0.3,
  },
  confidence: { high: 1, medium: 0.75, low: 0.5, unknown: 0.35 },
  survival: {
    substantially_intact: 1,
    altered_recognisable: 0.75,
    heavily_altered: 0.45,
    site_only_or_demolished: 0.2,
    unknown: 0.6,
  },
};

export function ageBand(year?: number): string {
  if (!year) return 'unknown';
  if (year < 1700) return 'before_1700';
  if (year < 1800) return '1700_1799';
  if (year < 1850) return '1800_1849';
  if (year < 1900) return '1850_1899';
  if (year <= 1918) return '1900_1918';
  if (year <= 1945) return '1919_1945';
  if (year <= 1960) return '1946_1960';
  return 'after_1960';
}

export function historicCharacterScore(
  feature: PublicFeature,
  method = defaultMethodology,
): number {
  if (
    feature.evidenceScope === 'related_context' ||
    feature.evidenceScope === 'out_of_scope' ||
    feature.tags.includes('current-context')
  )
    return 0;
  const age =
    method.age[ageBand(feature.latestPossibleYear ?? feature.earliestPossibleYear)] ??
    method.age.unknown;
  const significance = method.significance[feature.significance ?? 'recognised'];
  const confidence = method.confidence[feature.dateConfidence];
  const survival = method.survival[feature.survival ?? 'unknown'];
  // Age is deliberately emphasised for the heat map, while the remaining
  // evidence factors still moderate uncertain or poorly surviving sites.
  return age ** 1.5 * significance * confidence * survival;
}
