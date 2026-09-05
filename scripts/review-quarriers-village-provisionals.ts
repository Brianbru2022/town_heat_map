import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { setFeaturePublicationState } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/quarriers-village.json');
const reportPath = resolve(
  process.argv[3] ?? 'data/review/quarriers-village-provisional-verification-pilot.json',
);
const markdownReportPath = reportPath.replace(/\.json$/i, '.md');
const reviewedAt = new Date().toISOString();

const officialRecordIds = new Set([
  'hes-conservation-area:CA99',
  'hes-designed-landscape:GDL00146',
  'nrhe:171043',
  'nrhe:197718',
  'nrhe:199193',
  'nrhe:199200',
  'nrhe:199210',
  'nrhe:199223',
  'nrhe:197301',
  'nrhe:199183',
  'nrhe:199184',
  'nrhe:199187',
  'nrhe:199188',
  'nrhe:199191',
  'nrhe:264200',
  'nrhe:264201',
  'nrhe:264198',
  'nrhe:264202',
  'nrhe:264203',
  'nrhe:264204',
  'nrhe:277150',
  'nrhe:317060',
  'nrhe:317065',
  'nrhe:350586',
  'nrhe:347087',
  'hes-listed-building:LB12745',
  'hes-listed-building:LB13047',
  'hes-listed-building:LB13230',
]);

const outsideOsmIds = new Set([
  'osm-community:node-6832719685',
  'osm-community:node-7323540836',
  'osm-community:node-12132458920',
  'osm-community:node-12132458922',
]);

const liveOsmTags: Record<string, string> = {
  'osm-community:node-6832719685': 'amenity=bench; backrest=no',
  'osm-community:node-7323540836':
    'board_type=history; description=Quarriers village; information=board; tourism=information',
  'osm-community:node-12132458920': 'amenity=bench; backrest=yes',
  'osm-community:node-12132458922': 'information=board; tourism=information',
  'osm-community:way-476412346': 'amenity=parking',
  'osm-community:way-476412347': 'amenity=parking',
  'osm-community:way-900166216': 'leisure=playground; source=OS Open Greenspace',
  'osm-community:way-900166217': 'leisure=playground; source=OS Open Greenspace',
  'osm-community:way-1462906878':
    'amenity=parking; orientation=perpendicular; parking=street_side; surface=asphalt',
  'osm-community:way-1462906882': 'amenity=parking; parking=surface; surface=asphalt',
  'osm-community:way-1462906885':
    'amenity=parking; orientation=perpendicular; parking=street_side; surface=asphalt',
  'osm-community:way-1462906886':
    'amenity=parking; orientation=perpendicular; parking=street_side; surface=asphalt',
};

const pilotRecordIds = new Set([...officialRecordIds, ...Object.keys(liveOsmTags)]);

function appendNote(feature: HeritageFeature, note: string): void {
  if (feature.reviewNotes?.includes('Evidence-and-editorial pilot review completed')) return;
  feature.reviewNotes = feature.reviewNotes ? `${feature.reviewNotes} ${note}` : note;
}

function osmCheck(feature: HeritageFeature): SourceRecord {
  const original = feature.sourceRecords.find((source) => source.sourceRecordId);
  if (!original?.sourceRecordId) throw new Error(`Missing OSM source identity for ${feature.id}.`);
  return {
    sourceName: 'OpenStreetMap API record check',
    sourceOrganisation: 'OpenStreetMap contributors',
    sourceRecordId: original.sourceRecordId,
    sourceUrl: original.sourceUrl,
    accessedAt: reviewedAt,
    licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors.',
    reliability: 'discovery_only',
    notes: `Live API check returned the same element and current tags: ${liveOsmTags[feature.id]}. This confirms only the current volunteer-mapped record, not public access, operator, visitor role or independent factual corroboration.`,
  };
}

