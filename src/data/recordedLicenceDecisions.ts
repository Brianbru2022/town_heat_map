import approvedEvidence from '../../data/licensing/public-licence-evidence.json';
import type {
  DataLicenceComponent,
  LicenceDecision,
  ProjectPackage,
  SourceRecord,
} from '../domain/models';
import { PUBLIC_METADATA_SCOPE } from '../domain/licensing';

const approved = new Set(approvedEvidence.approved);
const inherited = new Set(approvedEvidence.inheritedFromSourceRecords);
const packageIds = new Set(approvedEvidence.packages);

function decisionForEvidence(value?: string): LicenceDecision {
  const evidenceText = value?.trim();
  if (evidenceText && inherited.has(evidenceText))
    return {
      state: 'inherited',
      scope: PUBLIC_METADATA_SCOPE,
      reviewedAt: approvedEvidence.reviewedAt,
      evidenceText,
      inheritedFrom: 'source_records',
    };
  return {
    state: evidenceText && approved.has(evidenceText) ? 'approved' : 'unresolved',
    scope: PUBLIC_METADATA_SCOPE,
    reviewedAt: approvedEvidence.reviewedAt,
    ...(evidenceText ? { evidenceText } : {}),
  };
}

function sourceRecord(record: SourceRecord): SourceRecord {
  return { ...record, licenceDecision: decisionForEvidence(record.licence) };
}

function component(value: DataLicenceComponent): DataLicenceComponent {
  return { ...value, licenceDecision: decisionForEvidence(value.licence) };
}

/**
 * Applies the reviewed rc.4 evidence snapshot to checked-in static packages only.
 * Untrusted database and test packages never pass through this migration bridge.
 */
export function withRecordedLicenceDecisions(source: ProjectPackage): ProjectPackage {
  const pkg = structuredClone(source);
  pkg.licenceDecision = {
    state: packageIds.has(pkg.project.id) ? 'approved' : 'unresolved',
    scope: PUBLIC_METADATA_SCOPE,
    reviewedAt: approvedEvidence.reviewedAt,
  };
  pkg.features = pkg.features.map((feature) => ({
    ...feature,
    licenceDecision: decisionForEvidence(feature.licence),
    sourceRecords: feature.sourceRecords.map(sourceRecord),
  }));
  pkg.sources = pkg.sources.map((definition) => ({
    ...definition,
    licenceDecision: decisionForEvidence(definition.licence),
  }));
  pkg.historicMaps = pkg.historicMaps.map((map) => ({
    ...map,
    licenceDecision: decisionForEvidence(map.licence),
  }));
  pkg.settlementPolygons = pkg.settlementPolygons.map((polygon) => ({
    ...polygon,
    licenceDecision: {
      state: 'inherited',
      scope: PUBLIC_METADATA_SCOPE,
      reviewedAt: approvedEvidence.reviewedAt,
      inheritedFrom: 'source_records',
    },
    sourceRecords: polygon.sourceRecords.map(sourceRecord),
  }));
  if (pkg.licensingMetadata)
    pkg.licensingMetadata = {
      components: pkg.licensingMetadata.components.map(component),
    };
  return pkg;
}
