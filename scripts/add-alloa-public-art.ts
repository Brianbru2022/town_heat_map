import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/alloa.json');
const accessedAt = new Date().toISOString();

const publicArt: HeritageFeature[] = [
  {
    id: 'curated:public-art-i-can-see-for-miles',
    projectId: 'alloa-scotland',
    name: 'I Can See For Miles',
    alternativeNames: [],
    countryCode: 'GB-SCT',
    region: 'Clackmannanshire',
    locality: 'Alloa',
    address: 'Station Square, Alloa',
    featureType: 'public_art',
    significance: 'local',
    statutoryStatus: 'Not a heritage designation',
    geometry: { type: 'Point', coordinates: [-3.7887368, 56.1177727] },
    locationType: 'exact',
    documentedDateText: 'Installed May 2008',
    earliestPossibleYear: 2008,
    latestPossibleYear: 2008,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
    locationConfidence: 'high',
    survival: 'substantially_intact',
    shortDescription:
      'Andy Scott sculpture of an adult and child, installed at Station Square before the railway reopening.',
    fullDescription:
      'Commissioned public artwork by Andy Scott. The Council describes it as a focal point for Station Square that references Alloa’s working past and future generations.',
    sourceRecords: [
      {
        sourceName: 'I Can See for Miles',
        sourceOrganisation: 'Clackmannanshire Council',
        sourceUrl: 'https://www.clacks.gov.uk/culture/trainstnsculpture/',
        accessedAt,
        licence:
          'Council web content consulted as a local-authority reference; retain the source link and do not redistribute its text.',
        notes:
          'The Council records installation on Station Square before the May 2008 railway opening.',
        reliability: 'local_authority',
      },
      {
        sourceName: 'OpenStreetMap artwork node',
        sourceOrganisation: 'OpenStreetMap contributors',
        sourceRecordId: 'node/8946381280',
        sourceUrl: 'https://www.openstreetmap.org/node/8946381280',
        accessedAt,
        licence: 'Open Database License (ODbL); OpenStreetMap attribution required.',
        notes: 'Used only to locate the Council-identified artwork point.',
        reliability: 'discovery_only',
      },
    ],
    licence: 'See individual source records.',
    tags: ['public-art', 'sculpture', 'andy-scott', 'community-layer'],
    createdAt: accessedAt,
    updatedAt: accessedAt,
    reviewed: true,
    reviewNotes:
      'Location comes from the OpenStreetMap artwork node and is supported by the Council’s Station Square description.',
  },
  {
    id: 'curated:public-art-lifeline',
    projectId: 'alloa-scotland',
    name: 'Lifeline',
    alternativeNames: [],
    countryCode: 'GB-SCT',
    region: 'Clackmannanshire',
    locality: 'Alloa',
    address: 'Shillinghill Roundabout, Alloa',
    featureType: 'public_art',
    significance: 'local',
    statutoryStatus: 'Not a heritage designation',
    geometry: { type: 'Point', coordinates: [-3.7876535, 56.1164828] },
    locationType: 'exact',
    documentedDateText: 'Installed April 2011',
    earliestPossibleYear: 2011,
    latestPossibleYear: 2011,
    dateBasis: 'documented_construction',
    dateConfidence: 'high',
    locationConfidence: 'high',
    survival: 'substantially_intact',
    shortDescription:
      'Andy Scott public sculpture at Shillinghill Roundabout, commemorating emergency services.',
    fullDescription:
      'A steel sculpture in the form of a giant hand supporting a woman and child. The Council’s public-art trail records installation at Shillinghill Roundabout in April 2011.',
    sourceRecords: [
      {
        sourceName: 'Andy Scott Public Art Trail',
        sourceOrganisation: 'Clackmannanshire Council',
        sourceUrl: 'https://www.clacks.gov.uk/document/3588.pdf',
        accessedAt,
        licence:
          'Council document consulted as a local-authority reference; retain the source link and do not redistribute its text.',
        notes:
          'The trail identifies Lifeline at Shillinghill Roundabout, Alloa, installed April 2011.',
        reliability: 'local_authority',
      },
      {
        sourceName: 'OpenStreetMap artwork node',
        sourceOrganisation: 'OpenStreetMap contributors',
        sourceRecordId: 'node/4884199857',
        sourceUrl: 'https://www.openstreetmap.org/node/4884199857',
        accessedAt,
        licence: 'Open Database License (ODbL); OpenStreetMap attribution required.',
        notes: 'Used only to locate the Council-identified artwork point.',
        reliability: 'discovery_only',
      },
    ],
    licence: 'See individual source records.',
    tags: ['public-art', 'sculpture', 'andy-scott', 'community-layer'],
    createdAt: accessedAt,
    updatedAt: accessedAt,
    reviewed: true,
    reviewNotes:
      'Location comes from the OpenStreetMap artwork node and is supported by the Council’s Shillinghill Roundabout description.',
  },
];

const packageJson = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const existingIds = new Set(packageJson.features.map((feature) => feature.id));
packageJson.features = [
  ...packageJson.features,
  ...publicArt.filter((feature) => !existingIds.has(feature.id)),
];
packageJson.validation = validateFeatures(packageJson.project, packageJson.features);
const errors = packageJson.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);

await writeFile(projectPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(
  `Added ${publicArt.filter((feature) => !existingIds.has(feature.id)).length} source-backed Alloa public-art feature(s).`,
);
