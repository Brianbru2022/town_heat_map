import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import { withRecordedLicenceDecisions } from '../data/recordedLicenceDecisions';
import { FeatureDetails } from '../components/FeatureDetails';
import { useExplorerStore } from '../app/store';
import type { ClaimEvidence, ProjectPackage } from './models';
import { publicProjectPackage } from './publication';
import { geometryIsStructurallyValid } from './validation';

function clonePackage(): ProjectPackage {
  return structuredClone(alloaPackage);
}

describe('v0.1.0-rc.4 adversarial reproductions', () => {
  it('B1 rejects schema-accepted objects at primitive public DTO boundaries', () => {
    const sentinel = { privateWorkflowNote: 'RC4-B1-SENTINEL' };
    const invalidMethodology = clonePackage();
    invalidMethodology.project.methodology.age.before_1700 = sentinel as unknown as number;
    expect(() => publicProjectPackage(invalidMethodology)).not.toThrow();
    expect(publicProjectPackage(invalidMethodology)).toBeUndefined();

    const optionalValues = clonePackage();
    optionalValues.features[0].earliestPossibleYear = sentinel as unknown as number;
    optionalValues.sources[0].name = sentinel as unknown as string;

    const delivered = publicProjectPackage(optionalValues);
    const serialised = JSON.stringify(delivered);

    expect(typeof serialised).toBe('string');
    expect(serialised).not.toContain('RC4-B1-SENTINEL');
    expect(() =>
      renderToStaticMarkup(
        createElement('span', null, delivered?.features[0]?.earliestPossibleYear as ReactNode),
      ),
    ).not.toThrow();
  });

  it.each([
    { type: 'Point', coordinates: null },
    { type: 'MultiPoint', coordinates: [null] },
    { type: 'LineString', coordinates: [[0]] },
    { type: 'MultiLineString', coordinates: [null] },
    { type: 'Polygon', coordinates: [[[0, 0], [1, 0], null, [0, 0]]] },
    { type: 'MultiPolygon', coordinates: [[null]] },
    { type: 'GeometryCollection', geometries: [null] },
  ])('B2 treats malformed $type geometry as invalid without throwing', (geometry) => {
    expect(() => geometryIsStructurallyValid(geometry)).not.toThrow();
    expect(geometryIsStructurallyValid(geometry)).toBe(false);
  });

  it('B2 withholds a record with malformed primary geometry without crashing projection', () => {
    const pkg = clonePackage();
    const target = pkg.features.find((feature) => feature.id === 'hes-listed-building:LB20953')!;
    target.geometry = { type: 'Point', coordinates: null } as never;

    expect(() => publicProjectPackage(pkg)).not.toThrow();
    expect(publicProjectPackage(pkg)?.features.some((feature) => feature.id === target.id)).toBe(
      false,
    );
  });

  it('B3 does not let recommendation approval authorise embedded operational claims', () => {
    const pkg = clonePackage();
    const target = pkg.features.find((feature) => feature.id === 'hes-listed-building:LB20953')!;
    const sourceRef =
      target.sourceRecords[0].sourceRecordId ??
      target.sourceRecords[0].sourceUrl ??
      target.sourceRecords[0].sourceName;
    const evidence: ClaimEvidence = {
      claim: 'editorial_recommendation',
      tier: 'editorial',
      sourceRecordRefs: [sourceRef],
      reviewedAt: '2026-09-05T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
    };
    target.publication = { state: 'publishable', profile: 'editorial' };
    target.claimEvidence = [evidence];
    target.shortDescription =
      'Recommended stop; dogs welcome, wheelchair access, toilets, free admission and open daily.';

    const delivered = publicProjectPackage(pkg)?.features.find(
      (feature) => feature.id === target.id,
    );
    const serialised = JSON.stringify(delivered);

    expect(serialised).toContain('Recommended');
    expect(serialised).not.toMatch(/dogs welcome|wheelchair|toilets|free admission|open daily/i);
    useExplorerStore.setState({ selectedFeature: delivered });
    expect(() => renderToStaticMarkup(createElement(FeatureDetails))).not.toThrow();
    expect(renderToStaticMarkup(createElement(FeatureDetails))).not.toMatch(
      /dogs welcome|wheelchair|toilets|free admission|open daily/i,
    );
  });

  it('B4 preserves an explicit denied licence decision over the migration bridge', () => {
    const pkg = clonePackage();
    pkg.features[0].licenceDecision = {
      state: 'denied',
      scope: 'internal_only',
      reviewedAt: '2026-09-05T00:00:00.000Z',
      evidenceText: pkg.features[0].licence,
    };

    const migrated = withRecordedLicenceDecisions(pkg);

    expect(migrated.features[0].licenceDecision?.state).toBe('denied');
    expect(migrated.features[0].licenceDecision?.scope).toBe('internal_only');
  });
});
