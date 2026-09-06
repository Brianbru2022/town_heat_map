import type {
  DataLicenceComponent,
  HeritageFeature,
  HistoricMapLayer,
  ProjectPackage,
  PublicationState,
  PublicationSummary,
  SettlementAgePolygon,
  SourceRecord,
  ValidationResult,
} from './models';
import type { Geometry, Point, Position } from 'geojson';
import {
  projectPublicClaims,
  publicCurrentPlaceDetails,
  publicNarrativeComponents,
} from './claims';
import { validateProjectPackageSchema } from './packageSchema';
import { geometryIsStructurallyValid, positionIsValid, validateFeatures } from './validation';
import { canonicalPublicTileUrl, canonicalPublicUrl } from './publicUrl';
import {
  componentLicenceAllowsPublicUse,
  licenceDecisionAllowsPublicUse,
  mapLicenceAllowsPublicUse,
  packageLicenceAllowsPublicUse,
  settlementLicenceAllowsPublicUse,
} from './licensing';
import type {
  PublicCurrentPlaceDetail,
  PublicFeature,
  PublicHistoricMapLayer,
  PublicLicenceComponent,
  PublicProjectPackage,
  PublicScoringMethodology,
  PublicSettlementPolygon,
  PublicSourceRecord,
} from './publicDto';

export type EffectivePublicationState = PublicationState | 'requires_review';

export interface FeaturePublicationAssessment {
  recordId: string;
  declaredState: PublicationState;
  effectiveState: EffectivePublicationState;
  canPublish: boolean;
  usedLegacyDefault: boolean;
  blockers: ValidationResult[];
  advisories: ValidationResult[];
}

export interface PackagePublicationAssessment {
  packageState: PublicationState;
  usedLegacyDefault: boolean;
  canPublishPackage: boolean;
  records: FeaturePublicationAssessment[];
  summary: PublicationSummary;
  schemaErrors?: string[];
}

const publicationStates = new Set<PublicationState>([
  'provisional',
  'verified',
  'publishable',
  'withheld',
]);

function isPublicationState(value: unknown): value is PublicationState {
  return typeof value === 'string' && publicationStates.has(value as PublicationState);
}

function schemaBlocker(recordId: string, errors: string[]): ValidationResult {
  return {
    recordId,
    severity: 'error',
    code: 'schema.invalid',
    publicationImpact: 'blocker',
    message: `Package schema validation failed: ${errors.join('; ')}`,
  };
}

function isBlocker(item: ValidationResult): boolean {
  return item.publicationImpact === 'blocker' || item.severity === 'error';
}

/**
 * Safe legacy migration: the existing reviewed flag establishes verification,
 * but an unreviewed record remains provisional. Neither state alone authorises
 * public delivery.
 */
export function declaredFeaturePublicationState(feature: HeritageFeature): PublicationState {
  const declared = feature.publication?.state as unknown;
  if (declared === undefined) return feature.reviewed ? 'verified' : 'provisional';
  return isPublicationState(declared) ? declared : 'withheld';
}

function effectiveState(
  packageState: PublicationState,
  featureState: PublicationState,
  hasBlockers: boolean,
): EffectivePublicationState {
  if (packageState === 'withheld' || featureState === 'withheld') return 'withheld';
  if (hasBlockers) return 'requires_review';
  if (packageState === 'provisional') return 'provisional';
  if (featureState === 'provisional') return 'provisional';
  if (packageState === 'verified') return 'verified';
  return 'publishable';
}

function assessValidatedFeaturePublication(
  pkg: ProjectPackage,
  feature: HeritageFeature,
  validation: ValidationResult[],
): FeaturePublicationAssessment {
  const declaredState = declaredFeaturePublicationState(feature);
  const issues = validation.filter((item) => item.recordId === feature.id);
  const blockers = issues.filter(isBlocker);
  const advisories = issues.filter((item) => !isBlocker(item));
  const resolvedState =
    feature.evidenceScope === 'out_of_scope'
      ? 'withheld'
      : effectiveState(pkg.publication?.state ?? 'provisional', declaredState, blockers.length > 0);
  return {
    recordId: feature.id,
    declaredState,
    effectiveState: resolvedState,
    canPublish: resolvedState === 'publishable',
    usedLegacyDefault: feature.publication === undefined,
    blockers,
    advisories,
  };
}

