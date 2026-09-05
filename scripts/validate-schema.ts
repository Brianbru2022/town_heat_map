import { publishedProjectPackages } from '../src/data/publishedProjects';
import { validateProjectPackageSchema } from '../src/domain/packageSchema';

for (const projectPackage of publishedProjectPackages) {
  const result = validateProjectPackageSchema(projectPackage);
  if (!result.valid) {
    throw new Error(
      `${projectPackage.project.id} failed runtime schema validation: ${result.errors.join('; ')}`,
    );
  }
}

console.log(
  `Runtime schema validation passed for ${publishedProjectPackages.length} project packages.`,
);
