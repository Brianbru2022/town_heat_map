import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { booleanIntersects } from '@turf/turf';
import type { Feature, Geometry, Polygon, MultiPolygon } from 'geojson';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const reportPath = resolve(process.argv[3] ?? 'data/review/alloa-town-locality-scope-review.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const locality = pkg.project.townStudyArea?.localityBoundary;
if (!locality)
  throw new Error('Alloa needs an NRS town-locality boundary before scope review can run.');

const accessedAt = new Date().toISOString();
const managedTag = 'outside-alloa-town-locality';
const scopeNote =
  'Outside the NRS Alloa locality boundary. Retained in the repository audit trail for the appropriate town project, but excluded from Alloa public maps, public review and town exports.';

function intersectsAlloaLocality(feature: HeritageFeature): boolean {
  if (!feature.geometry) return true;
  return booleanIntersects(
    { type: 'Feature', properties: {}, geometry: feature.geometry } as Feature<Geometry>,
    locality as Feature<Polygon | MultiPolygon>,
  );
}

function targetLocality(feature: HeritageFeature): string | undefined {
  const text = `${feature.name} ${feature.address ?? ''}`.toLowerCase();
  if (/\b(?:new |old )?sauchie\b/.test(text)) return 'Sauchie';
  if (/\bfish\s?cross\b/.test(text)) return 'Fishcross';
  if (/\btullibody\b/.test(text)) return 'Tullibody';
  if (/\bcambus\b/.test(text)) return 'Cambus';
  if (/\balva\b/.test(text)) return 'Alva';
  if (/\bmenstrie\b/.test(text)) return 'Menstrie';
  if (/\bclackmannan\b/.test(text)) return 'Clackmannan';
  return undefined;
}

const decisions: Array<{ id: string; name: string; targetLocality?: string }> = [];
for (const feature of pkg.features) {
  if (intersectsAlloaLocality(feature)) continue;
  const target = targetLocality(feature);
  feature.evidenceScope = 'out_of_scope';
  feature.tags = [
    ...new Set([
      ...feature.tags,
      managedTag,
      ...(target ? [`target-locality:${target.toLowerCase().replaceAll(' ', '-')}`] : []),
    ]),
  ];
  feature.reviewed = true;
  feature.updatedAt = accessedAt;
  if (!feature.reviewNotes?.includes(scopeNote))
    feature.reviewNotes = `${feature.reviewNotes ? `${feature.reviewNotes} ` : ''}${scopeNote}`;
  decisions.push({
    id: feature.id,
    name: feature.name,
    ...(target ? { targetLocality: target } : {}),
  });
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
      boundary: {
        name: pkg.project.townStudyArea?.localityName,
        source: pkg.project.townStudyArea?.sourceName,
        sourceUrl: pkg.project.townStudyArea?.sourceUrl,
      },
      policy:
        'Features outside the current NRS Alloa locality are not public Alloa features. They remain in this audit report for migration into a dedicated town project; the civil-parish study boundary is not changed.',
      excluded: decisions.sort((left, right) => left.name.localeCompare(right.name)),
    },
    null,
    2,
  )}\n`,
  'utf8',
);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Excluded ${decisions.length} feature(s) outside the NRS Alloa locality from public Alloa presentation.`,
);
