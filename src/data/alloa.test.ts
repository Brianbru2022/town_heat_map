import { describe, expect, it } from 'vitest';
import { alloaPackage } from './alloa';

describe('Alloa published package', () => {
  it('retains the official HES period evidence for Alloa Tower', () => {
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:320380')).toMatchObject({
      name: 'Alloa Tower',
      earliestPossibleYear: 1400,
      latestPossibleYear: 1499,
      dateBasis: 'documented_date_range',
      dateConfidence: 'high',
    });
  });

  it('keeps catalogue views out of the map while preserving archaeology and named-site review queues', () => {
    expect(
      alloaPackage.features.filter((feature) => feature.tags.includes('catalogue-general-view')),
    ).toHaveLength(35);
    expect(
      alloaPackage.features.filter((feature) => feature.tags.includes('archaeology-evidence')),
    ).toHaveLength(21);
    expect(
      alloaPackage.features.filter((feature) =>
        feature.tags.includes('curation-priority-named-site'),
      ),
    ).toHaveLength(0);
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:130814')).toMatchObject({
      earliestPossibleYear: 1879,
      latestPossibleYear: 1960,
      dateBasis: 'documented_date_range',
    });
  });

  it('does not publish adjacent settlements in the Alloa town view', () => {
    const outOfScope = alloaPackage.features.filter(
      (feature) => feature.evidenceScope === 'out_of_scope',
    );
    expect(outOfScope).toHaveLength(166);
    expect(outOfScope.some((feature) => feature.name.includes('TULLIBODY'))).toBe(true);
    expect(outOfScope.some((feature) => feature.name.includes('SAUCHIE'))).toBe(true);
  });

  it('uses feature-level evidence rather than guessed years for the Mar Inn and Gray and Harrower mill', () => {
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:47197')).toMatchObject({
      latestPossibleYear: 1744,
      dateBasis: 'present_by',
      survival: 'site_only_or_demolished',
    });
    expect(
      alloaPackage.features.find((feature) => feature.id === 'nrhe:47197')?.earliestPossibleYear,
    ).toBeUndefined();
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:141970')).toMatchObject({
      earliestPossibleYear: 1731,
      latestPossibleYear: 1731,
      dateBasis: 'documented_construction',
    });
  });

  it('retains the distinction between building dates and named-site evidence', () => {
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:47202')).toMatchObject({
      earliestPossibleYear: 1861,
      dateBasis: 'documented_date_range',
    });
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:47235')).toMatchObject({
      latestPossibleYear: 1799,
      dateBasis: 'present_by',
    });
    expect(
      alloaPackage.features.find((feature) => feature.id === 'nrhe:47235')?.earliestPossibleYear,
    ).toBeUndefined();
  });

  it('keeps source-reviewed but undated named records in the public review path', () => {
    expect(
      alloaPackage.features.filter((feature) =>
        feature.tags.includes('alloa-date-researched-no-date'),
      ),
    ).toHaveLength(14);
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:141370')).toMatchObject({
      latestPossibleYear: 1815,
      dateBasis: 'present_by',
    });
    expect(alloaPackage.features.find((feature) => feature.id === 'nrhe:133349')?.tags).toContain(
      'map-hidden',
    );
  });
});
