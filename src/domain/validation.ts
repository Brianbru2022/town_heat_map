import { booleanPointInPolygon, point } from '@turf/turf';
import type { Geometry, Position } from 'geojson';
import type { HeritageFeature, SourceRecord, TownProject, ValidationResult } from './models';
import {
  minimumTierForClaim,
  isOsmDerivedFeature,
  osmElementRequiresReview,
  osmMappedContextIsFresh,
  sourceReference,
  tierSatisfiesClaim,
} from './claims';

const unresolvedLicencePattern =
  /\b(?:not stated|unknown|unresolved|pending|to be confirmed|must be reviewed)\b/i;
const unresolvedHistoricLayerLicencePatterns = [
  /\b(?:not stated|unknown|unresolved|pending|placeholder|tbc|to be confirmed)\b/i,
  /\b(?:await(?:ing)?|requires?|needs?|must)\b.{0,80}\b(?:review(?:ed)?|confirmation|permission|clearance|approval)\b/i,
  /\bconditional(?:ly)?\b.{0,80}\b(?:confirm(?:ation)?|permission|clearance|approval|review)\b/i,
  /\b(?:confirm|review|clear|obtain)\b.{0,100}\bbefore\b.{0,60}\b(?:publish|publication|public display|display|reuse|redistribut|export)\w*/i,
  /\b(?:rights?|licen[cs]e|permission)\b.{0,80}\b(?:not final|not confirmed|not cleared|not granted)\b/i,
];
const delegatedLicencePattern = /\b(?:see|refer to)\b.*\b(?:source|dataset|metadata|licen[cs]e)/i;
const restrictedUsePattern = /\b(?:citation only|link only|do not redistribute|no reuse)\b/i;

export function historicLayerLicenceTextIsResolved(value: string | undefined): boolean {
  const licence = value?.trim();
  return Boolean(
    licence && !unresolvedHistoricLayerLicencePatterns.some((pattern) => pattern.test(licence)),
  );
}

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
    source.sourceName?.trim() &&
    source.sourceOrganisation?.trim() &&
    source.accessedAt?.trim() &&
    source.reliability?.trim(),
  );
}

function positionIsValid(position: Position): boolean {
  return (
    position.length >= 2 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

function lineIsValid(line: Position[], minimumPositions: number): boolean {
  return line.length >= minimumPositions && line.every(positionIsValid);
}

function ringIsValid(ring: Position[]): boolean {
  return (
    lineIsValid(ring, 4) &&
    ring[0].length === ring.at(-1)?.length &&
    ring[0].every((coordinate, index) => coordinate === ring.at(-1)?.[index])
  );
}

export function geometryIsStructurallyValid(geometry: Geometry): boolean {
  switch (geometry.type) {
    case 'Point':
      return positionIsValid(geometry.coordinates);
    case 'MultiPoint':
      return geometry.coordinates.length > 0 && geometry.coordinates.every(positionIsValid);
    case 'LineString':
      return lineIsValid(geometry.coordinates, 2);
    case 'MultiLineString':
      return (
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every((line) => lineIsValid(line, 2))
      );
    case 'Polygon':
      return geometry.coordinates.length > 0 && geometry.coordinates.every(ringIsValid);
    case 'MultiPolygon':
      return (
        geometry.coordinates.length > 0 &&
        geometry.coordinates.every((polygon) => polygon.length > 0 && polygon.every(ringIsValid))
      );
    case 'GeometryCollection':
      return (
        geometry.geometries.length > 0 && geometry.geometries.every(geometryIsStructurallyValid)
      );
  }
}

function licenceResults(feature: HeritageFeature): ValidationResult[] {
  const licence = feature.licence?.trim();
  if (!licence)
    return [
      result(
        feature.id,
        'warning',
        'blocker',
        'licence.missing',
        'Licence is not recorded; redistribution must be prevented.',
        'licence',
      ),
    ];
  if (unresolvedLicencePattern.test(licence))
    return [
      result(
        feature.id,
        'warning',
        'blocker',
        'licence.unresolved',
        'Licence terms explicitly require review before redistribution.',
        'licence',
      ),
    ];
  if (delegatedLicencePattern.test(licence)) {
    const sourceLicences = feature.sourceRecords.map((source) => source.licence?.trim());
    if (
      sourceLicences.length === 0 ||
      sourceLicences.some(
        (sourceLicence) => !sourceLicence || unresolvedLicencePattern.test(sourceLicence),
      )
    )
      return [
        result(
          feature.id,
          'warning',
          'blocker',
          'licence.delegated_unresolved',
          'Feature licence delegates to source metadata that is missing or unresolved.',
          'licence',
        ),
      ];
  }
  if (restrictedUsePattern.test(licence))
    return [
      result(
        feature.id,
        'warning',
        'advisory',
        'licence.citation_only',
        'Source use is citation-only; source media and text must not be redistributed.',
        'licence',
      ),
    ];
  return [];
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
    } else if (!geometryIsStructurallyValid(feature.geometry))
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
    if (
      feature.geometry?.type === 'Point' &&
      feature.evidenceScope !== 'related_context' &&
      feature.evidenceScope !== 'out_of_scope' &&
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
