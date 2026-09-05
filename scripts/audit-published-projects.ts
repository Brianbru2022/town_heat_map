import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { HeritageFeature, HistoricMapLayer, ProjectPackage } from '../src/domain/models';
import { assessProjectPackage } from '../src/domain/publication';
import { hasHistoricTimelineDate } from '../src/domain/timeline';

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
const jsonReportPath = resolve('data/review/published-project-final-audit.json');
const markdownReportPath = resolve('data/review/published-project-final-audit.md');
const hesCrossCheckLayerId = 'hes-listed-buildings-by-category';

function inPublicScope(feature: HeritageFeature): boolean {
  return feature.evidenceScope !== 'out_of_scope';
}

function isMapHidden(feature: HeritageFeature): boolean {
  return feature.tags.includes('map-hidden') || feature.tags.includes('catalogue-general-view');
}

function isRenderableMap(layer: HistoricMapLayer): boolean {
  return (
    Boolean(layer.tileUrl) &&
    ['xyz', 'wmts', 'wms', 'georeferenced_raster_tiles', 'cog'].includes(layer.layerType)
  );
}

function duplicateOfficialReferences(features: HeritageFeature[]) {
  const references = new Map<string, Set<string>>();
  for (const feature of features) {
    const featureReferences = new Set<string>();
    for (const source of feature.sourceRecords) {
      const id = source.sourceRecordId?.trim();
      if (!id || !/^(?:LB|SM|GDL)\d+$/i.test(id)) continue;
      featureReferences.add(id);
    }
    for (const id of featureReferences)
      references.set(id, new Set([...(references.get(id) ?? []), feature.id]));
  }
  return [...references.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([reference, featureIds]) => ({ reference, featureIds: [...featureIds].sort() }))
    .sort((left, right) => left.reference.localeCompare(right.reference));
}

