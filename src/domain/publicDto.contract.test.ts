import { describe, expect, it } from 'vitest';
import { publishedProjectPackages } from '../data/publishedProjects';
import type { PublicProjectPackage } from './publicDto';
import { publicProjectPackage } from './publication';
import { canonicalPublicTileUrl, canonicalPublicUrl } from './publicUrl';
import { geometryIsStructurallyValid } from './validation';

function expectString(value: unknown): asserts value is string {
  expect(typeof value).toBe('string');
}

function expectFinite(value: unknown): asserts value is number {
  expect(typeof value).toBe('number');
  expect(Number.isFinite(value)).toBe(true);
}

function expectOptionalString(value: unknown): void {
  if (value !== undefined) expectString(value);
}

function expectPublicGeometry(value: unknown): void {
  expect(geometryIsStructurallyValid(value)).toBe(true);
  const geometry = value as { type: string; coordinates?: unknown; geometries?: unknown[] };
  expect(Object.keys(geometry).sort()).toEqual(
    (geometry.type === 'GeometryCollection'
      ? ['geometries', 'type']
      : ['coordinates', 'type']
    ).sort(),
  );
  if (geometry.type === 'GeometryCollection') geometry.geometries?.forEach(expectPublicGeometry);
}

function expectPublicPackage(pkg: PublicProjectPackage): void {
  const project = pkg.project;
  for (const value of [
    project.id,
    project.name,
    project.countryCode,
    project.country,
    project.locality,
  ])
    expectString(value);
  expectOptionalString(project.region);
  expect(project.centre).toHaveLength(2);
  project.centre.forEach(expectFinite);
  expect(Object.keys(project.boundary).sort()).toEqual(['geometry', 'properties', 'type']);
  expect(project.boundary.properties).toEqual({});
  expectPublicGeometry(project.boundary.geometry);
  if (project.timelineStart !== undefined) expectFinite(project.timelineStart);
  if (project.timelineEnd !== undefined) expectFinite(project.timelineEnd);
  for (const group of Object.values(project.methodology))
    for (const score of Object.values(group)) {
      expectFinite(score);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }

  for (const feature of pkg.features) {
    for (const value of [feature.id, feature.name, feature.featureType, feature.locationType])
      expectString(value);
    feature.alternativeNames.forEach(expectString);
    feature.tags.forEach(expectString);
    for (const value of [
      feature.designationType,
      feature.designationCategory,
      feature.statutoryStatus,
      feature.datePrecision,
      feature.shortDescription,
      feature.licence,
      feature.osmCheckedAt,
    ])
      expectOptionalString(value);
    for (const value of [feature.earliestPossibleYear, feature.latestPossibleYear])
      if (value !== undefined) {
        expectFinite(value);
        expect(Number.isSafeInteger(value)).toBe(true);
      }
    if (feature.geometry) expectPublicGeometry(feature.geometry);
    feature.additionalPointLocations?.forEach(expectPublicGeometry);
    feature.currentPlaceDetails?.forEach((detail) => {
      expect(Object.keys(detail).sort()).toEqual(['key', 'value']);
      expectString(detail.key);
      expectString(detail.value);
    });
    feature.currentPlaceClaims?.forEach((claim) => {
      expectString(claim.kind);
      if (claim.kind === 'website') expect(canonicalPublicUrl(claim.url)).toBe(claim.url);
      if (claim.kind === 'capacity') {
        expectFinite(claim.spaces);
        expect(Number.isSafeInteger(claim.spaces)).toBe(true);
      }
    });
    feature.narrative?.forEach((component) => {
      expect(Object.keys(component).sort()).toEqual(['kind', 'text']);
      expect(component.kind).toBe('recommendation');
      expectString(component.text);
    });
    feature.sourceRecords.forEach((source) => {
      expect(
        Object.keys(source).every((key) =>
          [
            'sourceName',
            'sourceOrganisation',
            'sourceUrl',
            'accessedAt',
            'licence',
            'reliability',
          ].includes(key),
        ),
      ).toBe(true);
      expectString(source.sourceName);
      expectString(source.sourceOrganisation);
      expectString(source.accessedAt);
      expectOptionalString(source.licence);
      if (source.sourceUrl) expect(canonicalPublicUrl(source.sourceUrl)).toBe(source.sourceUrl);
    });
  }

  pkg.sources.forEach((source) => {
    for (const value of [source.id, source.name, source.organisation]) expectString(value);
    expectOptionalString(source.licence);
    if (source.sourceUrl) expect(canonicalPublicUrl(source.sourceUrl)).toBe(source.sourceUrl);
  });
  pkg.historicMaps.forEach((map) => {
    for (const value of [
      map.id,
      map.title,
      map.displayDate,
      map.sourceInstitution,
      map.attribution,
    ])
      expectString(value);
    expectFinite(map.opacity);
    expectOptionalString(map.licence);
    if (map.sourceUrl) expect(canonicalPublicUrl(map.sourceUrl)).toBe(map.sourceUrl);
    if (map.tileUrl) expect(canonicalPublicTileUrl(map.tileUrl)).toBe(map.tileUrl);
  });
  pkg.settlementPolygons.forEach((polygon) => {
    expectString(polygon.id);
    expectPublicGeometry(polygon.geometry);
    if (polygon.earliestEvidenceYear !== undefined) expectFinite(polygon.earliestEvidenceYear);
    if (polygon.latestEvidenceYear !== undefined) expectFinite(polygon.latestEvidenceYear);
    polygon.sourceRecords.forEach((source) => {
      expectString(source.sourceName);
      expectString(source.sourceOrganisation);
      expectString(source.accessedAt);
    });
  });
  pkg.licensingMetadata?.components.forEach((component) => {
    for (const value of [
      component.id,
      component.name,
      component.source,
      component.licence,
      component.attribution,
      component.scope,
    ])
      expectString(value);
    if (component.licenceUrl)
      expect(canonicalPublicUrl(component.licenceUrl)).toBe(component.licenceUrl);
  });
}

describe('recursive public DTO runtime contract', () => {
  it('validates every delivered field in every checked-in public package', () => {
    const deliveries = publishedProjectPackages.map(publicProjectPackage);
    expect(deliveries.every(Boolean)).toBe(true);
    deliveries.forEach((delivery) => expectPublicPackage(delivery!));
  });

  it.each([null, true, false, 'unexpected', [], { sentinel: 'PRIVATE-SENTINEL' }])(
    'never passes a wrong-type optional feature year through: %#',
    (value) => {
      const pkg = structuredClone(publishedProjectPackages[0]);
      const target = pkg.features.find((feature) => feature.publication?.state === 'publishable')!;
      target.earliestPossibleYear = value as never;
      const delivery = publicProjectPackage(pkg);
      expect(() => JSON.stringify(delivery)).not.toThrow();
      expect(JSON.stringify(delivery)).not.toContain('PRIVATE-SENTINEL');
      expect(
        delivery?.features.find((feature) => feature.id === target.id)?.earliestPossibleYear,
      ).toBeUndefined();
    },
  );
});
