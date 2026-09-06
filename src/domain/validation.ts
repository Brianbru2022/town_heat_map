import { booleanPointInPolygon, point } from '@turf/turf';
import type { Geometry } from 'geojson';
import type { HeritageFeature, SourceRecord, TownProject, ValidationResult } from './models';
import {
  minimumTierForClaim,
  isOsmDerivedFeature,
  osmElementRequiresReview,
  osmMappedContextIsFresh,
  sourceReference,
  tierSatisfiesClaim,
} from './claims';
import {
  featureLicenceAllowsPublicUse,
  licenceDecisionMatchesEvidence,
  sourceRecordLicenceAllowsPublicUse,
} from './licensing';

function result(
  recordId: string,
  severity: ValidationResult['severity'],
  publicationImpact: NonNullable<ValidationResult['publicationImpact']>,
  code: string,
  message: string,
  field?: string,
): ValidationResult {
  return { recordId, severity, publicationImpact, code, field, message };
}

function sourceIsIdentifiable(source: SourceRecord): boolean {
  return Boolean(
    typeof source.sourceName === 'string' &&
    source.sourceName.trim() &&
    typeof source.sourceOrganisation === 'string' &&
    source.sourceOrganisation.trim() &&
    typeof source.accessedAt === 'string' &&
    source.accessedAt.trim() &&
    typeof source.reliability === 'string' &&
    source.reliability.trim(),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDenseArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1)
    if (!Object.hasOwn(value, index)) return false;
  return true;
}

export function positionIsValid(position: unknown): position is number[] {
  if (
    !isDenseArray(position) ||
    position.length < 2 ||
    !position.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  )
    return false;
  const [longitude, latitude] = position as number[];
  return longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

function lineIsValid(line: unknown, minimumPositions: number): line is number[][] {
  return isDenseArray(line) && line.length >= minimumPositions && line.every(positionIsValid);
}

function ringIsValid(ring: unknown): ring is number[][] {
  if (!lineIsValid(ring, 4)) return false;
  const first = ring[0];
  const last = ring.at(-1);
  return (
    Boolean(last) &&
    ring.every((position) => position.length === first.length) &&
    first.length === last?.length &&
    first.every((coordinate, index) => coordinate === last?.[index])
  );
}

export const MAX_GEOMETRY_NESTING_DEPTH = 32;

export function geometryIsStructurallyValid(geometry: unknown): geometry is Geometry {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: geometry, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (!isRecord(current.value) || typeof current.value.type !== 'string') return false;
    switch (current.value.type) {
      case 'Point':
        if (!positionIsValid(current.value.coordinates)) return false;
        break;
      case 'MultiPoint':
        if (
          !isDenseArray(current.value.coordinates) ||
          current.value.coordinates.length === 0 ||
          !current.value.coordinates.every(positionIsValid)
        )
          return false;
        break;
      case 'LineString':
        if (!lineIsValid(current.value.coordinates, 2)) return false;
        break;
      case 'MultiLineString':
        if (
          !isDenseArray(current.value.coordinates) ||
          current.value.coordinates.length === 0 ||
          !current.value.coordinates.every((line) => lineIsValid(line, 2))
        )
          return false;
        break;
      case 'Polygon':
        if (
          !isDenseArray(current.value.coordinates) ||
          current.value.coordinates.length === 0 ||
          !current.value.coordinates.every(ringIsValid)
        )
          return false;
        break;
      case 'MultiPolygon':
        if (
          !isDenseArray(current.value.coordinates) ||
          current.value.coordinates.length === 0 ||
          !current.value.coordinates.every(
            (polygon) => isDenseArray(polygon) && polygon.length > 0 && polygon.every(ringIsValid),
          )
        )
          return false;
        break;
      case 'GeometryCollection':
        if (
          current.depth >= MAX_GEOMETRY_NESTING_DEPTH ||
          !isDenseArray(current.value.geometries) ||
          current.value.geometries.length === 0
        )
          return false;
        for (const child of current.value.geometries)
          pending.push({ value: child, depth: current.depth + 1 });
        break;
      default:
        return false;
    }
  }
  return true;
}