export function assessFeaturePublication(
  pkg: ProjectPackage,
  feature: HeritageFeature,
  validation?: ValidationResult[],
): FeaturePublicationAssessment {
  const schema = validateProjectPackageSchema(pkg);
  if (!schema.valid) {
    const recordId = typeof feature?.id === 'string' ? feature.id : 'unknown-record';
    return {
      recordId,
      declaredState: 'withheld',
      effectiveState: 'withheld',
      canPublish: false,
      usedLegacyDefault: feature?.publication === undefined,
      blockers: [schemaBlocker(recordId, schema.errors)],
      advisories: [],
    };
  }
  return assessValidatedFeaturePublication(
    pkg,
    feature,
    validation ?? validateFeatures(pkg.project, pkg.features),
  );
}

export function assessProjectPackage(pkg: ProjectPackage): PackagePublicationAssessment {
  const schema = validateProjectPackageSchema(pkg);
  if (!schema.valid) {
    const untrustedFeatures = Array.isArray((pkg as { features?: unknown }).features)
      ? (pkg as { features: unknown[] }).features
      : [];
    const records = untrustedFeatures.map((feature, index): FeaturePublicationAssessment => {
      const recordId =
        feature &&
        typeof feature === 'object' &&
        typeof (feature as { id?: unknown }).id === 'string'
          ? (feature as { id: string }).id
          : `unknown-record-${index + 1}`;
      return {
        recordId,
        declaredState: 'withheld',
        effectiveState: 'withheld',
        canPublish: false,
        usedLegacyDefault: false,
        blockers: [schemaBlocker(recordId, schema.errors)],
        advisories: [],
      };
    });
    return {
      packageState: 'withheld',
      usedLegacyDefault: false,
      canPublishPackage: false,
      records,
      summary: {
        totalRecords: records.length,
        publishable: 0,
        provisional: 0,
        verified: 0,
        requiresReview: 0,
        withheld: records.length,
        blockerCount: schema.errors.length,
        advisoryCount: 0,
      },
      schemaErrors: schema.errors,
    };
  }
  const validation = validateFeatures(pkg.project, pkg.features);
  const packageState = pkg.publication?.state ?? 'provisional';
  const licenceApproved = packageLicenceAllowsPublicUse(pkg);
  const records = pkg.features.map((feature) =>
    assessValidatedFeaturePublication(pkg, feature, validation),
  );
  const summary: PublicationSummary = {
    totalRecords: records.length,
    publishable: records.filter((record) => record.effectiveState === 'publishable').length,
    provisional: records.filter((record) => record.effectiveState === 'provisional').length,
    verified: records.filter((record) => record.effectiveState === 'verified').length,
    requiresReview: records.filter((record) => record.effectiveState === 'requires_review').length,
    withheld: records.filter((record) => record.effectiveState === 'withheld').length,
    blockerCount: records.reduce((count, record) => count + record.blockers.length, 0),
    advisoryCount: records.reduce((count, record) => count + record.advisories.length, 0),
  };
  return {
    packageState,
    usedLegacyDefault: pkg.publication === undefined,
    canPublishPackage: packageState === 'publishable' && licenceApproved,
    records,
    summary,
  };
}

function historicMapCanPublish(pkg: ProjectPackage, map: HistoricMapLayer): boolean {
  const configured =
    Boolean(canonicalPublicTileUrl(map.tileUrl)) &&
    ['xyz', 'wmts', 'wms', 'georeferenced_raster_tiles', 'cog'].includes(map.layerType);
  const legacyState: PublicationState =
    configured && map.licence && map.attribution ? 'verified' : 'provisional';
  const state = map.publication?.state ?? legacyState;
  return (
    pkg.publication?.state === 'publishable' &&
    (state === 'verified' || state === 'publishable') &&
    configured &&
    mapLicenceAllowsPublicUse(map) &&
    typeof map.attribution === 'string' &&
    Boolean(map.attribution.trim())
  );
}

function settlementPolygonCanPublish(pkg: ProjectPackage, polygon: SettlementAgePolygon): boolean {
  const state = polygon.publication?.state ?? (polygon.reviewed ? 'verified' : 'provisional');
  const sourcesAreUsable =
    Array.isArray(polygon.sourceRecords) &&
    polygon.sourceRecords.length > 0 &&
    polygon.sourceRecords.every(
      (source) =>
        typeof source.sourceName === 'string' &&
        source.sourceName.trim() &&
        typeof source.sourceOrganisation === 'string' &&
        source.sourceOrganisation.trim() &&
        typeof source.accessedAt === 'string' &&
        source.accessedAt.trim() &&
        licenceDecisionAllowsPublicUse(source.licenceDecision, source.licence),
    );
  return (
    pkg.publication?.state === 'publishable' &&
    (state === 'verified' || state === 'publishable') &&
    geometryIsStructurallyValid(polygon.geometry) &&
    sourcesAreUsable &&
    settlementLicenceAllowsPublicUse(polygon)
  );
}

