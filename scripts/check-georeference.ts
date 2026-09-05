import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface ControlPoint {
  image?: [number, number];
  wgs84?: [number, number];
  feature?: string;
  evidence?: string;
}
interface Manifest {
  projectId?: string;
  mapId?: string;
  sourceInstitution?: string;
  sourceUrl?: string;
  licence?: string;
  attribution?: string;
  imagePath?: string;
  targetCrs?: string;
  controlPoints?: ControlPoint[];
  reviewedBy?: string;
  reviewedAt?: string;
}

const manifestPath = resolve(
  process.argv[2] ?? 'data/georeferencing/alloa-map-georeference.template.json',
);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest;
const errors: string[] = [];
if (!manifest.projectId) errors.push('projectId is required.');
if (!manifest.mapId || manifest.mapId.startsWith('replace-'))
  errors.push('A reviewed mapId is required.');
if (!manifest.sourceInstitution || manifest.sourceInstitution.startsWith('Replace'))
  errors.push('sourceInstitution is required.');
if (!manifest.sourceUrl || manifest.sourceUrl.includes('replace-with'))
  errors.push('A sourceUrl for the original map record is required.');
if (!manifest.licence || /confirm licence/i.test(manifest.licence))
  errors.push('A confirmed publication licence is required.');
if (!manifest.attribution || /copy the required/i.test(manifest.attribution))
  errors.push('Required attribution is missing.');
if (manifest.targetCrs !== 'EPSG:3857') errors.push('targetCrs must be EPSG:3857 for web tiles.');
if (!manifest.imagePath || manifest.imagePath.includes('replace-with'))
  errors.push('An authorised imagePath is required.');
else {
  try {
    await access(resolve(manifest.imagePath));
  } catch {
    errors.push('imagePath does not exist locally.');
  }
}
if (!manifest.reviewedBy || !manifest.reviewedAt)
  errors.push('reviewedBy and reviewedAt are required.');
if ((manifest.controlPoints?.length ?? 0) < 4)
  errors.push('At least four independently checked control points are required.');
for (const [index, point] of (manifest.controlPoints ?? []).entries()) {
  if (!point.image?.every(Number.isFinite))
    errors.push(`Control point ${index + 1} needs image coordinates.`);
  if (!point.wgs84 || Math.abs(point.wgs84[0]) > 180 || Math.abs(point.wgs84[1]) > 90)
    errors.push(`Control point ${index + 1} needs valid WGS84 coordinates.`);
  if (!point.feature || !point.evidence)
    errors.push(`Control point ${index + 1} needs a feature and matching evidence.`);
}
if (errors.length) {
  console.error(`Georeferencing manifest cannot be used:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else console.log(`Georeferencing manifest is ready: ${manifest.mapId}`);
