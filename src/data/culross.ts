import packageJson from '../../data/projects/culross.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const culrossPackage = withRecordedLicenceDecisions(
  packageJson as unknown as ProjectPackage,
);
