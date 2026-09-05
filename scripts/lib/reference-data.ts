import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const referenceDataDirectory = resolve('data/runtime/reference');
export const referenceManifestPath = resolve('data/reference/reference-data-manifest.json');

export const referenceDatasets = {
  hesListedBuildings: {
    id: 'hes-listed-buildings',
    title: 'Historic Environment Scotland Listed Buildings spatial data',
    sourceUrl: 'https://inspire.hes.scot/AtomService/DATA/lb_scotland.zip',
    filename: 'hes-listed-buildings.zip',
  },
  nrsLocalities2022: {
    id: 'nrs-localities-2022',
    title: 'National Records of Scotland 2022 Census Locality Boundaries',
    sourceUrl: 'https://www.nrscotland.gov.uk/media/im2nqu55/censuslocality2022_mhw.zip',
    filename: 'nrs-localities-2022.zip',
  },
} as const;

const defaultLocalHesDirectory = 'D:\\Map Data\\Scotland HES';
export const localHesDataDirectory =
  process.env.HES_LOCAL_DATA_DIR?.trim() || defaultLocalHesDirectory;
const localListedBuildingBase = resolve(localHesDataDirectory, 'lb_scotland', 'Listed_Buildings');
const localListedBuildingExtensions = ['.shp', '.dbf', '.prj', '.cpg'] as const;
const localHesDatasetBases = {
  listedBuildingBoundaries: ['lb_scotland', 'Listed_Buildings_boundaries'],
  canmorePoints: ['Canmore_Points', 'Canmore_Points'],
  conservationAreas: ['ca_scotland', 'Conservation_Areas'],
  scheduledMonuments: ['sam_scotland', 'Scheduled_Monuments'],
  designedLandscapes: ['gdl_scotland', 'Gardens_and_Designed_Landscapes'],
  battlefields: ['battlefields_scotland', 'Battlefields_Inventory_Boundary'],
  propertiesInCare: ['pic', 'properties_in_care'],
  worldHeritageSites: ['WHS', 'World_Heritage_Sites'],
  historicMarineProtectedAreas: ['HMPA_scotland', 'Historic_Marine_Protected_Areas'],
} as const;
export type LocalHesDataset = keyof typeof localHesDatasetBases;

export type ReferenceDatasetKey = keyof typeof referenceDatasets;

export function referenceDataPath(key: ReferenceDatasetKey): string {
  return resolve(referenceDataDirectory, referenceDatasets[key].filename);
}

export async function localHesListedBuildingFiles(): Promise<
  { shp: string; dbf: string; prj: string; cpg: string } | undefined
> {
  const entries = Object.fromEntries(
    localListedBuildingExtensions.map((extension) => [
      extension.slice(1),
      `${localListedBuildingBase}${extension}`,
    ]),
  ) as { shp: string; dbf: string; prj: string; cpg: string };
  try {
    await Promise.all(Object.values(entries).map((filename) => access(filename)));
    return entries;
  } catch {
    return undefined;
  }
}

export async function localHesDatasetFiles(
  dataset: LocalHesDataset,
): Promise<{ shp: string; dbf: string; prj: string; cpg: string } | undefined> {
  const [directory, basename] = localHesDatasetBases[dataset];
  const base = resolve(localHesDataDirectory, directory, basename);
  const entries = Object.fromEntries(
    localListedBuildingExtensions.map((extension) => [extension.slice(1), `${base}${extension}`]),
  ) as { shp: string; dbf: string; prj: string; cpg: string };
  try {
    await Promise.all(Object.values(entries).map((filename) => access(filename)));
    return entries;
  } catch {
    return undefined;
  }
}

export async function localHesListedBuildingSnapshot(): Promise<
  Record<string, unknown> | undefined
> {
  const files = await localHesListedBuildingFiles();
  if (!files) return undefined;
  const checksum = createHash('sha256');
  const parts: Record<string, number> = {};
  for (const [extension, filename] of Object.entries(files)) {
    const contents = await readFile(filename);
    checksum.update(extension).update(contents);
    parts[extension] = contents.byteLength;
  }
  return {
    id: referenceDatasets.hesListedBuildings.id,
    title: referenceDatasets.hesListedBuildings.title,
    sourceUrl: referenceDatasets.hesListedBuildings.sourceUrl,
    localSourceDirectory: localHesDataDirectory,
    localShapefile: files.shp,
    accessMethod: 'Developer-supplied local HES Shapefile',
    accessedAt: new Date().toISOString(),
    sha256: checksum.digest('hex'),
    bytes: Object.values(parts).reduce((total, value) => total + value, 0),
    parts,
  };
}

export async function readReferenceData(key: ReferenceDatasetKey): Promise<Buffer> {
  try {
    return await readFile(referenceDataPath(key));
  } catch {
    throw new Error(
      `Missing ${referenceDatasets[key].title}. Run npm run sync-reference-data before importing towns.`,
    );
  }
}

export async function syncReferenceDataset(
  key: ReferenceDatasetKey,
  refresh: boolean,
): Promise<Record<string, unknown>> {
  const definition = referenceDatasets[key];
  if (key === 'hesListedBuildings') {
    const local = await localHesListedBuildingSnapshot();
    if (local) return local;
  }
  const destination = referenceDataPath(key);
  await mkdir(referenceDataDirectory, { recursive: true });
  let contents: Buffer;
  try {
    contents = refresh ? Buffer.alloc(0) : await readFile(destination);
  } catch {
    contents = Buffer.alloc(0);
  }
  if (!contents.length) {
    const response = await fetch(definition.sourceUrl);
    if (!response.ok) throw new Error(`${definition.title} download failed: ${response.status}`);
    contents = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, contents);
  }
  return {
    id: definition.id,
    title: definition.title,
    sourceUrl: definition.sourceUrl,
    localFilename: `data/runtime/reference/${definition.filename}`,
    accessedAt: new Date().toISOString(),
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: contents.byteLength,
  };
}
