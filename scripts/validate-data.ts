import { publishedProjectPackages } from '../src/data/publishedProjects';
import { assessProjectPackage } from '../src/domain/publication';
import { validateProjectPackageSchema } from '../src/domain/packageSchema';
import { validateFeatures } from '../src/domain/validation';

const results = publishedProjectPackages.map((projectPackage) => {
  const schema = validateProjectPackageSchema(projectPackage);
  const validation = validateFeatures(projectPackage.project, projectPackage.features);
  const publication = assessProjectPackage(projectPackage);
  return {
    project: projectPackage.project.id,
    records: projectPackage.features.length,
    schema,
    validation,
    publication: publication.summary,
  };
});
console.log(JSON.stringify(results, null, 2));
if (
  results.some(
    (result) => !result.schema.valid || result.validation.some((item) => item.severity === 'error'),
  )
)
  process.exitCode = 1;
