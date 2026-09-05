import type { ProjectPackage, PublicationSummary, TownProject } from '../domain/models';
import { sortPublishedProjects } from '../domain/projects';

export type PublishedProjectSummary = Pick<
  TownProject,
  'id' | 'name' | 'countryCode' | 'country' | 'region' | 'locality' | 'centre'
> & {
  featureCount?: number;
  publicationSummary?: PublicationSummary;
};

let catalogueRequest: Promise<PublishedProjectSummary[]> | undefined;
const projectRequests = new Map<string, Promise<ProjectPackage>>();

async function getJson<T>(url: string, description: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${description} could not be loaded (${response.status}).`);
  return (await response.json()) as T;
}

export function loadProjectCatalogue(): Promise<PublishedProjectSummary[]> {
  catalogueRequest ??= getJson<PublishedProjectSummary[]>('/api/projects', 'The town catalogue')
    .then((projects) => sortPublishedProjects(projects))
    .catch((error: unknown) => {
      catalogueRequest = undefined;
      throw error;
    });
  return catalogueRequest;
}

export function loadProjectPackage(id: string): Promise<ProjectPackage> {
  const cached = projectRequests.get(id);
  if (cached) return cached;

  const request = getJson<ProjectPackage>(
    `/api/projects/${encodeURIComponent(id)}`,
    'The selected town guide',
  ).catch((error: unknown) => {
    projectRequests.delete(id);
    throw error;
  });
  projectRequests.set(id, request);
  return request;
}

export function clearProjectClientCache(): void {
  catalogueRequest = undefined;
  projectRequests.clear();
}
