import { access, mkdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';

interface SourceSheet {
  recordId: string;
  iiifServiceUrl: string;
  sourceWidth?: number;
  sourceHeight?: number;
  bounds: [number, number, number, number];
  /** The scanned paper margins vary between NLS sheets.  A reviewed sheet crop
   * takes precedence over the manifest-wide fallback. */
  sourceCrop?: SourceCrop;
}

type SourceCrop =
  | { x: number; y: number; width: number; bottomMargin: number }
  | { leftFraction: number; topFraction: number; rightFraction: number; bottomFraction: number };

interface MosaicManifest {
  approvedForPublication: boolean;
  tilePackageId: string;
  targetCrs: 'EPSG:3857';
  renderWidthPerSheet: number;
  defaultSourceCrop: SourceCrop;
  sheets: SourceSheet[];
}

const suppliedPath = process.argv[2];
if (!suppliedPath)
  throw new Error('Usage: npm run prepare-local-historic-mosaic -- <manifest.json> [--draft]');
const draftMode = process.argv.includes('--draft');
const manifest = JSON.parse(await readFile(resolve(suppliedPath), 'utf8')) as MosaicManifest;
if (!manifest.approvedForPublication && !draftMode)
  throw new Error('This mosaic has not passed the source, licence and control-point review gate.');
if (manifest.targetCrs !== 'EPSG:3857' || manifest.sheets.length < 2)
  throw new Error('An EPSG:3857 mosaic with at least two source sheets is required.');

const runtimeRoot = resolve('data/runtime');
const sourceDirectory = resolve(runtimeRoot, 'source-maps');
const tilesDirectory = resolve(runtimeRoot, 'tiles');
const outputSuffix = draftMode ? '-draft' : '';
const workingDirectory = resolve(sourceDirectory, manifest.tilePackageId + outputSuffix);
const mosaicVrt = resolve(workingDirectory, 'mosaic.vrt');
const outputTiles = resolve(tilesDirectory, manifest.tilePackageId + outputSuffix + '.mbtiles');
const gdalBin =
  process.env.GDAL_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\GDAL' : undefined);

async function gdalCommand(command: string) {
  if (!gdalBin) return command;
  const executable = resolve(gdalBin, command + (process.platform === 'win32' ? '.exe' : ''));
  await access(executable);
  return executable;
}

async function run(command: string, args: string[]) {
  const environment =
    gdalBin && process.platform === 'win32'
      ? {
          ...process.env,
          GDAL_DATA: join(gdalBin, 'gdal-data'),
          PROJ_LIB: join(gdalBin, 'projlib'),
        }
      : process.env;
  await new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, env: environment });
    child.once('error', rejectCommand);
    child.once('exit', (code) =>
      code === 0
        ? resolveCommand()
        : rejectCommand(new Error(command + ' exited with code ' + String(code))),
    );
  });
}

await mkdir(workingDirectory, { recursive: true });
await mkdir(tilesDirectory, { recursive: true });
const warpedSheets: string[] = [];

try {
  for (const sheet of manifest.sheets) {
    const sourceInfo =
      sheet.sourceWidth && sheet.sourceHeight
        ? { width: sheet.sourceWidth, height: sheet.sourceHeight }
        : ((await (await fetch(sheet.iiifServiceUrl + '/info.json')).json()) as {
            width: number;
            height: number;
          });
    // Never assume that a shared crop fits all scanned sheets: an incorrect
    // paper-margin crop changes the geographic scale as well as its position.
    const cropDefinition = sheet.sourceCrop ?? manifest.defaultSourceCrop;
    const crop =
      'x' in cropDefinition
        ? {
            x: cropDefinition.x,
            y: cropDefinition.y,
            width: cropDefinition.width,
            height: sourceInfo.height - cropDefinition.y - cropDefinition.bottomMargin,
          }
        : {
            x: Math.round(sourceInfo.width * cropDefinition.leftFraction),
            y: Math.round(sourceInfo.height * cropDefinition.topFraction),
            width: Math.round(
              sourceInfo.width * (1 - cropDefinition.leftFraction - cropDefinition.rightFraction),
            ),
            height: Math.round(
              sourceInfo.height * (1 - cropDefinition.topFraction - cropDefinition.bottomFraction),
            ),
          };
    if (
      crop.height <= 0 ||
      crop.x + crop.width > sourceInfo.width ||
      crop.y + crop.height > sourceInfo.height
    )
      throw new Error('Invalid source crop for NLS record ' + sheet.recordId + '.');
    const renderHeight = Math.round((crop.height * manifest.renderWidthPerSheet) / crop.width);
    const rawTiff = resolve(workingDirectory, sheet.recordId + '.tif');
    const warpedTiff = resolve(workingDirectory, sheet.recordId + '-3857.tif');
    const [minLon, minLat, maxLon, maxLat] = sheet.bounds;
    await run(await gdalCommand('gdal_translate'), [
      '-of',
      'GTiff',
      '-srcwin',
      String(crop.x),
      String(crop.y),
      String(crop.width),
      String(crop.height),
      '-outsize',
      String(manifest.renderWidthPerSheet),
      String(renderHeight),
      '-a_srs',
      'EPSG:4326',
      '-gcp',
      '0',
      '0',
      String(minLon),
      String(maxLat),
      '-gcp',
      String(manifest.renderWidthPerSheet - 1),
      '0',
      String(maxLon),
      String(maxLat),
      '-gcp',
      String(manifest.renderWidthPerSheet - 1),
      String(renderHeight - 1),
      String(maxLon),
      String(minLat),
      '-gcp',
      '0',
      String(renderHeight - 1),
      String(minLon),
      String(minLat),
      'IIIF:' + sheet.iiifServiceUrl,
      rawTiff,
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
      rawTiff,
      warpedTiff,
    ]);
    warpedSheets.push(warpedTiff);
    await rm(rawTiff, { force: true });
  }
  await run(await gdalCommand('gdalbuildvrt'), [
    '-resolution',
    'highest',
    mosaicVrt,
    ...warpedSheets,
  ]);
  await rm(outputTiles, { force: true });
  await run(await gdalCommand('gdal_translate'), [
    '-of',
    'MBTILES',
    '-co',
    'TILE_FORMAT=PNG',
    mosaicVrt,
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
  await rm(workingDirectory, { recursive: true, force: true });
}

if (draftMode)
  console.log(
    'Prepared alignment-review mosaic draft ' +
      outputTiles +
      '. Do not publish until visual and residual checks pass.',
  );
else
  console.log(
    'Prepared ' + outputTiles + '. Restart the tile service, then publish the approved map.',
  );
