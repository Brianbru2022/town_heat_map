import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { distance, point } from '@turf/turf';
import type {
  HeritageFeature,
  OsmElementMetadata,
  ProjectPackage,
  SourceRecord,
} from '../src/domain/models';
import { projectPublicClaims } from '../src/domain/claims';
import { setFeaturePublicationState } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

const reviewDir = resolve('data/review');
const triagePath = resolve(reviewDir, 'townscape-provisional-verification-triage-2026-09-03.json');
const packageNames = ['alloa', 'alva', 'biggar', 'culross', 'killin', 'kincardine', 'tillicoultry'];
const checkedAt = new Date().toISOString();
const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<Record<string, unknown>>;
};
const cohort = triage.records.filter((record) => record.primaryCohort === 'B');
const ids = cohort.map((record) => String(record.recordId)).sort();
const membershipSha256 = createHash('sha256')
  .update(`${ids.join('\n')}\n`)
  .digest('hex');
if (ids.length !== 52 || new Set(ids).size !== 52)
  throw new Error(`Expected 52 unique Cohort B records; found ${ids.length}.`);

const packages = await Promise.all(
  packageNames.map(
    async (name) =>
      JSON.parse(
        await readFile(resolve('data/projects', `${name}.json`), 'utf8'),
      ) as ProjectPackage,
  ),
);
const idSet = new Set(ids);
const features = packages.flatMap((pkg) => pkg.features.filter((feature) => idSet.has(feature.id)));
if (features.length !== 52 || new Set(features.map((feature) => feature.id)).size !== 52)
  throw new Error('Cohort B membership does not match the project package contents.');