function publicString(value: unknown, allowEmpty = false): string | undefined {
  return typeof value === 'string' && (allowEmpty || value.length > 0) ? value : undefined;
}

function publicFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function publicInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function publicEnum<T extends string>(value: unknown, values: ReadonlySet<T>): T | undefined {
  return typeof value === 'string' && values.has(value as T) ? (value as T) : undefined;
}

function publicStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : undefined;
}

function publicPosition(position: Position): Position {
  return [...position];
}

/** Reconstructs validated GeoJSON without retaining arbitrary object properties. */
export function publicGeometry(geometry: unknown): Geometry | undefined {
  if (!geometryIsStructurallyValid(geometry)) return undefined;
  switch (geometry.type) {
    case 'Point':
      return { type: 'Point', coordinates: publicPosition(geometry.coordinates) };
    case 'MultiPoint':
      return { type: 'MultiPoint', coordinates: geometry.coordinates.map(publicPosition) };
    case 'LineString':
      return { type: 'LineString', coordinates: geometry.coordinates.map(publicPosition) };
    case 'MultiLineString':
      return {
        type: 'MultiLineString',
        coordinates: geometry.coordinates.map((line) => line.map(publicPosition)),
      };
    case 'Polygon':
      return {
        type: 'Polygon',
        coordinates: geometry.coordinates.map((ring) => ring.map(publicPosition)),
      };
    case 'MultiPolygon':
      return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(publicPosition)),
        ),
      };
    case 'GeometryCollection':
      return {
        type: 'GeometryCollection',
        geometries: geometry.geometries.map((item) => publicGeometry(item)!),
      };
  }
}

function publicPoint(point: unknown): Point | undefined {
  const projected = publicGeometry(point);
  return projected?.type === 'Point' ? projected : undefined;
}

const publicPresentationTags = new Set([
  'map-hidden',
  'catalogue-general-view',
  'archaeology-evidence',
  'scheduled_monument',
  'inventory-presence-date',
  'current-context',
  'public-art',
  'plaque',
  'community-memorial',
  'osm-community-place',
  'osm-community-food',
  'osm-community-picnic',
  'osm-community-art',
  'osm-community-memorial',
  'osm-community-historic',
  'osm-community-leisure',
  'osm-community-visitor',
  'osm-community-amenities',
  'osm-community-parking',
  'osm-community-nature',
]);

const reliabilityValues = new Set([
  'official_statutory',
  'official_non_statutory',
  'academic',
  'local_authority',
  'archival',
  'secondary',
  'discovery_only',
] as const);
const significanceValues = new Set([
  'highest_national',
  'national',
  'regional',
  'local',
  'recognised',
] as const);
const dateBasisValues = new Set([
  'documented_construction',
  'documented_date_range',
  'present_by',
  'first_mapped',
  'estimated_from_authoritative_source',
  'estimated_from_map_comparison',
  'unknown',
] as const);
const confidenceValues = new Set(['high', 'medium', 'low', 'unknown'] as const);
const survivalValues = new Set([
  'substantially_intact',
  'altered_recognisable',
  'heavily_altered',
  'site_only_or_demolished',
  'unknown',
] as const);
const evidenceScopeValues = new Set([
  'parish_evidence',
  'related_context',
  'out_of_scope',
] as const);
const publicationProfileValues = new Set([
  'mapped_context',
  'verified_facility',
  'editorial',
] as const);

function publicSourceRecord(source: SourceRecord): PublicSourceRecord | undefined {
  const sourceName = publicString(source.sourceName);
  const sourceOrganisation = publicString(source.sourceOrganisation);
  const accessedAt = publicString(source.accessedAt);
  const reliability = publicEnum(source.reliability, reliabilityValues);
  if (!sourceName || !sourceOrganisation || !accessedAt || !reliability) return undefined;
  const sourceUrl = canonicalPublicUrl(source.sourceUrl);
  const licence = publicString(source.licence);
  return {
    sourceName,
    sourceOrganisation,
    ...(sourceUrl ? { sourceUrl } : {}),
    accessedAt,
    ...(licence ? { licence } : {}),
    reliability,
  };
}

