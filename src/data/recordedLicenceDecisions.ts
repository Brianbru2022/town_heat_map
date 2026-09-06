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

function decisionForSourceRecord(record: SourceRecord): LicenceDecision {
  return {
    ...decisionForEvidence(record.licence),
    evidenceSnapshot: {
      ...(record.licence ? { licence: record.licence.trim() } : {}),
      ...(record.sourceRecordId ? { sourceRecordId: record.sourceRecordId.trim() } : {}),
      ...(record.sourceUrl ? { sourceUrl: record.sourceUrl.trim() } : {}),
      sourceName: record.sourceName.trim(),
      sourceOrganisation: record.sourceOrganisation.trim(),
    },
  };
}

function sourceRecord(record: SourceRecord, inRecordedScope: boolean): SourceRecord {
  return {
    ...record,
    ...(record.licenceDecision || !inRecordedScope
      ? {}
      : { licenceDecision: decisionForSourceRecord(record) }),
  };
}

function component(value: DataLicenceComponent, inRecordedScope: boolean): DataLicenceComponent {
  return {
    ...value,
    ...(value.licenceDecision || !inRecordedScope
      ? {}
      : { licenceDecision: decisionForEvidence(value.licence) }),
  };
}

/**
 * Applies the reviewed rc.4 evidence snapshot to checked-in static packages only.
 * Untrusted database and test packages never pass through this migration bridge.
 */
export function withRecordedLicenceDecisions(source: ProjectPackage): ProjectPackage {
  const pkg = structuredClone(source);
  const inRecordedScope = packageIds.has(pkg.project.id);
  if (inRecordedScope && !pkg.licenceDecision)
    pkg.licenceDecision = {
      state: 'approved',
      scope: PUBLIC_METADATA_SCOPE,
      reviewedAt: approvedEvidence.reviewedAt,
    };
  pkg.features = pkg.features.map((feature) => ({
    ...feature,
    ...(feature.licenceDecision || !inRecordedScope
      ? {}
      : { licenceDecision: decisionForEvidence(feature.licence) }),
    sourceRecords: feature.sourceRecords.map((record) => sourceRecord(record, inRecordedScope)),
  }));
  pkg.sources = pkg.sources.map((definition) => ({
    ...definition,
    ...(definition.licenceDecision || !inRecordedScope
      ? {}
      : { licenceDecision: decisionForEvidence(definition.licence) }),
  }));
  pkg.historicMaps = pkg.historicMaps.map((map) => ({
    ...map,
    ...(map.licenceDecision || !inRecordedScope
      ? {}
      : { licenceDecision: decisionForEvidence(map.licence) }),
  }));
  pkg.settlementPolygons = pkg.settlementPolygons.map((polygon) => ({
    ...polygon,
    ...(polygon.licenceDecision || !inRecordedScope
      ? {}
      : {
          licenceDecision: {
            state: 'inherited',
            scope: PUBLIC_METADATA_SCOPE,
            reviewedAt: approvedEvidence.reviewedAt,
            inheritedFrom: 'source_records',
          },
        }),
    sourceRecords: polygon.sourceRecords.map((record) => sourceRecord(record, inRecordedScope)),
  }));
  if (pkg.licensingMetadata)
    pkg.licensingMetadata = {
      components: pkg.licensingMetadata.components.map((value) =>
        component(value, inRecordedScope),
      ),
    };
  return pkg;
}
