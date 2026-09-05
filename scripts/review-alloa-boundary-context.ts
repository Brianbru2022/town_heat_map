import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { booleanPointInPolygon, point } from '@turf/turf';
import type { ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const reportPath = resolve(process.argv[3] ?? 'data/review/alloa-boundary-context-review.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

function boundaryReviewSource(): SourceRecord {
  return {
    sourceName: 'National Records of Scotland civil-parish boundary containment review',
    sourceOrganisation: 'National Records of Scotland',
    sourceUrl: 'https://www.nrscotland.gov.uk/publications/2022-census-geography-products/',
    accessedAt,
    licence: 'Open Government Licence v3.0; retain National Records of Scotland attribution.',
    reliability: 'official_non_statutory',
    notes:
      'Point containment was checked against the published Alloa civil-parish study boundary. This is a scope decision; it does not invalidate the HES NRHE source record.',
  };
}

const decisions: Array<{
  id: string;
  name: string;
  decision: 'related_context';
  rationale: string;
}> = [];
for (const feature of pkg.features) {
  if (feature.geometry?.type !== 'Point') continue;
  if (booleanPointInPolygon(point(feature.geometry.coordinates), pkg.project.boundary)) continue;

  feature.evidenceScope = 'related_context';
  feature.sourceRecords = [
    ...feature.sourceRecords.filter(
      (source) => source.sourceName !== boundaryReviewSource().sourceName,
    ),
    boundaryReviewSource(),
  ];
  const rationale =
    'Verified source record lies outside the authoritative Alloa civil-parish study boundary; retained as related context and excluded from parish totals, heat scoring, settlement evidence and parish-only exports.';
  feature.reviewNotes = `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}Boundary review: ${rationale}`;
  feature.updatedAt = accessedAt;
  decisions.push({ id: feature.id, name: feature.name, decision: 'related_context', rationale });
}

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  `${JSON.stringify(
    {
      projectId: pkg.project.id,
      reviewedAt: accessedAt,
      boundarySource: pkg.project.boundarySource,
      decisions,
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(`Recorded ${decisions.length} Alloa related-context boundary decision(s).`);
