import type { PublicFeature, PublicProjectPackage } from '../src/domain/publicDto';

function parseCsv(value: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (character === '"' && value[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += character;
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

export function spreadsheetSafeText(value: string): string {
  return /^[\t\r\n ]*[=+\-@]/.test(value) || /^[\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string, protectFormula = false): string {
  const safe = protectFormula ? spreadsheetSafeText(value) : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Defensively filters a generated export even when the file predates the current publication audit. */
export function filterCsvByRecordIds(
  value: string,
  idColumn: string,
  publishableIds: ReadonlySet<string>,
): string {
  const hasByteOrderMark = value.startsWith('\uFEFF');
  const rows = parseCsv(hasByteOrderMark ? value.slice(1) : value);
  const header = rows[0] ?? [];
  const idIndex = header.indexOf(idColumn);
  if (idIndex === -1) throw new Error(`CSV export is missing the ${idColumn} column.`);
  const filtered = [header, ...rows.slice(1).filter((row) => publishableIds.has(row[idIndex]))];
  return `${hasByteOrderMark ? '\uFEFF' : ''}${filtered
    .map((row, index) => row.map((cell) => csvCell(cell, index > 0)).join(','))
    .join('\r\n')}\r\n`;
}

/**
 * Projects a generated CSV through an explicit visitor-column allowlist after
 * its rows have passed the publication gate. New internal columns therefore
 * remain local until deliberately added to this contract.
 */
export function publicCsvByRecordIds(
  value: string,
  idColumn: string,
  publishableIds: ReadonlySet<string>,
  publicColumns: readonly string[],
): string {
  const hasByteOrderMark = value.startsWith('\uFEFF');
  const rows = parseCsv(hasByteOrderMark ? value.slice(1) : value);
  const header = rows[0] ?? [];
  const idIndex = header.indexOf(idColumn);
  if (idIndex === -1) throw new Error(`CSV export is missing the ${idColumn} column.`);
  const indexes = publicColumns.map((column) => header.indexOf(column));
  const missing = publicColumns.filter((_column, index) => indexes[index] === -1);
  if (missing.length)
    throw new Error(`CSV export is missing public columns: ${missing.join(', ')}.`);
  const filtered = rows.slice(1).filter((row) => publishableIds.has(row[idIndex]));
  return `${hasByteOrderMark ? '\uFEFF' : ''}${[
    publicColumns,
    ...filtered.map((row) => indexes.map((index) => row[index] ?? '')),
  ]
    .map((row, index) => row.map((cell) => csvCell(cell, index > 0)).join(','))
    .join('\r\n')}\r\n`;
}

export function csvRecordIds(value: string, idColumn: string): Set<string> {
  const rows = parseCsv(value.startsWith('\uFEFF') ? value.slice(1) : value);
  const header = rows[0] ?? [];
  const idIndex = header.indexOf(idColumn);
  if (idIndex === -1) throw new Error(`CSV export is missing the ${idColumn} column.`);
  return new Set(
    rows
      .slice(1)
      .map((row) => row[idIndex])
      .filter(Boolean),
  );
}

function publicDate(feature: PublicFeature): string {
  if (feature.earliestPossibleYear === undefined) return '';
  if (
    feature.latestPossibleYear === undefined ||
    feature.latestPossibleYear === feature.earliestPossibleYear
  )
    return String(feature.earliestPossibleYear);
  return `${feature.earliestPossibleYear}–${feature.latestPossibleYear}`;
}

/** Builds CSV values only from the already claim-safe public DTO. */
export function publicListedBuildingsCsv(
  pkg: PublicProjectPackage,
  listedBuildingIds: ReadonlySet<string>,
): string {
  const header = [
    'project_id',
    'town',
    'selection_class',
    'hes_designation_reference',
    'feature_id',
    'listed_building_title',
    'statutory_title',
    'category',
    'designation_type',
    'statutory_status',
    'longitude',
    'latitude',
    'location_precision',
    'documented_date',
    'date_basis',
    'date_confidence',
    'source_url',
    'source_accessed_at',
    'source_attribution',
    'visitor_narrative',
  ];
  const rows = pkg.features
    .filter((feature) => listedBuildingIds.has(feature.id))
    .map((feature) => {
      const source =
        feature.sourceRecords.find((entry) => entry.sourceUrl) ?? feature.sourceRecords[0];
      const point = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : undefined;
      return [
        pkg.project.id,
        pkg.project.locality,
        '',
        feature.id.match(/LB\d+/)?.[0] ?? '',
        feature.id,
        feature.name,
        feature.name,
        feature.designationCategory ?? '',
        feature.designationType ?? '',
        feature.statutoryStatus ?? '',
        point ? String(point[0]) : '',
        point ? String(point[1]) : '',
        feature.locationType,
        publicDate(feature),
        feature.dateBasis,
        feature.dateConfidence,
        source?.sourceUrl ?? '',
        source?.accessedAt ?? '',
        source ? `${source.sourceName} — ${source.sourceOrganisation}` : '',
        feature.narrative?.map((component) => component.text).join(' ') ?? '',
      ];
    });
  return `${[header, ...rows]
    .map((row, index) => row.map((cell) => csvCell(cell, index > 0)).join(','))
    .join('\r\n')}\r\n`;
}