function publicCurrentPlaceDetailsFor(feature: HeritageFeature): PublicCurrentPlaceDetail[] {
  const details = feature.sourceRecords.flatMap((source) =>
    publicCurrentPlaceDetails(feature, source),
  );
  const projected = details.flatMap((detail) => {
    const key = publicString(detail.key);
    const rawValue = publicString(detail.value);
    if (!key || !rawValue) return [];
    const value = key === 'website' ? canonicalPublicUrl(rawValue) : rawValue;
    return value ? [{ key, value }] : [];
  });
  return projected.filter(
    (detail, index) =>
      projected.findIndex(
        (candidate) => candidate.key === detail.key && candidate.value === detail.value,
      ) === index,
  );
}

function publicFeature(feature: HeritageFeature): PublicFeature | undefined {
  const claimSafe = projectPublicClaims(feature);
  const id = publicString(claimSafe.id);
  const name = publicString(claimSafe.name);
  const alternativeNames = publicStringArray(claimSafe.alternativeNames);
  const featureType = publicString(claimSafe.featureType);
  const locationType = publicString(claimSafe.locationType);
  const dateBasis = publicEnum(claimSafe.dateBasis, dateBasisValues);
  const dateConfidence = publicEnum(claimSafe.dateConfidence, confidenceValues);
  const locationConfidence = publicEnum(claimSafe.locationConfidence, confidenceValues);
  const sourceRecords = Array.isArray(claimSafe.sourceRecords)
    ? claimSafe.sourceRecords.map(publicSourceRecord)
    : [];
  if (
    !id ||
    !name ||
    !alternativeNames ||
    !featureType ||
    !locationType ||
    !dateBasis ||
    !dateConfidence ||
    !locationConfidence ||
    sourceRecords.length === 0 ||
    sourceRecords.some((source) => source === undefined)
  )
    return undefined;
  const currentPlaceDetails = publicCurrentPlaceDetailsFor(feature);
  const narrative = publicNarrativeComponents(feature);
  const geometry = claimSafe.geometry === null ? null : publicGeometry(claimSafe.geometry);
  if (claimSafe.geometry !== undefined && claimSafe.geometry !== null && !geometry)
    return undefined;
  const additionalPointLocations = Array.isArray(claimSafe.additionalPointLocations)
    ? claimSafe.additionalPointLocations.map(publicPoint)
    : undefined;
  const validAdditionalPoints =
    additionalPointLocations && additionalPointLocations.every(Boolean)
      ? (additionalPointLocations as Point[])
      : undefined;
  const earliestPossibleYear = publicInteger(claimSafe.earliestPossibleYear);
  const latestPossibleYear = publicInteger(claimSafe.latestPossibleYear);
  const designationType = publicString(claimSafe.designationType);
  const designationCategory = publicString(claimSafe.designationCategory);
  const significance = publicEnum(claimSafe.significance, significanceValues);
  const statutoryStatus = publicString(claimSafe.statutoryStatus);
  const datePrecision = publicString(claimSafe.datePrecision);
  const survival = publicEnum(claimSafe.survival, survivalValues);
  const shortDescription = publicString(claimSafe.shortDescription);
  const licence = publicString(claimSafe.licence);
  const tags = publicStringArray(claimSafe.tags) ?? [];
  const evidenceScope = publicEnum(claimSafe.evidenceScope, evidenceScopeValues);
  const profile = publicEnum(claimSafe.publication?.profile, publicationProfileValues);
  const osmCheckedAt = publicString(claimSafe.osmElement?.checkedAt);
  return {
    id,
    name,
    alternativeNames,
    featureType,
    ...(designationType ? { designationType } : {}),
    ...(designationCategory ? { designationCategory } : {}),
    ...(significance ? { significance } : {}),
    ...(statutoryStatus ? { statutoryStatus } : {}),
    ...(claimSafe.geometry !== undefined ? { geometry } : {}),
    ...(validAdditionalPoints ? { additionalPointLocations: validAdditionalPoints } : {}),
    locationType,
    ...(earliestPossibleYear !== undefined ? { earliestPossibleYear } : {}),
    ...(latestPossibleYear !== undefined ? { latestPossibleYear } : {}),
    ...(datePrecision ? { datePrecision } : {}),
    dateBasis,
    dateConfidence,
    locationConfidence,
    ...(survival ? { survival } : {}),
    ...(shortDescription ? { shortDescription } : {}),
    ...(narrative.length > 0 ? { narrative } : {}),
    ...(licence ? { licence } : {}),
    tags: tags.filter((tag) => publicPresentationTags.has(tag)),
    ...(evidenceScope ? { evidenceScope } : {}),
    ...(profile ? { publication: { profile } } : {}),
    ...(currentPlaceDetails.length > 0 ? { currentPlaceDetails } : {}),
    ...(osmCheckedAt ? { osmCheckedAt } : {}),
    sourceRecords: sourceRecords as PublicSourceRecord[],
  };
}

