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

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
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
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')}\r\n`;
}
