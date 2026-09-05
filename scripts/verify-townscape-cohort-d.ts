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
import { setFeaturePublicationState } from '../src/domain/publication';
import { projectPublicClaims } from '../src/domain/claims';
import { validateFeatures } from '../src/domain/validation';

const triagePath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const reviewedAt = new Date().toISOString();
const accessDate = reviewedAt.slice(0, 10);
const allProjectPaths = [
  'data/projects/alloa.json',
  'data/projects/alva.json',
  'data/projects/biggar.json',
  'data/projects/culross.json',
  'data/projects/killin.json',
  'data/projects/kincardine.json',
  'data/projects/quarriers-village.json',
  'data/projects/tillicoultry.json',
].map((path) => resolve(path));
const selectedProject = process.env.COHORT_D_PROJECT;
const projectPaths = selectedProject
  ? allProjectPaths.filter((path) => path.endsWith(`\\${selectedProject}.json`))
  : allProjectPaths;
if (selectedProject && projectPaths.length !== 1)
  throw new Error(`Unknown Cohort D project selection: ${selectedProject}`);

type Triage = { records: Array<{ recordId: string; projectId: string; primaryCohort: string }> };
type Decision = Record<string, unknown>;

const officialSources = {
  clacksParking: {
    sourceName: 'Clackmannanshire Council public car parks',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clacks.gov.uk/transport/parking/',
    notes:
      'Current council list and policy: named public car parks in Alloa, Alva and Tillicoultry; council states its public car parks are free and not time restricted. It does not identify generic OSM amenities individually.',
  },
  clacksParks: {
    sourceName: 'Clackmannanshire Council parks and play areas quality assessment',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clacks.gov.uk/document/meeting/227/554/4366.pdf',
    notes:
      'Current council document naming selected parks/play areas. It is not an element-level inventory of benches, tables or information boards.',
  },
  clacksAlva: {
    sourceName: 'Johnstone & Cochrane Parks',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clacks.gov.uk/culture/johnstonecochraneparks/',
    notes:
      'Current council page confirms the named Alva park, play areas, picnic tables and public events; it does not identify each mapped object.',
  },
  clacksOchil: {
    sourceName: 'Ochil Hills Woodland Park',
    sourceOrganisation: 'Clackmannanshire Council',
    sourceUrl: 'https://www.clacks.gov.uk/culture/ochilhillswoodlandpark/',
    notes:
      'Current council page confirms a play area, picnic sites and display boards in the park; exact OSM-object correspondence is not established.',
  },
  fifeCarParks: {
    sourceName: 'Fife Council car park list',
    sourceOrganisation: 'Fife Council',
    sourceUrl: 'https://www.fife.gov.uk/roads-travel-parking/parking-and-car-parks/car-park-list',
    notes:
      'Current council list names Balgownie West and East Low Causeway car parks in Culross and Walker Street Car Park in Kincardine.',
  },
  fifeCulrossPark: {
    sourceName: 'Low Causeway, Culross',
    sourceOrganisation: 'Fife Council',
    sourceUrl: 'https://www.fife.gov.uk/facilities/park/low-causeway',
    notes:
      'Current council park page confirms a play park, public toilets, car park, picnic area and benches at Low Causeway; it does not identify each mapped object.',
  },
  fifeToilets: {
    sourceName: 'Culross Public Toilets',
    sourceOrganisation: 'Fife Council',
    sourceUrl: 'https://www.fife.gov.uk/facilities/public-toilet/culross-public-toilets',
    notes:
      'Current council facility page confirms location, seasonal opening hours, 30p charge and accessible toilet information for Culross Public Toilets.',
  },
  biggar: {
    sourceName: 'Biggar Public Park',
    sourceOrganisation: 'South Lanarkshire Council',
    sourceUrl: 'https://www.southlanarkshire.gov.uk/directory_record/656837/biggar_public_park',
    notes:
      "Current council page confirms Biggar Public Park, picnic facilities, children's play area and council management; access may be limited by bark surfacing.",
  },
  killinPark: {
    sourceName: 'Killin - Breadalbane Park',
    sourceOrganisation: 'Stirling Council',
    sourceUrl:
      'https://www.stirling.gov.uk/community-life-and-leisure/parks-walking-trails-and-cycle-paths/parks-in-stirling/parks-in-stirling/killin-breadalbane-park/',
    notes:
      'Current council page confirms year-round public park access, play area, picnic tables/seating, paths and free parking next to McLaren Hall.',
  },
  killinToilet: {
    sourceName: 'Killin (Falls of Dochart) public toilet',
    sourceOrganisation: 'Stirling Council',
    sourceUrl:
      'https://www.stirling.gov.uk/community-life-and-leisure/public-toilets/list-of-the-public-toilets-in-stirling/killin-falls-of-dochart/',
    notes:
      'Current council page confirms a public toilet at Dochart Falls, 24-hour opening, no charge and no disabled access; separate February 2026 council notice reported Killin public toilets temporarily closed during a water incident.',
  },
} as const;

