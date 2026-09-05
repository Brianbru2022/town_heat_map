import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  GeographicRelationship,
  HeritageFeature,
  ProjectPackage,
  PublicationSummary,
} from '../src/domain/models';
import {
  assessFeaturePublication,
  assessProjectPackage,
  setFeaturePublicationState,
} from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

/**
 * A deliberately closed exception review.  The preceding geographic cohort is
 * the baseline; this script must not become a second bulk-classification pass.
 * Each disposition below is a recorded editorial decision based on the feature
 * identity and locally held HES/NRHE source history, not buffer distance.
 */
const projectPaths = [
  'data/projects/alloa.json',
  'data/projects/alva.json',
  'data/projects/culross.json',
  'data/projects/kincardine.json',
  'data/projects/tillicoultry.json',
  'data/projects/quarriers-village.json',
  'data/projects/biggar.json',
  'data/projects/killin.json',
];
const baselinePath = resolve('data/review/townscape-local-hes-verification-2026-09-03.json');
const reportPath = resolve('data/review/townscape-hes-exception-review-2026-09-03.json');
const reviewedAt = new Date().toISOString();
const reviewDate = reviewedAt.slice(0, 10);

type ProjectId =
  | 'alva-scotland'
  | 'culross-scotland'
  | 'kincardine-on-forth-scotland'
  | 'tillicoultry-scotland'
  | 'biggar-scotland'
  | 'killin-scotland';
type DecisionKind =
  | 'partial_overlap_context'
  | 'buffer_related_publishable'
  | 'buffer_out_of_scope'
  | 'provenance_resolved'
  | 'wording_corrected';

type ExceptionDecision = {
  projectId: ProjectId;
  id: string;
  kind: DecisionKind;
  classification: 'related_context' | 'out_of_scope' | 'within_town_locality';
  publication: 'publishable' | 'withheld';
  rationale: string;
  wording?: string;
};

const partialOverlap: ExceptionDecision[] = [
  {
    projectId: 'culross-scotland',
    id: 'hes-conservation-area:CA143',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory Culross Conservation Area is explicitly the Culross designation. Its authoritative polygon legitimately extends beyond the NRS locality edge, so it is published only as locality-spanning statutory context and not as evidence that every part lies within the locality.',
  },
  {
    projectId: 'kincardine-on-forth-scotland',
    id: 'hes-conservation-area:CA153',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory Kincardine Conservation Area is explicitly the Kincardine designation. Its authoritative polygon legitimately extends beyond the NRS locality edge, so it is published only as locality-spanning statutory context and not as evidence that every part lies within the locality.',
  },
  {
    projectId: 'tillicoultry-scotland',
    id: 'hes-conservation-area:CA512',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory Tillicoultry Conservation Area is explicitly the Tillicoultry designation. Its authoritative polygon legitimately extends beyond the NRS locality edge, so it is published only as locality-spanning statutory context and not as evidence that every part lies within the locality.',
  },
  {
    projectId: 'biggar-scotland',
    id: 'hes-conservation-area:CA391',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory Biggar Conservation Area is explicitly the Biggar designation. Its authoritative polygon legitimately extends beyond the NRS locality edge, so it is published only as locality-spanning statutory context and not as evidence that every part lies within the locality.',
  },
  {
    projectId: 'biggar-scotland',
    id: 'hes-scheduled-monument:SM5492',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory monument is explicitly described by HES as a prehistoric settlement and enclosure at Colliehill Road, Biggar. The designation polygon crosses the locality boundary but the feature identity gives a direct Biggar relationship; publish it only as locality-spanning statutory context.',
  },
  {
    projectId: 'killin-scotland',
    id: 'hes-conservation-area:CA544',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The statutory Killin Conservation Area is explicitly the Killin designation. Its authoritative polygon legitimately extends beyond the NRS locality edge, so it is published only as locality-spanning statutory context and not as evidence that every part lies within the locality.',
  },
  {
    projectId: 'killin-scotland',
    id: 'hes-scheduled-monument:SM4675',
    kind: 'partial_overlap_context',
    classification: 'related_context',
    publication: 'publishable',
    rationale:
      'The scheduled monument is the Finlarig Castle, earthworks and mausoleum complex, a named historic component of Killin. Its designation polygon crosses the locality boundary; publish it only as locality-spanning statutory context.',
  },
];

