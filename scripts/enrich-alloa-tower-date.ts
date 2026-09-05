import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve('data/projects/alloa.json');
const accessedAt = new Date().toISOString();
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const tower = pkg.features.find((feature) => feature.id === 'nrhe:320380');
if (!tower) throw new Error('Alloa Tower (NRHE 320380) is not present in the Alloa package.');

const source: SourceRecord = {
  sourceName: 'Historic Environment Scotland Listed Building record: Alloa Tower (LB20959)',
  sourceOrganisation: 'Historic Environment Scotland',
  sourceRecordId: 'LB20959',
  sourceUrl:
    'https://portal.historicenvironment.scot/apex/f?p=1505:300:::::VIEWTYPE,VIEWREF:designation,LB20959',
  accessedAt,
  licence:
    'Open Government Licence v3.0; retain Historic Environment Scotland attribution and source link.',
  quotedDateText: '15th century, altered 16th, 17th and late 18th century.',
  notes:
    'HES identifies this as Alloa Tower; the description supplies the historic period and later alteration sequence.',
  reliability: 'official_statutory',
};
tower.name = 'Alloa Tower';
tower.alternativeNames = [...new Set([...tower.alternativeNames, 'Alloa Tower Estate'])];
tower.designationType = 'Listed Building';
tower.statutoryStatus = 'Listed Building';
tower.documentedDateText = '15th century; altered 16th, 17th and late 18th centuries.';
tower.earliestPossibleYear = 1400;
tower.latestPossibleYear = 1499;
tower.datePrecision = 'century';
tower.dateBasis = 'documented_date_range';
tower.dateConfidence = 'high';
tower.sourceRecords = [
  ...tower.sourceRecords.filter((record) => record.sourceRecordId !== source.sourceRecordId),
  source,
];
tower.tags = [...new Set([...tower.tags, 'hes-listed-building', 'date-enriched'])];
tower.reviewed = true;
tower.reviewNotes =
  'Date reviewed against the official HES Listed Building record LB20959. The 15th-century date is construction-period evidence; later alterations remain in the cited wording.';
tower.updatedAt = accessedAt;
pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((result) => result.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Enriched Alloa Tower from HES listed-building record LB20959.');
