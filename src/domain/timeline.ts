import type { HeritageFeature } from './models';

type TimelineFeature = Pick<
  HeritageFeature,
  | 'documentedDateText'
  | 'earliestPossibleYear'
  | 'latestPossibleYear'
  | 'dateBasis'
  | 'tags'
  | 'evidenceScope'
>;

export type TimelineState = 'hidden' | 'possible' | 'definite';

/** A curator has supplied a historical date or date range for this feature. */
export function hasEstablishedDate<T extends TimelineFeature>(feature: T): boolean {
  return (
    feature.earliestPossibleYear !== undefined ||
    feature.latestPossibleYear !== undefined ||
    Boolean(feature.documentedDateText)
  );
}

/** Inventory-only presence records are provenance, not historic timeline evidence. */
export function hasHistoricTimelineDate<T extends TimelineFeature>(feature: T): boolean {
  return (
    feature.dateBasis !== 'unknown' &&
    (feature.earliestPossibleYear !== undefined || Boolean(feature.documentedDateText)) &&
    !feature.tags.includes('inventory-presence-date') &&
    feature.evidenceScope !== 'related_context' &&
    feature.evidenceScope !== 'out_of_scope'
  );
}

export function featureTimelineState<T extends TimelineFeature>(
  feature: T,
  year: number,
): TimelineState {
  const earliest = feature.earliestPossibleYear;
  const latest = feature.latestPossibleYear ?? earliest;
  if (earliest === undefined && latest === undefined) return 'possible';
  if (earliest !== undefined && year < earliest) return 'hidden';
  if (latest !== undefined && year < latest) return 'possible';
  return 'definite';
}

export function dateWording<T extends TimelineFeature>(feature: T): string {
  const earliest = feature.earliestPossibleYear;
  const latest = feature.latestPossibleYear;
  if (feature.documentedDateText) return feature.documentedDateText;
  if (earliest === undefined) return 'Date not established';
  const range =
    latest !== undefined && latest !== earliest ? `${earliest}–${latest}` : `${earliest}`;
  const labels: Record<TimelineFeature['dateBasis'], string> = {
    documented_construction: 'Documented construction',
    documented_date_range: 'Documented date range',
    present_by: 'Present by',
    first_mapped: 'First shown on maps reviewed',
    estimated_from_authoritative_source: 'Estimated by an authoritative source',
    estimated_from_map_comparison: 'Estimated from map comparison',
    unknown: 'Date not established',
  };
  return feature.dateBasis === 'unknown'
    ? labels.unknown
    : `${labels[feature.dateBasis]}: ${range}`;
}
