import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricMapLayer, ProjectPackage } from '../src/domain/models';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;

const layer: HistoricMapLayer = {
  id: 'hes-listed-buildings-by-category',
  projectId: pkg.project.id,
  title: 'Historic Environment Scotland — Designations',
  displayDate: 'Current designation data',
  sourceInstitution: 'Historic Environment Scotland',
  sourceUrl:
    'https://inspire.hes.scot/arcgis/services/HES/HES_Designations/MapServer/WMSServer?request=GetCapabilities&service=WMS',
  licence: 'Live service; confirm current reproduction terms before export or redistribution.',
  attribution:
    'Contains Historic Environment Scotland and Ordnance Survey data © Historic Environment Scotland - Scottish Charity No. SC045925 © Crown copyright and database right 2026.',
  notes:
    'Current official designations, not a historic map and not evidence of construction dates. Shows listed-building categories, conservation areas, scheduled monuments and listed-building boundaries.',
  layerType: 'wms',
  tileUrl: '/api/hes-designations/{z}/{x}/{y}.png',
  opacity: 0.78,
  minZoom: 10,
  maxZoom: 20,
  georeferencingMethod: 'Publisher-hosted ArcGIS MapServer export in Web Mercator',
  georeferencingAccuracy: 'high',
};

pkg.historicMaps = [...pkg.historicMaps.filter((candidate) => candidate.id !== layer.id), layer];
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Refreshed the HES designations overlay.');
