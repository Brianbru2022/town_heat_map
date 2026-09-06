import type { Feature, Geometry, MultiPolygon, Point, Polygon } from 'geojson';

export type Reliability =
  | 'official_statutory'
  | 'official_non_statutory'
  | 'academic'
  | 'local_authority'
  | 'archival'
  | 'secondary'
  | 'discovery_only';
export type Confidence = 'high' | 'medium' | 'low' | 'unknown';
export type DateBasis =
  | 'documented_construction'
  | 'documented_date_range'
  | 'present_by'
  | 'first_mapped'
  | 'estimated_from_authoritative_source'
  | 'estimated_from_map_comparison'
  | 'unknown';
export type EvidenceScope = 'parish_evidence' | 'related_context' | 'out_of_scope';
/**
 * The spatial relationship to the named Townscape locality. This is separate
 * from evidenceScope: the latter controls presentation/scoring treatment,
 * while this records the reproducible geographic decision behind it.
 */
export type GeographicRelationship =
  | 'within_town_locality'
  | 'immediately_associated'
  | 'related_context'
  | 'ambiguous'
  | 'out_of_scope';
export type PublicationState = 'provisional' | 'verified' | 'publishable' | 'withheld';
export type LicenceDecisionState =
  'approved' | 'unresolved' | 'denied' | 'restricted' | 'inherited';
export type LicenceUseScope = 'public_metadata' | 'public_redistribution' | 'internal_only';
export interface LicenceEvidenceSnapshot {
  licence?: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  sourceName?: string;
  sourceOrganisation?: string;
}
export interface LicenceDecision {
  state: LicenceDecisionState;
  scope: LicenceUseScope;
  reviewedAt: string;
  /** Exact evidence snapshot reviewed when this decision was recorded. */
  evidenceText?: string;
  /** Source-level evidence identity captured for an import decision. */
  evidenceSnapshot?: LicenceEvidenceSnapshot;
  inheritedFrom?: 'source_records';
}
export type EvidenceTier = 'mapped_context' | 'corroborated_facility' | 'operational' | 'editorial';
export type PublicationProfile = 'mapped_context' | 'verified_facility' | 'editorial';
export type ClaimType =
  | 'mapped_identity'
  | 'public_access'
  | 'opening_hours'
  | 'fees'
  | 'accessibility'
  | 'operator'
  | 'capacity'
  | 'current_operation'
  | 'route_access'
  | 'temporary_closure'
  | 'ev_charging_operation'
  | 'editorial_recommendation'
  | 'visitor_score'
  | 'visitor_suitability';

/**
 * An editorial declaration, not a substitute for the automated provenance,
 * licence and geometry gates. A publishable declaration can still resolve to
 * requires_review when a material blocker is present.
 */
export interface PublicationDeclaration {
  state: PublicationState;
  /** Controls the strength of claims that may be projected publicly. */
  profile?: PublicationProfile;
  reviewedAt?: string;
  notes?: string;
}

/** Evidence for one public claim. Source references resolve against this record's sourceRecords. */
export interface ClaimEvidence {
  claim: ClaimType;
  tier: EvidenceTier;
  sourceRecordRefs: string[];
  reviewedAt: string;
  expiresAt?: string;
  notes?: string;
}

export interface OsmElementMetadata {
  elementType: 'node' | 'way' | 'relation';
  elementId: string;
  version?: number;
  lastEditedAt?: string;
  changesetId?: number;
  visible?: boolean;
  status: 'current' | 'deleted' | 'unavailable';
  checkedAt: string;
}

