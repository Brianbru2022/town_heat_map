import type {
  ClaimType,
  EvidenceTier,
  HeritageFeature,
  PublicationProfile,
  SourceRecord,
} from './models';

const tierRank: Record<EvidenceTier, number> = {
  mapped_context: 0,
  corroborated_facility: 1,
  operational: 2,
  editorial: 3,
};

const claimMinimumTier: Record<ClaimType, EvidenceTier> = {
  mapped_identity: 'mapped_context',
  public_access: 'corroborated_facility',
  opening_hours: 'corroborated_facility',
  fees: 'corroborated_facility',
  accessibility: 'operational',
  operator: 'corroborated_facility',
  capacity: 'corroborated_facility',
  current_operation: 'operational',
  route_access: 'operational',
  temporary_closure: 'operational',
  ev_charging_operation: 'operational',
  editorial_recommendation: 'editorial',
  visitor_score: 'editorial',
  visitor_suitability: 'editorial',
};

const profileMaximumTier: Record<PublicationProfile, EvidenceTier> = {
  mapped_context: 'mapped_context',
  verified_facility: 'operational',
  editorial: 'editorial',
};

const claimTypes = new Set<ClaimType>(Object.keys(claimMinimumTier) as ClaimType[]);
const evidenceTiers = new Set<EvidenceTier>(Object.keys(tierRank) as EvidenceTier[]);
const publicationProfiles = new Set<PublicationProfile>(
  Object.keys(profileMaximumTier) as PublicationProfile[],
);

function isClaimType(value: unknown): value is ClaimType {
  return typeof value === 'string' && claimTypes.has(value as ClaimType);
}

function isEvidenceTier(value: unknown): value is EvidenceTier {
  return typeof value === 'string' && evidenceTiers.has(value as EvidenceTier);
}

function isPublicationProfile(value: unknown): value is PublicationProfile {
  return typeof value === 'string' && publicationProfiles.has(value as PublicationProfile);
}

const mappedContextKeys = new Set([
  'amenity',
  'board_type',
  'historic',
  'highway',
  'information',
  'landuse',
  'leisure',
  'man_made',
  'memorial',
  'name',
  'natural',
  'parking',
  'playground',
  'railway',
  'route',
  'shop',
  'tourism',
  'waterway',
]);

const exactClaimByKey: Partial<Record<string, ClaimType>> = {
  access: 'public_access',
  capacity: 'capacity',
  charge: 'fees',
  description: 'editorial_recommendation',
  fee: 'fees',
  opening_hours: 'opening_hours',
  operator: 'operator',
  wheelchair: 'accessibility',
  website: 'current_operation',
};

export function isOsmDerivedFeature(feature: HeritageFeature): boolean {
  return (
    feature.id.startsWith('osm-community:') ||
    feature.tags.includes('osm-community-place') ||
    feature.tags.includes('current-context')
  );
}

export function hasOsmDataSource(feature: HeritageFeature): boolean {
  return feature.sourceRecords.some((source) => {
    const identity = `${source.sourceName} ${source.sourceOrganisation} ${source.sourceUrl ?? ''} ${source.licence ?? ''}`;
    return /openstreetmap|\bODbL\b/i.test(identity);
  });
}

export function osmRecordCheckedAt(feature: HeritageFeature): string | undefined {
  if (feature.osmElement?.checkedAt) return feature.osmElement.checkedAt;
  return feature.sourceRecords
    .filter((source) =>
      /openstreetmap/i.test(
        `${source.sourceName} ${source.sourceOrganisation} ${source.sourceUrl}`,
      ),
    )
    .map((source) => source.accessedAt)
    .filter((date) => Number.isFinite(Date.parse(date)))
    .sort()
    .at(-1);
}

export function osmMappedContextIsFresh(feature: HeritageFeature, now: Date = new Date()): boolean {
  const checkedAt = osmRecordCheckedAt(feature);
  if (!checkedAt) return false;
  const age = now.getTime() - Date.parse(checkedAt);
  return age >= 0 && age <= 366 * 24 * 60 * 60 * 1000;
}

export function publicationProfile(feature: HeritageFeature): PublicationProfile | undefined {
  const declared = feature.publication?.profile as unknown;
  if (declared !== undefined) return isPublicationProfile(declared) ? declared : 'mapped_context';
  return hasOsmDataSource(feature) ? 'mapped_context' : undefined;
}

export function minimumTierForClaim(claim: ClaimType): EvidenceTier {
  return claimMinimumTier[claim];
}

export function tierSatisfiesClaim(tier: EvidenceTier, claim: ClaimType): boolean {
  if (!isEvidenceTier(tier) || !isClaimType(claim)) return false;
  const required = claimMinimumTier[claim];
  if (required === 'mapped_context') return tier !== 'editorial';
  if (required === 'corroborated_facility')
    return tier === 'corroborated_facility' || tier === 'operational';
  return tier === required;
}