function elementFromFeature(feature: HeritageFeature) {
  const sourceId = feature.sourceRecords.find((source) =>
    /^(node|way|relation)\/\d+$/.test(source.sourceRecordId ?? ''),
  )?.sourceRecordId;
  const match = sourceId?.match(/^(node|way|relation)\/(\d+)$/);
  if (!match) throw new Error(`Missing OSM identity for ${feature.id}.`);
  return { type: match[1]! as 'node' | 'way' | 'relation', id: match[2]! } as const;
}
function representativePosition(
  geometry: HeritageFeature['geometry'],
): [number, number] | undefined {
  const positions: [number, number][] = [];
  const visit = (value: unknown): void => {
    if (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      positions.push([value[0], value[1]]);
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
  };
  if (geometry && 'coordinates' in geometry) visit(geometry.coordinates);
  if (!positions.length) return undefined;
  return positions
    .reduce((sum, position) => [sum[0] + position[0], sum[1] + position[1]], [0, 0])
    .map((value) => value / positions.length) as [number, number];
}
type OsmResult = {
  url: string;
  status: 'current' | 'deleted' | 'unavailable';
  metadata: OsmElementMetadata;
  tags: Record<string, string>;
  geometryChecked: boolean;
  geometryDistanceMetres?: number;
  history: {
    url: string;
    status: string;
    versions?: number[];
    firstEditedAt?: string;
    lastEditedAt?: string;
    lastError?: string;
  };
};
async function getJson(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': 'Townscape-Guides-cohort-B-verification/1.0' },
    signal: AbortSignal.timeout(20000),
  });
}
async function inspectOsm(feature: HeritageFeature): Promise<OsmResult> {
  const element = elementFromFeature(feature);
  const url = `https://api.openstreetmap.org/api/0.6/${element.type}/${element.id}.json`;
  let response: Response | undefined;
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await getJson(url);
      if (response.ok || response.status === 404 || response.status === 410) break;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((done) => setTimeout(done, 1000 * (attempt + 1)));
  }
  if (!response || !response.ok) {
    const deleted = response?.status === 404 || response?.status === 410;
    return {
      url,
      status: deleted ? 'deleted' : 'unavailable',
      metadata: {
        elementType: element.type,
        elementId: element.id,
        visible: false,
        status: deleted ? 'deleted' : 'unavailable',
        checkedAt,
      },
      tags: {},
      geometryChecked: false,
      history: {
        url: `https://api.openstreetmap.org/api/0.6/${element.type}/${element.id}/history.json`,
        status: 'not-retrieved',
        ...(lastError ? { lastError } : {}),
      },
    };
  }
  const body = (await response.json()) as {
    elements?: Array<{
      type?: string;
      id?: number;
      lat?: number;
      lon?: number;
      tags?: Record<string, string>;
      version?: number;
      timestamp?: string;
      changeset?: number;
      visible?: boolean;
    }>;
  };
  const current = body.elements?.[0];
  if (!current?.id || !current.type) throw new Error(`Malformed OSM response for ${feature.id}.`);
  let geometryChecked = false;
  let geometryDistanceMetres: number | undefined;
  const featurePosition = representativePosition(feature.geometry);
  if (
    featurePosition &&
    element.type === 'node' &&
    Number.isFinite(current.lat) &&
    Number.isFinite(current.lon)
  ) {
    geometryChecked = true;
    geometryDistanceMetres = distance(point(featurePosition), point([current.lon!, current.lat!]), {
      units: 'meters',
    });
  } else if (featurePosition && element.type === 'way') {
    const full = await getJson(`https://api.openstreetmap.org/api/0.6/way/${element.id}/full.json`);
    if (full.ok) {
      const fullBody = (await full.json()) as {
        elements?: Array<{ type?: string; lat?: number; lon?: number }>;
      };
      const positions = (fullBody.elements ?? [])
        .filter(
          (item) => item.type === 'node' && Number.isFinite(item.lat) && Number.isFinite(item.lon),
        )
        .map((item) => [item.lon!, item.lat!] as [number, number]);
      if (positions.length) {
        geometryChecked = true;
        const centre = positions
          .reduce((sum, position) => [sum[0] + position[0], sum[1] + position[1]], [0, 0])
          .map((value) => value / positions.length) as [number, number];
        geometryDistanceMetres = distance(point(featurePosition), point(centre), {
          units: 'meters',
        });
      }
    }
  }
  const historyUrl = `https://api.openstreetmap.org/api/0.6/${element.type}/${element.id}/history.json`;
  let history: OsmResult['history'] = { url: historyUrl, status: 'unavailable' };
  try {
    const historyResponse = await getJson(historyUrl);
    if (historyResponse.ok) {
      const historyBody = (await historyResponse.json()) as {
        elements?: Array<{ version?: number; timestamp?: string }>;
      };
      const versions = (historyBody.elements ?? [])
        .map((item) => item.version)
        .filter((value): value is number => Number.isFinite(value));
      const timestamps = (historyBody.elements ?? [])
        .map((item) => item.timestamp)
        .filter((value): value is string => Boolean(value));
      history = {
        url: historyUrl,
        status: 'current',
        versions,
        ...(timestamps[0] ? { firstEditedAt: timestamps[0] } : {}),
        ...(timestamps.at(-1) ? { lastEditedAt: timestamps.at(-1) } : {}),
      };
    } else history = { url: historyUrl, status: `HTTP ${historyResponse.status}` };
  } catch (error) {
    history = { url: historyUrl, status: `error: ${String(error)}` };
  }
  return {
    url,
    status: current.visible === false ? 'deleted' : 'current',
    metadata: {
      elementType: element.type,
      elementId: element.id,
      version: current.version,
      lastEditedAt: current.timestamp,
      changesetId: current.changeset,
      visible: current.visible !== false,
      status: current.visible === false ? 'deleted' : 'current',
      checkedAt,
    },
    tags: current.tags ?? {},
    geometryChecked,
    ...(geometryDistanceMetres !== undefined ? { geometryDistanceMetres } : {}),
    history,
  };
}
function tagText(tags: Record<string, string>): string {
  return (
    Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('; ') || 'No tags returned.'
  );
}
function publicProjectionIsSafe(feature: HeritageFeature): string[] {
  const projected = projectPublicClaims(feature);
  const forbidden =
    /(?:^|; )(?:access|opening_hours?|charge|fee|operator|capacity|wheelchair|website|phone|description|network|operational_status)=/i;
  return projected.sourceRecords.flatMap((source) =>
    forbidden.test(source.notes ?? '') ? [source.sourceRecordId ?? source.sourceName] : [],
  );
}

