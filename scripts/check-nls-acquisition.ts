import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface Sheet {
  recordId?: string;
  recordUrl?: string;
  iiifServiceUrl?: string;
  wfsTitle?: string;
  sheetBoundsWgs84?: number[];
  licence?: string;
  attribution?: string;
}

interface AcquisitionManifest {
  schemaVersion?: string;
  projectId?: string;
  town?: string;
  purpose?: string;
  status?: string;
  primarySheet?: Sheet;
  companionSheetsForTownMosaic?: Sheet[];
  coverage?: string;
  georeferencing?: {
    targetCrs?: string;
    requiredBeforePublication?: string[];
    output?: string;
  };
}

function checkSheet(errors: string[], prefix: string, sheet: Sheet | undefined, primary: boolean) {
  if (!sheet) {
    errors.push(prefix + ' ' + (primary ? 'primarySheet' : 'companion sheet') + ' is required.');
    return;
  }
  if (!/^\d{8}$/.test(sheet.recordId ?? ''))
    errors.push(prefix + ' recordId must be an eight-digit NLS record ID.');
  if (!/^https:\/\/maps\.nls\.uk\/view\/\d{8}$/.test(sheet.recordUrl ?? ''))
    errors.push(prefix + ' recordUrl must be an NLS map record URL.');
  if (primary && !/^https:\/\/map-view\.nls\.uk\/iiif\/2\/.+/.test(sheet.iiifServiceUrl ?? ''))
    errors.push(prefix + ' primary sheet needs an NLS IIIF service URL.');
  if (!sheet.wfsTitle || !sheet.licence?.includes('CC-BY') || !sheet.attribution)
    errors.push(prefix + ' needs title, CC-BY licence statement and attribution.');
  if (
    primary &&
    (!sheet.sheetBoundsWgs84 ||
      sheet.sheetBoundsWgs84.length !== 4 ||
      !sheet.sheetBoundsWgs84.every(Number.isFinite))
  )
    errors.push(prefix + ' primary sheet needs four finite WGS84 bounds.');
}

const directory = resolve('data/georeferencing/acquisition');
const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
const errors: string[] = [];

for (const file of files) {
  const manifest = JSON.parse(
    await readFile(resolve(directory, file), 'utf8'),
  ) as AcquisitionManifest;
  const prefix = file + ':';
  if (manifest.schemaVersion !== 'historic-town-nls-acquisition.v1')
    errors.push(prefix + ' schemaVersion is invalid.');
  for (const field of ['projectId', 'town', 'purpose', 'coverage'] as const)
    if (!manifest[field]) errors.push(prefix + ' ' + field + ' is required.');
  if (manifest.status !== 'source_verified_georeferencing_pending')
    errors.push(
      prefix + ' must remain source_verified_georeferencing_pending until the map passes review.',
    );
  checkSheet(errors, prefix + ' primarySheet:', manifest.primarySheet, true);
  for (const [index, sheet] of (manifest.companionSheetsForTownMosaic ?? []).entries())
    checkSheet(errors, prefix + ' companion sheet ' + String(index + 1) + ':', sheet, false);
  if (manifest.georeferencing?.targetCrs !== 'EPSG:3857')
    errors.push(prefix + ' target CRS must be EPSG:3857.');
  if (!manifest.georeferencing?.output?.endsWith('.mbtiles'))
    errors.push(prefix + ' output must be an MBTiles path.');
  if ((manifest.georeferencing?.requiredBeforePublication ?? []).length < 4)
    errors.push(prefix + ' must state all publication review requirements.');
}

if (errors.length) {
  console.error('NLS acquisition validation failed:\n- ' + errors.join('\n- '));
  process.exitCode = 1;
} else console.log('Validated ' + String(files.length) + ' NLS acquisition manifest(s).');
