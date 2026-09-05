import type { HistoricMapLayer, ProjectPackage } from '../domain/models';

interface ReviewMapInput {
  id: string;
  projectId: string;
  title: string;
  displayDate: string;
  surveyStartYear: number;
  surveyEndYear: number;
  publicationYear: number;
  sourceUrl: string;
  attribution: string;
  tilePackageId: string;
  bounds: [number, number, number, number];
}

function reviewMap(input: ReviewMapInput): HistoricMapLayer {
  return {
    ...input,
    sourceInstitution: 'National Library of Scotland / Ordnance Survey',
    licence: 'CC-BY (National Library of Scotland); retain the required attribution.',
    notes:
      'Development-only local MBTiles mosaic for visual alignment review. It is not a published historic map layer and must not be used for digitisation or export until a curator records independently checked control points and residual error.',
    layerType: 'georeferenced_raster_tiles',
    tileUrl: '/api/local-historic-maps/' + input.tilePackageId + '-draft/{z}/{x}/{y}.png',
    localPath: 'data/runtime/tiles/' + input.tilePackageId + '-draft.mbtiles',
    opacity: 0.6,
    minZoom: 12,
    maxZoom: 19,
    georeferencingMethod: 'NLS sheet-footprint crop; visual alignment review pending',
    georeferencingAccuracy: 'unknown',
    controlPointCount: 4,
  };
}

const localMapReviews: HistoricMapLayer[] = [
  reviewMap({
    id: 'nls-alloa-os-25-inch-1900-mosaic-alignment-review',
    projectId: 'alloa-scotland',
    title: 'Alloa circa 1900 - expanded alignment review (draft)',
    displayDate: '1900 draft',
    surveyStartYear: 1898,
    surveyEndYear: 1899,
    publicationYear: 1900,
    sourceUrl: 'https://maps.nls.uk/view/82875201',
    attribution:
      'National Library of Scotland, Ordnance Survey 25-inch mapping, Alloa-area sheets (1898-99 revisions; 1900 publication).',
    tilePackageId: 'nls-alloa-os-25-inch-1900-mosaic',
    bounds: [-3.8463, 56.0992, -3.7298, 56.1426],
  }),
  reviewMap({
    id: 'nls-alva-os-25-inch-1900-mosaic-alignment-review',
    projectId: 'alva-scotland',
    title: 'Alva circa 1900 - expanded alignment review (draft)',
    displayDate: '1900 draft',
    surveyStartYear: 1898,
    surveyEndYear: 1899,
    publicationYear: 1900,
    sourceUrl: 'https://maps.nls.uk/view/83546229',
    attribution:
      'National Library of Scotland, Ordnance Survey 25-inch mapping, Alva-area sheets (1898-99 revisions; 1900 publication).',
    tilePackageId: 'nls-alva-os-25-inch-1900-mosaic',
    bounds: [-3.8463, 56.1281, -3.7297, 56.1715],
  }),
  reviewMap({
    id: 'nls-culross-os-25-inch-1896-mosaic-alignment-review',
    projectId: 'culross-scotland',
    title: 'Culross 1896 - expanded alignment review (draft)',
    displayDate: '1896 draft',
    surveyStartYear: 1895,
    surveyEndYear: 1895,
    publicationYear: 1896,
    sourceUrl: 'https://maps.nls.uk/view/82882002',
    attribution:
      'National Library of Scotland, Ordnance Survey 25-inch mapping, Culross-area sheets (1895 survey; 1896 publication).',
    tilePackageId: 'nls-culross-os-25-inch-1896-mosaic',
    bounds: [-3.6564, 56.0436, -3.5782, 56.0874],
  }),
  reviewMap({
    id: 'nls-kincardine-os-25-inch-1896-mosaic-alignment-review',
    projectId: 'kincardine-on-forth-scotland',
    title: 'Kincardine-on-Forth 1896 - expanded alignment review (draft)',
    displayDate: '1896 draft',
    surveyStartYear: 1894,
    surveyEndYear: 1895,
    publicationYear: 1896,
    sourceUrl: 'https://maps.nls.uk/view/82881969',
    attribution:
      'National Library of Scotland, Ordnance Survey 25-inch mapping, Kincardine-area Fifeshire sheets (1894-95 surveys; 1896 publication).',
    tilePackageId: 'nls-kincardine-os-25-inch-1896-mosaic',
    bounds: [-3.7727, 56.0431, -3.6557, 56.0867],
  }),
  reviewMap({
    id: 'nls-tillicoultry-os-25-inch-1900-mosaic-alignment-review',
    projectId: 'tillicoultry-scotland',
    title: 'Tillicoultry circa 1900 - expanded alignment review (draft)',
    displayDate: '1900 draft',
    surveyStartYear: 1898,
    surveyEndYear: 1899,
    publicationYear: 1900,
    sourceUrl: 'https://maps.nls.uk/view/82875144',
    attribution:
      'National Library of Scotland, Ordnance Survey 25-inch mapping, Tillicoultry-area sheets (1898-99 revisions; 1900 publication).',
    tilePackageId: 'nls-tillicoultry-os-25-inch-1900-mosaic',
    bounds: [-3.8075, 56.1281, -3.6909, 56.1715],
  }),
];

export function withLocalMapReviews(
  projectPackage: ProjectPackage,
  enabled = import.meta.env.DEV && import.meta.env.VITE_ENABLE_LOCAL_MAP_REVIEWS === 'true',
): ProjectPackage {
  if (!enabled) return projectPackage;
  const mapsForProject = localMapReviews.filter(
    (map) => map.projectId === projectPackage.project.id,
  );
  if (
    !mapsForProject.length ||
    mapsForProject.every((map) =>
      projectPackage.historicMaps.some((existing) => existing.id === map.id),
    )
  )
    return projectPackage;

  return {
    ...projectPackage,
    historicMaps: [
      ...projectPackage.historicMaps,
      ...mapsForProject.filter(
        (map) => !projectPackage.historicMaps.some((existing) => existing.id === map.id),
      ),
    ],
  };
}