const bufferRelated: ExceptionDecision[] = [
  [
    'culross-scotland',
    'nrhe:48031',
    'The NRHE record is explicitly named Culross; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'culross-scotland',
    'nrhe:48064',
    'The NRHE record explicitly identifies the Culross Moat coal shaft; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'culross-scotland',
    'nrhe:86468',
    'The NRHE record explicitly identifies Culross Low Causeway; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'culross-scotland',
    'nrhe:92392',
    'The NRHE record explicitly identifies Culross Harbour; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'culross-scotland',
    'nrhe:280709',
    'The NRHE record is explicitly named Culross and classifies a pier; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'culross-scotland',
    'nrhe:280710',
    'The NRHE record is explicitly named Culross and classifies a pier; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48072',
    'The NRHE record explicitly identifies Kincardine-on-Forth, Kincardine House; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:93179',
    'The NRHE record explicitly identifies Kincardine-on-Forth, Kellywood Crescent; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:93180',
    'The NRHE record explicitly identifies Kincardine-on-Forth, Kellywood Works; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:123074',
    'The NRHE record explicitly identifies the Kincardine-on-Forth power-station jetty; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:68086',
    'The NRHE record explicitly identifies Kincardine-on-Forth Power Station; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:259537',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:268843',
    'The NRHE record explicitly identifies the Kincardine Eastern Link Road; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277533',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277534',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277095',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277101',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277102',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:277103',
    'The NRHE record explicitly identifies a Kincardine-on-Forth Power Station component; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:276991',
    'The NRHE record explicitly identifies the Kincardine-on-Forth Power Station turbine hall; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48260',
    'The NRHE record is explicitly named Tillicoultry; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48282',
    'The NRHE record explicitly identifies the Tillicoultry water-power system; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48286',
    'The NRHE record explicitly identifies the Tillicoultry railway viaduct; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48288',
    'The NRHE record is explicitly named Tillicoultry (East); retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48295',
    'The NRHE record is explicitly named Tillicoultry; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48296',
    'The NRHE record is explicitly named Tillicoultry; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:243538',
    'The NRHE record explicitly identifies Tillicoultry, Devonside and Alexandra Street; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:308562',
    'The NRHE record explicitly identifies Tillicoultry Golf Course on Alva Road; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:378491',
    'The NRHE record explicitly identifies the Tillicoultry weaving mill; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:350879',
    'The NRHE record explicitly identifies Tillicoultry allotments on Chapelle Street; retain it as limited related historic context, not as a boundary-based visitor inclusion.',
  ],
].map(([projectId, id, rationale]) => ({
  projectId: projectId as ProjectId,
  id,
  kind: 'buffer_related_publishable' as const,
  classification: 'related_context' as const,
  publication: 'publishable' as const,
  rationale,
}));

