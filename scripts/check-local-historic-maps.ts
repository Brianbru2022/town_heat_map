import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface Manifest {
  schemaVersion?: string;
  projectId?: string;
  mapId?: string;
  title?: string;
  sourceInstitution?: string;
  sourceUrl?: string;
  sourceImageUrl?: string;
  licence?: string;
  attribution?: string;
  displayDate?: string;
  surveyStartYear?: number;
  surveyEndYear?: number;
  publicationYear?: number;
  bounds?: number[];
  targetCrs?: string;
  tilePackageId?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  sourceCrop?: { x?: number; y?: number; width?: number; height?: number };
  approvedForPublication?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
  controlPoints?: Array<{
    image?: number[];
    wgs84?: number[];
    feature?: string;
    evidence?: string;
  }>;
}

const directory = resolve('data/georeferencing/local-maps');
const filenames = (await readdir(directory)).filter((filename) => filename.endsWith('.json'));
const errors: string[] = [];
for (const filename of filenames) {
  const manifest = JSON.parse(await readFile(resolve(directory, filename), 'utf8')) as Manifest;
  const prefix = `${filename}:`;
  if (manifest.schemaVersion !== 'historic-town-local-map.v1')
    errors.push(`${prefix} schemaVersion is invalid.`);
  for (const field of [
    'projectId',
    'mapId',
    'title',
    'sourceInstitution',
    'sourceUrl',
    'sourceImageUrl',
    'licence',
    'attribution',
    'displayDate',
    'tilePackageId',
  ] as const)
    if (!manifest[field]) errors.push(`${prefix} ${field} is required.`);
  if (manifest.targetCrs !== 'EPSG:3857') errors.push(`${prefix} targetCrs must be EPSG:3857.`);
  if (!manifest.bounds || manifest.bounds.length !== 4 || !manifest.bounds.every(Number.isFinite))
    errors.push(`${prefix} bounds must contain four valid coordinates.`);
  if (!manifest.surveyStartYear || !manifest.surveyEndYear || !manifest.publicationYear)
    errors.push(`${prefix} survey and publication years are required.`);
  if (!manifest.sourceWidth || !manifest.sourceHeight)
    errors.push(`${prefix} source image dimensions are required.`);
  if (manifest.sourceCrop) {
    const { x, y, width, height } = manifest.sourceCrop;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof width !== 'number' ||
      typeof height !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0 ||
      x < 0 ||
      y < 0
    )
      errors.push(
        `${prefix} sourceCrop must have non-negative origin and positive finite dimensions.`,
      );
    else if (x + width > manifest.sourceWidth! || y + height > manifest.sourceHeight!)
      errors.push(`${prefix} sourceCrop must stay within the source image.`);
  }
  if (manifest.approvedForPublication) {
    if (!manifest.reviewedBy || !manifest.reviewedAt)
      errors.push(`${prefix} publication approval needs reviewer details.`);
    if ((manifest.controlPoints?.length ?? 0) < 4)
      errors.push(`${prefix} publication approval needs four control points.`);
    for (const [index, point] of (manifest.controlPoints ?? []).entries()) {
      if (
        point.image?.length !== 2 ||
        point.wgs84?.length !== 2 ||
        !point.feature ||
        !point.evidence
      )
        errors.push(`${prefix} control point ${index + 1} is incomplete.`);
    }
  }
}
if (errors.length) {
  console.error(`Local historic map validation failed:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else console.log(`Validated ${filenames.length} local historic map intake manifest(s).`);
