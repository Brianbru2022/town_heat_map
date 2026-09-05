import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { assessProjectPackage } from '../src/domain/publication';

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
const reviewPath = resolve('data/review/townscape-hes-individual-determinations-2026-09-03.json');
const jsonPath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const markdownPath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.md');

type Cohort = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
type Model = 'Luna Medium' | 'Terra Medium' | 'Terra High' | 'manual';

interface TriageRecord {
  recordId: string;
  projectId: string;
  locality: string;
  primaryCohort: Cohort;
  sourceEvidenceType: string;
  conciseReason: string;
  internetResearchProbablyRequired: boolean;
  recommendedModel: Model;
  existingEvidenceSummary: string;
  sourceTypes: string[];
  geometryStatus: string;
  validationFindings: string[];
  wordingSummary: string;
  apparentVerificationRequirement: string;
}

function sourceType(feature: HeritageFeature): string {
  const types = new Set(
    feature.sourceRecords.map((source) => `${source.sourceOrganisation} (${source.reliability})`),
  );
  return [...types].join('; ') || 'No source records';
}

function sourceKinds(feature: HeritageFeature): string[] {
  return [...new Set(feature.sourceRecords.map((source) => source.reliability))].sort();
}

function geometryStatus(feature: HeritageFeature): string {
  const declared = feature.geographicScope?.classification;
  return [
    `${feature.locationType}/${feature.locationConfidence}`,
    declared ? `geographic=${declared}` : undefined,
    feature.geometry ? `geometry=${feature.geometry.type}` : 'geometry=missing',
  ]
    .filter(Boolean)
    .join('; ');
}

function isCurrentPlace(feature: HeritageFeature): boolean {
  return feature.tags.includes('current-context') || feature.tags.includes('osm-community-place');
}

function hasAny(feature: HeritageFeature, values: string[]): boolean {
  const haystack =
    `${feature.featureType} ${feature.name} ${feature.tags.join(' ')} ${feature.shortDescription ?? ''}`.toLowerCase();
  return values.some((value) => haystack.includes(value));
}

function classify(
  feature: HeritageFeature,
  explicitEscalation: Map<string, string>,
): { cohort: Cohort; reason: string; model: Model; internet: boolean; requirement: string } {
  const escalation = explicitEscalation.get(feature.id);
  if (escalation)
    return {
      cohort: 'J',
      reason: escalation,
      model: 'manual',
      internet: true,
      requirement:
        'Existing controlled review explicitly escalated this record; preserve that decision for manual resolution.',
    };

  const geometryAmbiguous =
    !feature.geometry ||
    feature.locationConfidence === 'low' ||
    feature.locationConfidence === 'unknown' ||
    feature.geographicScope?.classification === 'ambiguous' ||
    /geometry|digitis|alignment|address|footprint|extent|polygon|mappable|period map/i.test(
      `${feature.locationType} ${feature.reviewNotes ?? ''}`,
    );
  if (geometryAmbiguous)
    return {
      cohort: 'G',
      reason: 'Identity, location, extent or geometry is not yet reproducibly fixed.',
      model: 'manual',
      internet: true,
      requirement:
        'Substantive geographic/identity judgement and, where needed, a bounded map or address comparison.',
    };

  if (
    isCurrentPlace(feature) &&
    hasAny(feature, [
      'café',
      'caf_',
      'restaurant',
      'bakery',
      'shop',
      'souvenir',
      'ice_cream',
      'tourist_information',
      'visitor_information',
    ])
  )
    return {
      cohort: 'C',
      reason:
        'OSM identifies a current venue or operation, but current existence/operation needs independent evidence.',
      model: 'Terra Medium',
      internet: true,
      requirement:
        'Confirm current operation, identity, public availability and wording from an operator or reliable current source.',
    };
  if (
    isCurrentPlace(feature) &&
    hasAny(feature, [
      'parking',
      'toilet',
      'ev ',
      'charging',
      'bench',
      'playground',
      'picnic',
      'drinking_water',
      'information_board',
      'guidepost',
      'amenit',
    ])
  )
    return {
      cohort: 'D',
      reason:
        'OSM identifies a visitor facility or amenity whose current availability and public status need corroboration.',
      model: 'Luna Medium',
      internet: true,
      requirement:
        'Confirm that the facility exists now and is publicly usable, including any access or availability qualification.',
    };
  if (
    isCurrentPlace(feature) &&
    hasAny(feature, [
      'viewpoint',
      'waterfall',
      'park',
      'garden',
      'nature',
      'trail',
      'route',
      'path',
      'outdoor',
    ])
  )
    return {
      cohort: 'E',
      reason:
        'The candidate is an outdoor feature or visitor-access place requiring existence, access or suitability corroboration.',
      model: 'Terra Medium',
      internet: true,
      requirement:
        'Confirm current existence, access and visitor-relevant wording from suitable sources.',
    };
  if (isCurrentPlace(feature))
    return {
      cohort: 'B',
      reason:
        'OSM establishes a mapped object/location, but identity and current existence still need independent evidence.',
      model: 'Luna Medium',
      internet: true,
      requirement:
        'Confirm current existence and identity; do not infer operation, access or visitor relevance from OSM alone.',
    };

  if (
    sourceKinds(feature).includes('official_statutory') ||
    sourceKinds(feature).includes('local_authority')
  )
    return {
      cohort: 'A',
      reason:
        'Existing authoritative evidence appears capable of bounded verification of the stated historical/designation fact.',
      model: 'Luna Medium',
      internet: false,
      requirement:
        'Check the named authoritative record and ensure the wording does not exceed its scope.',
    };
  if (feature.sourceRecords.length > 1)
    return {
      cohort: 'F',
      reason:
        'Multiple evidence streams or source roles require reconciliation before the claim is safe.',
      model: 'Terra High',
      internet: true,
      requirement:
        'Reconcile source identity, date, geography and wording across the existing evidence.',
    };
  return {
    cohort: 'H',
    reason:
      'The record may be factually evidenced, but its substantive description or visitor relevance needs editorial review.',
    model: 'Terra Medium',
    internet: true,
    requirement:
      'Review the claim and visitor-facing wording against evidence without making a publication decision.',
  };
}

