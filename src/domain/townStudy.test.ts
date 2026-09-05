import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import { bufferedTownBoundary, classifyTownPoint } from './townStudy';

const locality: Feature<Polygon> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-3.75, 56.15],
        [-3.74, 56.15],
        [-3.74, 56.16],
        [-3.75, 56.16],
        [-3.75, 56.15],
      ],
    ],
  },
};

describe('town study selection', () => {
  it('uses exact locality geometry before the heritage buffer', () => {
    const buffered = bufferedTownBoundary(locality, 500);
    expect(
      classifyTownPoint({ type: 'Point', coordinates: [-3.745, 56.155] }, locality, buffered),
    ).toBe('inside_locality');
    expect(
      classifyTownPoint({ type: 'Point', coordinates: [-3.753, 56.155] }, locality, buffered),
    ).toBe('heritage_buffer');
    expect(
      classifyTownPoint({ type: 'Point', coordinates: [-3.8, 56.155] }, locality, buffered),
    ).toBe('excluded');
  });
});