function licenceResults(feature: HeritageFeature): ValidationResult[] {
  const decision = feature.licenceDecision;
  if (!decision)
    return [
      result(
        feature.id,
        'warning',
        'blocker',
        'licence.decision_missing',
        'No explicit licence decision is recorded for the relevant public use.',
        'licenceDecision',
      ),
    ];
  if (!licenceDecisionMatchesEvidence(decision, feature.licence))
    return [
      result(
        feature.id,
        'warning',
        'blocker',
        'licence.decision_stale',
        'The recorded licence decision does not match the retained licence evidence.',
        'licenceDecision.evidenceText',
      ),
    ];
  if (!featureLicenceAllowsPublicUse(feature))
    return [
      result(
        feature.id,
        'warning',
        'blocker',
        decision.state === 'inherited'
          ? 'licence.delegated_unresolved'
          : `licence.${decision.state}`,
        decision.state === 'inherited'
          ? 'The inherited feature licence depends on source-record decisions that are not all approved.'
          : 'The explicit licence decision does not approve this public use.',
        'licenceDecision',
      ),
    ];
  return [];
}

function sourceRecordLicenceResults(feature: HeritageFeature): ValidationResult[] {
  return feature.sourceRecords.flatMap((source, index) =>
    sourceRecordLicenceAllowsPublicUse(source)
      ? []
      : [
          result(
            feature.id,
            'warning',
            'blocker',
            source.licenceDecision
              ? 'licence.source_not_approved'
              : 'licence.source_decision_missing',
            'A source record lacks an applicable explicit decision approving this public use.',
            `sourceRecords[${index}].licenceDecision`,
          ),
        ],
  );
}