export interface GeographicScopeDeclaration {
  classification: GeographicRelationship;
  boundaryName: string;
  boundarySource: string;
  verifiedAt: string;
  rationale: string;
}
export type Significance = 'highest_national' | 'national' | 'regional' | 'local' | 'recognised';
export type FeatureType =
  | 'castle'
  | 'tower'
  | 'palace'
  | 'country_house'
  | 'manor_house'
  | 'church'
  | 'chapel'
  | 'cathedral'
  | 'monastery'
  | 'abbey'
  | 'burial_ground'
  | 'civic_building'
  | 'school'
  | 'hospital'
  | 'house'
  | 'tenement'
  | 'commercial_building'
  | 'market'
  | 'harbour'
  | 'dock'
  | 'canal'
  | 'railway'
  | 'bridge'
  | 'road'
  | 'street'
  | 'square'
  | 'park'
  | 'garden'
  | 'designed_landscape'
  | 'brewery'
  | 'distillery'
  | 'mill'
  | 'mine'
  | 'quarry'
  | 'foundry'
  | 'factory'
  | 'warehouse'
  | 'military_site'
  | 'archaeological_site'
  | 'public_art'
  | 'plaque'
  | 'monument'
  | 'memorial'
  | 'demolished_site'
  | 'other';

export interface SourceRecord {
  sourceName: string;
  sourceOrganisation: string;
  sourceRecordId?: string;
  sourceUrl?: string;
  accessedAt: string;
  licence?: string;
  licenceDecision?: LicenceDecision;
  quotedDateText?: string;
  notes?: string;
  reliability: Reliability;
}

export interface HeritageFeature {
  id: string;
  projectId: string;
  name: string;
  alternativeNames: string[];
  countryCode: string;
  region?: string;
  locality?: string;
  address?: string;
  featureType: FeatureType | string;
  designationType?: string;
  designationCategory?: string;
  significance?: Significance;
  statutoryStatus?: string;
  geometry?: Geometry | null;
  /** Additional official point locations for one designation; these share the same record and are not duplicates. */
  additionalPointLocations?: Point[];
  locationType:
    | 'exact'
    | 'building_centroid'
    | 'site_centroid'
    | 'representative_point'
    | 'approximate'
    | 'unknown'
    | string;
  documentedDateText?: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
  /** How precisely the cited date can be interpreted (for example, exact year or century range). */
  datePrecision?: string;
  dateBasis: DateBasis;
  dateConfidence: Confidence;
  locationConfidence: Confidence;
  survival?:
    | 'substantially_intact'
    | 'altered_recognisable'
    | 'heavily_altered'
    | 'site_only_or_demolished'
    | 'unknown';
  shortDescription?: string;
  fullDescription?: string;
  sourceRecords: SourceRecord[];
  licence?: string;
  licenceDecision?: LicenceDecision;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  reviewed: boolean;
  reviewNotes?: string;
  evidenceScope?: EvidenceScope;
  geographicScope?: GeographicScopeDeclaration;
  publication?: PublicationDeclaration;
  claimEvidence?: ClaimEvidence[];
  osmElement?: OsmElementMetadata;
}

export interface HistoricMapLayer {
  id: string;
  projectId: string;
  title: string;
  displayDate: string;
  surveyStartYear?: number;
  surveyEndYear?: number;
  revisionYear?: number;
  publicationYear?: number;
  sourceInstitution: string;
  sourceUrl?: string;
  licence?: string;
  licenceDecision?: LicenceDecision;
  attribution: string;
  notes?: string;
  layerType: 'xyz' | 'wmts' | 'wms' | 'georeferenced_raster_tiles' | 'cog' | 'four_corner_image';
  tileUrl?: string;
  wmsParameters?: Record<string, string>;
  localPath?: string;
  bounds?: [number, number, number, number];
  opacity: number;
  minZoom?: number;
  maxZoom?: number;
  georeferencingMethod?: string;
  georeferencingAccuracy?: Confidence;
  controlPointCount?: number;
  residualError?: number;
  publication?: PublicationDeclaration;
}