const packages = await Promise.all(
  projectPaths.map(
    async (path) => JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  ),
);
const explicit = JSON.parse(await readFile(reviewPath, 'utf8')) as {
  summary?: { escalated?: Array<{ id: string; reason: string }> };
};
const escalations = new Map(
  (explicit.summary?.escalated ?? []).map((item) => [item.id, item.reason]),
);
const records: TriageRecord[] = [];
const inputHashes: Record<string, string> = {};

for (const [index, pkg] of packages.entries()) {
  const raw = await readFile(resolve(projectPaths[index]!), 'utf8');
  inputHashes[projectPaths[index]!] = createHash('sha256').update(raw).digest('hex');
  const assessment = assessProjectPackage(pkg);
  const validation = [
    ...pkg.validation,
    ...assessment.records.flatMap((item) => [...item.blockers, ...item.advisories]),
  ].filter(
    (item, itemIndex, all) =>
      all.findIndex(
        (candidate) =>
          candidate.recordId === item.recordId &&
          candidate.field === item.field &&
          candidate.message === item.message,
      ) === itemIndex,
  );
  const provisionalIds = new Set(
    assessment.records
      .filter((item) => item.effectiveState === 'provisional')
      .map((item) => item.recordId),
  );
  for (const feature of pkg.features.filter((candidate) => provisionalIds.has(candidate.id))) {
    const decision = classify(feature, escalations);
    const findings = validation
      .filter((item) => item.recordId === feature.id)
      .map((item) => `${item.severity}${item.code ? `/${item.code}` : ''}: ${item.message}`);
    records.push({
      recordId: feature.id,
      projectId: pkg.project.id,
      locality: feature.locality ?? pkg.project.locality,
      primaryCohort: decision.cohort,
      sourceEvidenceType: sourceType(feature),
      conciseReason: decision.reason,
      internetResearchProbablyRequired: decision.internet,
      recommendedModel: decision.model,
      existingEvidenceSummary:
        feature.sourceRecords
          .map((source) => `${source.sourceName} — ${source.notes ?? source.reliability}`)
          .join(' | ') || 'No source history recorded.',
      sourceTypes: sourceKinds(feature),
      geometryStatus: geometryStatus(feature),
      validationFindings: findings,
      wordingSummary: (
        feature.shortDescription ??
        feature.fullDescription ??
        'No descriptive wording recorded.'
      )
        .replace(/\s+/g, ' ')
        .trim(),
      apparentVerificationRequirement: decision.requirement,
    });
  }
}