export function validateFeatures(
  project: TownProject,
  features: HeritageFeature[],
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const seen = new Map<string, Set<string>>();
  const seenIds = new Set<string>();
  for (const feature of features) {
    if (seenIds.has(feature.id))
      results.push(
        result(
          feature.id,
          'error',
          'blocker',
          'record.duplicate_id',
          'Feature ID must be unique within a project.',
          'id',
        ),
      );
    seenIds.add(feature.id);
    if (!feature.sourceRecords.length)
      results.push(
        result(
          feature.id,
          'error',
          'blocker',
          'provenance.missing',
          'A source record is required.',
          'sourceRecords',
        ),
      );
    else if (feature.sourceRecords.some((source) => !sourceIsIdentifiable(source)))
      results.push(
        result(
          feature.id,
          'error',
          'blocker',
          'provenance.incomplete',
          'Every source record needs a source name, organisation, access date and reliability.',
          'sourceRecords',
        ),
      );
    results.push(...licenceResults(feature));
    results.push(...sourceRecordLicenceResults(feature));
    if (osmElementRequiresReview(feature))
      results.push(
        result(
          feature.id,
          'warning',
          'blocker',
          'osm.element_not_current',
          'The OSM element is deleted or unavailable and requires review; this is not proof that the real-world object has been removed.',
          'osmElement.status',
        ),
      );
    else if (isOsmDerivedFeature(feature) && !osmMappedContextIsFresh(feature))
      results.push(
        result(
          feature.id,
          'warning',
          'blocker',
          'osm.check_stale_or_missing',
          'Mapped-context publication requires an OSM check within the last 366 days.',
          'osmElement.checkedAt',
        ),
      );
    if (feature.claimEvidence) {
      const knownSourceReferences = new Set(feature.sourceRecords.flatMap(sourceReference));
      for (const evidence of feature.claimEvidence) {
        const referencedSources = feature.sourceRecords.filter((source) =>
          sourceReference(source).some((reference) =>
            evidence.sourceRecordRefs.includes(reference),
          ),
        );
        if (!tierSatisfiesClaim(evidence.tier, evidence.claim))
          results.push(
            result(
              feature.id,
              'error',
              'blocker',
              'claim.insufficient_tier',
              `${evidence.claim} requires evidence appropriate to ${minimumTierForClaim(evidence.claim)}.`,
              'claimEvidence',
            ),
          );
        if (
          evidence.sourceRecordRefs.length === 0 ||
          evidence.sourceRecordRefs.some((reference) => !knownSourceReferences.has(reference))
        )
          results.push(
            result(
              feature.id,
              'error',
              'blocker',
              'claim.source_reference_invalid',
              'Every claim-evidence reference must identify a source record on the same feature.',
              'claimEvidence.sourceRecordRefs',
            ),
          );
        if (
          evidence.claim !== 'mapped_identity' &&
          referencedSources.length > 0 &&
          !referencedSources.some(
            (source) =>
              source.reliability !== 'discovery_only' &&
              !/openstreetmap/i.test(`${source.sourceName} ${source.sourceOrganisation}`),
          )
        )
          results.push(
            result(
              feature.id,
              'error',
              'blocker',
              'claim.independent_source_required',
              'Claims above mapped context require a referenced non-OSM, non-discovery source.',
              'claimEvidence.sourceRecordRefs',
            ),
          );
        if (!Number.isFinite(Date.parse(evidence.reviewedAt)))
          results.push(
            result(
              feature.id,
              'error',
              'blocker',
              'claim.reviewed_at_invalid',
              'Claim evidence must have a valid reviewed date.',
              'claimEvidence.reviewedAt',
            ),
          );
        if (evidence.expiresAt) {
          const expiry = Date.parse(evidence.expiresAt);
          if (!Number.isFinite(expiry))
            results.push(
              result(
                feature.id,
                'error',
                'blocker',
                'claim.expiry_invalid',
                'Claim-evidence expiry must be a valid date.',
                'claimEvidence.expiresAt',
              ),
            );
          else if (expiry < Date.now())
            results.push(
              result(
                feature.id,
                'warning',
                'advisory',
                'claim.expired',
                'Claim evidence has expired; the affected public field will be suppressed until reverified.',
                'claimEvidence.expiresAt',
              ),
            );
        }
      }
    }
    if (
      feature.earliestPossibleYear &&
      feature.latestPossibleYear &&
      feature.earliestPossibleYear > feature.latestPossibleYear
    )
      results.push(
        result(
          feature.id,
          'error',
          'blocker',
          'date.invalid_range',
          'Earliest year is after latest year.',
          'date',
        ),
      );
    const geometryIsValid = feature.geometry
      ? geometryIsStructurallyValid(feature.geometry)
      : false;
    if (!feature.geometry) {
      const pendingGeometry =
        /geometry|polygon|digitis|alignment|street|change_area|historic_site|location_to_verify/i.test(
          feature.locationType,
        );
      results.push(
        result(
          feature.id,
          pendingGeometry ? 'warning' : 'error',
          'blocker',
          pendingGeometry ? 'geometry.pending' : 'geometry.missing',
          pendingGeometry
            ? 'Geometry is intentionally pending import or digitisation.'
            : 'Geometry is missing.',
          'geometry',
        ),
      );
    } else if (!geometryIsValid)
      results.push(
        result(
          feature.id,
          'error',
          'blocker',
          'geometry.malformed',
          'Geometry is malformed, empty, out of range or has an unclosed polygon ring.',
          'geometry',
        ),
      );
    if (geometryIsValid) {
      const spatialIdentity = `${feature.name}|${JSON.stringify(feature.geometry)}`;
      const currentSourceIds = new Set(
        feature.sourceRecords.flatMap((source) =>
          source.sourceRecordId ? [source.sourceRecordId] : [],
        ),
      );
      const priorSourceIds = seen.get(spatialIdentity);
      const hasDistinctAuthoritativeRecords =
        priorSourceIds &&
        currentSourceIds.size > 0 &&
        ![...currentSourceIds].some((id) => priorSourceIds.has(id));
      if (priorSourceIds && !hasDistinctAuthoritativeRecords)
        results.push(
          result(
            feature.id,
            'warning',
            'advisory',
            'record.possible_duplicate',
            'Possible duplicate record.',
          ),
        );
      seen.set(spatialIdentity, new Set([...(priorSourceIds ?? []), ...currentSourceIds]));
    }
    if (
      feature.geometry?.type === 'Point' &&
      geometryIsValid &&
      feature.evidenceScope !== 'related_context' &&
      feature.evidenceScope !== 'out_of_scope' &&
      geometryIsStructurallyValid(project.boundary?.geometry) &&
      (project.boundary.geometry.type === 'Polygon' ||
        project.boundary.geometry.type === 'MultiPolygon') &&
      !booleanPointInPolygon(point(feature.geometry.coordinates), project.boundary)
    )
      results.push(
        result(
          feature.id,
          'warning',
          'blocker',
          'geometry.outside_boundary',
          'Point is outside the project boundary.',
          'geometry',
        ),
      );
  }
  return results;
}
