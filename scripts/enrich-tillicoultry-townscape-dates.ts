import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { HeritageFeature, ProjectPackage, SourceRecord } from '../src/domain/models';
import { validateFeatures } from '../src/domain/validation';

const projectPath = resolve(process.argv[2] ?? 'data/projects/tillicoultry.json');
const pkg = JSON.parse(await readFile(projectPath, 'utf8')) as ProjectPackage;
const accessedAt = new Date().toISOString();

const appraisalSource: SourceRecord = {
  sourceName: 'Tillicoultry Conservation Area Character Appraisal, February 2018',
  sourceOrganisation: 'Clackmannanshire Council',
  sourceRecordId: 'tillicoultry-historical-development-2018',
  sourceUrl: 'https://www.clacks.gov.uk/document/6454.pdf',
  accessedAt,
  licence: 'Open Government Licence v3.0; retain Clackmannanshire Council attribution.',
  notes:
    'Council-commissioned conservation appraisal. Dates are applied only where its historical-development narrative names the mapped place, street or site.',
  reliability: 'local_authority',
};

function feature(id: string): HeritageFeature {
  const result = pkg.features.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing Tillicoultry feature ${id}.`);
  return result;
}

function addSource(target: HeritageFeature, source: SourceRecord): void {
  if (
    target.sourceRecords.some(
      (candidate) =>
        candidate.sourceOrganisation === source.sourceOrganisation &&
        candidate.sourceRecordId === source.sourceRecordId,
    )
  )
    return;
  target.sourceRecords.push(source);
}

function apply(target: HeritageFeature, values: Partial<HeritageFeature>): void {
  Object.assign(target, values, { updatedAt: accessedAt, reviewed: true });
  addSource(target, appraisalSource);
}

// The Council appraisal describes the historic site sequence, rather than a
// survey date for every surviving mill component.  `present_by` makes that
// distinction visible in cards and the timeline.
apply(feature('nrhe:48279'), {
  documentedDateText:
    'Castle Mills established by 1806 (site-sequence evidence; construction year not established)',
  latestPossibleYear: 1806,
  datePrecision: 'present-by site evidence',
  dateBasis: 'present_by',
  dateConfidence: 'medium',
  reviewNotes:
    'Council appraisal records Castle Mills as following the first water-powered mill of the late eighteenth century and preceding Craigfoot Mill (1806). This dates site presence by 1806, not every building component.',
});

apply(feature('nrhe:220124'), {
  documentedDateText: 'Built 1829; demolished around 1960',
  earliestPossibleYear: 1829,
  latestPossibleYear: 1829,
  datePrecision: 'documented year',
  dateBasis: 'documented_construction',
  dateConfidence: 'medium',
  survival: 'site_only_or_demolished',
  reviewNotes:
    'Council appraisal states that Tillicoultry House was built in 1829 and had been demolished around 1960.',
});

apply(feature('nrhe:310488'), {
  documentedDateText: 'Ochil Street laid out from the 1850s (street-development evidence)',
  earliestPossibleYear: 1850,
  latestPossibleYear: 1859,
  datePrecision: 'documented decade / street-development evidence',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  reviewNotes:
    'Council appraisal dates the laying out of Ochil Street by the Tillicoultry Ochil United Housing Society from the 1850s. This does not date every property on the street.',
});

apply(feature('nrhe:310489'), {
  documentedDateText: 'Hamilton Street developed in 1851 (street-development evidence)',
  earliestPossibleYear: 1851,
  latestPossibleYear: 1851,
  datePrecision: 'documented year / street-development evidence',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  reviewNotes:
    'Council appraisal records development of Hamilton Street in 1851. This is street-development evidence, not a construction date for every property.',
});

apply(feature('nrhe:310490'), {
  documentedDateText: 'Hill Street laid out in 1892 (street-development evidence)',
  earliestPossibleYear: 1892,
  latestPossibleYear: 1892,
  datePrecision: 'documented year / street-development evidence',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  reviewNotes:
    'Council appraisal records that Hill Street was not laid out until 1892. This is street-development evidence, not a construction date for every property.',
});

apply(feature('nrhe:310456'), {
  documentedDateText:
    'Walker Terrace dates to the late nineteenth century (street-development evidence)',
  earliestPossibleYear: 1870,
  latestPossibleYear: 1899,
  datePrecision: 'documented broad period / street-development evidence',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  reviewNotes:
    'Council appraisal dates Walker Terrace to the late nineteenth century. The range is deliberately broad and does not date every property.',
});

const colliery = feature('nrhe:130824');
Object.assign(colliery, {
  documentedDateText: 'Production commenced 1876 (Tillicoultry 1) and 1947 (Tillicoultry 2)',
  earliestPossibleYear: 1876,
  latestPossibleYear: 1947,
  datePrecision: 'documented operating phases',
  dateBasis: 'documented_date_range',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'NRHE/Trove records production commencement for Tillicoultry 1 in 1876 and Tillicoultry 2 in 1947. The range describes two colliery phases, not a single construction date.',
});
addSource(colliery, {
  sourceName: 'Historic Environment Scotland NRHE/Trove detailed Tillicoultry Colliery record',
  sourceOrganisation: 'Historic Environment Scotland',
  sourceRecordId: '130824-date-review',
  sourceUrl: 'https://www.trove.scot/place/130824',
  accessedAt,
  licence: 'Open Government Licence v3.0; retain Historic Environment Scotland attribution.',
  notes:
    'NRHE archaeology note records production commencement in 1876 (Tillicoultry 1) and 1947 (Tillicoultry 2).',
  reliability: 'official_non_statutory',
});

const station = feature('nrhe:111917');
Object.assign(station, {
  documentedDateText: 'Railway station present by 1851, when the Alloa–Tillicoultry line opened',
  earliestPossibleYear: undefined,
  latestPossibleYear: 1851,
  datePrecision: 'present-by transport-service evidence',
  dateBasis: 'present_by',
  dateConfidence: 'medium',
  updatedAt: accessedAt,
  reviewed: true,
  reviewNotes:
    'Council appraisal dates opening of the Alloa–Tillicoultry railway to 1851. This supports station presence by that date; it is not asserted as the station building construction year.',
});
addSource(station, appraisalSource);

// The local-authority appraisal is the strongest directly cited source for the
// listed clock tower.  Retain the earlier pack's 1878 reference in review
// history, but display the Council's explicit 1879 date.
apply(feature('curated:hes-lb42050'), {
  documentedDateText:
    'Clock tower added in 1879; former Popular Institute built 1859 and demolished 1986',
  earliestPossibleYear: 1879,
  latestPossibleYear: 1879,
  datePrecision: 'documented year',
  dateBasis: 'documented_construction',
  dateConfidence: 'high',
  reviewNotes:
    'Council appraisal explicitly dates the clock tower to 1879. An earlier curated source said 1878; that conflicting secondary value remains in the import history but is not used for the public date.',
});

pkg.validation = validateFeatures(pkg.project, pkg.features);
const errors = pkg.validation.filter((item) => item.severity === 'error');
if (errors.length) throw new Error(`Refusing to write ${errors.length} validation error(s).`);
await writeFile(projectPath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
console.log('Enriched eight Tillicoultry townscape records with direct source-backed dates.');
