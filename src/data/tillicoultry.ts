import packageJson from '../../data/projects/tillicoultry.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const tillicoultryPackage = withRecordedLicenceDecisions(
  packageJson as unknown as ProjectPackage,
);