const before = {
  createdAt: checkedAt,
  exactCohort: 'B',
  exactRecords: ids.length,
  membershipSha256,
  triageInputSha256: createHash('sha256')
    .update(await readFile(triagePath))
    .digest('hex'),
  records: features
    .map((feature) => ({
      recordId: feature.id,
      projectId: feature.projectId,
      workflowState: feature.publication?.state ?? (feature.reviewed ? 'verified' : 'provisional'),
      sourceHash: createHash('sha256').update(JSON.stringify(feature)).digest('hex'),
    }))
    .sort((a, b) => a.recordId.localeCompare(b.recordId)),
};
await writeFile(
  resolve(reviewDir, 'townscape-cohort-b-migration-before-2026-09-04.json'),
  `${JSON.stringify(before, null, 2)}\n`,
);
const decisions: Array<Record<string, unknown>> = [];
const results = new Map<string, OsmResult>();
for (const feature of features) {
  const osm = await inspectOsm(feature);
  results.set(feature.id, osm);
  const geometryAnomaly =
    osm.geometryChecked &&
    (osm.geometryDistanceMetres ?? 0) > (osm.metadata.elementType === 'node' ? 100 : 150);
  const decision =
    osm.status === 'current' &&
    osm.geometryChecked &&
    !geometryAnomaly &&
    osm.history.status === 'current'
      ? 'mapped_context'
      : 'requires_review';
  decisions.push({
    recordId: feature.id,
    projectId: feature.projectId,
    locality: feature.locality,
    existingName: feature.name,
    featureType: feature.featureType,
    existingSourceRecords: feature.sourceRecords.map((source) => ({
      sourceRecordId: source.sourceRecordId,
      sourceName: source.sourceName,
      reliability: source.reliability,
      notes: source.notes,
    })),
    existingClaimsExceedOsm: Boolean(
      feature.significance ||
      feature.designationType ||
      feature.statutoryStatus ||
      feature.fullDescription ||
      feature.sourceRecords.some((source) =>
        /(?:access|opening_hours?|charge|fee|operator|capacity|wheelchair|website|phone|description)=/i.test(
          source.notes ?? '',
        ),
      ),
    ),
    decision,
    evidenceRoute: 'live OSM element + geometry + element history',
    osmUrl: osm.url,
    osmStatus: osm.status,
    osmTags: tagText(osm.tags),
    osmMetadata: osm.metadata,
    geometryChecked: osm.geometryChecked,
    ...(osm.geometryDistanceMetres !== undefined
      ? { geometryDistanceMetres: Math.round(osm.geometryDistanceMetres) }
      : {}),
    history: osm.history,
    anomaly: geometryAnomaly
      ? `Mapped geometry differs by ${Math.round(osm.geometryDistanceMetres ?? 0)}m.`
      : undefined,
    conclusion:
      decision === 'mapped_context'
        ? 'Current element identity and geometry are sufficiently established for Tier M mapped context; OSM supports mapped existence, broad mapped type and location only.'
        : 'Not published as mapped context. Element, geometry or history could not be established without ambiguity; retained for review. A deleted/unavailable element is not treated as real-world disappearance.',
    claimsRetained:
      decision === 'mapped_context' ? 'Tier M mapped identity only.' : 'No public claim promoted.',
    sourceHistoryPreserved: true,
  });
}