export interface SettlementAgePolygon {
  id: string;
  projectId: string;
  geometry: Polygon | MultiPolygon;
  earliestEvidenceYear?: number;
  latestEvidenceYear?: number;
  category:
    | 'developed_by_1700'
    | 'developed_by_1800'
    | 'developed_by_1850'
    | 'developed_by_1900'
    | 'developed_by_1930'
    | 'developed_by_1960'
    | 'post_1960'
    | 'uncertain';
  evidenceMapIds: string[];
  evidenceDescription: string;
  confidence: Exclude<Confidence, 'unknown'>;
  digitisationMethod: string;
  sourceRecords: SourceRecord[];
  licenceDecision?: LicenceDecision;
  reviewed: boolean;
  publication?: PublicationDeclaration;
}

export interface DataSourceDefinition {
  id: string;
  name: string;
  organisation: string;
  coverage: string;
  accessMethod: string;
  licence?: string;
  licenceDecision?: LicenceDecision;
  sourceUrl?: string;
  reliability: Reliability;
  limitations?: string;
}

export interface TownProject {
  id: string;
  name: string;
  countryCode: string;
  country: string;
  region?: string;
  locality: string;
  centre: [number, number];
  boundary: Feature<Polygon | MultiPolygon>;
  boundarySource: string;
  boundaryConfidence: Confidence;
  sourceLanguage: string;
  preferredBasemap: string;
  createdAt: string;
  timelineStart?: number;
  timelineEnd?: number;
  methodology: ScoringMethodology;
  researchNotes?: string;
  /**
   * A modern statistical locality used only to make a transparent town-level
   * statutory-register extract. It never replaces the project's study boundary.
   */
  townStudyArea?: TownStudyArea;
}

export interface TownStudyArea {
  localityName: string;
  localityCode?: string;
  sourceName: string;
  sourceUrl: string;
  sourceVersion: string;
  bufferMetres: number;
  localityBoundary: Feature<Polygon | MultiPolygon>;
  bufferedBoundary: Feature<Polygon | MultiPolygon>;
  notes: string;
}

export interface ScoringMethodology {
  age: Record<string, number>;
  significance: Record<Significance, number>;
  confidence: Record<Confidence, number>;
  survival: Record<NonNullable<HeritageFeature['survival']>, number>;
}

export interface ValidationResult {
  recordId: string;
  severity: 'error' | 'warning';
  code?: string;
  publicationImpact?: 'blocker' | 'advisory';
  field?: string;
  message: string;
}

export interface PublicationSummary {
  totalRecords: number;
  publishable: number;
  provisional: number;
  verified: number;
  requiresReview: number;
  withheld: number;
  blockerCount: number;
  advisoryCount: number;
}

export interface ImportedPackMetadata {
  datasetId: string;
  title: string;
  importedAt: string;
  historicMapCatalogue?: Array<Record<string, unknown>>;
  settlementEvidence?: Array<Record<string, unknown>>;
  methodology?: Record<string, unknown>;
  licensingAndAttribution?: Record<string, unknown>;
}

export interface DataLicenceComponent {
  id: string;
  name: string;
  source: string;
  licence: string;
  licenceDecision?: LicenceDecision;
  licenceUrl?: string;
  attribution: string;
  scope: string;
  legalReviewNote?: string;
}

export interface LicensingMetadata {
  components: DataLicenceComponent[];
}
export interface ProjectPackage {
  $schema?: string;
  project: TownProject;
  features: HeritageFeature[];
  sources: DataSourceDefinition[];
  historicMaps: HistoricMapLayer[];
  settlementPolygons: SettlementAgePolygon[];
  validation: ValidationResult[];
  curationMetadata?: { importedPacks: ImportedPackMetadata[] };
  publication?: PublicationDeclaration;
  licenceDecision?: LicenceDecision;
  /** Computed for delivery/audit responses; not a source-data declaration. */
  publicationSummary?: PublicationSummary;
  /** Computed component-level licensing information for a public delivery. */
  licensingMetadata?: LicensingMetadata;
}
