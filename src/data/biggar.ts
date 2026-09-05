import packageJson from '../../data/projects/biggar.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const biggarPackage = withRecordedLicenceDecisions(packageJson as unknown as ProjectPackage);
