import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HistoricMapLayer, ProjectPackage } from '../src/domain/models';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const sourceUrl = 'https://maps.nls.uk/projects/api/index.html';
const licence = 'CC BY 3.0 for the online map service; MapTiler Cloud terms also apply.';
const common = {
  projectId: pkg.project.id,
  sourceInstitution: 'National Library of Scotland',
  sourceUrl,
  licence,
  attribution: 'National Library of Scotland',
  layerType: 'xyz' as const,
  minZoom: 7,
  maxZoom: 18,
  opacity: 0.7,
  georeferencingMethod: 'Publisher-hosted georeferenced tile layer',
  georeferencingAccuracy: 'medium' as const,
  notes:
    'Publisher-hosted historic OS mapping. Use it for visual comparison and reviewed digitisation only: individual features may not align exactly with modern mapping.',
};
const layers: HistoricMapLayer[] = [
  {
    ...common,
    id: 'nls-os-one-inch-hills-1885-1903',
    title: 'NLS — Ordnance Survey one-inch “Hills” edition',
    displayDate: '1885–1903',
    surveyStartYear: 1885,
    surveyEndYear: 1903,
    tileUrl:
      'https://api.maptiler.com/tiles/uk-osgb63k1885/{z}/{x}/{y}.jpg?key={VITE_NLS_MAPTILER_API_KEY}',
  },
  {
    ...common,
    id: 'nls-os-1920s-1940s',
    title: 'NLS — Ordnance Survey mapping',
    displayDate: '1920s–1940s',
    surveyStartYear: 1920,
    surveyEndYear: 1949,
    tileUrl:
      'https://api.maptiler.com/tiles/uk-osgb1919/{z}/{x}/{y}.jpg?key={VITE_NLS_MAPTILER_API_KEY}',
  },
  {
    ...common,
    id: 'nls-os-provisional-1937-1961',
    title: 'NLS — Ordnance Survey Provisional edition',
    displayDate: '1937–1961',
    surveyStartYear: 1937,
    surveyEndYear: 1961,
    tileUrl:
      'https://api.maptiler.com/tiles/uk-osgb25k1937/{z}/{x}/{y}.jpg?key={VITE_NLS_MAPTILER_API_KEY}',
  },
  {
    ...common,
    id: 'nls-os-seventh-series-1955-1961',
    title: 'NLS — Ordnance Survey Seventh Series',
    displayDate: '1955–1961',
    surveyStartYear: 1955,
    surveyEndYear: 1961,
    tileUrl:
      'https://api.maptiler.com/tiles/uk-osgb63k1955/{z}/{x}/{y}.jpg?key={VITE_NLS_MAPTILER_API_KEY}',
  },
];
const retiredLayerIds = new Set(['nls-roy-lowlands-1752-1755']);
pkg.historicMaps = [
  ...layers,
  ...pkg.historicMaps.filter(
    (map) => !retiredLayerIds.has(map.id) && !layers.some((candidate) => candidate.id === map.id),
  ),
];
pkg.sources = pkg.sources.map((source) =>
  source.id === 'nls'
    ? {
        ...source,
        accessMethod: 'NLS Historic Maps API / MapTiler XYZ tiles',
        sourceUrl,
        licence,
        limitations:
          'Use for map comparison and reviewed digitisation. Historical georeferencing is not guaranteed at individual-feature precision; retain NLS attribution and follow MapTiler terms.',
      }
    : source,
);
if (!pkg.sources.some((source) => source.id === 'nls-historic-maps-api')) {
  pkg.sources.push({
    id: 'nls-historic-maps-api',
    name: 'National Library of Scotland Historic Maps API',
    organisation: 'National Library of Scotland',
    coverage: 'Alloa / Scotland',
    accessMethod: 'Publisher-hosted georeferenced XYZ tile services',
    sourceUrl,
    licence,
    reliability: 'archival',
    limitations:
      'Use for comparison and curator-reviewed digitisation. Individual features may not align exactly with modern mapping; retain the attribution and provider terms for every layer.',
  });
}
if (!pkg.sources.some((source) => source.id === 'nrs-rhp1230-alloa-c1790')) {
  pkg.sources.push({
    id: 'nrs-rhp1230-alloa-c1790',
    name: 'Plan of the town of Alloa (RHP1230)',
    organisation: 'National Records of Scotland',
    coverage: 'Central Alloa, c. 1790',
    accessMethod: 'Catalogue record and NRS Search Rooms Virtual Volumes',
    sourceUrl:
      'https://catalogue.nrscotland.gov.uk/nrsonlinecatalogue/details.aspx?reference=RHP1230',
    reliability: 'archival',
    limitations:
      'A detailed c. 1790 plan by John Ainslie. A publicly reusable GIS or tile endpoint has not been verified, so it must be obtained under the archive terms and georeferenced with documented control points before use in the app.',
  });
}
if (!pkg.sources.some((source) => source.id === 'nls-pont-maps-1583-1614')) {
  pkg.sources.push({
    id: 'nls-pont-maps-1583-1614',
    name: 'Pont maps of Scotland, c. 1583–1614',
    organisation: 'National Library of Scotland',
    coverage:
      'Scotland; contextual coverage for the Alloa area must be selected and reviewed per map',
    accessMethod: 'NLS map-image collection',
    sourceUrl: 'https://maps.nls.uk/pont/',
    reliability: 'archival',
    limitations:
      'Seventeenth-century manuscript mapping is valuable contextual evidence, but no Alloa-specific public GIS tile endpoint or survey-grade georeferencing has been verified. It must not be used alone to trace a settlement-age polygon.',
  });
}
if (!pkg.sources.some((source) => source.id === 'nrs-rhp13258-alloa-plan-1722-1730')) {
  pkg.sources.push({
    id: 'nrs-rhp13258-alloa-plan-1722-1730',
    name: 'Plan of Alloa, the seat of the Lord Mar (RHP13258)',
    organisation: 'National Records of Scotland / University of Edinburgh',
    coverage: 'Alloa estate, town and harbour, 1722–1730',
    accessMethod: 'University of Edinburgh Charting the Nation image viewer',
    sourceUrl:
      'https://images-teaching.is.ed.ac.uk/luna/servlet/detail/UoEcha~1~1~326696~102160:Plan-of-Alloa-The-Seat-of-The-Lord-',
    licence:
      'Courtesy of the Keeper of the Records of Scotland; no open publication licence stated.',
    reliability: 'archival',
    limitations:
      'A high-resolution image is available for research and digitisation review, but it is not licensed or CORS-enabled for publication as an app overlay. Obtain reuse permission, an authorised source file and four independently checked control points before publishing derived map tiles or a historic footprint.',
  });
}
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log(
  `Added or refreshed ${layers.length} National Library of Scotland historic map layers.`,
);
