import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/culross.json');
const parishName = (process.argv[3] ?? 'Culross').trim().toLocaleLowerCase();
const datasetUrl = 'https://www.nrscotland.gov.uk/media/ajrmp0te/civilparish1930.zip';

// shpjs is primarily browser-targeted and reads `self` while initialising.
Object.assign(globalThis, { self: globalThis });
const { default: shp } = await import('shpjs');

type ShapeCollection = {
  features: Array<Feature<Polygon | MultiPolygon, Record<string, unknown>>>;
};

const response = await fetch(datasetUrl);
if (!response.ok) throw new Error(`NRS civil-parish download failed: ${response.status}`);
const parsed = (await shp(await response.arrayBuffer())) as ShapeCollection | ShapeCollection[];
const collections = Array.isArray(parsed) ? parsed : [parsed];
const records = collections.flatMap((collection) => collection.features);
const boundary = records.find(
  (record) =>
    String(record.properties.name ?? '')
      .trim()
      .toLocaleLowerCase() === parishName,
);
if (!boundary) throw new Error(`NRS civil parish '${parishName}' was not found in the download.`);

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
pkg.project.boundary = {
  type: 'Feature',
  properties: {
    sourceDataset: 'NRS Civil Parish Dataset',
    parishName: boundary.properties.name,
    parishCode: boundary.properties.code,
  },
  geometry: boundary.geometry,
};
pkg.project.boundarySource =
  'National Records of Scotland Civil Parish Dataset (1930 civil-parish boundary; downloaded from NRS Geography Products).';
pkg.project.boundaryConfidence = 'high';
pkg.project.researchNotes = `The project extent is the official NRS ${String(boundary.properties.name)} civil-parish boundary. ${pkg.project.locality} is the historic town focus; conservation areas and other evidence layers are not substituted for the parish boundary.`;
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Imported NRS civil parish boundary '${boundary.properties.name}' into ${projectPath}.`,
);