export function sourceReference(source: SourceRecord): string[] {
  return [source.sourceRecordId, source.sourceUrl, source.sourceName].filter(
    (value): value is string => typeof value === 'string' && Boolean(value.trim()),
  );
}

function referencedSources(feature: HeritageFeature, refs: string[]): SourceRecord[] {
  return feature.sourceRecords.filter((source) =>
    sourceReference(source).some((reference) => refs.includes(reference)),
  );
}

function evidenceReferencesKnownSource(feature: HeritageFeature, refs: string[]): boolean {
  const known = new Set(feature.sourceRecords.flatMap(sourceReference));
  return refs.length > 0 && refs.every((ref) => known.has(ref));
}

function evidenceIsUsable(
  feature: HeritageFeature,
  claim: ClaimType,
  now: Date,
  source?: SourceRecord,
): boolean {
  return Boolean(
    feature.claimEvidence?.some((evidence) => {
      if (
        !evidence ||
        typeof evidence !== 'object' ||
        !isClaimType(evidence.claim) ||
        !isEvidenceTier(evidence.tier) ||
        !Array.isArray(evidence.sourceRecordRefs) ||
        !evidence.sourceRecordRefs.every((reference) => typeof reference === 'string') ||
        typeof evidence.reviewedAt !== 'string'
      )
        return false;
      if (evidence.claim !== claim || !tierSatisfiesClaim(evidence.tier, claim)) return false;
      if (!evidenceReferencesKnownSource(feature, evidence.sourceRecordRefs)) return false;
      const sources = referencedSources(feature, evidence.sourceRecordRefs);
      if (
        claim !== 'mapped_identity' &&
        !sources.some(
          (candidate) =>
            candidate.reliability !== 'discovery_only' &&
            !/openstreetmap/i.test(`${candidate.sourceName} ${candidate.sourceOrganisation}`),
        )
      )
        return false;
      if (source && !sourceReference(source).some((ref) => evidence.sourceRecordRefs.includes(ref)))
        return false;
      const reviewedAt = Date.parse(evidence.reviewedAt);
      if (!Number.isFinite(reviewedAt)) return false;
      const expiresAt = evidence.expiresAt ? Date.parse(evidence.expiresAt) : undefined;
      return expiresAt === undefined || (Number.isFinite(expiresAt) && expiresAt >= now.getTime());
    }),
  );
}

export function claimIsSupported(
  feature: HeritageFeature,
  claim: ClaimType,
  now: Date = new Date(),
): boolean {
  if (!isClaimType(claim)) return false;
  const profile = publicationProfile(feature);
  if (!profile) return true;
  if (tierRank[profileMaximumTier[profile]] < tierRank[claimMinimumTier[claim]]) return false;

  // A current OSM record is intrinsically sufficient only for its narrow Tier M claim.
  if (claim === 'mapped_identity' && hasOsmDataSource(feature))
    return !osmElementRequiresReview(feature) && osmMappedContextIsFresh(feature, now);

  return evidenceIsUsable(feature, claim, now);
}

export function claimForCurrentPlaceKey(key: string): ClaimType | undefined {
  if (mappedContextKeys.has(key)) return 'mapped_identity';
  if (key.startsWith('playground:')) return 'mapped_identity';
  if (key.startsWith('opening_hours:')) return 'opening_hours';
  if (key.startsWith('operator:')) return 'operator';
  if (key.startsWith('capacity:'))
    return key === 'capacity:disabled' ? 'accessibility' : 'capacity';
  if (key.startsWith('payment:')) return 'fees';
  if (key.startsWith('contact:')) return 'current_operation';
  if (
    key.startsWith('socket:') ||
    key.startsWith('charging_station:') ||
    key.startsWith('authentication:') ||
    ['network', 'operational_status'].includes(key)
  )
    return 'ev_charging_operation';
  if (key.startsWith('toilets:'))
    return key === 'toilets:wheelchair' ? 'accessibility' : 'public_access';
  if (['bicycle', 'foot', 'hiking', 'horse', 'motor_vehicle'].includes(key)) return 'route_access';
  if (['cuisine', 'phone'].includes(key)) return 'current_operation';
  return exactClaimByKey[key];
}

export interface CurrentPlaceDetail {
  key: string;
  value: string;
}

export function parseCurrentPlaceDetails(notes?: string): CurrentPlaceDetail[] {
  if (
    !notes ||
    !/^(?:Current OSM|Current-place curation|Live API check result|Public claim details)/.test(
      notes,
    )
  )
    return [];
  const colon = notes.indexOf(':');
  if (colon === -1) return [];
  return notes
    .slice(colon + 1)
    .replace(/\s+This establishes only[\s\S]*$/i, '')
    .replace(/\.$/, '')
    .split(';')
    .map((entry) => {
      const separator = entry.indexOf('=');
      if (separator === -1) return undefined;
      return {
        key: entry.slice(0, separator).trim(),
        value: entry.slice(separator + 1).trim(),
      };
    })
    .filter((entry): entry is CurrentPlaceDetail => Boolean(entry?.key && entry.value));
}

