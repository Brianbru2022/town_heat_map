import type {
  DataLicenceComponent,
  HeritageFeature,
  HistoricMapLayer,
  LicenceDecision,
  ProjectPackage,
  SettlementAgePolygon,
  SourceRecord,
} from './models';

export const PUBLIC_METADATA_SCOPE = 'public_metadata';

export function licenceDecisionMatchesEvidence(
  decision: LicenceDecision | undefined,
  licenceText: string | undefined,
): boolean {
  if (
    !decision ||
    typeof decision !== 'object' ||
    typeof decision.state !== 'string' ||
    typeof decision.scope !== 'string' ||
    typeof decision.reviewedAt !== 'string'
  )
    return false;
  const evidence = typeof licenceText === 'string' ? licenceText.trim() : undefined;
  if (decision.evidenceText !== undefined && typeof decision.evidenceText !== 'string')
    return false;
  return evidence ? decision.evidenceText === evidence : decision.evidenceText === undefined;
}

function sourceEvidenceSnapshot(
  source: SourceRecord,
): NonNullable<LicenceDecision['evidenceSnapshot']> {
  return {
    ...(source.licence ? { licence: source.licence.trim() } : {}),
    ...(source.sourceRecordId ? { sourceRecordId: source.sourceRecordId.trim() } : {}),
    ...(source.sourceUrl ? { sourceUrl: source.sourceUrl.trim() } : {}),
    sourceName: source.sourceName.trim(),
    sourceOrganisation: source.sourceOrganisation.trim(),
  };
}

export function sourceRecordLicenceDecisionMatchesEvidence(source: SourceRecord): boolean {
  const decision = source.licenceDecision;
  if (!licenceDecisionMatchesEvidence(decision, source.licence)) return false;
  if (!decision?.evidenceSnapshot) return true;
  const expected = decision.evidenceSnapshot;
  if (Object.keys(expected).length === 0) return false;
  const actual = sourceEvidenceSnapshot(source);
  return Object.entries(expected).every(
    ([key, value]) => actual[key as keyof typeof actual] === value,
  );
}

export function licenceDecisionAllowsPublicUse(
  decision: LicenceDecision | undefined,
  licenceText?: string,
  inheritedDecisions: readonly boolean[] = [],
): boolean {
  if (!decision || !licenceDecisionMatchesEvidence(decision, licenceText)) return false;
  if (decision.scope !== 'public_metadata' && decision.scope !== 'public_redistribution')
    return false;
  if (decision.state === 'approved') return true;
  return (
    decision.state === 'inherited' &&
    decision.inheritedFrom === 'source_records' &&
    inheritedDecisions.length > 0 &&
    inheritedDecisions.every(Boolean)
  );
}

export function sourceRecordLicenceAllowsPublicUse(source: SourceRecord): boolean {
  return (
    sourceRecordLicenceDecisionMatchesEvidence(source) &&
    licenceDecisionAllowsPublicUse(source.licenceDecision, source.licence)
  );
}

export function featureLicenceAllowsPublicUse(feature: HeritageFeature): boolean {
  return licenceDecisionAllowsPublicUse(
    feature.licenceDecision,
    feature.licence,
    feature.sourceRecords.map(sourceRecordLicenceAllowsPublicUse),
  );
}

export function mapLicenceAllowsPublicUse(map: HistoricMapLayer): boolean {
  return licenceDecisionAllowsPublicUse(map.licenceDecision, map.licence);
}

export function settlementLicenceAllowsPublicUse(polygon: SettlementAgePolygon): boolean {
  return licenceDecisionAllowsPublicUse(
    polygon.licenceDecision,
    undefined,
    polygon.sourceRecords.map(sourceRecordLicenceAllowsPublicUse),
  );
}

export function componentLicenceAllowsPublicUse(component: DataLicenceComponent): boolean {
  return licenceDecisionAllowsPublicUse(component.licenceDecision, component.licence);
}

export function packageLicenceAllowsPublicUse(pkg: ProjectPackage): boolean {
  return licenceDecisionAllowsPublicUse(pkg.licenceDecision);
}
