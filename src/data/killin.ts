import packageJson from '../../data/projects/killin.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const killinPackage = withRecordedLicenceDecisions(packageJson as unknown as ProjectPackage);