export function publicCurrentPlaceDetails(
  feature: HeritageFeature,
  source?: SourceRecord,
  now: Date = new Date(),
): CurrentPlaceDetail[] {
  if (!publicationProfile(feature)) return [];
  return parseCurrentPlaceDetails(source?.notes).filter((detail) => {
    const claim = claimForCurrentPlaceKey(detail.key);
    if (claim === undefined || !claimIsSupported(feature, claim, now)) return false;
    return claim === 'mapped_identity' || evidenceIsUsable(feature, claim, now, source);
  });
}

function publicSourceRecord(
  feature: HeritageFeature,
  source: SourceRecord,
  now: Date,
): SourceRecord {
  const projected = { ...source };
  delete projected.notes;
  const details = publicCurrentPlaceDetails(feature, source, now);
  if (details.length === 0) return projected;
  return {
    ...projected,
    notes: `Public claim details: ${details.map(({ key, value }) => `${key}=${value}`).join('; ')}.`,
  };
}

export function osmElementRequiresReview(feature: HeritageFeature): boolean {
  if (feature.osmElement)
    return feature.osmElement.status !== 'current' || feature.osmElement.visible === false;
  const latestLiveCheck = feature.sourceRecords
    .filter((source) => source.notes?.startsWith('Live API check result'))
    .sort((left, right) => Date.parse(right.accessedAt) - Date.parse(left.accessedAt))[0];
  return /Live API check result \((?:deleted|gone|404|410)\)|\bHTTP\s*(?:404|410)\b/i.test(
    latestLiveCheck?.notes ?? '',
  );
}

/** Claim-safe public projection. The input record is never mutated. */
export function projectPublicClaims(
  feature: HeritageFeature,
  now: Date = new Date(),
): HeritageFeature {
  const sourceRecords = feature.sourceRecords.map((source) =>
    publicSourceRecord(feature, source, now),
  );
  const editorial = claimIsSupported(feature, 'editorial_recommendation', now);
  const profile = publicationProfile(feature);
  const narrativeIsClaimConstrained = profile !== undefined;
  const legacyNarrativeClaims = feature.shortDescription
    ? [
        ...(/\b(?:recommend(?:ed|ation)?|must[- ]see|excellent|ideal|best|unmissable|worthwhile|high[- ]quality)\b/i.test(
          feature.shortDescription,
        )
          ? (['editorial_recommendation'] as const)
          : []),
        ...(/\b(?:currently|open (?:daily|today|to the public)|opening hours?|booking|admission|entry fee|visitor facilit|in operation|operates? as)\b/i.test(
          feature.shortDescription,
        )
          ? (['current_operation'] as const)
          : []),
        ...(/\b(?:public access|wheelchair accessible|accessible entrance|free entry)\b/i.test(
          feature.shortDescription,
        )
          ? (['public_access'] as const)
          : []),
      ]
    : [];
  const legacyNarrativeIsSupported = legacyNarrativeClaims.every((claim) =>
    evidenceIsUsable(feature, claim, now),
  );
  const publication = feature.publication
    ? {
        state: feature.publication.state,
        ...(profile ? { profile } : {}),
        ...(feature.publication.reviewedAt ? { reviewedAt: feature.publication.reviewedAt } : {}),
      }
    : undefined;
  const common: HeritageFeature = {
    ...feature,
    reviewNotes: undefined,
    sourceRecords,
    publication,
    claimEvidence: feature.claimEvidence?.map((evidence) => {
      const projected = { ...evidence };
      delete projected.notes;
      return projected;
    }),
    shortDescription: narrativeIsClaimConstrained
      ? editorial
        ? feature.shortDescription
        : 'Mapped present-day context; availability and visitor facilities are not implied.'
      : legacyNarrativeIsSupported
        ? feature.shortDescription
        : undefined,
    fullDescription:
      narrativeIsClaimConstrained && !editorial ? undefined : feature.fullDescription,
  };
  if (!isOsmDerivedFeature(feature)) return common;
  return {
    ...common,
    designationType: undefined,
    designationCategory: undefined,
    significance: undefined,
    statutoryStatus: undefined,
    documentedDateText: undefined,
    earliestPossibleYear: undefined,
    latestPossibleYear: undefined,
    datePrecision: undefined,
    survival: undefined,
    tags: feature.tags.filter(
      (tag) => tag === 'current-context' || tag.startsWith('osm-community-'),
    ),
    publication: publication ?? {
      state: feature.reviewed ? 'verified' : 'provisional',
      profile: 'mapped_context',
    },
  };
}
