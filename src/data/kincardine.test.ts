import { describe, expect, it } from 'vitest';
import { hasHistoricTimelineDate } from '../domain/timeline';
import { validateFeatures } from '../domain/validation';
import { kincardinePackage } from './kincardine';

describe('Kincardine-on-Forth published package', () => {
  it('keeps the supplied all-dated heritage snapshot, statutory refresh and authoritative parish extent', () => {
    const historicFeatures = kincardinePackage.features.filter(
      (feature) => !feature.tags.includes('osm-community-place'),
    );
    expect(kincardinePackage.project.id).toBe('kincardine-on-forth-scotland');
    expect(kincardinePackage.project.boundary.properties?.parishName).toBe('Tulliallan');
    expect(kincardinePackage.project.townStudyArea?.localityName).toBe('Kincardine');
    expect(kincardinePackage.project.townStudyArea?.bufferMetres).toBe(500);
    expect(historicFeatures).toHaveLength(317);
    expect(
      historicFeatures.filter(
        (feature) =>
          feature.documentedDateText &&
          feature.earliestPossibleYear !== undefined &&
          feature.latestPossibleYear !== undefined &&
          feature.dateBasis !== 'unknown',
      ),
    ).toHaveLength(224);
    expect(historicFeatures.filter((feature) => feature.id.startsWith('nrhe:'))).toHaveLength(248);
    expect(historicFeatures.some((feature) => feature.datePrecision)).toBe(true);
    expect(
      historicFeatures.filter((feature) => feature.tags.includes('nrhe-period-extracted')),
    ).toHaveLength(158);
    expect(historicFeatures.filter(hasHistoricTimelineDate)).toHaveLength(192);
    expect(
      validateFeatures(kincardinePackage.project, kincardinePackage.features),
    ).not.toContainEqual(expect.objectContaining({ severity: 'error' }));
  });

  it('keeps unapproved maps out of the selector', () => {
    expect(kincardinePackage.historicMaps).toHaveLength(1);
    expect(kincardinePackage.historicMaps.some((map) => map.id === 'nls-os-1920s-public-api')).toBe(
      false,
    );
    expect(kincardinePackage.settlementPolygons).toEqual([]);
    expect(kincardinePackage.curationMetadata?.importedPacks[0]?.historicMapCatalogue).toHaveLength(
      7,
    );
    expect(kincardinePackage.features.filter((feature) => !feature.geometry)).toHaveLength(2);
  });
});
