import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../data/alloa';
import { publicGeometry, publicProjectPackage } from './publication';
import { geometryIsStructurallyValid, MAX_GEOMETRY_NESTING_DEPTH } from './validation';

const validGeometries = [
  { type: 'Point', coordinates: [-3.79, 56.11] },
  { type: 'MultiPoint', coordinates: [[-3.79, 56.11]] },
  {
    type: 'LineString',
    coordinates: [
      [-3.79, 56.11],
      [-3.78, 56.12],
    ],
  },
  {
    type: 'MultiLineString',
    coordinates: [
      [
        [-3.79, 56.11],
        [-3.78, 56.12],
      ],
    ],
  },
  {
    type: 'Polygon',
    coordinates: [
      [
        [-3.8, 56.1],
        [-3.7, 56.1],
        [-3.7, 56.2],
        [-3.8, 56.1],
      ],
    ],
  },
  {
    type: 'MultiPolygon',
    coordinates: [
      [
        [
          [-3.8, 56.1],
          [-3.7, 56.1],
          [-3.7, 56.2],
          [-3.8, 56.1],
        ],
      ],
    ],
  },
  {
    type: 'GeometryCollection',
    geometries: [{ type: 'Point', coordinates: [-3.79, 56.11] }],
  },
] as const;

const sparsePosition = [-3.79, 56.11, 0];
delete sparsePosition[2];
const sparsePositions: unknown[] = [
  [-3.79, 56.11],
  [-3.78, 56.12],
];
delete sparsePositions[1];

describe('total public geometry boundary', () => {
  it.each(validGeometries)('accepts and reconstructs valid $type geometry', (geometry) => {
    const withSentinel = { ...structuredClone(geometry), privateNote: 'GEOMETRY-SENTINEL' };
    expect(geometryIsStructurallyValid(withSentinel)).toBe(true);
    expect(publicGeometry(withSentinel)).toEqual(geometry);
    expect(JSON.stringify(publicGeometry(withSentinel))).not.toContain('GEOMETRY-SENTINEL');
  });

  it.each([
    null,
    undefined,
    true,
    1,
    'Point',
    [],
    {},
    { type: 'Point' },
    { type: 'Point', coordinates: [181, 0] },
    { type: 'Point', coordinates: [0, 91] },
    { type: 'Point', coordinates: [0, Number.NaN] },
    { type: 'Point', coordinates: sparsePosition },
    { type: 'MultiPoint', coordinates: sparsePositions },
    { type: 'LineString', coordinates: [[0, 0]] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      ],
    },
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'GeometryCollection', geometries: [] },
    { type: 'GeometryCollection', geometries: [{ type: 'Unknown', coordinates: [] }] },
  ])('rejects malformed geometry without an exception: %#', (geometry) => {
    expect(() => geometryIsStructurallyValid(geometry)).not.toThrow();
    expect(geometryIsStructurallyValid(geometry)).toBe(false);
    expect(publicGeometry(geometry)).toBeUndefined();
  });

  it('enforces the documented GeometryCollection nesting limit without recursion overflow', () => {
    let accepted: unknown = { type: 'Point', coordinates: [-3.79, 56.11] };
    for (let index = 0; index < MAX_GEOMETRY_NESTING_DEPTH; index += 1)
      accepted = { type: 'GeometryCollection', geometries: [accepted] };
    expect(geometryIsStructurallyValid(accepted)).toBe(true);

    const rejected = { type: 'GeometryCollection', geometries: [accepted] };
    expect(() => geometryIsStructurallyValid(rejected)).not.toThrow();
    expect(geometryIsStructurallyValid(rejected)).toBe(false);
  });

  it('fails malformed boundary, settlement and additional locations closed', () => {
    const boundaryPackage = structuredClone(alloaPackage);
    boundaryPackage.project.boundary.geometry = {
      type: 'Polygon',
      coordinates: null,
    } as never;
    expect(() => publicProjectPackage(boundaryPackage)).not.toThrow();
    expect(publicProjectPackage(boundaryPackage)).toBeUndefined();

    const optionalPackage = structuredClone(alloaPackage);
    const target = optionalPackage.features.find(
      (feature) => feature.id === 'hes-listed-building:LB20953',
    )!;
    target.additionalPointLocations = [null] as never;
    if (optionalPackage.settlementPolygons[0])
      optionalPackage.settlementPolygons[0].geometry = {
        type: 'Polygon',
        coordinates: null,
      } as never;
    const delivered = publicProjectPackage(optionalPackage);
    expect(delivered?.features.find((feature) => feature.id === target.id)).not.toHaveProperty(
      'additionalPointLocations',
    );
    expect(delivered?.settlementPolygons).toEqual([]);
  });
});