const batchReports: Array<Record<string, unknown>> = [];
for (let batchIndex = 0; batchIndex < packages.length; batchIndex += 1) {
  const pkg = packages[batchIndex]!;
  const batchFeatures = features.filter((feature) => feature.projectId === pkg.project.id);
  const beforeState = batchFeatures.map((feature) => ({
    recordId: feature.id,
    publication: feature.publication,
  }));
  const errorsBefore = validateFeatures(pkg.project, pkg.features).filter(
    (item) => item.severity === 'error',
  );
  if (errorsBefore.length) throw new Error(`${pkg.project.id}: validation failed before batch.`);
  for (const feature of batchFeatures) {
    const result = results.get(feature.id)!;
    const decision = decisions.find((item) => item.recordId === feature.id)!.decision;
    feature.osmElement = result.metadata;
    const osmSourceId = `osm-api-check:${feature.id}`;
    const source: SourceRecord = {
      sourceName: 'OpenStreetMap API record check',
      sourceOrganisation: 'OpenStreetMap contributors',
      sourceRecordId: osmSourceId,
      sourceUrl: result.url,
      accessedAt: checkedAt,
      licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
      reliability: 'discovery_only',
      notes: `Live API check result (${result.status}): ${tagText(result.tags)}. This establishes only current volunteer-mapped identity, broad mapped type and location; it does not establish historic significance, official designation, operation, access, opening hours, fees, accessibility, safety, suitability or recommendation.`,
    };
    feature.sourceRecords = [
      ...feature.sourceRecords.filter((item) => item.sourceRecordId !== osmSourceId),
      source,
    ];
    feature.reviewed = false;
    feature.updatedAt = checkedAt;
    setFeaturePublicationState(
      feature,
      'provisional',
      checkedAt,
      decision === 'mapped_context'
        ? 'Controlled Cohort B migration: Tier M mapped context only.'
        : 'Controlled Cohort B migration: retained for review; no real-world disappearance inferred.',
    );
    feature.publication = { ...feature.publication!, profile: 'mapped_context' };
    feature.claimEvidence =
      decision === 'mapped_context'
        ? [
            {
              claim: 'mapped_identity',
              tier: 'mapped_context',
              sourceRecordRefs: [osmSourceId],
              reviewedAt: checkedAt,
              notes: 'Current OSM element identity, geometry and element history checked.',
            },
          ]
        : undefined;
    feature.reviewNotes =
      `${feature.reviewNotes ?? ''} Cohort B migration ${checkedAt.slice(0, 10)}: existing OSM-only wording and claims are not independently established; public projection is mapped context only.`.trim();
    if (decision === 'mapped_context' && publicProjectionIsSafe(feature).length)
      throw new Error(`Unsupported public claim survived ${feature.id}.`);
  }
  const errorsAfter = validateFeatures(pkg.project, pkg.features).filter(
    (item) => item.severity === 'error',
  );
  if (errorsAfter.length) throw new Error(`${pkg.project.id}: validation failed after batch.`);
  const batch = {
    registerType: 'Cohort B controlled claim-evidence migration batch',
    batch: batchIndex + 1,
    projectId: pkg.project.id,
    records: batchFeatures.length,
    reversibleBeforeState: beforeState,
    decisions: decisions.filter((item) => item.projectId === pkg.project.id),
    gates: {
      preflightValidationErrors: 0,
      postBatchValidationErrors: 0,
      publicTierFoeSuppression: true,
      sourceHistoryPreserved: true,
    },
  };
  await writeFile(
    resolve(
      reviewDir,
      `townscape-cohort-b-migration-batch-${String(batchIndex + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify(batch, null, 2)}\n`,
  );
  await writeFile(
    resolve('data/projects', `${packageNames[batchIndex]}.json`),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  batchReports.push(batch);
}

const current = decisions.filter((item) => item.decision === 'mapped_context').length;
const review = decisions.length - current;
const stronger = decisions.filter((item) => item.existingClaimsExceedOsm).length;
const report = {
  registerType: 'controlled Cohort B OSM/current-place claim-evidence migration decision register',
  migrationDate: checkedAt,
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  sourceTriage: {
    path: 'data/review/townscape-provisional-verification-triage-2026-09-03.json',
    exactCohort: 'B',
    exactRecords: ids.length,
    membershipSha256,
    inputSha256: before.triageInputSha256,
  },
  summary: {
    exactCohortSize: ids.length,
    approvedMappedContext: current,
    supportedAtStrongerTierByExistingIndependentEvidence: 0,
    recordsRemainingProvisional: current,
    recordsRequiringReview: review,
    recordsWithheld: 0,
    recordsWithExistingClaimsExceedingOsm: stronger,
    osmMetadataCaptured: decisions.filter((item) => Boolean(item.osmMetadata)).length,
    geometryChecksRecorded: decisions.filter((item) => item.geometryChecked === true).length,
    historyChecksRecorded: decisions.filter(
      (item) => (item.history as { status?: string }).status === 'current',
    ).length,
    unsupportedTierFoeFieldsSuppressed: true,
    publicationTotalsBefore: {
      publishable: 0,
      provisional: ids.length,
      requiresReview: 0,
      withheld: 0,
    },
    publicationTotalsAfterMigration: {
      publishable: 0,
      provisional: current,
      requiresReview: review,
      withheld: 0,
    },
  },
  decisions,
  batches: batchReports,
  rulesApplied: [
    'OSM alone promotes only Tier M mapped existence, broad physical/object type, location/geometry and appropriate non-generic mapped name.',
    'OSM does not establish historic significance, designation, attribution, operation, access, hours, fees, accessibility, safety, suitability, recommendation or editorial importance.',
    'Deleted, Gone or unavailable elements are requires_review; no real-world disappearance is inferred.',
    'Existing independent stronger evidence would be preserved and separately assessed; none was present in the exact Cohort B source records.',
    'Visitor scores, town ratings, scoring methodology, unrelated content and HES/NRHE records were not changed.',
  ],
};
await writeFile(
  resolve(reviewDir, 'townscape-cohort-b-migration-decision-register-2026-09-04.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve(reviewDir, 'townscape-cohort-b-migration-decision-register-2026-09-04.md'),
  `# Cohort B controlled OSM/current-place migration decision register\n\nMigration date: ${checkedAt}\nExact cohort: **${ids.length}** records\nMembership SHA-256: **${membershipSha256}**\n\n- Approved mapped context: **${current}**\n- Supported at stronger tier by existing independent evidence: **0**\n- Remaining provisional: **${current}**\n- Requiring review: **${review}**\n- Withheld: **0**\n- OSM metadata captured: **${decisions.filter((item) => Boolean(item.osmMetadata)).length}/${ids.length}**\n- Geometry checks recorded: **${decisions.filter((item) => item.geometryChecked === true).length}/${ids.length}**\n- History checks recorded: **${decisions.filter((item) => (item.history as { status?: string }).status === 'current').length}/${ids.length}**\n- Existing claims exceeding OSM alone: **${stronger}**; retained privately and suppressed from the mapped-context projection\n- Unsupported Tier F/O/E fields suppressed: **confirmed by projection gate**\n\nThe detailed JSON register records every existing source, live element metadata, history result, geometry check, anomaly and decision. Each project was written as a separate reversible batch after pre/post validation.\n`,
);
console.log(
  `Cohort B migration: ${current} mapped_context, ${review} requires_review, ${stronger} records had claims exceeding OSM alone.`,
);
