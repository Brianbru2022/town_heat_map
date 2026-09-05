import type { ProjectPackage } from '../domain/models';
import { assertValidProjectPackage } from '../domain/packageSchema';
import { alloaPackage } from './alloa';
import { alvaPackage } from './alva';
import { biggarPackage } from './biggar';
import { culrossPackage } from './culross';
import { kincardinePackage } from './kincardine';
import { killinPackage } from './killin';
import { quarriersVillagePackage } from './quarriersVillage';
import { tillicoultryPackage } from './tillicoultry';

// Register only curated, published project packages here. The catalogue UI and API sort them
// consistently by country, region and town.
const cataloguePackages: unknown[] = [
  alloaPackage,
  alvaPackage,
  culrossPackage,
  kincardinePackage,
  tillicoultryPackage,
  quarriersVillagePackage,
  biggarPackage,
  killinPackage,
];

/** Invalid source JSON fails application startup/build instead of entering the public catalogue. */
export const publishedProjectPackages: ProjectPackage[] = cataloguePackages.map((projectPackage) =>
  assertValidProjectPackage(projectPackage, 'static published catalogue'),
);