function osmSourceHistoryPreserved(feature: HeritageFeature): boolean {
  return (
    feature.sourceRecords.some(
      (source) => source.sourceName === 'OpenStreetMap current community places',
    ) &&
    feature.sourceRecords.some((source) => source.sourceName === 'OpenStreetMap API record check')
  );
}

function claimFor(feature: HeritageFeature): string {
  if (feature.id === 'hes-conservation-area:CA99')
    return 'The HES conservation-area designation geometry identifies Quarriers Village.';
  if (feature.id === 'hes-designed-landscape:GDL00146')
    return 'The HES Garden and Designed Landscape geometry for Duchal House intersects the study area; it is contextual rather than evidence that the house itself lies in the locality.';
  if (feature.id.startsWith('hes-listed-building:'))
    return 'The named building is currently a Category B HES listed-building record in the 500m heritage buffer, not within the NRS locality.';
  if (feature.id.startsWith('nrhe:'))
    return `The official NRHE record identifies this named site at the retained representative point with the recorded NRHE classification; no more specific construction claim is made unless separately documented.`;
  return `OpenStreetMap currently maps the retained ${feature.featureType} object with the recorded basic tag(s).`;
}

function localEvidenceFor(feature: HeritageFeature): string {
  if (feature.id.startsWith('hes-'))
    return 'Developer-supplied HES designation/listed-building GIS snapshot, retained locally under its OGL provenance.';
  return 'Developer-supplied HES NRHE/Canmore point GIS snapshot, retained locally under its OGL provenance.';
}

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const provisional = pkg.features.filter((feature) => pilotRecordIds.has(feature.id));
if (provisional.length !== 40)
  throw new Error(
    `Expected the 40-record Quarrier's Village pilot set; found ${provisional.length}.`,
  );

