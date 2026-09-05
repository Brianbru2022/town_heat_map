import { describe, expect, it } from 'vitest';
import { hasHistoricTimelineDate } from '../domain/timeline';
import { tillicoultryPackage } from './tillicoultry';

describe('Tillicoultry published package', () => {
  it('retains curated evidence and labels official NRHE classifications as broad timeline ranges', () => {
    const historicFeatures = tillicoultryPackage.features.filter(
      (feature) => !feature.tags.includes('osm-community-place'),
    );
    expect(historicFeatures).toHaveLength(170);
    const curated = historicFeatures.filter((feature) => feature.id.startsWith('curated:'));
    expect(curated).toHaveLength(39);
    expect(curated.every(hasHistoricTimelineDate)).toBe(true);
    expect(
      historicFeatures.filter((feature) => feature.tags.includes('nrhe-period-extracted')),
    ).toHaveLength(62);
    expect(historicFeatures.filter((feature) => !hasHistoricTimelineDate(feature))).toHaveLength(
      92,
    );
    expect(
      tillicoultryPackage.features.filter((feature) => feature.tags.includes('osm-current-park')),
    ).toHaveLength(3);
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:220130'),
    ).toMatchObject({
      name: 'Murray Square Clock',
      earliestPossibleYear: 1928,
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48275'),
    ).toMatchObject({
      dateBasis: 'present_by',
      earliestPossibleYear: 1926,
    });
    expect(
      tillicoultryPackage.features.find(
        (feature) => feature.id === 'curated:westertown-historic-core',
      ),
    ).toMatchObject({
      earliestPossibleYear: 1560,
      locationType: 'approximate',
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48274'),
    ).toMatchObject({
      earliestPossibleYear: 1846,
      latestPossibleYear: 1869,
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48283'),
    ).toMatchObject({
      earliestPossibleYear: 1806,
      latestPossibleYear: 1806,
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48279'),
    ).toMatchObject({
      latestPossibleYear: 1806,
      dateBasis: 'present_by',
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48279')
        ?.earliestPossibleYear,
    ).toBeUndefined();
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'curated:hes-lb42050'),
    ).toMatchObject({
      earliestPossibleYear: 1879,
      latestPossibleYear: 1879,
      dateConfidence: 'high',
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:310490'),
    ).toMatchObject({
      earliestPossibleYear: 1892,
      latestPossibleYear: 1892,
    });
  });

  it('keeps unsited supplied records out of map rendering and withholds other-locality buffer records', () => {
    expect(tillicoultryPackage.features.filter((feature) => !feature.geometry)).toHaveLength(10);
    expect(
      tillicoultryPackage.features.filter((feature) => feature.id.startsWith('nrhe:')),
    ).toHaveLength(120);
    expect(
      tillicoultryPackage.features.filter(
        (feature) =>
          feature.evidenceScope === 'related_context' &&
          !feature.tags.includes('osm-community-place'),
      ),
    ).toHaveLength(15);
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48260'),
    ).toMatchObject({
      evidenceScope: 'related_context',
      publication: { state: 'publishable' },
    });
    expect(
      tillicoultryPackage.features.find((feature) => feature.id === 'nrhe:48292'),
    ).toMatchObject({
      evidenceScope: 'out_of_scope',
      publication: { state: 'withheld' },
    });
  });

  it('records explicit source-use terms for every public feature', () => {
    expect(
      tillicoultryPackage.features
        .filter((feature) => feature.evidenceScope !== 'out_of_scope')
        .every((feature) => Boolean(feature.licence)),
    ).toBe(true);
    expect(
      tillicoultryPackage.features.filter((feature) =>
        feature.tags.includes('source-use-restricted'),
      ),
    ).toHaveLength(7);
  });

  it('publishes the official parish boundary while keeping unapproved historic maps out', () => {
    expect(tillicoultryPackage.project.boundaryConfidence).toBe('high');
    expect(tillicoultryPackage.historicMaps.map((map) => map.id)).toEqual([
      'hes-listed-buildings-by-category',
    ]);
  });
});
