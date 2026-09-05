import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { ProjectPackage } from '../src/domain/models';
import { hasEstablishedDate } from '../src/domain/timeline';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const outputPath = resolve(process.argv[3] ?? 'data/review/alloa-date-review-queue.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const records = pkg.features
  .filter((feature) => !hasEstablishedDate(feature))
  .map((feature) => {
    const official = feature.sourceRecords.find((source) =>
      ['official_statutory', 'official_non_statutory'].includes(source.reliability),
    );
    const priority = feature.id.startsWith('hes-') ? 1 : feature.name === 'ALLOA' ? 3 : 2;
    return {
      priority,
      id: feature.id,
      name: feature.name,
      featureType: feature.featureType,
      sourceRecordId: official?.sourceRecordId,
      sourceUrl: official?.sourceUrl,
      status: 'requires_individual_authoritative_source_review',
      rule: 'Do not infer a construction date from a generic NRHE classification or a modern map.',
    };
  })
  .sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ projectId: pkg.project.id, generatedAt: new Date().toISOString(), records }, null, 2)}\n`,
);
console.log(`Wrote ${records.length} undated records to ${outputPath}.`);