const bufferOutside: ExceptionDecision[] = [
  [
    'culross-scotland',
    'nrhe:153472',
    'The NRHE record is named Dunimarle Castle and classifies a fish trap. It has no explicit Culross locality relationship in the locally held record; buffer distance is insufficient.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48108',
    'The NRHE record is for Inch House, a distinct named locality/estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48109',
    'The NRHE record is for Old Tulliallan Castle, a distinct named locality/estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48113',
    'The NRHE record is for Tulliallan, a distinct named locality/parish rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48114',
    'The NRHE record is for Tulliallan, a distinct named locality/parish rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48116',
    'The NRHE record is for the Tulliallan Castle ice house, a distinct named estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:48124',
    'The NRHE record is explicitly for Tulliallan Parish, not the Kincardine locality.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:351570',
    'The NRHE record is for the Tulliallan Castle laundry house, a distinct named estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:162415',
    'The NRHE record is for Inch Farm, a distinct named locality/estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:174313',
    'The NRHE record is for Tulliallan Castle and Moorloch Cottage, a distinct named estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:174316',
    'The NRHE record is for Inch Farm Cottages, a distinct named locality/estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:214067',
    'The NRHE record is for the Tulliallan Estate Office, a distinct named estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:250320',
    'The NRHE record is for Inch Farm, a distinct named locality/estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:94462',
    'The NRHE record is for Tulliallan Castle, a distinct named estate rather than Kincardine.',
  ],
  [
    'kincardine-on-forth-scotland',
    'nrhe:174310',
    'The NRHE record is for the Tulliallan Castle walled garden, a distinct named estate rather than Kincardine.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48256',
    'The NRHE record is for Harviestoun, a distinct named locality/estate rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48258',
    'The NRHE record is for Eastertown, a distinct named settlement rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48290',
    'The NRHE record is for Glenfoot Bridge, a distinct named settlement context rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48291',
    'The NRHE record is for Lady Ann’s Well and gives no explicit Tillicoultry locality relationship.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48292',
    'The NRHE record explicitly identifies Alva Glen, not Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:48294',
    'The NRHE record is for Castle Craig and gives no explicit Tillicoultry locality relationship.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:106444',
    'The NRHE record explicitly identifies Devonside, a distinct named settlement rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:111925',
    'The NRHE record is for Castle Craig and gives no explicit Tillicoultry locality relationship.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:111935',
    'The NRHE record is for Mellochfoot, a distinct named locality rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:111937',
    'The NRHE record explicitly identifies Devonside, a distinct named settlement rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:111940',
    'The NRHE record explicitly identifies Coalsnaughton, a distinct named settlement rather than Tillicoultry.',
  ],
  [
    'tillicoultry-scotland',
    'nrhe:111942',
    'The NRHE record explicitly identifies Glenfoot, a distinct named settlement rather than Tillicoultry.',
  ],
].map(([projectId, id, rationale]) => ({
  projectId: projectId as ProjectId,
  id,
  kind: 'buffer_out_of_scope' as const,
  classification: 'out_of_scope' as const,
  publication: 'withheld' as const,
  rationale,
}));

const provenance: ExceptionDecision[] = [
  ['culross-scotland', 'nrhe:48021'],
  ['culross-scotland', 'nrhe:48055'],
  ['culross-scotland', 'nrhe:92389'],
  ['culross-scotland', 'nrhe:124579'],
  ['culross-scotland', 'nrhe:124581'],
  ['culross-scotland', 'nrhe:165396'],
  ['culross-scotland', 'nrhe:319300'],
  ['killin-scotland', 'nrhe:24194'],
].map(([projectId, id]) => ({
  projectId: projectId as ProjectId,
  id,
  kind: 'provenance_resolved' as const,
  classification: 'within_town_locality' as const,
  publication: 'publishable' as const,
  rationale:
    'Existing locally held HES/NRHE evidence contains a licensed Historic Environment Scotland record matching this feature. Supplementary OSM or earlier HES source-history entries remain preserved, but do not displace the authoritative HES/NRHE provenance.',
}));

const wording: ExceptionDecision[] = [
  {
    projectId: 'alva-scotland',
    id: 'nrhe:220554',
    kind: 'wording_corrected',
    classification: 'within_town_locality',
    publication: 'publishable',
    rationale:
      'The NRHE identity/classification is valid after removing any implication about present status.',
    wording:
      'This record is limited to the NRHE classification of bus shelter and public convenience(s). It does not establish present status.',
  },
  {
    projectId: 'culross-scotland',
    id: 'nrhe:104336',
    kind: 'wording_corrected',
    classification: 'within_town_locality',
    publication: 'publishable',
    rationale:
      'The NRHE identity/classification is valid after removing any implication about present status.',
    wording:
      'This record is limited to the NRHE classification of public convenience. It does not establish present status.',
  },
  {
    projectId: 'kincardine-on-forth-scotland',
    id: 'nrhe:93075',
    kind: 'wording_corrected',
    classification: 'within_town_locality',
    publication: 'publishable',
    rationale:
      'The NRHE identity/classification is valid after removing any implication about present operation.',
    wording:
      'This record is limited to the NRHE classification of public house. It does not establish present operation.',
  },
  {
    projectId: 'kincardine-on-forth-scotland',
    id: 'nrhe:93096',
    kind: 'wording_corrected',
    classification: 'within_town_locality',
    publication: 'publishable',
    rationale:
      'The NRHE identity/classification is valid after removing any implication about present status.',
    wording:
      'This record is limited to the NRHE classifications of terraced house and public convenience. It does not establish present status.',
  },
];