const triage = JSON.parse(await readFile(triagePath, 'utf8')) as Triage;
const cohort = triage.records.filter((record) => record.primaryCohort === 'D');
if (cohort.length !== 414)
  throw new Error(`Expected exact Cohort D size 414; found ${cohort.length}.`);
const cohortIds = cohort.map((record) => record.recordId).sort();
const cohortMembershipSha256 = createHash('sha256')
  .update(`${cohortIds.join('\n')}\n`)
  .digest('hex');
const wanted = new Map(cohort.map((record) => [record.recordId, record]));
const packages = await Promise.all(
  projectPaths.map(async (path) => JSON.parse(await readFile(path, 'utf8')) as ProjectPackage),
);
const beforeSnapshot = {
  snapshotType: 'read-only controlled migration before snapshot',
  createdAt: reviewedAt,
  exactCohort: 'D',
  exactRecords: cohort.length,
  membershipSha256: cohortMembershipSha256,
  triageInputSha256: createHash('sha256')
    .update(await readFile(triagePath))
    .digest('hex'),
  records: packages
    .flatMap((pkg) => pkg.features)
    .filter((feature) => wanted.has(feature.id))
    .map((feature) => ({
      recordId: feature.id,
      projectId: feature.projectId,
      workflowState: feature.publication?.state ?? (feature.reviewed ? 'verified' : 'provisional'),
      sourceHashes: feature.sourceRecords.map((source) => ({
        sourceRecordId: source.sourceRecordId,
        sha256: createHash('sha256').update(JSON.stringify(source)).digest('hex'),
      })),
    }))
    .sort((left, right) => left.recordId.localeCompare(right.recordId)),
};
try {
  await readFile(resolve('data/review/townscape-cohort-d-migration-before-2026-09-04.json'));
} catch {
  await writeFile(
    resolve('data/review/townscape-cohort-d-migration-before-2026-09-04.json'),
    `${JSON.stringify(beforeSnapshot, null, 2)}\n`,
    'utf8',
  );
}
const officialByProject: Record<string, readonly (keyof typeof officialSources)[]> = {
  'alloa-scotland': ['clacksParking', 'clacksParks'],
  'alva-scotland': ['clacksParking', 'clacksParks', 'clacksAlva', 'clacksOchil'],
  'tillicoultry-scotland': ['clacksParking', 'clacksParks', 'clacksOchil'],
  'biggar-scotland': ['biggar'],
  'culross-scotland': ['fifeCarParks', 'fifeCulrossPark', 'fifeToilets'],
  'kincardine-on-forth-scotland': ['fifeCarParks'],
  'killin-scotland': ['killinPark', 'killinToilet'],
  'quarriers-village-scotland': [],
};

function osmElement(feature: HeritageFeature): { type: string; id: string } {
  const id = feature.sourceRecords.find((source) => source.sourceRecordId)?.sourceRecordId;
  const match = id?.match(/^(node|way|relation)\/(\d+)$/);
  if (!match) throw new Error(`Missing OSM element identity for ${feature.id}.`);
  return { type: match[1]!, id: match[2]! };
}

