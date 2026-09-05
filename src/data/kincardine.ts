import packageJson from '../../data/projects/kincardine.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const kincardinePackage = withRecordedLicenceDecisions(
  packageJson as unknown as ProjectPackage,
);
