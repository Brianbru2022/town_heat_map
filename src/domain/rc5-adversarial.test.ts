import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { publicListedBuildingsCsv, spreadsheetSafeText } from '../../server/csv';
import { useExplorerStore } from '../app/store';
import { FeatureDetails } from '../components/FeatureDetails';
import { alloaPackage } from '../data/alloa';
import type { ClaimEvidence, LicenceDecisionState, ProjectPackage } from './models';
import { publicGeometry, publicProjectPackage } from './publication';
import { geometryIsStructurallyValid, validateFeatures } from './validation';

function clonePackage(): ProjectPackage {
  return structuredClone(alloaPackage);
}

function claimEvidence(
  claim: ClaimEvidence['claim'],
  tier: ClaimEvidence['tier'],
  sourceRecordRefs: string[],
): ClaimEvidence {
  return {
    claim,
    tier,
    sourceRecordRefs,
    reviewedAt: '2026-09-05T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function currentPlacePackage(notes: string, claims: ClaimEvidence['claim'][]): ProjectPackage {
  const pkg = clonePackage();
  const feature = pkg.features.find((candidate) => candidate.id === 'hes-listed-building:LB20953')!;
  const source = feature.sourceRecords[0];
  const sourceRef = source.sourceRecordId ?? source.sourceUrl ?? source.sourceName;
  const tierByClaim: Record<ClaimEvidence['claim'], ClaimEvidence['tier']> = {
    mapped_identity: 'mapped_context',
    public_access: 'corroborated_facility',
    opening_hours: 'corroborated_facility',
    fees: 'corroborated_facility',
    accessibility: 'operational',
    operator: 'corroborated_facility',
    capacity: 'corroborated_facility',
    current_operation: 'operational',
    route_access: 'operational',
    temporary_closure: 'operational',
    ev_charging_operation: 'operational',
    editorial_recommendation: 'editorial',
    visitor_score: 'editorial',
    visitor_suitability: 'editorial',
  };
  feature.publication = { state: 'publishable', profile: 'editorial' };
  feature.claimEvidence = claims.map((claim) =>
    claimEvidence(claim, tierByClaim[claim], [sourceRef]),
  );
  source.notes = `Public claim details: ${notes}.`;
  pkg.features = [feature];
  pkg.historicMaps = [];
  pkg.settlementPolygons = [];
  return pkg;
}

describe('v0.1.0-rc.5 adversarial reproductions', () => {
  it('R1 prevents one approved field from carrying unrelated current-place claims', () => {
    const pkg = currentPlacePackage(
      [
        'description=Recommended, dogs welcome, wheelchair access, toilets, £5 admission, open daily, booking advised and suitable for families',
        'operator=Example Council, dogs welcome',
        'fee=no, toilets available',
        'access=yes, booking required',
        'wheelchair=yes, family friendly',
        'opening_hours=09:00-17:00, admission £5',
      ].join('; '),
      [
        'editorial_recommendation',
        'operator',
        'fees',
        'public_access',
        'accessibility',
        'opening_hours',
      ],
    );

    const delivered = publicProjectPackage(pkg)?.features[0];
    const publicText = JSON.stringify(delivered);

    expect(delivered?.narrative).toEqual([
      { kind: 'recommendation', text: 'Recommended as a visitor stop.' },
    ]);
    expect(publicText).not.toMatch(
      /dogs welcome|wheelchair access|toilets available|admission|open daily|booking|family/i,
    );
    expect(delivered?.currentPlaceDetails).toBeUndefined();
    useExplorerStore.setState({ selectedFeature: delivered });
    const visitorHtml = renderToStaticMarkup(createElement(FeatureDetails));
    expect(visitorHtml).not.toMatch(
      /dogs welcome|wheelchair access|toilets available|admission|open daily|booking|family/i,
    );
    const publicPackage = publicProjectPackage(pkg)!;
    const csv = publicListedBuildingsCsv(publicPackage, new Set([publicPackage.features[0].id]));
    expect(csv).not.toMatch(
      /dogs welcome|wheelchair access|toilets available|admission|open daily|booking|family/i,
    );
  });

  it.each(['website', 'contact:website', 'url', 'contact:url'])(
    'R2 routes the %s current-place alias through canonical URL validation',
    (key) => {
      const pkg = currentPlacePackage(`${key}=javascript:alert(1)`, ['current_operation']);
      const publicText = JSON.stringify(publicProjectPackage(pkg)?.features[0]);

      expect(publicText).not.toContain('javascript:');
      expect(publicText).not.toContain(key);
    },
  );

  it.each(['\u0000=1+1', '\u0000\t +SUM(A1:A2)', '\u0001\r\n-2+2', '\u001f @IMPORTXML(A1)'])(
    'R3 neutralises control-prefixed spreadsheet formula text: %s',
    (value) => {
      const safe = spreadsheetSafeText(value);

      expect(safe).toMatch(/^'/);
      expect(
        [...safe.replace(/^'/, '')].some((character) => {
          const code = character.charCodeAt(0);
          return (
            code <= 8 || (code >= 11 && code <= 12) || (code >= 14 && code <= 31) || code === 127
          );
        }),
      ).toBe(false);
      expect(safe.replace(/^[\t\r\n ]*'/, "'")).toMatch(/^'[\t\r\n ]*[=+\-@]/);
    },
  );

  it.each([
    ['approved', true],
    ['denied', false],
    ['restricted', false],
    ['unresolved', false],
  ] as const)(
    'respects an explicit %s HES component decision before computed attribution',
    (state, expectedPublic) => {
      const pkg = clonePackage();
      pkg.licensingMetadata = {
        components: [
          {
            id: 'historic-environment-scotland-spatial-data',
            name: `Explicit ${state} HES component`,
            source: 'Historic Environment Scotland',
            licence: state === 'approved' ? 'Open Government Licence v3.0' : 'Permission pending',
            licenceDecision: {
              state: state as LicenceDecisionState,
              scope: state === 'approved' ? 'public_metadata' : 'internal_only',
              reviewedAt: '2026-09-05',
              evidenceText:
                state === 'approved' ? 'Open Government Licence v3.0' : 'Permission pending',
            },
            attribution: 'Explicit decision attribution',
            scope: 'Explicit decision scope',
          },
        ],
      };

      const component = publicProjectPackage(pkg)?.licensingMetadata?.components.find(
        (candidate) => candidate.id === 'historic-environment-scotland-spatial-data',
      );

      if (expectedPublic) expect(component?.name).toBe('Explicit approved HES component');
      else expect(component).toBeUndefined();
    },
  );

  it('rejects sparse coordinates and boundedly rejects hostile geometry depth', () => {
    const coordinates = [-3.79, 56.11, 0];
    delete coordinates[2];
    const sparse = { type: 'Point', coordinates };
    expect(geometryIsStructurallyValid(sparse)).toBe(false);
    expect(publicGeometry(sparse)).toBeUndefined();

    let deep: unknown = { type: 'Point', coordinates: [-3.79, 56.11] };
    for (let index = 0; index < 20_000; index += 1)
      deep = { type: 'GeometryCollection', geometries: [deep] };
    expect(() => geometryIsStructurallyValid(deep)).not.toThrow();
    expect(geometryIsStructurallyValid(deep)).toBe(false);
    expect(() => publicGeometry(deep)).not.toThrow();
    expect(publicGeometry(deep)).toBeUndefined();

    const pkg = clonePackage();
    pkg.features[0].geometry = deep as never;
    pkg.features = [pkg.features[0]];
    expect(() => validateFeatures(pkg.project, pkg.features)).not.toThrow();
    expect(validateFeatures(pkg.project, pkg.features)).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'geometry.malformed' })]),
    );
    expect(() => publicProjectPackage(pkg)).not.toThrow();
    const delivered = publicProjectPackage(pkg);
    expect(delivered === undefined || delivered.features.length === 0).toBe(true);
  });
});