function publicScoringMethodology(value: unknown): PublicScoringMethodology | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const group = (name: string, keys: readonly string[]) => {
    const candidate = record[name];
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined;
    const source = candidate as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const key of keys) {
      const score = publicFiniteNumber(source[key]);
      if (score === undefined) return undefined;
      result[key] = score;
    }
    return result;
  };
  const age = group('age', [
    'before_1700',
    '1700_1799',
    '1800_1849',
    '1850_1899',
    '1900_1918',
    '1919_1945',
    '1946_1960',
    'after_1960',
    'unknown',
  ]);
  const significance = group('significance', [
    'highest_national',
    'national',
    'regional',
    'local',
    'recognised',
  ]);
  const confidence = group('confidence', ['high', 'medium', 'low', 'unknown']);
  const survival = group('survival', [
    'substantially_intact',
    'altered_recognisable',
    'heavily_altered',
    'site_only_or_demolished',
    'unknown',
  ]);
  if (!age || !significance || !confidence || !survival) return undefined;
  return { age, significance, confidence, survival } as PublicScoringMethodology;
}

function publicHistoricMap(map: HistoricMapLayer): PublicHistoricMapLayer | undefined {
  const id = publicString(map.id);
  const title = publicString(map.title);
  const displayDate = publicString(map.displayDate);
  const sourceInstitution = publicString(map.sourceInstitution);
  const attribution = publicString(map.attribution);
  const layerType = publicEnum(
    map.layerType,
    new Set([
      'xyz',
      'wmts',
      'wms',
      'georeferenced_raster_tiles',
      'cog',
      'four_corner_image',
    ] as const),
  );
  const opacity = publicFiniteNumber(map.opacity);
  const tileUrl = canonicalPublicTileUrl(map.tileUrl);
  if (
    !id ||
    !title ||
    !displayDate ||
    !sourceInstitution ||
    !attribution ||
    !layerType ||
    opacity === undefined
  )
    return undefined;
  const sourceUrl = canonicalPublicUrl(map.sourceUrl);
  const licence = publicString(map.licence);
  return {
    id,
    title,
    displayDate,
    sourceInstitution,
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(licence ? { licence } : {}),
    attribution,
    layerType,
    ...(tileUrl ? { tileUrl } : {}),
    opacity,
  };
}