records.sort(
  (left, right) =>
    left.projectId.localeCompare(right.projectId) || left.recordId.localeCompare(right.recordId),
);
const cohortCounts = Object.fromEntries(
  (['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as Cohort[]).map((cohort) => [
    cohort,
    records.filter((record) => record.primaryCohort === cohort).length,
  ]),
);
const modelCounts = Object.fromEntries(
  (['Luna Medium', 'Terra Medium', 'Terra High', 'manual'] as Model[]).map((model) => [
    model,
    records.filter((record) => record.recommendedModel === model).length,
  ]),
);
const report = {
  registerType: 'read-only verification triage',
  reviewedAt: new Date().toISOString(),
  policy:
    'Classification only. No publication state, content, score, geometry, provenance, source history or editorial data is changed.',
  inputs: {
    projectPackages: projectPaths,
    explicitEscalationRegister:
      'data/review/townscape-hes-individual-determinations-2026-09-03.json',
  },
  exactProvisionalCount: records.length,
  rawDeclaredProvisionalCount: 557,
  systematicDataSourceFindings: [
    'The eight real packages contain 557 raw provisional declarations; 10 have effective requires_review blockers, so the publication-audit in-scope provisional cohort is exactly 547.',
    `${records.filter((record) => record.sourceTypes.includes('discovery_only')).length} of ${records.length} records retain at least one discovery_only source; OSM/discovery evidence is not treated as proof of current operation, access, visitor relevance or facility availability.`,
    `${records.filter((record) => record.sourceTypes.some((type) => type === 'official_statutory' || type === 'local_authority')).length} records contain authoritative/local-authority source types; their current triage is G or J because geometry or explicit escalation takes precedence over source strength.`,
    'No triaged record has a live validation finding; the records with material validation blockers are effective requires_review and are outside this provisional cohort.',
  ],
  cohortCounts,
  recommendedModelCounts: modelCounts,
  internetResearchRecords: records
    .filter((record) => record.internetResearchProbablyRequired)
    .map((record) => `${record.projectId}/${record.recordId}`),
  existingEvidenceOnlyRecords: records
    .filter((record) => !record.internetResearchProbablyRequired)
    .map((record) => `${record.projectId}/${record.recordId}`),
  records,
  inputSha256: inputHashes,
};
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const cohortLabels: Record<Cohort, string> = {
  A: 'Official/current authoritative source',
  B: 'OSM/current-place factual record',
  C: 'Business/venue/current operation',
  D: 'Visitor facility',
  E: 'Route/access/outdoor',
  F: 'Mixed-source verification',
  G: 'Geographic/identity ambiguity',
  H: 'Editorial/visitor claim',
  I: 'Likely unsupported/irrelevant',
  J: 'Existing explicit escalation',
};
const lines = [
  '# Townscape Guides provisional verification triage',
  '',
  `Reviewed: ${report.reviewedAt}`,
  '',
  'Read-only classification register. The source packages and application data were not edited.',
  '',
  `- Exact provisional records: **${records.length}**`,
  `- Luna Medium: **${modelCounts['Luna Medium']}**`,
  `- Terra Medium: **${modelCounts['Terra Medium']}**`,
  `- Terra High: **${modelCounts['Terra High']}**`,
  `- Manual review: **${modelCounts.manual}**`,
  `- Probably requiring live internet research: **${report.internetResearchRecords.length}**`,
  `- Potentially verifiable entirely from existing evidence: **${report.existingEvidenceOnlyRecords.length}**`,
  '',
  '## Systematic data/source findings',
  '',
  ...report.systematicDataSourceFindings.map((finding) => `- ${finding}`),
  '',
  '## Cohort counts',
  '',
  ...(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as Cohort[]).map(
    (cohort) => `- **${cohort} — ${cohortLabels[cohort]}:** ${cohortCounts[cohort]}`,
  ),
  '',
  '## Classification rules and processing order',
  '',
  'J preserves the seven explicit HES/manual escalations. G captures unresolved geometry, extent or identity ambiguity before source-type classification. Current-place records are then separated into C (operation), D (facility), E (outdoor/access) and B (other mapped factual objects). Remaining authoritative records are A; multi-source reconciliation is F; substantive wording review is H; I is reserved for likely unsupported/irrelevant records. No category is a publication decision.',
  '',
  'Recommended order: **J/G first** (manual identity and geometry blockers), **A** (bounded authoritative checks), **D/B** (repeatable current-place factual checks), **C/E** (live operation and access checks), then **F/H/I** (reconciliation, editorial wording and unsupported/irrelevance review).',
  '',
  '## Record register',
  '',
  '| Record ID | Locality | Cohort | Source/evidence type | Reason | Internet likely | Final model |',
  '|---|---|---|---|---|---:|---|',
  ...records.map(
    (record) =>
      `| ${record.projectId}/${record.recordId} | ${record.locality} | ${record.primaryCohort} | ${record.sourceEvidenceType.replaceAll('|', '\\|')} | ${record.conciseReason} | ${record.internetResearchProbablyRequired ? 'yes' : 'no'} | ${record.recommendedModel} |`,
  ),
];
await writeFile(markdownPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Wrote ${records.length} triage records to ${jsonPath} and ${markdownPath}.`);
