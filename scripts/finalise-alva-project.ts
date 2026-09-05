import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { booleanPointInPolygon, point } from '@turf/turf';
import type { ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alva.json');
const projectPackage = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const excludedLocality = /\bmenstrie\b/i;
const riverSpiritContextNote =
  'Nearby approach-road sculpture outside the Alva town core. Exact coordinate requires field verification; retained as related context and excluded from parish totals and heat scoring.';
const boundaryContextNote =
  'Representative point lies beyond the authoritative NRS Alva parish boundary; retained only as related context and excluded from parish totals and heat scoring.';
const removedMenstrieRecords = projectPackage.features.filter((feature) =>
  excludedLocality.test(feature.name),
).length;
projectPackage.features = projectPackage.features.filter(
  (feature) => !excludedLocality.test(feature.name),
);
const riverSpirit = projectPackage.features.find(
  (feature) => feature.id === 'curated:public-art-river-spirit',
);
if (!riverSpirit) throw new Error('River Spirit record was not found after Alva community import.');
riverSpirit.evidenceScope = 'related_context';
riverSpirit.reviewed = true;
riverSpirit.reviewNotes = riverSpirit.reviewNotes?.includes(riverSpiritContextNote)
  ? riverSpirit.reviewNotes
  : [riverSpirit.reviewNotes, riverSpiritContextNote].filter(Boolean).join(' ');

for (const feature of projectPackage.features) {
  if (
    feature.geometry?.type !== 'Point' ||
    booleanPointInPolygon(point(feature.geometry.coordinates), projectPackage.project.boundary)
  )
    continue;
  feature.evidenceScope = 'related_context';
  feature.reviewNotes = feature.reviewNotes?.includes(boundaryContextNote)
    ? feature.reviewNotes
    : [feature.reviewNotes, boundaryContextNote].filter(Boolean).join(' ');
}

projectPackage.validation = validateFeatures(projectPackage.project, projectPackage.features);
const errors = projectPackage.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(projectPackage, null, 2)}\n`, 'utf8');
console.log(
  `Finalised Alva package: ${projectPackage.features.length} records, ${removedMenstrieRecords} Menstrie record(s) excluded, ${projectPackage.validation.length} review warning(s).`,
);
