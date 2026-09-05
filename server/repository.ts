import { Client } from 'pg';
import type { ProjectPackage } from '../src/domain/models';
import { validateProjectPackageSchema } from '../src/domain/packageSchema';
import { publishedProjectPackages } from '../src/data/publishedProjects';

export interface ProjectRepository {
  list(): Promise<ProjectPackage['project'][]>;
  get(id: string): Promise<ProjectPackage | undefined>;
}
export class StaticProjectRepository implements ProjectRepository {
  async list() {
    return publishedProjectPackages.map((projectPackage) => projectPackage.project);
  }
  async get(id: string) {
    return publishedProjectPackages.find((projectPackage) => projectPackage.project.id === id);
  }
}
export class PostgisProjectRepository implements ProjectRepository {
  constructor(private readonly client: Client) {}
  async list() {
    const result = await this.client.query<{ payload: unknown }>(
      'SELECT payload FROM project_packages ORDER BY published_at DESC',
    );
    return result.rows.flatMap((row, index) => {
      const validation = validateProjectPackageSchema(row.payload);
      if (!validation.valid) {
        console.error(
          `Ignoring schema-invalid database project package at row ${index + 1}: ${validation.errors.join('; ')}`,
        );
        return [];
      }
      return [(row.payload as ProjectPackage).project];
    });
  }
  async get(id: string) {
    const result = await this.client.query<{ payload: unknown }>(
      'SELECT payload FROM project_packages WHERE id = $1',
      [id],
    );
    const payload = result.rows[0]?.payload;
    if (payload === undefined) return undefined;
    const validation = validateProjectPackageSchema(payload);
    if (!validation.valid) {
      console.error(
        `Ignoring schema-invalid database project package ${id}: ${validation.errors.join('; ')}`,
      );
      return undefined;
    }
    return payload as ProjectPackage;
  }
}
export async function createProjectRepository(): Promise<ProjectRepository> {
  if (!process.env.DATABASE_URL) return new StaticProjectRepository();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    return new PostgisProjectRepository(client);
  } catch (error) {
    console.warn(
      'PostGIS unavailable; using static published package data.',
      error instanceof Error ? error.name : 'unknown error',
    );
    await client.end().catch(() => undefined);
    return new StaticProjectRepository();
  }
}
