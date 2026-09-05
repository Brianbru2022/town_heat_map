import packageJson from '../../data/projects/alloa.json';
import type { ProjectPackage } from '../domain/models';
import { withRecordedLicenceDecisions } from './recordedLicenceDecisions';

// Populate data/projects/alloa.json with reviewed source-backed records, then rebuild/seed.
export const alloaPackage = withRecordedLicenceDecisions(packageJson as unknown as ProjectPackage);