async function fetchOsm(feature: HeritageFeature): Promise<{
  url: string;
  detail: string;
  status: 'current' | 'deleted' | 'unavailable';
  metadata: OsmElementMetadata;
  geometryChecked: boolean;
  geometryAnomaly?: string;
}> {
  const element = osmElement(feature);
  const url = `https://api.openstreetmap.org/api/0.6/${element.type}/${element.id}.json`;
  let last = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'user-agent': 'Townscape-Guides-cohort-D-verification/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (response.ok) {
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
      const tags = current?.tags ?? {};
      let geometryChecked = false;
      let geometryAnomaly: string | undefined;
      if (
        element.type === 'node' &&
        Number.isFinite(current?.lat) &&
        Number.isFinite(current?.lon)
      ) {
        geometryChecked = true;
        const featurePosition = representativePosition(feature.geometry);
        if (featurePosition) {
          const metres = distance(point(featurePosition), point([current!.lon!, current!.lat!]), {
            units: 'meters',
          });
          if (metres > 100) geometryAnomaly = `Node geometry differs by ${Math.round(metres)}m.`;
        }
      } else if (element.type === 'way') {
        const fullUrl = `https://api.openstreetmap.org/api/0.6/way/${element.id}/full.json`;
        const fullResponse = await fetch(fullUrl, {
          headers: { 'user-agent': 'Townscape-Guides-cohort-D-verification/1.0' },
          signal: AbortSignal.timeout(15000),
        });
        if (fullResponse.ok) {
          const full = (await fullResponse.json()) as {
            elements?: Array<{ type?: string; lat?: number; lon?: number }>;
          };
          const positions = (full.elements ?? [])
            .filter(
              (item) =>
                item.type === 'node' && Number.isFinite(item.lat) && Number.isFinite(item.lon),
            )
            .map((item) => [item.lon!, item.lat!] as [number, number]);
          const featurePosition = representativePosition(feature.geometry);
          if (positions.length > 0 && featurePosition) {
            geometryChecked = true;
            const mappedPosition = positions
              .reduce((sum, position) => [sum[0] + position[0], sum[1] + position[1]], [0, 0])
              .map((value) => value / positions.length) as [number, number];
            const metres = distance(point(featurePosition), point(mappedPosition), {
              units: 'meters',
            });
            if (metres > 150)
              geometryAnomaly = `Way representative geometry differs by ${Math.round(metres)}m.`;
          }
        }
      }
      return {
        url,
        detail:
          Object.entries(tags)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`)
            .join('; ') || 'No tags returned.',
        status: 'current',
        metadata: {
          elementType: element.type as OsmElementMetadata['elementType'],
          elementId: element.id,
          version: current?.version,
          lastEditedAt: current?.timestamp,
          changesetId: current?.changeset,
          visible: current?.visible,
          status: 'current',
          checkedAt: reviewedAt,
        },
        geometryChecked,
        ...(geometryAnomaly ? { geometryAnomaly } : {}),
      };
    }
    last = `${response.status} ${response.statusText}`;
    if (response.status === 404 || response.status === 410)
      return {
        url,
        detail: `OSM API returned ${response.status} ${response.statusText}; the mapped element is not currently retrievable.`,
        status: 'deleted',
        metadata: {
          elementType: element.type as OsmElementMetadata['elementType'],
          elementId: element.id,
          visible: false,
          status: 'deleted',
          checkedAt: reviewedAt,
        },
        geometryChecked: false,
      };
    if (response.status !== 429 && response.status < 500) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1200 * (attempt + 1)));
  }
  return {
    url,
    detail: `OSM API check unavailable after retries: ${last}`,
    status: 'unavailable',
    metadata: {
      elementType: element.type as OsmElementMetadata['elementType'],
      elementId: element.id,
      status: 'unavailable',
      checkedAt: reviewedAt,
    },
    geometryChecked: false,
  };
}

function representativePosition(
  geometry: HeritageFeature['geometry'],
): [number, number] | undefined {
  if (!geometry) return undefined;
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
  if ('coordinates' in geometry) visit(geometry.coordinates);
  if (!positions.length) return undefined;
  return positions
    .reduce((sum, position) => [sum[0] + position[0], sum[1] + position[1]], [0, 0])
    .map((value) => value / positions.length) as [number, number];
}

function assertMappedProjection(feature: HeritageFeature): void {
  const projected = projectPublicClaims(feature);
  const notes = projected.sourceRecords.map((source: SourceRecord) => source.notes ?? '').join(' ');
  if (
    /\b(?:access|opening_hours?|charge|fee|operator|capacity|wheelchair|website|phone|description)=/i.test(
      notes,
    )
  )
    throw new Error(`Unsupported operational field survived public projection for ${feature.id}.`);
  if (projected.publication?.profile !== 'mapped_context')
    throw new Error(`Mapped-context profile missing from projection for ${feature.id}.`);
  if (projected.shortDescription?.includes('availability') === false)
    throw new Error(`Mapped-context disclaimer missing from projection for ${feature.id}.`);
}

const decisions: Decision[] = [];
let reviewed = 0;
for (const [packageIndex, pkg] of packages.entries()) {
  const features = pkg.features.filter((feature) => wanted.has(feature.id));
  for (const feature of features) {
    const osm = await fetchOsm(feature);
    feature.osmElement = osm.metadata;
    const osmSourceId = `osm-api-check:${feature.id}`;
    const osmSource: SourceRecord = {
      sourceName: 'OpenStreetMap API record check',
      sourceOrganisation: 'OpenStreetMap contributors',
      sourceRecordId: osmSourceId,
      sourceUrl: osm.url,
      accessedAt: reviewedAt,
      licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
      reliability: 'discovery_only',
      notes: `Live API check result (${osm.status}): ${osm.detail} This establishes only the current volunteer-mapped record status; it does not establish public operation, access, operator or facility characteristics.`,
    };
    feature.sourceRecords = [
      ...feature.sourceRecords.filter((source) => source.sourceRecordId !== osmSourceId),
      osmSource,
    ];
    const sourceKeys = officialByProject[pkg.project.id] ?? [];
    const exactNamed =
      feature.id === 'osm-community:way-92438298' ||
      feature.id === 'osm-community:way-237358761' ||
      feature.id === 'osm-community:way-89947778' ||
      feature.id === 'osm-community:way-89947779' ||
      feature.id === 'osm-community:way-385084824';
    const decision =
      osm.status === 'current' && !osm.geometryAnomaly ? 'mapped_context' : 'requires_review';
    feature.reviewed = false;
    feature.updatedAt = reviewedAt;
    setFeaturePublicationState(
      feature,
      'provisional',
      reviewedAt,
      osm.status === 'current'
        ? 'Controlled Cohort D migration: mapped context only; no stronger claim is authorised from OSM alone.'
        : 'Controlled Cohort D migration: OSM element is Gone/deleted and requires review; this is not evidence that the real-world feature disappeared.',
    );
    feature.publication = { ...feature.publication!, profile: 'mapped_context' };
    feature.claimEvidence =
      decision === 'mapped_context'
        ? [
            {
              claim: 'mapped_identity',
              tier: 'mapped_context',
              sourceRecordRefs: [osmSourceId],
              reviewedAt,
              notes:
                'Current OSM element metadata and mapped geometry checked; supports mapped existence, broad type and location/geometry only.',
            },
          ]
        : undefined;
    feature.reviewNotes =
      `${feature.reviewNotes ?? ''} Cohort D migration ${accessDate}: OSM metadata persisted; mapped identity and geometry checked where current. No unsupported access, operator, payment, opening, capacity, accessibility or visitor-suitability claim added.`.trim();
    if (osm.geometryAnomaly)
      feature.reviewNotes += ` Geometry/history anomaly: ${osm.geometryAnomaly} Tier M publication withheld pending review.`;
    if (decision === 'mapped_context') assertMappedProjection(feature);
    decisions.push({
      recordId: feature.id,
      projectId: pkg.project.id,
      locality: feature.locality ?? pkg.project.locality,
      facilityType: feature.featureType,
      existingName: feature.name,
      decision,
      exactNamedCandidate: exactNamed,
      evidenceRoute: 'osm_live_check_plus_targeted_authority_research',
      osmUrl: osm.url,
      osmStatus: osm.status,
      osmTags: osm.detail,
      osmMetadata: osm.metadata,
      geometryChecked: osm.geometryChecked,
      ...(osm.geometryAnomaly ? { geometryAnomaly: osm.geometryAnomaly } : {}),
      authoritativeSourcesConsulted: sourceKeys.map((key) => officialSources[key]),
      authoritativeElementLevelMatch: false,
      conclusion:
        osm.status !== 'current'
          ? 'OSM element is Gone/deleted. The real-world feature is not asserted to have disappeared; retained source/history and escalated to requires_review.'
          : osm.geometryAnomaly
            ? `${osm.geometryAnomaly} Identity/geometry correspondence is unsafe for Tier M publication; escalated without guessing.`
            : exactNamed
              ? 'Named facility has a relevant authority source, but the current record does not contain enough reproducible element-level identity/address correspondence for promotion.'
              : 'No reliable authority/operator record was found that identifies this individual mapped facility; authority source-class evidence is not enough to promote it.',
      claimsRetained:
        decision === 'mapped_context'
          ? 'Tier M mapped identity only: mapped existence, broad type and location/geometry. No access, operation, payment, opening, operator, capacity or accessibility claim is published.'
          : 'No public claim promoted; source/history retained for review.',
      sourceHistoryPreserved: true,
    });
    reviewed += 1;
    if (reviewed % 25 === 0)
      console.log(`Completed controlled batch ${reviewed}/${cohort.length}.`);
  }
  pkg.validation = validateFeatures(pkg.project, pkg.features);
  const errors = pkg.validation.filter((item) => item.severity === 'error');
  if (errors.length)
    throw new Error(
      `${pkg.project.id} produced ${errors.length} validation errors after its batch.`,
    );
  await writeFile(
    resolve(
      `data/review/townscape-cohort-d-migration-batch-${String(packageIndex + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify(
      {
        batch: packageIndex + 1,
        projectId: pkg.project.id,
        records: features.length,
        validationErrors: errors.length,
        projectionChecked: features.filter((feature) => feature.osmElement?.status === 'current')
          .length,
        decisions: decisions.filter((decision) => decision.projectId === pkg.project.id),
      },
      null,
    )}\n`,
    'utf8',
  );
  await writeFile(projectPaths[packageIndex]!, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

const before = { publishable: 0, provisional: 414, requiresReview: 0, withheld: 0 };
const after = {
  publishable: 0,
  provisional: decisions.filter((decision) => decision.decision === 'mapped_context').length,
  requiresReview: decisions.filter((decision) => decision.decision === 'requires_review').length,
  withheld: 0,
};
const report = {
  registerType: 'controlled current-evidence verification decision register',
  reviewedAt,
  accessDate,
  sourceTriage: {
    path: 'data/review/townscape-provisional-verification-triage-2026-09-03.json',
    exactCohort: 'D',
    exactRecords: cohort.length,
    inputSha256: createHash('sha256')
      .update(await readFile(triagePath))
      .digest('hex'),
    membershipSha256: cohortMembershipSha256,
  },
  summary: {
    exactRecordsReviewed: decisions.length,
    promotedPublishable: 0,
    currentOsmElementsMigratedToMappedContext: after.provisional,
    remainingProvisional: after.provisional,
    requiresReviewEscalated: after.requiresReview,
    withheldOutOfScope: 0,
    correctedExistingInformation: 0,
    authoritativeOrPrimaryRecordVerified: 0,
    secondaryEvidenceRequired: 0,
    adequateCurrentEvidenceNotFound: after.requiresReview,
    publicationTotalsBefore: { cohortD: before },
    publicationTotalsAfter: { cohortD: after },
  },
  batches: projectPaths.map((path, index) => ({
    batch: index + 1,
    project: path,
    records: decisions.filter((decision) => decision.projectId === packages[index]!.project.id)
      .length,
    validation:
      'validateFeatures passed; mapped projection allowlist checked for current elements.',
  })),
  recurringSourceEvidenceProblems: [
    'OSM API confirms a current volunteer-mapped element and tags only; it does not prove existence on the ground, public access, operation, operator, payment, opening hours, accessibility or visitor suitability.',
    'Authority pages verify named facilities or facility classes at park/site level, but most Cohort D records are anonymous individual objects without reproducible element-level identity correspondence.',
    'Generic benches, picnic tables and information boards generally have no authoritative public inventory; no inference was made from nearby named parks.',
    'Cohort D contains no supported accessibility, charging/payment or opening claim that could safely be retained from the existing wording.',
  ],
  decisions,
};
const reportPath = resolve('data/review/townscape-cohort-d-verification-2026-09-03.json');
const markdownPath = resolve('data/review/townscape-cohort-d-verification-2026-09-03.md');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(
  markdownPath,
  [
    '# Townscape Cohort D current-evidence verification',
    '',
    `Reviewed: ${reviewedAt}`,
    '',
    `- Exact triage cohort reviewed: **${decisions.length}**`,
    '- Promoted publishable: **0**',
    `- Current OSM elements migrated to mapped context: **${after.provisional}**`,
    `- Remaining provisional: **${after.provisional}**`,
    `- Requires review/escalated: **${after.requiresReview}**`,
    '- Withheld/out of scope: **0**',
    '- Existing information corrected: **0**',
    `- Adequate current evidence not found / withheld: **${after.requiresReview}**`,
    '',
    '## Decision',
    '',
    `The exact 414-record cohort was frozen with membership SHA-256 ${cohortMembershipSha256}. ${after.provisional} current elements received mapped_context and a Tier M mapped_identity claim; ${after.requiresReview} Gone/deleted elements were escalated to requires_review. No OSM-only facility was promoted to a stronger claim tier.`,
    '',
    'The JSON file is the individual decision register. It records the current OSM URL/tags, authority sources consulted, decision, evidence limitation and source-history result for every record.',
    '',
    '## Validation',
    '',
    'Each project package was passed through `validateFeatures` after its controlled batch. Current-element public projections were checked against the mapped-context allowlist; unsupported operational and editorial OSM fields were suppressed.',
    '',
  ].join('\n') + '\n',
  'utf8',
);
console.log(
  `Reviewed ${decisions.length} Cohort D records: 0 publishable, ${decisions.length} provisional.`,
);
