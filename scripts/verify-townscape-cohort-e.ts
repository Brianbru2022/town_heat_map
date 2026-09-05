import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ClaimType, HeritageFeature, ProjectPackage, Reliability } from '../src/domain/models';
import { projectPublicClaims } from '../src/domain/claims';
import { assessFeaturePublication, publicProjectPackage } from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

type Outcome = 'mapped_context' | 'verified_access';
type Decision = {
  id: string;
  outcome: Outcome;
  research: { name: string; url: string; reliability: Reliability; finding: string };
  claim?: ClaimType;
  claimNote: string;
};

const triagePath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const packageNames = ['alloa', 'alva', 'biggar', 'culross', 'killin', 'kincardine', 'tillicoultry'];
const checkedAt = new Date();
const checked = checkedAt.toISOString();
const expiresAt = new Date(checkedAt.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
const source = (name: string, url: string, reliability: Reliability, finding: string) => ({
  name,
  url,
  reliability,
  finding,
});
const decisions: Decision[] = [
  {
    id: 'osm-community:node-1861230548',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'The council asset record describes Alloa Docks as non-operational land; it does not establish visitor access to this mapped viewpoint.',
    ),
    claimNote:
      'Live mapped identity retained only; asset-status evidence is not an access permission.',
  },
  {
    id: 'osm-park:way-81291580',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'No current authority route or access page was found for this exact Earlsfield polygon.',
    ),
    claimNote: 'Live mapped park context only; no access, facilities or suitability claim.',
  },
  {
    id: 'osm-park:way-92352276',
    outcome: 'verified_access',
    research: source(
      'Greenfield Park',
      'https://www.clacks.gov.uk/culture/greenfieldpark/',
      'local_authority',
      'Current council visitor page identifies Greenfield Park in Alloa and describes it as a public park.',
    ),
    claim: 'public_access',
    claimNote:
      'Tier F public-park access only; opening hours, facilities, accessibility and visitor recommendation are not claimed.',
  },
  {
    id: 'osm-park:way-92352291',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'No current access authority page was found for this exact bowling-club polygon.',
    ),
    claimNote: 'Live mapped context only; a sports-ground label does not establish public access.',
  },
  {
    id: 'osm-park:way-94132373',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire cricket',
      'https://www.clacks.gov.uk/learning/cricket/',
      'local_authority',
      'The council identifies the cricket club at The Arns, but does not provide a current public-access condition for this polygon.',
    ),
    claimNote: 'Live mapped context only; no general public-access or event-access claim.',
  },
  {
    id: 'osm-community:node-5061863243',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Core Paths Plan',
      'https://www.clacks.gov.uk/document/2345.pdf',
      'local_authority',
      'Authority mapping provides area context but does not establish access to this exact viewpoint point.',
    ),
    claimNote: 'Live mapped viewpoint context only; no route, safety or access claim.',
  },
  {
    id: 'osm-park:way-166100727',
    outcome: 'verified_access',
    research: source(
      'Johnstone and Cochrane Parks',
      'https://www.clacks.gov.uk/culture/johnstonecochraneparks/',
      'local_authority',
      'Current council page identifies Cochrane Park, Alva as a public park.',
    ),
    claim: 'public_access',
    claimNote:
      'Tier F public-park access only; no facilities, accessibility or recommendation claim.',
  },
  {
    id: 'osm-park:way-423424487',
    outcome: 'verified_access',
    research: source(
      'Johnstone and Cochrane Parks',
      'https://www.clacks.gov.uk/culture/johnstonecochraneparks/',
      'local_authority',
      'Current council page identifies Johnstone Park, Alva as a public park.',
    ),
    claim: 'public_access',
    claimNote:
      'Tier F public-park access only; no facilities, accessibility or recommendation claim.',
  },
  {
    id: 'osm-community:node-4411862438',
    outcome: 'mapped_context',
    research: source(
      'South Lanarkshire Council parks information',
      'https://www.southlanarkshire.gov.uk/info/200168/parks_and_open_spaces',
      'local_authority',
      'No current authority or route-operator evidence linked this exact Biggar viewpoint point to public access.',
    ),
    claimNote: 'Live mapped viewpoint context only; no access or visitor claim.',
  },
  {
    id: 'osm-community:node-11848606894',
    outcome: 'mapped_context',
    research: source(
      'Visit Culross nature and outdoors',
      'https://www.visitculross.com/naturandoutdoors',
      'local_authority',
      'Current tourism information confirms the Fife Coastal Path through Culross, but does not independently establish the present condition of this specific signboard.',
    ),
    claimNote: 'Mapped signboard context only; no route-status claim is attached to the signboard.',
  },
  {
    id: 'osm-community:node-12905986604',
    outcome: 'mapped_context',
    research: source(
      'Visit Culross nature and outdoors',
      'https://www.visitculross.com/naturandoutdoors',
      'local_authority',
      'No current responsible-body source establishes access to this exact viewpoint point.',
    ),
    claimNote: 'Live mapped viewpoint context only; no public-access or safety claim.',
  },
  {
    id: 'osm-community:node-12909451261',
    outcome: 'mapped_context',
    research: source(
      'National Trust for Scotland Culross planning',
      'https://www.nts.org.uk/visit/places/culross/planning-your-visit',
      'official_non_statutory',
      'The current page concerns National Trust visitor areas, but does not identify this exact Hanging Gardens viewpoint.',
    ),
    claimNote:
      'Live mapped viewpoint context only; no inferred access from nearby visitor information.',
  },
  {
    id: 'osm-community:way-930975377',
    outcome: 'mapped_context',
    research: source(
      'Visit Culross nature and outdoors',
      'https://www.visitculross.com/naturandoutdoors',
      'local_authority',
      'No current responsible-body source establishes public access to this Parkhouse manor-house polygon.',
    ),
    claimNote: 'Mapped identity/location only; private-estate access is not inferred.',
  },
  {
    id: 'osm-park:way-932845024',
    outcome: 'mapped_context',
    research: source(
      'National Trust for Scotland Culross planning',
      'https://www.nts.org.uk/visit/places/culross/planning-your-visit',
      'official_non_statutory',
      'Current visitor information does not identify this exact Old School Yard garden polygon.',
    ),
    claimNote: 'Mapped garden context only; no public-access claim.',
  },
  {
    id: 'osm-park:way-94351879',
    outcome: 'mapped_context',
    research: source(
      'Visit Culross nature and outdoors',
      'https://www.visitculross.com/naturandoutdoors',
      'local_authority',
      'No current access authority evidence was found for this exact Playing Field polygon.',
    ),
    claimNote: 'Mapped context only; playing-field access rights are not inferred.',
  },
  {
    id: 'osm-park:way-94516038',
    outcome: 'mapped_context',
    research: source(
      'National Trust for Scotland Culross planning',
      'https://www.nts.org.uk/visit/places/culross/planning-your-visit',
      'official_non_statutory',
      'Current visitor information does not identify this exact Abbey Mansion House garden polygon.',
    ),
    claimNote: 'Mapped garden context only; no public-access claim.',
  },
  {
    id: 'osm-park:way-94710202',
    outcome: 'verified_access',
    research: source(
      'Dunimarle Castle visit information',
      'https://www.dunimarlecastle.co.uk/visit-us',
      'official_non_statutory',
      'Current estate page says entrance is via Chapel Gate and access is limited to its advertised opening arrangements/guided tours.',
    ),
    claim: 'public_access',
    claimNote:
      'Tier F conditional visitor access only; no hours, accessibility, facilities or general-access claim is carried.',
  },
  {
    id: 'osm-park:way-94725851',
    outcome: 'mapped_context',
    research: source(
      'Dunimarle Castle visit information',
      'https://www.dunimarlecastle.co.uk/visit-us',
      'official_non_statutory',
      'Current nearby estate information does not identify or authorise access to this separate Blair Castle garden polygon.',
    ),
    claimNote: 'Mapped garden context only; no private-estate access inference.',
  },
  {
    id: 'osm-community:node-368979641',
    outcome: 'verified_access',
    research: source(
      'Loch Lomond and The Trossachs National Park waterfalls',
      'https://www.lochlomond-trossachs.org/things-to-see/waterfalls/',
      'local_authority',
      'Current National Park visitor guidance identifies the Falls of Dochart and describes access from the bridge.',
    ),
    claim: 'route_access',
    claimNote:
      'Tier O access-to-viewing claim only; no independent difficulty, accessibility, dog or visitor-recommendation claim.',
  },
  {
    id: 'osm-community:node-5514420225',
    outcome: 'mapped_context',
    research: source(
      'Killin Heritage Trail',
      'https://www.lochlomond-trossachs.org/discover-the-park/our-heritage-culture/heritage-walks/killin-heritage-trail/',
      'local_authority',
      'Current route guidance does not identify this anonymous waterfall point.',
    ),
    claimNote: 'Mapped waterfall context only; no public-access or passability claim.',
  },
  {
    id: 'osm-community:node-6690804225',
    outcome: 'mapped_context',
    research: source(
      'Killin Heritage Trail',
      'https://www.lochlomond-trossachs.org/discover-the-park/our-heritage-culture/heritage-walks/killin-heritage-trail/',
      'local_authority',
      'Current route guidance does not identify this exact viewpoint point.',
    ),
    claimNote: 'Mapped viewpoint context only; no public-access or safety claim.',
  },
  {
    id: 'osm-park:way-543305423',
    outcome: 'mapped_context',
    research: source(
      'Killin Heritage Trail',
      'https://www.lochlomond-trossachs.org/discover-the-park/our-heritage-culture/heritage-walks/killin-heritage-trail/',
      'local_authority',
      'Current trail guidance supplies locality context but no exact public-access evidence for Breadalbane Park.',
    ),
    claimNote: 'Mapped park context only; no access, facility or suitability claim.',
  },
  {
    id: 'osm-community:node-3883540476',
    outcome: 'mapped_context',
    research: source(
      'Fife Council outdoor access',
      'https://www.fife.gov.uk/community-life/parks-allotments-core-paths/outdoor-access',
      'local_authority',
      'Current council guidance confirms the Fife Coastal Path as a local long-distance route, but not the current condition of this specific arch artwork.',
    ),
    claimNote: 'Mapped artwork context only; no route or access claim attached to the artwork.',
  },
  {
    id: 'osm-community:node-11807355552',
    outcome: 'mapped_context',
    research: source(
      'Tillicoultry Glen',
      'https://www.clacks.gov.uk/visiting/tillicoultryglen/',
      'local_authority',
      'Current council closure advice concerns parts of the Glen path, but does not establish access to this exact waterfall point.',
    ),
    claimNote:
      'Mapped waterfall context only; no passability claim. Current Glen closure is recorded as an unresolved nearby restriction.',
  },
  {
    id: 'osm-community:node-11822229938',
    outcome: 'mapped_context',
    research: source(
      'Tillicoultry Glen',
      'https://www.clacks.gov.uk/visiting/tillicoultryglen/',
      'local_authority',
      'Current council closure advice concerns parts of the Glen path, but does not establish access to this exact waterfall point.',
    ),
    claimNote:
      'Mapped waterfall context only; no passability claim. Current Glen closure is recorded as an unresolved nearby restriction.',
  },
  {
    id: 'osm-community:node-1446890832',
    outcome: 'mapped_context',
    research: source(
      'Tillicoultry Glen',
      'https://www.clacks.gov.uk/visiting/tillicoultryglen/',
      'local_authority',
      'Current council closure advice concerns parts of the Glen path, but does not establish access to this exact waterfall point.',
    ),
    claimNote:
      'Mapped waterfall context only; no passability claim. Current Glen closure is recorded as an unresolved nearby restriction.',
  },
  {
    id: 'osm-park:way-1269318858',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'No current responsible-body source identifies access conditions for this exact community-garden polygon.',
    ),
    claimNote: 'Mapped garden context only; no access, opening or community-use claim.',
  },
  {
    id: 'osm-park:way-166960629',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'The current asset register identifies an operational Recreation Ground, but its geometry does not establish that it is this exact public-park polygon.',
    ),
    claimNote: 'Mapped park context only; asset status is not used as a public-access claim.',
  },
  {
    id: 'osm-park:way-656830978',
    outcome: 'mapped_context',
    research: source(
      'Clackmannanshire Council estates asset register',
      'https://www.clacks.gov.uk/form/1128.pdf',
      'local_authority',
      'No current responsible-body page establishes access conditions for this exact Hepburn Park polygon.',
    ),
    claimNote: 'Mapped park context only; no public-access or facilities claim.',
  },
];

