import packageJson from '../../data/projects/alva.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

export const alvaPackage = withRecordedLicenceDecisions(packageJson as unknown as ProjectPackage);
