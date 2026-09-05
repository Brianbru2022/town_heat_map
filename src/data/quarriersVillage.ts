import packageJson from '../../data/projects/quarriers-village.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const quarriersVillagePackage = withRecordedLicenceDecisions(
  packageJson as unknown as ProjectPackage,
);