const decisions = [
  ...partialOverlap,
  ...bufferRelated,
  ...bufferOutside,
  ...provenance,
  ...wording,
];
const changedProjectIds = new Set(decisions.map((item) => item.projectId));
if (
  partialOverlap.length !== 7 ||
  bufferRelated.length + bufferOutside.length !== 57 ||
  provenance.length !== 8 ||
  wording.length !== 4
)
  throw new Error('Exception register counts no longer match the controlled baseline.');
if (new Set(decisions.map((item) => `${item.projectId}/${item.id}`)).size !== decisions.length)
  throw new Error('The exception register contains a duplicate feature decision.');

function recordId(feature: HeritageFeature): string | undefined {
  if (feature.id.startsWith('nrhe:')) return feature.id.slice('nrhe:'.length);
  return feature.id.match(
    /^hes-(?:listed-building|scheduled-monument|conservation-area|designed-landscape):(.+)$/,
  )?.[1];
}

function assertHesEvidence(feature: HeritageFeature): void {
  const expected = recordId(feature);
  const source = feature.sourceRecords.find(
    (item) =>
      item.sourceOrganisation === 'Historic Environment Scotland' &&
      item.sourceRecordId === expected &&
      Boolean(item.licence?.trim()),
  );
  if (!source)
    throw new Error(
      `${feature.id}: no locally held licensed HES/NRHE source matching the feature identifier.`,
    );
}

function appendReviewNote(feature: HeritageFeature, note: string): void {
  const marker = `Townscape exception review ${reviewDate}.`;
  if (!feature.reviewNotes?.includes(marker))
    feature.reviewNotes = [feature.reviewNotes, `${marker} ${note}`].filter(Boolean).join(' ');
}

function scopeFeature(
  pkg: ProjectPackage,
  feature: HeritageFeature,
  classification: ExceptionDecision['classification'],
  rationale: string,
): void {
  const area = pkg.project.townStudyArea;
  if (!area) throw new Error(`${pkg.project.id}: missing Townscape locality boundary.`);
  feature.geographicScope = {
    classification,
    boundaryName: area.localityName,
    boundarySource: `${area.sourceName} (${area.sourceVersion})`,
    verifiedAt: reviewedAt,
    rationale,
  };
  feature.evidenceScope = classification === 'out_of_scope' ? 'out_of_scope' : 'related_context';
}

function summaryTotal(summaries: ReturnType<typeof assessProjectPackage>['summary'][]) {
  return summaries.reduce(
    (total, summary) => ({
      totalRecords: total.totalRecords + summary.totalRecords,
      publishable: total.publishable + summary.publishable,
      provisional: total.provisional + summary.provisional,
      verified: total.verified + summary.verified,
      requiresReview: total.requiresReview + summary.requiresReview,
      withheld: total.withheld + summary.withheld,
      blockerCount: total.blockerCount + summary.blockerCount,
      advisoryCount: total.advisoryCount + summary.advisoryCount,
    }),
    {
      totalRecords: 0,
      publishable: 0,
      provisional: 0,
      verified: 0,
      requiresReview: 0,
      withheld: 0,
      blockerCount: 0,
      advisoryCount: 0,
    },
  );
}

const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as {
  geographicClassifications?: Record<string, number>;
  publicationTotals?: {
    after?: PublicationSummary;
    byProject?: { after?: Array<{ projectId: string } & PublicationSummary> };
  };
};
const packages = await Promise.all(
  projectPaths.map(async (path) => ({
    path,
    pkg: JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  })),
);
const beforeByProject = packages.map(({ pkg }) => ({
  projectId: pkg.project.id,
  ...assessProjectPackage(pkg).summary,
}));

const decided: Array<
  Omit<ExceptionDecision, 'classification'> & {
    classification: GeographicRelationship;
    name: string;
    sourceRecordIds: string[];
  }
