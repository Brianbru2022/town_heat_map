import { describe, expect, it } from 'vitest';
import { historicCharacterScore } from '../domain/scoring';
import { publishedProjectPackages } from './publishedProjects';

describe('current OpenStreetMap community places', () => {
  it('are optional current-context records with unique OSM IDs and no heat-map score', () => {
    for (const pkg of publishedProjectPackages) {
      const places = pkg.features.filter((feature) => feature.tags.includes('osm-community-place'));
      expect(places.length, pkg.project.name).toBeGreaterThan(0);
      expect(new Set(places.map((feature) => feature.id)).size, pkg.project.name).toBe(
        places.length,
      );
      expect(pkg.sources.some((source) => source.id === 'osm-current-community-places')).toBe(true);
      for (const feature of places) {
        expect(feature.tags).toContain('current-context');
        expect(
          feature.sourceRecords.some((source) =>
            source.sourceRecordId?.match(/^(node|way|relation)\/\d+$/),
          ),
        ).toBe(true);
        expect(historicCharacterScore(feature, pkg.project.methodology)).toBe(0);
      }
    }
  });
});