function publicSettlementPolygon(
  polygon: SettlementAgePolygon,
): PublicSettlementPolygon | undefined {
  const id = publicString(polygon.id);
  const geometry = publicGeometry(polygon.geometry);
  const category = publicEnum(
    polygon.category,
    new Set([
      'developed_by_1700',
      'developed_by_1800',
      'developed_by_1850',
      'developed_by_1900',
      'developed_by_1930',
      'developed_by_1960',
      'post_1960',
      'uncertain',
    ] as const),
  );
  const confidence = publicEnum(polygon.confidence, new Set(['high', 'medium', 'low'] as const));
  const sourceRecords = Array.isArray(polygon.sourceRecords)
    ? polygon.sourceRecords.map(publicSourceRecord)
    : [];
  if (
    !id ||
    !geometry ||
    (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') ||
    !category ||
    !confidence ||
    sourceRecords.length === 0 ||
    sourceRecords.some((source) => source === undefined)
  )
    return undefined;
  const earliestEvidenceYear = publicInteger(polygon.earliestEvidenceYear);
  const latestEvidenceYear = publicInteger(polygon.latestEvidenceYear);
  return {
    id,
    geometry,
    ...(earliestEvidenceYear !== undefined ? { earliestEvidenceYear } : {}),
    ...(latestEvidenceYear !== undefined ? { latestEvidenceYear } : {}),
    category,
    confidence,
    sourceRecords: sourceRecords as PublicSourceRecord[],
  };
}

function publicLicenceComponent(
  component: DataLicenceComponent,
): PublicLicenceComponent | undefined {
  const id = publicString(component.id);
  const name = publicString(component.name);
  const source = publicString(component.source);
  const licence = publicString(component.licence);
  const attribution = publicString(component.attribution);
  const scope = publicString(component.scope);
  if (!id || !name || !source || !licence || !attribution || !scope) return undefined;
  const licenceUrl = canonicalPublicUrl(component.licenceUrl);
  return {
    id,
    name,
    source,
    licence,
    ...(licenceUrl ? { licenceUrl } : {}),
    attribution,
    scope,
  };
}

/** Explicit visitor DTO. The retained research package is never mutated or spread into it. */
function buildPublicProjectPackage(pkg: ProjectPackage): PublicProjectPackage | undefined {
  const methodology = publicScoringMethodology(pkg.project.methodology);
  const projectId = publicString(pkg.project.id);
  const projectName = publicString(pkg.project.name);
  const countryCode = publicString(pkg.project.countryCode);
  const country = publicString(pkg.project.country);
  const locality = publicString(pkg.project.locality);
  const centre = pkg.project.centre;
  const boundaryGeometry = publicGeometry(pkg.project.boundary?.geometry);
  if (
    !methodology ||
    !projectId ||
    !projectName ||
    !countryCode ||
    !country ||
    !locality ||
    !Array.isArray(centre) ||
    centre.length !== 2 ||
    !positionIsValid(centre) ||
    !boundaryGeometry ||
    (boundaryGeometry.type !== 'Polygon' && boundaryGeometry.type !== 'MultiPolygon')
  )
    return undefined;
  const assessment = assessProjectPackage(pkg);
  if (!assessment.canPublishPackage) return undefined;
  const publishableIds = new Set(
    assessment.records.filter((record) => record.canPublish).map((record) => record.recordId),
  );
  const features = pkg.features
    .filter((feature) => publishableIds.has(feature.id))
    .map(publicFeature)
    .filter((feature): feature is PublicFeature => Boolean(feature));
  const historicMaps = pkg.historicMaps
    .filter((map) => historicMapCanPublish(pkg, map))
    .map(publicHistoricMap)
    .filter((map): map is PublicHistoricMapLayer => Boolean(map));
  const settlementPolygons = pkg.settlementPolygons
    .filter((polygon) => settlementPolygonCanPublish(pkg, polygon))
    .map(publicSettlementPolygon)
    .filter((polygon): polygon is PublicSettlementPolygon => Boolean(polygon));
  const existingComponents = (pkg.licensingMetadata?.components ?? [])
    .filter((component) => componentLicenceAllowsPublicUse(component))
    .map(publicLicenceComponent)
    .filter((component): component is PublicLicenceComponent => Boolean(component));
  const osmComponent: DataLicenceComponent = {
    id: 'openstreetmap-current-place-data',
    name: 'OpenStreetMap-derived current-place data',
    source: 'OpenStreetMap',
    licence: 'Open Data Commons Open Database Licence (ODbL) 1.0',
    licenceDecision: {
      state: 'approved',
      scope: 'public_metadata',
      reviewedAt: '2026-09-05',
      evidenceText: 'Open Data Commons Open Database Licence (ODbL) 1.0',
    },
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: '© OpenStreetMap contributors',
    scope: 'OSM-derived present-day map objects and retained mapped-context fields.',
  };
  const containsOsmData = features.some((feature) =>
    feature.sourceRecords.some((source) => /openstreetmap/i.test(source.sourceName)),
  );
  const publishedFeatureIds = new Set(features.map((feature) => feature.id));
  const hesSources = pkg.features
    .filter((feature) => publishedFeatureIds.has(feature.id))
    .flatMap((feature) =>
      feature.sourceRecords.filter((source) => {
        const identity = `${source.sourceName} ${source.sourceOrganisation} ${source.sourceUrl ?? ''}`;
        return (
          /(?:historic environment scotland|\bhes\b|canmore|trove\.scot)/i.test(identity) &&
          /(?:open government licen[cs]e|\bogl\b)/i.test(source.licence ?? '') &&
          licenceDecisionAllowsPublicUse(source.licenceDecision, source.licence)
        );
      }),
    );
  const hesYears = hesSources
    .map((source) => new Date(source.accessedAt).getUTCFullYear())
    .filter((year) => Number.isInteger(year));
  const hesYear = hesYears.length > 0 ? Math.max(...hesYears) : undefined;
  const hesComponent: DataLicenceComponent | undefined = hesYear
    ? {
        id: 'historic-environment-scotland-spatial-data',
        name: 'Historic Environment Scotland spatial data',
        source: 'Historic Environment Scotland and Ordnance Survey',
        licence: 'Open Government Licence v3.0',
        licenceDecision: {
          state: 'approved',
          scope: 'public_metadata',
          reviewedAt: '2026-09-05',
          evidenceText: 'Open Government Licence v3.0',
        },
        licenceUrl: 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
        attribution: `Contains Historic Environment Scotland and OS data © Historic Environment Scotland and Crown Copyright and database right ${hesYear}, licensed under the Open Government Licence v3.0.`,
        scope:
          'HES/NRHE source records delivered in this town guide. This records component terms only; classification of the combined Townscape database remains subject to professional legal review.',
      }
    : undefined;
  const computedComponents = [
    ...(hesComponent ? [hesComponent] : []),
    ...(containsOsmData ? [osmComponent] : []),
  ]
    .map(publicLicenceComponent)
    .filter((component): component is PublicLicenceComponent => Boolean(component));
  const computedComponentIds = new Set(computedComponents.map((component) => component.id));
  const components: PublicLicenceComponent[] = [
    ...existingComponents.filter((component) => !computedComponentIds.has(component.id)),
    ...computedComponents,
  ];
  return {
    project: {
      id: projectId,
      name: projectName,
      countryCode,
      country,
      ...(publicString(pkg.project.region) ? { region: publicString(pkg.project.region) } : {}),
      locality,
      centre: [centre[0], centre[1]],
      boundary: {
        type: 'Feature',
        properties: {},
        geometry: boundaryGeometry,
      },
      ...(publicInteger(pkg.project.timelineStart) !== undefined
        ? { timelineStart: publicInteger(pkg.project.timelineStart) }
        : {}),
      ...(publicInteger(pkg.project.timelineEnd) !== undefined
        ? { timelineEnd: publicInteger(pkg.project.timelineEnd) }
        : {}),
      methodology,
    },
    features,
    sources: pkg.sources
      .filter((source) => licenceDecisionAllowsPublicUse(source.licenceDecision, source.licence))
      .flatMap((source) => {
        const id = publicString(source.id);
        const name = publicString(source.name);
        const organisation = publicString(source.organisation);
        const reliability = publicEnum(source.reliability, reliabilityValues);
        if (!id || !name || !organisation || !reliability) return [];
        const licence = publicString(source.licence);
        const sourceUrl = canonicalPublicUrl(source.sourceUrl);
        return [
          {
            id,
            name,
            organisation,
            ...(licence ? { licence } : {}),
            ...(sourceUrl ? { sourceUrl } : {}),
            reliability,
          },
        ];
      }),
    historicMaps,
    settlementPolygons,
    ...(components.length > 0
      ? {
          licensingMetadata: {
            components,
          },
        }
      : {}),
  };
}

/**
 * Total trust-boundary entry point. Broad internal schemas remain useful for
 * retained research data, but public delivery also requires the recursive,
 * field-specific reconstruction performed above.
 */
export function publicProjectPackage(value: unknown): PublicProjectPackage | undefined {
  try {
    const schema = validateProjectPackageSchema(value);
    if (!schema.valid) return undefined;
    return buildPublicProjectPackage(value as ProjectPackage);
  } catch {
    return undefined;
  }
}

export function publishedLocalMapPackageIds(packages: readonly ProjectPackage[]): Set<string> {
  const ids = new Set<string>();
  for (const pkg of packages) {
    const publicPackage = publicProjectPackage(pkg);
    if (!publicPackage) continue;
    for (const map of publicPackage.historicMaps) {
      const match = map.tileUrl?.match(/^\/api\/local-historic-maps\/([^/]+)\//);
      if (match) ids.add(decodeURIComponent(match[1]));
    }
  }
  return ids;
}

export function setFeaturePublicationState(
  feature: HeritageFeature,
  state: PublicationState,
  reviewedAt: string,
  notes?: string,
): void {
  feature.publication = {
    state,
    ...(feature.publication?.profile ? { profile: feature.publication.profile } : {}),
    reviewedAt,
    ...(notes ? { notes } : {}),
  };
}
