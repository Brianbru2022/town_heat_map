import type { Feature, Geometry, MultiPolygon, Point, Polygon } from 'geojson';
import type {
  Confidence,
  DateBasis,
  EvidenceScope,
  FeatureType,
  PublicationProfile,
  Reliability,
  Significance,
} from './models';

/**
 * Visitor-facing contract. These types are deliberately separate from the
 * retained research package so a new domain-model property cannot become
 * public merely by being serialised.
 */
export interface PublicSourceRecord {
  sourceName: string;
  sourceOrganisation: string;
  sourceUrl?: string;
  accessedAt: string;
  licence?: string;
  reliability: Reliability;
}

export interface PublicCurrentPlaceDetail {
  key: string;
  value: string;
}

export interface PublicNarrativeComponent {
  kind: 'recommendation';
  text: string;
}

export interface PublicFeature {
  /** Stable visitor-map key; it is not an internal workflow identifier. */
  id: string;
  name: string;
  alternativeNames: string[];
  featureType: FeatureType | string;
  designationType?: string;
  designationCategory?: string;
  significance?: Significance;
  statutoryStatus?: string;
  geometry?: Geometry | null;
  additionalPointLocations?: Point[];
  locationType: string;
  earliestPossibleYear?: number;
  latestPossibleYear?: number;
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
  /** Fixed, claim-specific visitor copy; unrestricted internal prose never crosses the boundary. */
  narrative?: PublicNarrativeComponent[];
  licence?: string;
  /** Visitor presentation categories only; curator and import tags are excluded. */
  tags: string[];
  /** Explains mapped related-context records without exposing the underlying decision register. */
  evidenceScope?: EvidenceScope;
  /** Limited public evidence status, not the internal evidence ledger. */
  publication?: { profile?: PublicationProfile };
  /** Claim-safe fields which the visitor client may render for a current place. */
  currentPlaceDetails?: PublicCurrentPlaceDetail[];
  /** Date of the current OSM context check, where applicable. */
  osmCheckedAt?: string;
  sourceRecords: PublicSourceRecord[];
}

export interface PublicHistoricMapLayer {
  id: string;
  title: string;
  displayDate: string;
  sourceInstitution: string;
  sourceUrl?: string;
  licence?: string;
  attribution: string;
  layerType: 'xyz' | 'wmts' | 'wms' | 'georeferenced_raster_tiles' | 'cog' | 'four_corner_image';
  tileUrl?: string;
  opacity: number;
}

export interface PublicSettlementPolygon {
  id: string;
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
  confidence: Exclude<Confidence, 'unknown'>;
  sourceRecords: PublicSourceRecord[];
}

export interface PublicDataSource {
  id: string;
  name: string;
  organisation: string;
  licence?: string;
  sourceUrl?: string;
  reliability: Reliability;
}

export interface PublicScoringMethodology {
  age: {
    before_1700: number;
    '1700_1799': number;
    '1800_1849': number;
    '1850_1899': number;
    '1900_1918': number;
    '1919_1945': number;
    '1946_1960': number;
    after_1960: number;
    unknown: number;
  };
  significance: {
    highest_national: number;
    national: number;
    regional: number;
    local: number;
    recognised: number;
  };
  confidence: { high: number; medium: number; low: number; unknown: number };
  survival: {
    substantially_intact: number;
    altered_recognisable: number;
    heavily_altered: number;
    site_only_or_demolished: number;
    unknown: number;
  };
}

export interface PublicLicenceComponent {
  id: string;
  name: string;
  source: string;
  licence: string;
  licenceUrl?: string;
  attribution: string;
  scope: string;
}

export interface PublicProjectPackage {
  project: {
    id: string;
    name: string;
    countryCode: string;
    country: string;
    region?: string;
    locality: string;
    centre: [number, number];
    boundary: Feature<Polygon | MultiPolygon>;
    timelineStart?: number;
    timelineEnd?: number;
    methodology: PublicScoringMethodology;
  };
  features: PublicFeature[];
  sources: PublicDataSource[];
  historicMaps: PublicHistoricMapLayer[];
  settlementPolygons: PublicSettlementPolygon[];
  licensingMetadata?: { components: PublicLicenceComponent[] };
}