> = [];
for (const decision of decisions) {
  const holder = packages.find(({ pkg }) => pkg.project.id === decision.projectId);
  if (!holder) throw new Error(`Missing project package ${decision.projectId}.`);
  const feature = holder.pkg.features.find((item) => item.id === decision.id);
  if (!feature) throw new Error(`${decision.projectId}: missing ${decision.id}.`);
  assertHesEvidence(feature);

  if (decision.kind === 'wording_corrected') {
    feature.fullDescription = decision.wording;
    // The geographic review already established that these four records are
    // in the locality. Wording remediation must not turn them into context.
    feature.evidenceScope = 'parish_evidence';
  } else if (decision.kind === 'provenance_resolved') {
    // Keep an existing non-core scope declaration intact; only record the source decision.
    if (feature.geographicScope?.classification === 'related_context')
      feature.evidenceScope = 'related_context';
    else feature.evidenceScope = 'parish_evidence';
  } else {
    scopeFeature(holder.pkg, feature, decision.classification, decision.rationale);
  }
  feature.reviewed = true;
  appendReviewNote(feature, decision.rationale);
  setFeaturePublicationState(feature, decision.publication, reviewedAt, decision.rationale);
  decided.push({
    ...decision,
    classification: feature.geographicScope?.classification ?? decision.classification,
    name: feature.name,
    sourceRecordIds: feature.sourceRecords.flatMap((source) =>
      source.sourceRecordId ? [source.sourceRecordId] : [],
    ),
  });
}