const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const ids = triage.records
  .filter((r) => r.primaryCohort === 'E')
  .map((r) => r.recordId)
  .sort();
const membershipSha256 = createHash('sha256')
  .update(`${ids.join('\n')}\n`)
  .digest('hex');
if (
  ids.length !== 29 ||
  new Set(ids).size !== 29 ||
  decisions.length !== 29 ||
  new Set(decisions.map((d) => d.id)).size !== 29 ||
  decisions.some((d) => !ids.includes(d.id))
)
  throw new Error('Frozen Cohort E membership or decision coverage mismatch.');
const packages = await Promise.all(
  packageNames.map(
    async (name) =>
      JSON.parse(await readFile(resolve(`data/projects/${name}.json`), 'utf8')) as ProjectPackage,
  ),
);
const target = new Set(ids);
const features = packages.flatMap((pkg) => pkg.features.filter((f) => target.has(f.id)));
if (features.length !== 29 || new Set(features.map((f) => f.id)).size !== 29)
  throw new Error('Project features do not match frozen Cohort E membership.');
const locate = (feature: HeritageFeature) => {
  const match = feature.id.match(/^osm-(?:community|park):(node|way|relation)-(\d+)$/);
  if (!match) throw new Error(`${feature.id}: unsupported OSM identifier.`);
  return { type: match[1] as 'node' | 'way' | 'relation', id: match[2] };
};
async function verifyOsm(feature: HeritageFeature) {
  const osm = locate(feature);
  const response = await fetch(`https://api.openstreetmap.org/api/0.6/${osm.type}/${osm.id}.json`, {
    headers: {
      'user-agent': 'Townscape controlled verification (contact: local research register)',
    },
  });
  if (!response.ok)
    throw new Error(`${feature.id}: OSM current check returned ${response.status}.`);
  const payload = (await response.json()) as {
    elements?: Array<{
      version?: number;
      timestamp?: string;
      changeset?: number;
      visible?: boolean;
    }>;
  };
  const element = payload.elements?.[0];
  if (!element) throw new Error(`${feature.id}: OSM element is absent.`);
  feature.osmElement = {
    elementType: osm.type,
    elementId: osm.id,
    version: element.version,
    lastEditedAt: element.timestamp,
    changesetId: element.changeset,
    visible: element.visible ?? true,
    status: 'current',
    checkedAt: checked,
  };
  return feature.osmElement;
}
const before = { publishable: 0, provisional: 29, verified: 0, requires_review: 0, withheld: 0 };
const batchReports: Array<Record<string, unknown>> = [];
for (const pkg of packages) {
  const batch = pkg.features.filter((f) => target.has(f.id));
  const preErrors = validateFeatures(pkg.project, pkg.features).filter(
    (i) => i.severity === 'error',
  );
  if (preErrors.length) throw new Error(`${pkg.project.id}: pre-batch validation errors.`);
  const results = [] as Array<Record<string, unknown>>;
  for (const feature of batch) {
    const decision = decisions.find((d) => d.id === feature.id)!;
    const osmElement = await verifyOsm(feature);
    const osmRef = feature.sourceRecords.find(
      (s) => s.reliability === 'discovery_only',
    )?.sourceRecordId;
    if (!osmRef) throw new Error(`${feature.id}: missing OSM source record.`);
    feature.sourceRecords = feature.sourceRecords.filter(
      (s) => !s.sourceRecordId?.startsWith('townscape-cohort-e-'),
    );
    const evidence: HeritageFeature['claimEvidence'] = [
      {
        claim: 'mapped_identity',
        tier: 'mapped_context',
        sourceRecordRefs: [osmRef],
        reviewedAt: checked,
        notes: decision.claimNote,
      },
    ];
    if (decision.outcome === 'verified_access') {
      const ref = `townscape-cohort-e-${checked.slice(0, 10)}`;
      feature.sourceRecords.push({
        sourceName: decision.research.name,
        sourceOrganisation: decision.research.name,
        sourceUrl: decision.research.url,
        sourceRecordId: ref,
        accessedAt: checked,
        reliability: decision.research.reliability,
        notes: `Claim-specific current access research: ${decision.research.finding}`,
      });
      evidence.push({
        claim: decision.claim!,
        tier: decision.claim === 'route_access' ? 'operational' : 'corroborated_facility',
        sourceRecordRefs: [ref],
        reviewedAt: checked,
        expiresAt,
        notes: decision.claimNote,
      });
      feature.publication = {
        state: 'verified',
        profile: 'verified_facility',
        reviewedAt: checked,
        notes: 'Controlled Cohort E verification: only the cited access claim is public.',
      };
    } else {
      feature.publication = {
        state: 'verified',
        profile: 'mapped_context',
        reviewedAt: checked,
        notes:
          'Controlled Cohort E verification: physical mapped identity/location only; all access and visitor claims suppressed.',
      };
    }
    feature.claimEvidence = evidence;
    feature.reviewed = true;
    feature.updatedAt = checked;
    results.push({
      recordId: feature.id,
      currentName: feature.name,
      outcome: decision.outcome,
      research: decision.research,
      claim: decision.claim ?? null,
      claimNote: decision.claimNote,
      osmElement,
      publicClaims: projectPublicClaims(feature).claimEvidence ?? [],
    });
  }
  const postErrors = validateFeatures(pkg.project, pkg.features).filter(
    (i) => i.severity === 'error',
  );
  if (postErrors.length) throw new Error(`${pkg.project.id}: post-batch validation errors.`);
  const delivery = publicProjectPackage(pkg);
  if (!delivery) throw new Error(`${pkg.project.id}: no public delivery.`);
  for (const result of results) {
    const delivered = delivery.features.find((f) => f.id === result.recordId);
    if (!delivered) throw new Error(`${result.recordId}: failed public projection.`);
    const decision = decisions.find((d) => d.id === result.recordId)!;
    if (
      decision.outcome === 'mapped_context' &&
      delivered.publication?.profile !== 'mapped_context'
    )
      throw new Error(`${result.recordId}: stronger claim leaked from mapped context.`);
    if (
      decision.outcome === 'verified_access' &&
      delivered.publication?.profile !== 'verified_facility'
    )
      throw new Error(`${result.recordId}: access claim missing from projection.`);
  }
  const batchNo = String(batchReports.length + 1).padStart(2, '0');
  await writeFile(
    resolve('data/review', `townscape-cohort-e-verification-batch-${batchNo}.json`),
    `${JSON.stringify({ projectId: pkg.project.id, checkedAt: checked, preflightValidationErrors: 0, postBatchValidationErrors: 0, publicProjection: 'passed', recordResults: results }, null, 2)}\n`,
  );
  // Package IDs use public slugs while the canonical source package filenames
  // use town names. Write back to the same ordered source package, not a
  // shadow project-ID file.
  await writeFile(
    resolve('data/projects', `${packageNames[batchReports.length]}.json`),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  batchReports.push({
    projectId: pkg.project.id,
    records: batch.length,
    validation: 'passed with zero errors',
    publicProjection: 'passed',
  });
}
const after = features.reduce(
  (out, feature) => {
    const pkg = packages.find((p) => p.project.id === feature.projectId)!;
    out[assessFeaturePublication(pkg, feature).effectiveState]++;
    return out;
  },
  { publishable: 0, provisional: 0, verified: 0, requires_review: 0, withheld: 0 } as Record<
    string,
    number
  >,
);
const mapped = decisions.filter((d) => d.outcome === 'mapped_context');
const access = decisions.filter((d) => d.outcome === 'verified_access');
const report = {
  registerType: 'controlled Cohort E route/access/outdoor decision register',
  checkedAt: checked,
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  sourceTriage: {
    path: 'data/review/townscape-provisional-verification-triage-2026-09-03.json',
    exactCohort: 'E',
    exactRecords: 29,
    membershipSha256,
    inputSha256: createHash('sha256')
      .update(await readFile(triagePath))
      .digest('hex'),
  },
  summary: {
    tierMMappedContext: mapped.length,
    independentlyVerifiedRouteOrAccess: access.length,
    tierEEditorialSupported: 0,
    remainingProvisional: 0,
    requiringReview: 0,
    withheldOrOutOfScope: 0,
    unsupportedClaimsSuppressed: [
      'public_access except five cited claims',
      'route status except Falls of Dochart access claim',
      'closures/restrictions at uncorrelated points',
      'safety',
      'accessibility',
      'dog suitability',
      'difficulty',
      'facilities',
      'visitor recommendation',
      'editorial description',
    ],
    evidenceUsage: {
      primaryOrAuthoritativeClaimEvidence: access.length,
      secondaryClaimEvidence: 0,
      currentResearchSourcesRecorded: decisions.length,
    },
    publicationTotals: { before, after },
  },
  contradictoryOrStaleEvidence: [
    {
      recordIds: [
        'osm-community:node-11807355552',
        'osm-community:node-11822229938',
        'osm-community:node-1446890832',
      ],
      source: 'https://www.clacks.gov.uk/visiting/tillicoultryglen/',
      note: 'Current council closure applies to part of Tillicoultry Glen path, but current evidence does not correlate the restriction to each anonymous waterfall pin; all remain Tier M only.',
    },
    {
      recordId: 'osm-community:node-1861230548',
      source: 'https://www.clacks.gov.uk/form/1128.pdf',
      note: 'Council asset register calls Alloa Docks non-operational; that is not proof of viewpoint access or closure, so no access claim is published.',
    },
  ],
  rulesApplied: [
    'Each Cohort E OSM object was checked live against the OSM API for mapped identity context.',
    'OSM supports Tier M only and is not used to establish legal access, route status, safety, accessibility, difficulty or recommendation.',
    'Every stronger claim has claim-specific current authority/operator evidence and a 180-day review expiry.',
    'No visitor score, town rating or scoring methodology was changed.',
  ],
  decisions,
  batches: batchReports,
};
await writeFile(
  resolve('data/review/townscape-cohort-e-route-access-decision-register-2026-09-04.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve('data/review/townscape-cohort-e-route-access-decision-register-2026-09-04.md'),
  `# Cohort E route/access/outdoor decision register\n\nChecked: ${checked}\n\n- Exact cohort: **29**\n- Membership SHA-256: **${membershipSha256}**\n- Tier M mapped-context records: **${mapped.length}**\n- Independently verified route/access claims: **${access.length}**\n- Tier E/editorial claims supported: **0**\n- Remaining provisional / review / withheld: **0 / 0 / 0**\n\nAll 29 OSM objects were checked live. The 24 Tier M records expose physical identity/location only. Five current authority/operator sources support narrowly scoped route/access claims. No secondary source supports a public claim.\n\n## Suppressed claims\n\nAccess, passability, closure, safety, accessibility, dog suitability, difficulty, facilities and recommendation claims are suppressed unless expressly listed in the JSON decision entries. The Tillicoultry Glen closure was not applied to anonymous pins without a reliable location correlation.\n\n## Publication totals\n\nBefore: 0 publishable, 29 provisional, 0 requires review, 0 withheld.\n\nAfter: ${after.publishable} publishable, ${after.provisional} provisional, ${after.requires_review} requires review, ${after.withheld} withheld.\n\n## Validation\n\nEach of seven reversible project batches passed pre/post data validation and public-projection checks; batch records are retained beside this register.\n`,
);
console.log(
  `Cohort E complete: ${mapped.length} Tier M; ${access.length} verified access; membership SHA-256 ${membershipSha256}`,
);
