import { describe, expect, it } from 'vitest';
import { hasEstablishedDate, hasHistoricTimelineDate } from '../domain/timeline';
import { validateFeatures } from '../domain/validation';
import { alvaPackage } from './alva';

describe('Alva published package', () => {
  it('uses the NRS Alva parish boundary and retains the dated curated pack alongside NRHE evidence', () => {
    const historicFeatures = alvaPackage.features.filter(
      (feature) => !feature.tags.includes('osm-community-place'),
    );
    expect(alvaPackage.project.boundary.properties?.parishName).toBe('Alva');
    expect(alvaPackage.project.townStudyArea?.localityName).toBe('Alva');
    expect(alvaPackage.project.townStudyArea?.bufferMetres).toBe(500);
    expect(historicFeatures).toHaveLength(164);
    expect(historicFeatures.filter((feature) => feature.id.startsWith('curated:'))).toHaveLength(
      34,
    );
    expect(
      historicFeatures
        .filter((feature) => feature.id.startsWith('curated:'))
        .every(hasEstablishedDate),
    ).toBe(true);
    expect(historicFeatures.filter(hasEstablishedDate)).toHaveLength(164);
    expect(historicFeatures.filter(hasHistoricTimelineDate)).toHaveLength(101);
    expect(historicFeatures.filter((feature) => feature.id.startsWith('nrhe:'))).toHaveLength(124);
    expect(
      historicFeatures.filter((feature) => feature.tags.includes('inventory-presence-date')),
    ).toHaveLength(62);
    expect(
      alvaPackage.features.filter((feature) => feature.tags.includes('osm-current-park')),
    ).toHaveLength(2);
    expect(validateFeatures(alvaPackage.project, alvaPackage.features)).not.toContainEqual(
      expect.objectContaining({ severity: 'error' }),
    );
    expect(alvaPackage.features.some((feature) => /\bmenstrie\b/i.test(feature.name))).toBe(false);
    expect(alvaPackage.features.find((feature) => feature.id === 'nrhe:47074')).toMatchObject({
      earliestPossibleYear: 1873,
      latestPossibleYear: 1877,
      dateBasis: 'estimated_from_authoritative_source',
    });
    expect(alvaPackage.features.find((feature) => feature.id === 'nrhe:111955')).toMatchObject({
      latestPossibleYear: 1866,
      dateBasis: 'first_mapped',
    });
    expect(
      alvaPackage.features.find((feature) => feature.id === 'nrhe:111955')?.earliestPossibleYear,
    ).toBeUndefined();
  });

  it('publishes the reviewed community inventory without an unapproved historic map', () => {
    const communityFeatures = alvaPackage.features.filter((feature) =>
      feature.tags.includes('community-layer'),
    );
    expect(communityFeatures).toHaveLength(15);
    expect(communityFeatures.flatMap((feature) => feature.sourceRecords)).not.toContainEqual(
      expect.any(String),
    );
    expect(alvaPackage.historicMaps).toHaveLength(1);
    expect(alvaPackage.historicMaps.some((map) => map.id === 'nls-os-1920s-public-api')).toBe(
      false,
    );
    expect(alvaPackage.settlementPolygons).toEqual([]);
    expect(alvaPackage.curationMetadata?.importedPacks[0]?.historicMapCatalogue).toHaveLength(6);
  });
});