for (const { path, pkg } of packages) {
  if (!changedProjectIds.has(pkg.project.id as ProjectId)) continue;
  pkg.validation = validateFeatures(pkg.project, pkg.features);
  const errors = pkg.validation.filter((item) => item.severity === 'error');
  if (errors.length)
    throw new Error(`${pkg.project.id}: refusing to write ${errors.length} validation error(s).`);
  await writeFile(resolve(path), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
}

const afterByProject = packages.map(({ pkg }) => ({
  projectId: pkg.project.id,
  ...assessProjectPackage(pkg).summary,
}));
const remaining = packages.flatMap(({ pkg }) => {
  const validation = validateFeatures(pkg.project, pkg.features);
  return pkg.features
    .filter((feature) =>
      feature.sourceRecords.some(
        (source) => source.sourceOrganisation === 'Historic Environment Scotland',
      ),
    )
    .map((feature) => ({ feature, assessment: assessFeaturePublication(pkg, feature, validation) }))
    .filter(
      ({ assessment }) =>
        assessment.effectiveState === 'provisional' ||
        assessment.effectiveState === 'requires_review',
    )
    .map(({ feature, assessment }) => ({
      projectId: pkg.project.id,
      id: feature.id,
      name: feature.name,
      state: assessment.effectiveState,
      reason: assessment.blockers.length
        ? assessment.blockers.map((item) => `${item.code}: ${item.message}`).join(' ')
        : (feature.publication?.notes ?? 'No individual publication determination is recorded.'),
    }));
});
const remainingCohorts = Object.values(
  remaining.reduce<Record<string, { state: string; reason: string; records: typeof remaining }>>(
    (groups, item) => {
      const key = `${item.state}|${item.reason}`;
      const group = groups[key] ?? { state: item.state, reason: item.reason, records: [] };
      group.records.push(item);
      groups[key] = group;
      return groups;
    },
    {},
  ),
).map((group) => ({
  state: group.state,
  reason: group.reason,
  count: group.records.length,
  records: group.records,
}));

const report = {
  reviewedAt,
  precedent: 'Townscape HES/NRHE exception-review milestone',
  baselineCounts: {
    partialOverlap: baseline.geographicClassifications?.ambiguous,
    bufferOnly: baseline.geographicClassifications?.immediately_associated,
    provenanceExceptions: provenance.length,
    unsupportedWording: wording.length,
  },
  crossBoundaryRule:
    'Keep authoritative geometry unchanged. A feature that crosses a locality boundary may be published only as related context where an authoritative designation or record identity explicitly names the Townscape locality or establishes the feature as a named component of it. Label it locality-spanning; do not count it as wholly in-boundary or use it in locality scoring. Otherwise retain it as provisional or withhold it. Geometric overlap and buffer distance alone never establish the relationship.',
  totals: {
    // The review must remain reproducible if it is rerun: use the previous
    // controlled register's recorded post-cohort totals, not mutated files.
    before: baseline.publicationTotals?.after ?? summaryTotal(beforeByProject),
    after: summaryTotal(afterByProject),
    beforeByProject: baseline.publicationTotals?.byProject?.after ?? beforeByProject,
    afterByProject,
  },
  summary: {
    partialOverlapReviewed: partialOverlap.length,
    partialOverlapPublishedAsRelatedContext: partialOverlap.length,
    bufferOnlyReviewed: bufferRelated.length + bufferOutside.length,
    bufferOnlyPublishedAsRelatedContext: bufferRelated.length,
    bufferOnlyWithheldOutOfScope: bufferOutside.length,
    unresolved: 0,
    provenanceResolved: provenance.length,
    provenanceUnresolved: 0,
    wordingCorrected: wording.length,
    remainingHesNrheNonPublishable: remaining.length,
  },
  decisions: decided,
  remainingHesNrheCohorts: remainingCohorts,
};
const byKind = (kind: DecisionKind) => decided.filter((item) => item.kind === kind);
const show = (items: typeof decided) =>
  items.map((item) => `- ${item.projectId} / ${item.id} — ${item.name}`).join('\n');
const markdown = [
  '# Townscape HES/NRHE exception-review milestone',
  '',
  `Reviewed: ${reviewedAt}`,
  '',
  '## Baseline reconciled',
  '',
  `- Partial-overlap polygons: ${report.baselineCounts.partialOverlap}`,
  `- Buffer-only records: ${report.baselineCounts.bufferOnly}`,
  `- Provenance exceptions: ${report.baselineCounts.provenanceExceptions}`,
  `- Unsupported-wording exceptions: ${report.baselineCounts.unsupportedWording}`,
  '',
  '## Cross-boundary rule',
  '',
  report.crossBoundaryRule,
  '',
  '## Partial-overlap decisions',
  '',
  show(byKind('partial_overlap_context')),
  '',
  'All seven have an identity-based locality relationship and are published only as related, locality-spanning context. The HES geometry is unchanged.',
  '',
  '## Buffer-only decisions',
  '',
  `- Reviewed: ${report.summary.bufferOnlyReviewed}`,
  `- Published as clearly labelled related context: ${report.summary.bufferOnlyPublishedAsRelatedContext}`,
  `- Withheld as another locality/no documented town relationship: ${report.summary.bufferOnlyWithheldOutOfScope}`,
  `- Unresolved: ${report.summary.unresolved}`,
  '',
  '### Published related context',
  '',
  show(byKind('buffer_related_publishable')),
  '',
  '### Withheld / out of scope',
  '',
  show(byKind('buffer_out_of_scope')),
  '',
  '## Provenance decisions',
  '',
  `Resolved: ${report.summary.provenanceResolved}; unresolved: ${report.summary.provenanceUnresolved}. Each retains source history and is supported by a locally held, licensed HES/NRHE record matching the feature identifier.`,
  '',
  show(byKind('provenance_resolved')),
  '',
  '## Unsupported-wording corrections',
  '',
  'The following records are now expressly limited to their historic NRHE classification; no present access, opening, facilities, operation or use is claimed.',
  '',
  show(byKind('wording_corrected')),
  '',
  '## Publication totals',
  '',
  `- Before: ${report.totals.before.publishable} publishable, ${report.totals.before.provisional} provisional, ${report.totals.before.withheld} withheld, ${report.totals.before.requiresReview} requires review.`,
  `- After: ${report.totals.after.publishable} publishable, ${report.totals.after.provisional} provisional, ${report.totals.after.withheld} withheld, ${report.totals.after.requiresReview} requires review.`,
  '',
  '## Remaining non-publishable HES/NRHE records',
  '',
  remainingCohorts.length
    ? remainingCohorts
        .map(
          (cohort) =>
            `- ${cohort.count} ${cohort.state}: ${cohort.reason} The JSON companion carries the complete record list for this cohort.`,
        )
        .join('\n')
    : '- None. This exception cohort leaves no HES/NRHE record provisional or blocked from publication.',
  '',
].join('\n');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(reportPath.replace(/\.json$/i, '.md'), `${markdown}\n`, 'utf8');
console.log(
  `Resolved ${decisions.length} exceptions: ${bufferRelated.length} buffer context records published, ${bufferOutside.length} buffer records withheld, ${remaining.length} HES/NRHE record(s) remain non-publishable.`,
);
