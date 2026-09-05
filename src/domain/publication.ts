import type {
  DataLicenceComponent,
  HeritageFeature,
  HistoricMapLayer,
  PublicationDeclaration,
  ProjectPackage,
  PublicationState,
  PublicationSummary,
  SettlementAgePolygon,
  ValidationResult,
} from './models';
import { hasOsmDataSource, projectPublicClaims } from './claims';
import { validateProjectPackageSchema } from './packageSchema';
import { geometryIsStructurallyValid, validateFeatures } from './validation';

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
    canPublishPackage: packageState === 'publishable',
    records,
    summary,
  };
}

function publicPublicationDeclaration(
  declaration?: PublicationDeclaration,
): PublicationDeclaration | undefined {
  if (!declaration) return undefined;
  return {
    state: declaration.state,
    ...(declaration.profile ? { profile: declaration.profile } : {}),
    ...(declaration.reviewedAt ? { reviewedAt: declaration.reviewedAt } : {}),
  };
}

function historicMapCanPublish(pkg: ProjectPackage, map: HistoricMapLayer): boolean {
  const configured =
    Boolean(map.tileUrl) &&
    ['xyz', 'wmts', 'wms', 'georeferenced_raster_tiles', 'cog'].includes(map.layerType);
  const legacyState: PublicationState =
    configured && map.licence && map.attribution ? 'verified' : 'provisional';
  const state = map.publication?.state ?? legacyState;
  return (
    pkg.publication?.state === 'publishable' &&
    (state === 'verified' || state === 'publishable') &&
    configured &&
    Boolean(map.licence?.trim() && map.attribution.trim())
  );
}

function settlementPolygonCanPublish(pkg: ProjectPackage, polygon: SettlementAgePolygon): boolean {
  const state = polygon.publication?.state ?? (polygon.reviewed ? 'verified' : 'provisional');
  const sourcesAreUsable =
    polygon.sourceRecords.length > 0 &&
    polygon.sourceRecords.every(
      (source) =>
        source.sourceName?.trim() &&
        source.sourceOrganisation?.trim() &&
        source.accessedAt?.trim() &&
        source.licence?.trim(),
    );
  return (
    pkg.publication?.state === 'publishable' &&
    (state === 'verified' || state === 'publishable') &&
    geometryIsStructurallyValid(polygon.geometry) &&
    sourcesAreUsable
  );
}

/** Public/API/export projection. The source package is never mutated. */
export function publicProjectPackage(pkg: ProjectPackage): ProjectPackage | undefined {
  const assessment = assessProjectPackage(pkg);
  if (!assessment.canPublishPackage) return undefined;
  const publishableIds = new Set(
    assessment.records.filter((record) => record.canPublish).map((record) => record.recordId),
  );
  const features = pkg.features
    .filter((feature) => publishableIds.has(feature.id))
    .map((feature) => projectPublicClaims(feature));
  const historicMaps = pkg.historicMaps
    .filter((map) => historicMapCanPublish(pkg, map))
    .map((map) => ({
      ...map,
      notes: undefined,
      publication: publicPublicationDeclaration(map.publication),
    }));
  const settlementPolygons = pkg.settlementPolygons
    .filter((polygon) => settlementPolygonCanPublish(pkg, polygon))
    .map((polygon) => ({
      ...polygon,
      sourceRecords: polygon.sourceRecords.map((source) => {
        const projected = { ...source };
        delete projected.notes;
        return projected;
      }),
      publication: publicPublicationDeclaration(polygon.publication),
    }));
  const existingComponents = pkg.licensingMetadata?.components ?? [];
  const osmComponent: DataLicenceComponent = {
    id: 'openstreetmap-current-place-data',
    name: 'OpenStreetMap-derived current-place data',
    source: 'OpenStreetMap',
    licence: 'Open Data Commons Open Database Licence (ODbL) 1.0',
    licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attribution: '© OpenStreetMap contributors',
    scope: 'OSM-derived present-day map objects and retained mapped-context fields.',
    legalReviewNote:
      'Component status is recorded here; the legal character of the combined Townscape delivery remains a matter for legal review.',
  };
  const containsOsmData = features.some(hasOsmDataSource);
  const components = containsOsmData
    ? [...existingComponents.filter((component) => component.id !== osmComponent.id), osmComponent]
    : existingComponents;
  return {
    ...pkg,
    project: {
      ...pkg.project,
      researchNotes: undefined,
      townStudyArea: undefined,
    },
    features,
    sources: pkg.sources.map((source) => {
      const projected = { ...source };
      delete projected.limitations;
      return projected;
    }),
    historicMaps,
    settlementPolygons,
    validation: validateFeatures(pkg.project, pkg.features).filter((item) =>
      publishableIds.has(item.recordId),
    ),
    curationMetadata: undefined,
    publication: publicPublicationDeclaration(pkg.publication),
    publicationSummary: assessment.summary,
    ...(components.length > 0 ? { licensingMetadata: { components } } : {}),
  };
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
