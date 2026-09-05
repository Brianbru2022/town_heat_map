import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

interface ControlPoint {
  image: [number, number];
  wgs84: [number, number];
}

interface LocalHistoricMapManifest {
  schemaVersion: 'historic-town-local-map.v1';
  projectId: string;
  mapId: string;
  sourceImageUrl: string;
  iiifServiceUrl?: string;
  targetCrs: 'EPSG:3857';
  controlPoints: ControlPoint[];
  approvedForPublication: boolean;
  tilePackageId: string;
  renderWidth?: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceCrop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

const suppliedPath = process.argv[2];
if (!suppliedPath) throw new Error('Usage: npm run prepare-local-historic-map -- <manifest.json>');
const draftMode = process.argv.includes('--draft');
const manifest = JSON.parse(
  await readFile(resolve(suppliedPath), 'utf8'),
) as LocalHistoricMapManifest;

if (!manifest.approvedForPublication && !draftMode)
  throw new Error('This map has not passed the source, licence and control-point review gate.');
if (manifest.targetCrs !== 'EPSG:3857' || manifest.controlPoints.length < 4)
  throw new Error('A reviewed EPSG:3857 manifest with at least four control points is required.');

const runtimeRoot = resolve('data/runtime');
const sourceDirectory = resolve(runtimeRoot, 'source-maps');
const tilesDirectory = resolve(runtimeRoot, 'tiles');
const outputSuffix = draftMode ? '-draft' : '';
const sourceImage = resolve(sourceDirectory, manifest.tilePackageId + '.jpg');
const temporaryTiff = resolve(sourceDirectory, manifest.tilePackageId + outputSuffix + '.tif');
const warpedTiff = resolve(sourceDirectory, manifest.tilePackageId + outputSuffix + '-3857.tif');
const outputTiles = resolve(tilesDirectory, manifest.tilePackageId + outputSuffix + '.mbtiles');
const iiifDataset = manifest.iiifServiceUrl ? `IIIF:${manifest.iiifServiceUrl}` : sourceImage;
const renderWidth = manifest.renderWidth ?? 4096;
const sourceCrop = manifest.sourceCrop ?? {
  x: 0,
  y: 0,
  width: manifest.sourceWidth,
  height: manifest.sourceHeight,
};
const renderHeight = Math.round((sourceCrop.height * renderWidth) / sourceCrop.width);
const gdalBin =
  process.env.GDAL_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\GDAL' : undefined);

async function gdalCommand(command: string) {
  if (!gdalBin) return command;
  const executable = resolve(gdalBin, command + (process.platform === 'win32' ? '.exe' : ''));
  try {
    await access(executable);
    return executable;
  } catch {
    throw new Error('Unable to find ' + command + ' in GDAL_BIN: ' + gdalBin);
  }
}

async function run(command: string, args: string[]) {
  const gdalEnvironment =
    gdalBin && process.platform === 'win32'
      ? {
          ...process.env,
          GDAL_DATA: join(gdalBin, 'gdal-data'),
          PROJ_LIB: join(gdalBin, 'projlib'),
        }
      : process.env;
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, env: gdalEnvironment });
    child.once('error', rejectCommand);
    child.once('exit', (code) =>
      code === 0
        ? resolveCommand()
        : rejectCommand(new Error(`${command} exited with code ${code}`)),
    );
  });
}

await mkdir(sourceDirectory, { recursive: true });
await mkdir(tilesDirectory, { recursive: true });
if (!manifest.iiifServiceUrl) await access(sourceImage);

const gcpArgs = manifest.controlPoints.flatMap((point) => [
  '-gcp',
  String(((point.image[0] - sourceCrop.x) * renderWidth) / sourceCrop.width),
  String(((point.image[1] - sourceCrop.y) * renderHeight) / sourceCrop.height),
  String(point.wgs84[0]),
  String(point.wgs84[1]),
]);

try {
  await run(await gdalCommand('gdal_translate'), [
    '-of',
    'GTiff',
    '-srcwin',
    String(sourceCrop.x),
    String(sourceCrop.y),
    String(sourceCrop.width),
    String(sourceCrop.height),
    '-outsize',
    String(renderWidth),
    '0',
    '-a_srs',
    'EPSG:4326',
    ...gcpArgs,
    iiifDataset,
    temporaryTiff,
  ]);
  await run(await gdalCommand('gdalwarp'), [
    '-t_srs',
    'EPSG:3857',
    '-order',
    '1',
    '-r',
    'cubic',
    '-co',
    'TILED=YES',
    '-co',
    'COMPRESS=DEFLATE',
    temporaryTiff,
    warpedTiff,
  ]);
  await rm(outputTiles, { force: true });
  await run(await gdalCommand('gdal_translate'), [
    '-of',
    'MBTILES',
    '-co',
    'TILE_FORMAT=PNG',
    warpedTiff,
    outputTiles,
  ]);
  await run(await gdalCommand('gdaladdo'), [
    '-r',
    'average',
    outputTiles,
    '2',
    '4',
    '8',
    '16',
    '32',
    '64',
  ]);
} finally {
  await rm(temporaryTiff, { force: true });
  await rm(warpedTiff, { force: true });
}

if (draftMode)
  console.log(
    `Prepared alignment-review draft ${outputTiles}. Do not publish it until it passes visual and residual checks.`,
  );
else
  console.log(
    `Prepared ${outputTiles}. Restart the tiles service, then run publish-local-historic-maps.`,
  );
