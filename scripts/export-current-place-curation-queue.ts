import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');

function currentOsmSource(feature: HeritageFeature): SourceRecord | undefined {
  return feature.sourceRecords.find(
    (source) => source.sourceName === 'OpenStreetMap current community places',
  );
}

function osmValue(source: SourceRecord | undefined, key: string): string {
  const notes = source?.notes ?? '';
  return (
    new RegExp(`(?:^|[:;]\\s*)${key}=([^;]+)`).exec(notes)?.[1]?.replace(/\\.$/, '').trim() ?? ''
  );
}

function csvCell(value: string | undefined): string {
  const text = value ?? '';
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const rows = pkg.features
  .map((feature) => ({ feature, source: currentOsmSource(feature) }))
  .filter(({ feature, source }) => feature.tags.includes('osm-community-place') && source)
  .sort(({ feature: left }, { feature: right }) => left.name.localeCompare(right.name))
  .map(({ feature, source }) => {
    const category =
      feature.tags
        .find((tag) => tag.startsWith('osm-community-') && tag !== 'osm-community-place')
        ?.replace('osm-community-', '') ?? '';
    return [
      feature.id,
      pkg.project.locality,
      feature.name,
      category,
      source?.sourceUrl,
      osmValue(source, 'website'),
      osmValue(source, 'wikipedia'),
      osmValue(source, 'description'),
      osmValue(source, 'opening_hours'),
      '',
      '',
      '',
      '',
      '',
      '',
      'needs_source_review',
    ]
      .map(csvCell)
      .join(',');
  });

const header = [
  'feature_id',
  'town',
  'name',
  'category',
  'osm_url',
  'website',
  'wikipedia',
  'osm_description',
  'osm_opening_hours',
  'curated_summary',
  'curated_opening_hours',
  'rating',
  'rating_provider',
  'rating_source_url',
  'rating_accessed_at',
  'review_status',
].join(',');
const outputDirectory = resolve('data/review');
const outputPath = resolve(outputDirectory, `${pkg.project.id}-current-place-curation.csv`);
await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, `\ufeff${header}\n${rows.join('\n')}\n`, 'utf8');
console.log(`Wrote ${rows.length} current-place curation rows to ${basename(outputPath)}.`);
