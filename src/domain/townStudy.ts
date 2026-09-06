import { booleanPointInPolygon, buffer, point } from '@turf/turf';
import type { Feature, MultiPolygon, Point, Polygon } from 'geojson';
import { geometryIsStructurallyValid } from './validation';

export type TownSelection = 'inside_locality' | 'heritage_buffer' | 'excluded';

export function bufferedTownBoundary(
  locality: Feature<Polygon | MultiPolygon>,
  bufferMetres: number,
): Feature<Polygon | MultiPolygon> {
  if (
    !locality ||
    locality.type !== 'Feature' ||
    !geometryIsStructurallyValid(locality.geometry) ||
    !['Polygon', 'MultiPolygon'].includes(locality.geometry.type) ||
    !Number.isFinite(bufferMetres) ||
    bufferMetres < 0
  )
    throw new Error('A structurally valid town boundary and finite buffer distance are required.');
  const result = buffer(locality, bufferMetres, { units: 'meters', steps: 16 });
  if (!result || (result.geometry.type !== 'Polygon' && result.geometry.type !== 'MultiPolygon'))
    throw new Error('Could not create a usable town heritage buffer.');
  return result as Feature<Polygon | MultiPolygon>;
}

export function classifyTownPoint(
  geometry: Point,
  locality: Feature<Polygon | MultiPolygon>,
  bufferedLocality: Feature<Polygon | MultiPolygon>,
): TownSelection {
  if (
    !geometryIsStructurallyValid(geometry) ||
    geometry.type !== 'Point' ||
    !geometryIsStructurallyValid(locality?.geometry) ||
    !['Polygon', 'MultiPolygon'].includes(locality.geometry.type) ||
    !geometryIsStructurallyValid(bufferedLocality?.geometry) ||
    !['Polygon', 'MultiPolygon'].includes(bufferedLocality.geometry.type)
  )
    return 'excluded';
  const candidate = point(geometry.coordinates);
  if (booleanPointInPolygon(candidate, locality)) return 'inside_locality';
  if (booleanPointInPolygon(candidate, bufferedLocality)) return 'heritage_buffer';
  return 'excluded';
}