function countsByCode(records: ReturnType<typeof assessProjectPackage>['records']) {
  const counts = new Map<string, number>();
  for (const issue of records.flatMap((record) => record.blockers)) {
    const code = issue.code ?? 'validation.unclassified';
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

const packages = await Promise.all(
  projectPaths.map(
    async (path) => JSON.parse(await readFile(resolve(path), 'utf8')) as ProjectPackage,
  ),
);

const projects = packages.map((pkg) => {
  const assessment = assessProjectPackage(pkg);
  const inScope = pkg.features.filter(inPublicScope);
  const recordById = new Map(pkg.features.map((feature) => [feature.id, feature]));
  const inScopeAssessments = assessment.records.filter((record) =>
    inPublicScope(recordById.get(record.recordId)!),
  );
  const publishable = inScopeAssessments.filter((record) => record.canPublish);
  const needsRemediation = inScopeAssessments.filter(
    (record) => record.effectiveState !== 'publishable' && record.effectiveState !== 'withheld',
  );
  const historicMaps = pkg.historicMaps.filter((layer) => layer.id !== hesCrossCheckLayerId);
  const mapLayerIssues = historicMaps
    .filter((layer) => !isRenderableMap(layer) || !layer.licence || !layer.attribution)
    .map((layer) => ({
      id: layer.id,
      title: layer.title,
      reasons: [
        ...(!isRenderableMap(layer) ? ['not configured as a selectable browser overlay'] : []),
        ...(!layer.licence ? ['licence is not recorded'] : []),
        ...(!layer.attribution ? ['attribution is not recorded'] : []),
      ],
    }));
  const stateCounts = {
    publishable: publishable.length,
    provisional: inScopeAssessments.filter((record) => record.effectiveState === 'provisional')
      .length,
    verified: inScopeAssessments.filter((record) => record.effectiveState === 'verified').length,
    requiresReview: inScopeAssessments.filter(
      (record) => record.effectiveState === 'requires_review',
    ).length,
    withheld: inScopeAssessments.filter((record) => record.effectiveState === 'withheld').length,
  };
  const status = !assessment.canPublishPackage
    ? 'withheld'
    : needsRemediation.length
      ? publishable.length
        ? 'partially_publishable_requires_remediation'
        : 'requires_review'
      : assessment.summary.advisoryCount
        ? 'publishable_with_advisories'
        : 'publishable';

  return {
    projectId: pkg.project.id,
    town: pkg.project.locality,
    region: pkg.project.region,
    packageDeclaration: assessment.packageState,
    packageUsedLegacyDefault: assessment.usedLegacyDefault,
    status,
    states: stateCounts,
    records: {
      total: pkg.features.length,
      inPublicScope: inScope.length,
      outOfScope: pkg.features.length - inScope.length,
      relatedContext: inScope.filter((feature) => feature.evidenceScope === 'related_context')
        .length,
      publishableMapRecords: publishable.filter((record) => {
        const feature = recordById.get(record.recordId)!;
        return feature.geometry && !isMapHidden(feature);
      }).length,
      historicDateEvidence: inScope.filter(hasHistoricTimelineDate).length,
      legacyDefaulted: inScopeAssessments.filter((record) => record.usedLegacyDefault).length,
    },
    issues: {
      blockerCount: inScopeAssessments.reduce((count, record) => count + record.blockers.length, 0),
      advisoryCount: inScopeAssessments.reduce(
        (count, record) => count + record.advisories.length,
        0,
      ),
      blockersByCode: countsByCode(inScopeAssessments),
    },
    provisionalRecordIds: inScopeAssessments
      .filter((record) => record.effectiveState === 'provisional')
      .map((record) => record.recordId),
    blockerRecords: inScopeAssessments
      .filter((record) => record.effectiveState === 'requires_review')
      .map((record) => ({
        id: record.recordId,
        name: recordById.get(record.recordId)?.name,
        blockers: record.blockers.map((issue) => ({
          code: issue.code,
          field: issue.field,
          message: issue.message,
        })),
      })),
    duplicates: { officialReferenceCollisions: duplicateOfficialReferences(inScope) },
    historicMaps: {
      configured: historicMaps.length,
      selectable: historicMaps
        .filter(isRenderableMap)
        .map((layer) => ({ id: layer.id, title: layer.title })),
      issues: mapLayerIssues,
    },
  };
});

const totals = projects.reduce(
  (sum, project) => ({
    total: sum.total + project.records.total,
    inPublicScope: sum.inPublicScope + project.records.inPublicScope,
    outOfScope: sum.outOfScope + project.records.outOfScope,
    publishable: sum.publishable + project.states.publishable,
    provisional: sum.provisional + project.states.provisional,
    verified: sum.verified + project.states.verified,
    requiresReview: sum.requiresReview + project.states.requiresReview,
    withheld: sum.withheld + project.states.withheld,
    blockerCount: sum.blockerCount + project.issues.blockerCount,
    advisoryCount: sum.advisoryCount + project.issues.advisoryCount,
  }),
  {
    total: 0,
    inPublicScope: 0,
    outOfScope: 0,
    publishable: 0,
    provisional: 0,
    verified: 0,
    requiresReview: 0,
    withheld: 0,
    blockerCount: 0,
    advisoryCount: 0,
  },
);

const report = {
  generatedAt: new Date().toISOString(),
  purpose:
    'Read-only publication audit. Source records remain in their packages; public delivery includes only records whose effective state is publishable.',
  completionRule:
    'A record is public only when its package is explicitly publishable, the record is verified or explicitly publishable, and no material provenance, licence, validation or geometry blocker remains.',
  projects,
  summary: { projects: projects.length, ...totals },
};

const markdown = [
  '# Published Towns — Publication and Provenance Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  report.purpose,
  '',
  report.completionRule,
  '',
  '| Town | Package | Effective status | Publishable | Provisional | Verified | Requires review | Withheld | Blockers | Advisories |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...projects.map(
    (project) =>
      `| ${project.town} | ${project.packageDeclaration} | ${project.status.replaceAll('_', ' ')} | ${project.states.publishable} | ${project.states.provisional} | ${project.states.verified} | ${project.states.requiresReview} | ${project.states.withheld} | ${project.issues.blockerCount} | ${project.issues.advisoryCount} |`,
  ),
  '',
  `Catalogue total: ${totals.publishable} publishable; ${totals.provisional} provisional; ${totals.verified} verified but not package-approved; ${totals.requiresReview} requiring review; ${totals.withheld} explicitly withheld.`,
  '',
  '## Remediation summary',
  '',
  ...projects.map((project) => {
    const codes = Object.entries(project.issues.blockersByCode)
      .map(([code, count]) => `${code}: ${count}`)
      .join(', ');
    return `- **${project.town}:** ${project.states.provisional} provisional record(s) need evidence review and ${project.states.requiresReview} record(s) have material blockers${codes ? ` (${codes})` : ''}. Full record IDs and blocker reasons are in the JSON companion.`;
  }),
  '',
  'Advisories remain visible in the audit but do not prevent publication. No source record or withheld candidate is removed from the repository package.',
  '',
].join('\n');

await mkdir(dirname(jsonReportPath), { recursive: true });
await writeFile(jsonReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownReportPath, markdown, 'utf8');
console.log(
  `Audited ${projects.length} town package(s): ${totals.publishable} publishable, ${totals.provisional} provisional, ${totals.requiresReview} requiring review and ${totals.withheld} withheld.`,
);
