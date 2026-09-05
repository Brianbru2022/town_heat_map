import Ajv2020, { type ErrorObject } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import projectPackageSchema from '../../schemas/historic-town-project.schema.json';
import type { ProjectPackage } from './models';

export interface ProjectPackageSchemaResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateProjectPackage = ajv.compile<ProjectPackage>(projectPackageSchema);

function formatError(error: ErrorObject): string {
  const path = error.instancePath || '/';
  return `${path} ${error.message ?? 'is invalid'}`;
}

/** Validate untrusted package data before it can participate in publication decisions. */
export function validateProjectPackageSchema(value: unknown): ProjectPackageSchemaResult {
  const valid = validateProjectPackage(value);
  return {
    valid,
    errors: valid ? [] : (validateProjectPackage.errors ?? []).map(formatError),
  };
}

/** Build/startup and ingestion helper: invalid source packages are rejected, never coerced. */
export function assertValidProjectPackage(value: unknown, context: string): ProjectPackage {
  const result = validateProjectPackageSchema(value);
  if (!result.valid) {
    throw new Error(`Invalid Townscape project package (${context}): ${result.errors.join('; ')}`);
  }
  return value as ProjectPackage;
}
