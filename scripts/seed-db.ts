import { Client } from 'pg';
import { publishedProjectPackages } from '../src/data/publishedProjects';
import { publicProjectPackage } from '../src/domain/publication';
import { assertValidProjectPackage } from '../src/domain/packageSchema';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required to seed PostGIS.');
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
for (const projectPackage of publishedProjectPackages) {
  const validatedPackage = assertValidProjectPackage(
    projectPackage,
    `database seed ${projectPackage.project.id}`,
  );
  const publicPackage = publicProjectPackage(validatedPackage);
  if (!publicPackage)
    throw new Error(
      `Refusing to seed ${projectPackage.project.id} without an explicit publishable package declaration.`,
    );
  await client.query(
    'INSERT INTO projects (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, published_at = now()',
    [publicPackage.project.id, JSON.stringify(publicPackage.project)],
  );
  await client.query(
    'INSERT INTO project_packages (id, payload) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, published_at = now()',
    [publicPackage.project.id, JSON.stringify(publicPackage)],
  );
}
await client.end();
console.log(`Seeded ${publishedProjectPackages.length} published project packages.`);
