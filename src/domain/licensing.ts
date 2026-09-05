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
  if (!decision) return false;
  const evidence = licenceText?.trim();
  return evidence ? decision.evidenceText === evidence : decision.evidenceText === undefined;
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
  return licenceDecisionAllowsPublicUse(source.licenceDecision, source.licence);
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