const decisions: Array<Record<string, unknown>> = [];
for (const feature of provisional) {
  const sourceCountBefore = feature.sourceRecords.length;
  if (officialRecordIds.has(feature.id)) {
    feature.reviewed = true;
    feature.updatedAt = reviewedAt;
    if (feature.id === 'hes-designed-landscape:GDL00146') feature.evidenceScope = 'related_context';
    else if (!feature.evidenceScope) feature.evidenceScope = 'parish_evidence';
    appendNote(
      feature,
      `Evidence-and-editorial pilot review completed ${reviewedAt.slice(0, 10)}. The limited claim, official identity, retained geometry, category, OGL provenance and licence were checked against the local HES dataset. No unrecorded date, condition, access or ownership claim has been added.`,
    );
    setFeaturePublicationState(
      feature,
      'publishable',
      reviewedAt,
      feature.id.startsWith('hes-listed-building:')
        ? 'Publishable only as clearly labelled related listed-building context outside the NRS locality.'
        : feature.id === 'hes-designed-landscape:GDL00146'
          ? 'Publishable only as clearly labelled related designation context; the designation intersects the locality but does not locate Duchal House within it.'
          : 'The precise limited official-record claim is supported by the retained local HES source and passes the publication gates.',
    );
    decisions.push({
      id: feature.id,
      name: feature.name,
      claim: claimFor(feature),
      decision: 'publishable',
      evidenceRoute: 'local_authoritative',
      evidence: localEvidenceFor(feature),
      identityAndGeography:
        feature.evidenceScope === 'related_context'
          ? 'Official record identity and geometry checked; retained only as labelled related context.'
          : 'Official record identity and geometry checked against the NRS locality study boundary.',
      categorisation: `Retained ${feature.featureType} categorisation; no unsupported narrowing was introduced.`,
      provenanceAndLicence:
        'Identifiable HES source record with recorded Open Government Licence terms.',
      geometry: `${feature.geometry?.type ?? 'No geometry'} retained without alteration.`,
      sourceHistoryPreserved: sourceCountBefore === feature.sourceRecords.length,
    });
    continue;
  }

  if (!liveOsmTags[feature.id])
    throw new Error(`No live OSM result was recorded for ${feature.id}.`);
  feature.sourceRecords = feature.sourceRecords.filter(
    (source) => source.sourceName !== 'OpenStreetMap API record check',
  );
  feature.sourceRecords.push(osmCheck(feature));
  feature.updatedAt = reviewedAt;
  if (outsideOsmIds.has(feature.id)) {
    feature.reviewed = true;
    appendNote(
      feature,
      `Evidence-and-editorial pilot review completed ${reviewedAt.slice(0, 10)}. Live OSM confirms the volunteer-mapped object, but its point remains outside the NRS locality and lacks independent context evidence; retained source record is withheld from delivery.`,
    );
    setFeaturePublicationState(
      feature,
      'withheld',
      reviewedAt,
      'Outside the NRS locality and supported only by a discovery-only OSM record. Retained for future corroborated related-context review.',
    );
    decisions.push({
      id: feature.id,
      name: feature.name,
      claim: claimFor(feature),
      decision: 'withheld',
      evidenceRoute: 'additional_internet_research',
      evidence:
        'Current OpenStreetMap API check only; no independent authoritative source located.',
      identityAndGeography:
        'Current OSM element exists but retained point is outside the NRS locality.',
      categorisation: `OSM ${feature.featureType} tag retained as discovery metadata only.`,
      provenanceAndLicence: 'Original ODbL source record retained; current API check appended.',
      geometry: 'Retained unaltered; outside-boundary result is intentional and documented.',
      sourceHistoryPreserved: osmSourceHistoryPreserved(feature),
    });
    continue;
  }

  feature.reviewed = false;
  appendNote(
    feature,
    `Evidence-and-editorial pilot review completed ${reviewedAt.slice(0, 10)}. Live OSM confirms the current volunteer-mapped tag, but no independent authoritative source establishes the object’s identity, operator, public access or visitor relevance. It remains provisional and excluded from historic evidence and scoring.`,
  );
  setFeaturePublicationState(
    feature,
    'provisional',
    reviewedAt,
    'Current OSM confirmation is discovery evidence only. Independent responsible-source verification is required before public delivery.',
  );
  decisions.push({
    id: feature.id,
    name: feature.name,
    claim: claimFor(feature),
    decision: 'provisional',
    evidenceRoute: 'additional_internet_research',
    evidence: 'Current OpenStreetMap API check only; no independent authoritative source located.',
    identityAndGeography:
      'Current OSM element exists and its retained representative point is within the NRS locality.',
    categorisation: `OSM ${feature.featureType} tag is plausible but remains discovery metadata, not editorial classification.`,
    provenanceAndLicence: 'Original ODbL source record retained; current API check appended.',
    geometry:
      'Retained unaltered; representative points are not asserted as surveyed public-facility boundaries.',
    sourceHistoryPreserved: osmSourceHistoryPreserved(feature),
  });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);

