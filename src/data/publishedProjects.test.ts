import { describe, expect, it } from 'vitest';
import { sortPublishedPackages } from '../domain/projects';
import { publishedProjectPackages } from './publishedProjects';

describe('published project catalogue', () => {
  it('registers all published projects in country, region and town order', () => {
    const projects = sortPublishedPackages(publishedProjectPackages);
    expect(projects.map((item) => item.project.id)).toEqual([
      'alloa-scotland',
      'alva-scotland',
      'tillicoultry-scotland',
      'culross-scotland',
      'kincardine-on-forth-scotland',
      'quarriers-village-scotland',
      'biggar-scotland',
      'killin-scotland',
    ]);
    expect(
      projects.find((item) => item.project.id === 'culross-scotland')?.project.boundaryConfidence,
    ).toBe('high');
    expect(projects.find((item) => item.project.id === 'culross-scotland')?.project.centre).toEqual(
      [-3.625, 56.058],
    );
    expect(
      projects.find((item) => item.project.id === 'kincardine-on-forth-scotland')?.project.centre,
    ).toEqual([-3.7188, 56.069]);
    expect(projects.find((item) => item.project.id === 'alva-scotland')?.project.centre).toEqual([
      -3.8005, 56.1538,
    ]);
    expect(projects.every((item) => item.publication?.state === 'publishable')).toBe(true);
  });
});
