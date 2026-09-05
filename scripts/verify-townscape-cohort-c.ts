import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectPackage, Reliability } from '../src/domain/models';
import { projectPublicClaims } from '../src/domain/claims';
import {
  assessFeaturePublication,
  publicProjectPackage,
  setFeaturePublicationState,
} from '../src/domain/publication';
import { validateFeatures } from '../src/domain/validation';

type Outcome = 'operating' | 'mapped_context' | 'provisional' | 'review' | 'withheld';
type Decision = {
  id: string;
  outcome: Outcome;
  source?: [string, string, string, Reliability];
  note: string;
  renamedTo?: string;
};

const triagePath = resolve('data/review/townscape-provisional-verification-triage-2026-09-03.json');
const names = ['alloa', 'alva', 'biggar', 'culross', 'killin', 'kincardine', 'tillicoultry'];
const checkedAt = new Date();
const expiresAt = new Date(checkedAt.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
const decisions: Decision[] = [
  [
    'node-10657179791',
    'operating',
    'Discover Clackmannanshire shopping directory',
    'Discover Clackmannanshire',
    'https://discoverclackmannanshire.com/shopping-in-alloa',
    'local_authority',
    'Current council tourism directory identifies Celebrations as an Alloa shop.',
  ],
  [
    'node-10657179804',
    'provisional',
    undefined,
    undefined,
    undefined,
    undefined,
    'Historic licensing material is not current-operation evidence; no sufficiently current independent operator or authority source found.',
  ],
  [
    'node-13648474029',
    'review',
    undefined,
    undefined,
    undefined,
    undefined,
    'A current food-hygiene mirror marks the authority entry archived after a 2025 inspection; this is a material conflict but does not prove closure.',
  ],
  [
    'node-13662835231',
    'operating',
    'Restaurant Guru current listing',
    'Restaurant Guru',
    'https://restaurantguru.com/Enjoy-Alloa',
    'secondary',
    'Recent 2026 reviews and a current listing identify Enjoy at Alloa High Street as operating.',
  ],
  [
    'node-7500478539',
    'operating',
    'ASDA Alloa Cafe',
    'ASDA',
    'https://storelocator.asda.com/scotland/alloa/whins-road/cafe',
    'official_non_statutory',
    'Current operator store locator identifies ASDA Alloa Cafe at Whins Road.',
  ],
  [
    'way-318390943',
    'operating',
    'Alba Claremont',
    'Alba Claremont',
    'https://albaclaremont.co.uk/',
    'official_non_statutory',
    'Current operator site offers dining and room booking in Alloa.',
  ],
  [
    'node-13638168004',
    'operating',
    'Little Owls Cafe',
    'Little Owls Cafe',
    'https://www.littleowlscafe.co.uk/',
    'official_non_statutory',
    'Current operator site identifies Little Owls at 86 Stirling Street, Alva.',
  ],
  [
    'node-5879489144',
    'operating',
    'Bayne’s shop directory',
    'Bayne’s the Family Bakers',
    'https://baynes.co.uk/our-shops/',
    'official_non_statutory',
    'Current operator shop directory lists Alva.',
  ],
  [
    'node-10550528510',
    'operating',
    'The Barony Restaurant',
    'The Barony Restaurant',
    'https://www.barony-biggar.co.uk/home/',
    'official_non_statutory',
    'Current operator site accepts bookings at 55 High Street, Biggar.',
  ],
  [
    'node-10550529710',
    'provisional',
    undefined,
    undefined,
    undefined,
    undefined,
    'The online shop is current but the inspected page does not establish this Biggar premises.',
  ],
  [
    'node-10550529712',
    'operating',
    'Restaurant Guru current listing',
    'Restaurant Guru',
    'https://restaurantguru.com/Zest-Biggar',
    'secondary',
    'Recent 2026 listing and reviews identify Zest at 69 High Street, Biggar.',
  ],
  [
    'node-10550530110',
    'operating',
    'The Coffee Spot directory listing',
    'Yell',
    'https://www.yell.com/biz/the-coffee-spot-biggar-2476651/',
    'secondary',
    'Current directory listing identifies The Coffee Spot at 152 High Street, Biggar.',
  ],
  [
    'node-10553226217',
    'operating',
    'Elphinstone Hotel',
    'Elphinstone Hotel',
    'https://www.elphinstonehotel.co.uk/',
    'official_non_statutory',
    'Current operator site offers restaurant and room booking at 145 High Street, Biggar.',
  ],
  [
    'node-10934143056',
    'operating',
    'Biggar cafés listing',
    'Tripadvisor',
    'https://www.tripadvisor.com/Restaurants-g551840-c8-Biggar_South_Lanarkshire_Scotland.html',
    'secondary',
    'Current 2026 directory lists Aroma Cafe as open in Biggar.',
  ],
  [
    'node-10937125607',
    'operating',
    'The Oriental current listing',
    'Restaurant Guru',
    'https://restaurantguru.com/The-Oriental-Biggar',
    'secondary',
    'Current 2026 listing identifies The Oriental as open in Biggar.',
  ],
  [
    'node-12140732695',
    'mapped_context',
    undefined,
    undefined,
    undefined,
    undefined,
    'Current tourism evidence confirms the West Fife Woodlands Way, but does not independently establish this particular marker’s current physical state.',
  ],
  [
    'node-1319913221',
    'operating',
    'Visit Culross food and drink',
    'Visit Culross',
    'https://www.visitculross.com/foodanddrink',
    'local_authority',
    'Current tourism listing confirms the successor at this cafe location is Cobbled Lane, formerly The Biscuit Café.',
    'Cobbled Lane',
  ],
  [
    'node-4995290457',
    'operating',
    'The Mercat',
    'The Mercat',
    'https://the-mercat.com/',
    'official_non_statutory',
    'Current operator site identifies The Mercat cafe and shop at The Cross, Culross.',
    'The Mercat',
  ],
  [
    'node-4995290461',
    'operating',
    'Bessie’s Café',
    'National Trust for Scotland',
    'https://www.nts.org.uk/visit/places/culross/highlights/bessies-caf%C3%A9',
    'official_non_statutory',
    'Current operator page identifies Bessie’s Café at Culross Palace.',
  ],
  [
    'node-1834676847',
    'operating',
    'Falls of Dochart Inn café',
    'Falls of Dochart Inn',
    'https://www.fallsofdochart.co.uk/food-and-drink/our-cafe/',
    'official_non_statutory',
    'Current operator page identifies its Killin tearoom/cafe.',
  ],
  [
    'node-335564591',
    'operating',
    'Capercaillie current listing',
    'Big Red Directory',
    'https://www.bigreddirectory.com/capercaillie-killin',
    'secondary',
    'Current directory listing identifies Capercaillie restaurant on Main Street, Killin.',
  ],
  [
    'node-5459661392',
    'operating',
    'Escape in Killin current listing',
    'BizSeek',
    'https://www.bizseek.co.uk/escape-in-killin-01567-820212',
    'secondary',
    'Current directory listing identifies Escape in Killin at Myrtle Grove, Main Street.',
  ],
  [
    'node-5459670520',
    'operating',
    'Kula food-hygiene record',
    'Food Standards Agency',
    'https://ratings.food.gov.uk/business/1885889/kula-killin/online-ratings',
    'official_non_statutory',
    'Authority record identifies Kula as a Killin cafe following a November 2025 inspection.',
  ],
  [
    'node-5914517399',
    'mapped_context',
    undefined,
    undefined,
    undefined,
    undefined,
    'No current responsible authority source establishes a staffed visitor-information operation at this mapped point.',
  ],
  [
    'way-89971785',
    'mapped_context',
    undefined,
    undefined,
    undefined,
    undefined,
    'Historic tourist-information references are stale; no current official source establishes an operating information office.',
  ],
  [
    'node-10990017763',
    'operating',
    'Marco’s Kitchen current listing',
    'Restaurant Guru',
    'https://restaurantguru.com/Marcos-Kitchen-Kincardine-Scotland',
    'secondary',
    'Current 2026 listing identifies Marco’s Kitchen as open in Kincardine.',
  ],
  [
    'node-11104464562',
    'operating',
    'The Puttery',
    'Tulliallan Golf Club',
    'https://tulliallangolf.co.uk/the-club/the-puttery/',
    'official_non_statutory',
    'Current golf-club operator page identifies The Puttery near Kincardine and welcomes non-members.',
  ],
  [
    'node-12513969929',
    'operating',
    'Bayne’s shop directory',
    'Bayne’s the Family Bakers',
    'https://baynes.co.uk/our-shops/',
    'official_non_statutory',
    'Current operator shop directory lists Kincardine High Street.',
  ],
  [
    'node-11780574253',
    'provisional',
    undefined,
    undefined,
    undefined,
    undefined,
    'No sufficiently current operator, authority or reliable directory evidence found for West End Bakes.',
  ],
  [
    'node-13634000252',
    'operating',
    'Card Factory current listing',
    'BizSeek',
    'https://www.bizseek.co.uk/card-factory_825q-01259-751711',
    'secondary',
    'Current directory listing identifies Card Factory at Sterling Mills, Tillicoultry.',
  ],
  [
    'node-3265969946',
    'operating',
    'Mickey Buns food-hygiene record',
    'Food Standards Agency',
    'https://ratings.food.gov.uk/business/1551654/mickey-buns-tillicoultry',
    'official_non_statutory',
    'Authority record identifies Mickey Buns at 103 High Street following a September 2025 inspection.',
  ],
  [
    'node-9431156493',
    'operating',
    'BB’s Coffee & Muffins current listing',
    'Tripadvisor',
    'https://www.tripadvisor.co.uk/Restaurant_Review-g551955-d8317941-Reviews-BB_s_Coffee_Muffins-Tillicoultry_Clackmannanshire_Scotland.html',
    'secondary',
    'Current 2026 listing and recent reviews identify BB’s at Sterling Mills.',
  ],
  [
    'node-9431214265',
    'mapped_context',
    undefined,
    undefined,
    undefined,
    undefined,
    'The generic OSM name and nearby but non-coincident Penny Licks evidence do not establish this exact venue identity.',
  ],
  [
    'way-1022597762',
    'operating',
    'Mill Cafe current listing',
    'Tripadvisor',
    'https://www.tripadvisor.co.uk/Restaurant_Review-g551955-d8524600-Reviews-Mill_Cafe-Tillicoultry_Clackmannanshire_Scotland.html',
    'secondary',
    'Current 2026 listing identifies The Mill Cafe within Sterling Furniture.',
  ],
  [
    'way-1271991625',
    'provisional',
    undefined,
    undefined,
    undefined,
    undefined,
    'No sufficiently current independent source found for Lily House at this exact Tillicoultry location.',
  ],
  [
    'way-187304263',
    'operating',
    'Costa Tillicoultry',
    'Costa Coffee',
    'https://www.costa.co.uk/stores/tillicoultry',
    'official_non_statutory',
    'Current operator store locator identifies Costa at Sterling Mills, Tillicoultry.',
  ],
  [
    'way-320099376',
    'operating',
    'Penny-licks current listing',
    'Yell',
    'https://www.yell.com/biz/penny-licks-tillicoultry-10317031/',
    'secondary',
    'Current directory listing identifies Penny-licks at 120 High Street, Tillicoultry.',
  ],
  [
    'way-389616952',
    'operating',
    'Smugglers Bar & Bistro',
    'CAMRA',
    'https://camra.org.uk/pubs/smugglers-bar-bistro-tillicoultry-168554',
    'secondary',
    'Current specialist directory lists Smugglers Bar & Bistro at 148 High Street and current opening status.',
  ],
  [
    'way-653224884',
    'withheld',
    undefined,
    undefined,
    undefined,
    undefined,
    'A current directory marks Butterfly Inn closed; current evidence identifies a different Mill Cafe operation elsewhere within Sterling Furniture. Closure is retained as a non-public research outcome, not asserted from OSM.',
  ],
  [
    'way-926391362',
    'operating',
    'Bayne’s shop directory',
    'Bayne’s the Family Bakers',
    'https://baynes.co.uk/our-shops/',
    'official_non_statutory',
    'Current operator shop directory lists Tillicoultry High Street.',
  ],
  [
    'way-929914355',
    'operating',
    'Village Inn current ordering listing',
    'Just Eat',
    'https://www.just-eat.co.uk/restaurants-village-inn-tillicoultry/menu',
    'secondary',
    'Current ordering platform lists Village Inn in Tillicoultry.',
  ],
  [
    'way-989738553',
    'provisional',
    undefined,
    undefined,
    undefined,
    undefined,
    'No sufficiently current independent source found for Good Year Chinese at this exact mapped location.',
  ],
  [
    'way-993045924',
    'operating',
    'Tillicoultry restaurant listing',
    'Restaurantji',
    'https://www.restaurantji.co.uk/scotland/tillicoultry/',
    'secondary',
    'Current locality listing identifies Laura’s Tilly Tearoom at 10A Bank Street.',
  ],
].map(
  ([raw, outcome, sourceName, sourceOrganisation, sourceUrl, reliability, note, renamedTo]) => ({
    id: `osm-community:${raw}`,
    outcome: outcome as Outcome,
    source: sourceName
      ? [sourceName, sourceOrganisation!, sourceUrl!, reliability as Reliability]
      : undefined,
    note: note!,
    renamedTo,
  }),
);

const triage = JSON.parse(await readFile(triagePath, 'utf8')) as {
  records: Array<{ recordId: string; primaryCohort: string }>;
};
const cohortIds = triage.records
  .filter((record) => record.primaryCohort === 'C')
  .map((record) => record.recordId)
  .sort();
const membershipSha256 = createHash('sha256')
  .update(`${cohortIds.join('\n')}\n`)
  .digest('hex');
if (cohortIds.length !== 43 || new Set(cohortIds).size !== 43)
  throw new Error('Cohort C membership mismatch.');
if (decisions.length !== 43 || new Set(decisions.map((decision) => decision.id)).size !== 43)
  throw new Error('Decision register is not one-to-one with Cohort C.');
if (decisions.some((decision) => !cohortIds.includes(decision.id)))
  throw new Error('Decision outside Cohort C.');
const packages = await Promise.all(
  names.map(
    async (name) =>
      JSON.parse(await readFile(resolve(`data/projects/${name}.json`), 'utf8')) as ProjectPackage,
  ),
);
const idSet = new Set(cohortIds);
const features = packages.flatMap((pkg) => pkg.features.filter((feature) => idSet.has(feature.id)));
if (features.length !== 43 || new Set(features.map((feature) => feature.id)).size !== 43)
  throw new Error('Project packages do not match frozen membership.');
function totals() {
  return features.reduce(
    (out, feature) => {
      const pkg = packages.find((candidate) => candidate.project.id === feature.projectId)!;
      out[assessFeaturePublication(pkg, feature).effectiveState] += 1;
      return out;
    },
    { publishable: 0, provisional: 0, verified: 0, requires_review: 0, withheld: 0 } as Record<
      string,
      number
    >,
  );
}
// The frozen triage defines this entire cohort as effective provisional prior
// to this controlled operation pass. Do not derive this baseline from a
// rerun's already-mutated package state.
const before = {
  publishable: 0,
  provisional: 43,
  verified: 0,
  requires_review: 0,
  withheld: 0,
};
const batchReports: Array<Record<string, unknown>> = [];
for (const pkg of packages) {
  const batch = pkg.features.filter((feature) => idSet.has(feature.id));
  const preErrors = validateFeatures(pkg.project, pkg.features).filter(
    (issue) => issue.severity === 'error',
  );
  if (preErrors.length) throw new Error(`${pkg.project.id}: validation failed before batch.`);
  const batchDecisions = batch.map((feature) => ({
    feature,
    decision: decisions.find((candidate) => candidate.id === feature.id)!,
  }));
  for (const { feature, decision } of batchDecisions) {
    if (decision.renamedTo) {
      feature.alternativeNames = [...new Set([feature.name, ...feature.alternativeNames])];
      feature.name = decision.renamedTo;
    }
    if (decision.outcome === 'operating') {
      const [sourceName, sourceOrganisation, sourceUrl, reliability] = decision.source!;
      const sourceRecordId = `townscape-current-operation-${checkedAt.toISOString().slice(0, 10)}`;
      feature.sourceRecords = feature.sourceRecords.filter(
        (source) => source.sourceRecordId !== sourceRecordId,
      );
      feature.sourceRecords.push({
        sourceName,
        sourceOrganisation,
        sourceUrl,
        sourceRecordId,
        accessedAt: checkedAt.toISOString(),
        reliability,
        notes:
          'Current-operation research only; no hours, fees, access, facilities, accessibility, quality or recommendation claim is carried.',
      });
      feature.claimEvidence = [
        {
          claim: 'current_operation',
          tier: 'operational',
          sourceRecordRefs: [sourceRecordId],
          reviewedAt: checkedAt.toISOString(),
          expiresAt,
          notes: decision.note,
        },
      ];
      feature.publication = {
        state: 'verified',
        profile: 'verified_facility',
        reviewedAt: checkedAt.toISOString(),
        notes: 'Tier O current operation only; stronger or unrelated claims are suppressed.',
      };
      feature.reviewed = true;
    } else if (decision.outcome === 'mapped_context') {
      feature.claimEvidence = [
        {
          claim: 'mapped_identity',
          tier: 'mapped_context',
          sourceRecordRefs: [feature.sourceRecords[0]!.sourceRecordId!],
          reviewedAt: checkedAt.toISOString(),
          notes: decision.note,
        },
      ];
      feature.publication = {
        state: 'verified',
        profile: 'mapped_context',
        reviewedAt: checkedAt.toISOString(),
        notes: 'Mapped identity/type/location only; no operating claim.',
      };
    } else if (decision.outcome === 'withheld') {
      setFeaturePublicationState(feature, 'withheld', checkedAt.toISOString(), decision.note);
      feature.claimEvidence = [];
    } else {
      setFeaturePublicationState(feature, 'provisional', checkedAt.toISOString(), decision.note);
      feature.claimEvidence = [];
    }
    feature.updatedAt = checkedAt.toISOString();
  }
  const postErrors = validateFeatures(pkg.project, pkg.features).filter(
    (issue) => issue.severity === 'error',
  );
  if (postErrors.length) throw new Error(`${pkg.project.id}: validation failed after batch.`);
  const delivery = publicProjectPackage(pkg);
  if (!delivery) throw new Error(`${pkg.project.id}: public delivery is unavailable.`);
  for (const { feature, decision } of batchDecisions) {
    const delivered = delivery.features.find((candidate) => candidate.id === feature.id);
    if (decision.outcome === 'withheld' && delivered)
      throw new Error(`${feature.id}: withheld record reached public delivery.`);
    if (decision.outcome === 'operating') {
      if (
        !delivered?.claimEvidence?.some(
          (evidence) => evidence.claim === 'current_operation' && evidence.tier === 'operational',
        )
      )
        throw new Error(`${feature.id}: Tier O claim was not delivered.`);
    }
    if (
      decision.outcome === 'mapped_context' &&
      delivered?.claimEvidence?.some((evidence) => evidence.tier !== 'mapped_context')
    )
      throw new Error(`${feature.id}: mapped-context record exposed a stronger claim.`);
  }
  const recordResults = batchDecisions.map(({ feature, decision }) => ({
    recordId: feature.id,
    currentName: feature.name,
    outcome: decision.outcome,
    source: decision.source?.[2],
    note: decision.note,
    effectiveState: assessFeaturePublication(pkg, feature).effectiveState,
    publicClaims: projectPublicClaims(feature).claimEvidence ?? [],
  }));
  await writeFile(
    resolve(
      'data/review',
      `townscape-cohort-c-verification-batch-${String(batchReports.length + 1).padStart(2, '0')}.json`,
    ),
    `${JSON.stringify({ projectId: pkg.project.id, checkedAt: checkedAt.toISOString(), preflightValidationErrors: 0, postBatchValidationErrors: 0, recordResults }, null, 2)}\n`,
  );
  await writeFile(
    resolve('data/projects', `${names[batchReports.length]}.json`),
    `${JSON.stringify(pkg, null, 2)}\n`,
  );
  batchReports.push({
    projectId: pkg.project.id,
    records: batch.length,
    validation: 'passed with zero errors',
  });
}
const after = totals();
const count = (outcome: Outcome) =>
  decisions.filter((decision) => decision.outcome === outcome).length;
const report = {
  registerType: 'controlled Cohort C business/venue/current-operation decision register',
  checkedAt: checkedAt.toISOString(),
  policy: 'CLAIM_EVIDENCE_POLICY.md',
  sourceTriage: {
    path: 'data/review/townscape-provisional-verification-triage-2026-09-03.json',
    exactCohort: 'C',
    exactRecords: 43,
    membershipSha256,
    inputSha256: createHash('sha256')
      .update(await readFile(triagePath))
      .digest('hex'),
  },
  summary: {
    confirmedCurrentlyOperating: count('operating'),
    publishableAtTierO: count('operating'),
    retainedTierMMappedContext: count('mapped_context'),
    remainingProvisional: count('provisional'),
    requiringReview: count('review'),
    withheldClosedOrSuperseded: count('withheld'),
    claimsSuppressed: [
      'opening_hours',
      'prices_or_fees',
      'public_access',
      'accessibility',
      'facilities',
      'dog_friendliness',
      'booking_availability',
      'quality',
      'visitor_recommendation',
      'editorial_description',
    ],
    primaryEvidence: decisions.filter((d) =>
      ['official_non_statutory', 'local_authority'].includes(d.source?.[3] ?? ''),
    ).length,
    secondaryEvidence: decisions.filter((d) => d.source?.[3] === 'secondary').length,
    publicationTotals: { before, after },
  },
  contradictionsAndStaleSourceCases: decisions
    .filter((decision) => ['review', 'withheld', 'provisional'].includes(decision.outcome))
    .map((decision) => ({ recordId: decision.id, outcome: decision.outcome, note: decision.note })),
  rulesApplied: [
    'Every Tier O claim has an independent, non-OSM source and a 90-day expiry.',
    'OSM remains retained solely for mapped identity/type/location.',
    'No visitor score, town rating or scoring methodology was changed.',
    'Hours, prices, access, accessibility, facilities, dog policy, booking, quality, recommendation and editorial description were not inferred from operation evidence.',
  ],
  decisions: decisions.map((decision) => ({
    ...decision,
    source: decision.source
      ? {
          name: decision.source[0],
          organisation: decision.source[1],
          url: decision.source[2],
          reliability: decision.source[3],
        }
      : undefined,
  })),
  batches: batchReports,
};
await writeFile(
  resolve('data/review/townscape-cohort-c-current-operation-decision-register-2026-09-04.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  resolve('data/review/townscape-cohort-c-current-operation-decision-register-2026-09-04.md'),
  `# Cohort C business/venue/current-operation decision register\n\nChecked: ${checkedAt.toISOString()}\n\n- Exact cohort: **43**\n- Membership SHA-256: **${membershipSha256}**\n- Confirmed operating / Tier O: **${count('operating')}**\n- Tier M mapped context only: **${count('mapped_context')}**\n- Provisional: **${count('provisional')}**\n- Requiring review: **${count('review')}**\n- Withheld: **${count('withheld')}**\n\nPrimary/authority evidence: **${report.summary.primaryEvidence}**; current secondary evidence: **${report.summary.secondaryEvidence}**. All stronger unsupported claims were suppressed.\n\nPublication totals before: ${before.publishable} publishable, ${before.provisional} provisional, ${before.requires_review} requires review, ${before.withheld} withheld.\n\nPublication totals after: ${after.publishable} publishable, ${after.provisional} provisional, ${after.requires_review} requires review, ${after.withheld} withheld.\n`,
);
console.log(
  `Cohort C complete: ${count('operating')} Tier O, ${count('mapped_context')} Tier M, ${count('provisional')} provisional, ${count('review')} review, ${count('withheld')} withheld.`,
);