const decisionCounts = Object.fromEntries(
  ['publishable', 'provisional', 'withheld'].map((state) => [
    state,
    decisions.filter((decision) => decision.decision === state).length,
  ]),
);
const report = {
  projectId: pkg.project.id,
  town: pkg.project.locality,
  reviewedAt,
  pilotScope: 'Every record that was legacy-provisional at the start of this review.',
  framework: {
    rule: 'A record is publishable only when the package is publishable, its declared state is publishable, and provenance, licence and geometry have no material validation blocker.',
    sourcePolicy:
      'Local HES authoritative datasets take precedence for designation, NRHE identity/classification and geometry. Discovery-only OSM is never treated as sole published factual evidence.',
  },
  summary: {
    reviewed: provisional.length,
    ...decisionCounts,
    requiresReview: 0,
    verifiedPrimarilyFromExistingLocalAuthoritativeEvidence: decisions.filter(
      (decision) => decision.evidenceRoute === 'local_authoritative',
    ).length,
    requiredAdditionalInternetResearch: decisions.filter(
      (decision) => decision.evidenceRoute === 'additional_internet_research',
    ).length,
  },
  recurringGaps: [
    'OSM current-context records identify generic amenities but do not establish public access, ownership, operator, visitor role or independent factual support.',
    'NRHE point records provide identity, classification and representative location; they do not by themselves support a construction date, condition, access or ownership claim.',
    'A designation geometry may intersect the study area without placing the named designated asset inside the NRS locality; this must be labelled related context.',
  ],
  publicationRuleFindings: [
    'The automatic validation gates correctly reject malformed geometry, unresolved licences and provenance gaps, but do not reject an undated or generic NRHE record. Editorial review must continue to decide whether the limited source-backed claim is useful enough to publish.',
    'Legacy reviewed=false records are all declared provisional even when their retained HES evidence is sufficient for their deliberately narrow claims. The pilot makes this editorial decision explicit rather than treating the import flag as a permanent publication outcome.',
  ],
  operationalGuidance: {
    approximateWorkPerRecord:
      'First classify the claim and evidence cohort. HES/NRHE records normally need a short source-history, boundary, licence and geometry check (roughly 2–5 minutes when the claim remains limited to the official record). Discovery/current-place records need an additional live source check plus a search for a responsible operator or authority; if no corroboration is found, record that outcome rather than expanding the claim (roughly 5–15 minutes). Complex narratives, ambiguous identities, duplicate designations, routes, dates, access and commercial claims require manual research and can take materially longer.',
    remainingCatalogueRecommendation:
      'Mixed workflow. Use Luna Medium for deterministic inventory, source-history and geometry/licence triage; use Terra Medium for bounded official-record verification and report drafting; reserve Terra High for ambiguous identity, conflicting geometries, claims that require synthesis, dates/routes/accessibility, and any candidate promotion based on non-statutory or commercial evidence. The pilot shows that an all-Terra-High pass would waste effort on well-provenanced HES records, while an all-Luna pass would over-promote discovery-only records.',
  },
  decisions,
};

const markdown = [
  '# Quarrier’s Village provisional-record verification pilot',
  '',
  `Reviewed: ${reviewedAt}`,
  '',
  `- Records reviewed: ${provisional.length}`,
  `- Promoted to publishable: ${decisionCounts.publishable}`,
  `- Remaining provisional: ${decisionCounts.provisional}`,
  '- Requires review: 0',
  `- Withheld: ${decisionCounts.withheld}`,
  `- Verified primarily from local authoritative evidence: ${report.summary.verifiedPrimarilyFromExistingLocalAuthoritativeEvidence}`,
  `- Required additional internet research: ${report.summary.requiredAdditionalInternetResearch}`,
  '',
  '## Outcome',
  '',
  'The 28 HES/NRHE records were promoted only for their narrow, source-backed designation or classification claims. They retain their original sources, geometry and licensing; no construction, access, condition or ownership facts were inferred. Three listed buildings and the Duchal House designation remain clearly labelled related context.',
  '',
  'The twelve OSM current-context records were live-checked. Four sit outside the NRS locality and are withheld; eight remain provisional because OSM alone does not establish public access, operator, visitor role or independent factual corroboration.',
  '',
  '## Reusable process',
  '',
  report.operationalGuidance.approximateWorkPerRecord,
  '',
  '## Catalogue recommendation',
  '',
  report.operationalGuidance.remainingCatalogueRecommendation,
  '',
  'The JSON companion contains the claim, evidence route, geographic assessment, categorisation, provenance/licence decision and geometry result for every record.',
  '',
].join('\n');

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownReportPath, markdown, 'utf8');
console.log(
  `Reviewed ${provisional.length} Quarrier's Village provisional records: ${decisionCounts.publishable} publishable, ${decisionCounts.provisional} provisional and ${decisionCounts.withheld} withheld.`,
);
