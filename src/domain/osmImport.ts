import type { HeritageFeature, SourceRecord } from './models';

function snapshotSourceEvidence(record: SourceRecord) {
  return {
    ...(record.licence ? { licence: record.licence.trim() } : {}),
    ...(record.sourceRecordId ? { sourceRecordId: record.sourceRecordId.trim() } : {}),
    ...(record.sourceUrl ? { sourceUrl: record.sourceUrl.trim() } : {}),
    sourceName: record.sourceName.trim(),
    sourceOrganisation: record.sourceOrganisation.trim(),
  };
}

function sourceIdentity(record: SourceRecord): string | undefined {
  const recordId = record.sourceRecordId?.trim();
  if (recordId) return `record:${recordId}`;
  const sourceUrl = record.sourceUrl?.trim();
  if (sourceUrl) return `url:${sourceUrl}`;
  const name = record.sourceName.trim();
  const organisation = record.sourceOrganisation.trim();
  return name && organisation ? `publisher:${name}\u0000${organisation}` : undefined;
}

/**
 * Replaces one refreshed imported source without treating the refresh as a new
 * licensing decision.  A stable source identity carries its explicit decision
 * forward.  In particular, retaining an approved decision with its original
 * evidence snapshot deliberately makes it non-authorising if the incoming
 * licence text changes; licensing.ts performs that freshness comparison.
 */
export function replaceImportedSourceRecord(
  feature: HeritageFeature,
  incoming: SourceRecord,
): boolean {
  const incomingIdentity = sourceIdentity(incoming);
  if (!incomingIdentity) {
    feature.sourceRecords = [...feature.sourceRecords, incoming];
    return false;
  }

  const existingIndex = feature.sourceRecords.findIndex(
    (record) => sourceIdentity(record) === incomingIdentity,
  );
  if (existingIndex === -1) {
    feature.sourceRecords = [...feature.sourceRecords, incoming];
    return false;
  }

  const existing = feature.sourceRecords[existingIndex];
  const inheritedDecision = existing.licenceDecision;
  const retainedDecision =
    incoming.licenceDecision ??
    (inheritedDecision?.state === 'approved' && !inheritedDecision.evidenceSnapshot
      ? { ...inheritedDecision, evidenceSnapshot: snapshotSourceEvidence(existing) }
      : inheritedDecision);
  const replacement: SourceRecord = {
    ...incoming,
    // An importer is not a licence reviewer. Preserve the recorded explicit
    // decision (including denied, restricted, unresolved and inheritance).
    ...(retainedDecision ? { licenceDecision: retainedDecision } : {}),
  };
  feature.sourceRecords = feature.sourceRecords.map((record, index) =>
    index === existingIndex ? replacement : record,
  );
  return true;
}
