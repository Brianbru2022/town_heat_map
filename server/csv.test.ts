import { describe, expect, it } from 'vitest';
import { alloaPackage } from '../src/data/alloa';
import { publicProjectPackage } from '../src/domain/publication';
import {
  filterCsvByRecordIds,
  publicCsvByRecordIds,
  publicListedBuildingsCsv,
  spreadsheetSafeText,
} from './csv';

describe('publication-aware CSV delivery', () => {
  it('retains the header and publishable rows while excluding blocked records', () => {
    const source =
      '\uFEFFfeature_id,name,notes\r\npublishable-1,"Town Hall, West","Quoted ""note"""\r\nblocked-1,Mill,Review licence\r\n';

    const result = filterCsvByRecordIds(source, 'feature_id', new Set(['publishable-1']));

    expect(result).toContain('publishable-1');
    expect(result).toContain('Town Hall, West');
    expect(result).not.toContain('blocked-1');
    expect(result.startsWith('\uFEFFfeature_id')).toBe(true);
  });

  it('does not let future generated review columns enter the visitor export', () => {
    const source =
      'feature_id,name,source_url,review_notes,workflow_batch\r\npublishable-1,Town Hall,https://example.test,Internal reviewer note,batch-42\r\n';

    const result = publicCsvByRecordIds(source, 'feature_id', new Set(['publishable-1']), [
      'feature_id',
      'name',
      'source_url',
    ]);

    expect(result).toBe(
      'feature_id,name,source_url\r\npublishable-1,Town Hall,https://example.test\r\n',
    );
    expect(result).not.toContain('review_notes');
    expect(result).not.toContain('batch-42');
  });

  it('builds the listed-building export only from the public DTO contract', () => {
    const publicPackage = publicProjectPackage(alloaPackage)!;
    const feature = publicPackage.features.find((candidate) => candidate.id.includes('LB20953'))!;
    const csv = publicListedBuildingsCsv(publicPackage, new Set([feature.id]));

    expect(csv.split('\r\n')[0]).toBe(
      'project_id,town,selection_class,hes_designation_reference,feature_id,listed_building_title,statutory_title,category,designation_type,statutory_status,longitude,latitude,location_precision,documented_date,date_basis,date_confidence,source_url,source_accessed_at,source_attribution,visitor_narrative',
    );
    expect(csv).toContain(feature.id);
    expect(csv).not.toContain('documentedDateText');
    expect(csv).not.toContain('shortDescription');
    expect(csv).not.toContain('notes');
  });

  it.each([
    '=2+2',
    '+SUM(A1:A2)',
    '-cmd|calc',
    '@IMPORTXML(A1)',
    '  =HYPERLINK(A1)',
    '\t=1',
    '\r\n +1',
    '\u0000=1+1',
    '\u0000\t @IMPORTXML(A1)',
  ])('neutralises spreadsheet formula text: %s', (value) => {
    const normalised = [...value]
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
      })
      .join('');
    expect(spreadsheetSafeText(value)).toBe(`'${normalised}`);
    const csv = publicCsvByRecordIds(
      `feature_id,name\r\nrecord-1,"${value}"\r\n`,
      'feature_id',
      new Set(['record-1']),
      ['feature_id', 'name'],
    );
    expect(csv).toContain(`'${normalised}`);
  });

  it('strips non-text C0 controls before neutralising the parsed export cell', () => {
    const csv = publicCsvByRecordIds(
      'feature_id,name\r\nrecord-1,"\u0000\u0001=1+1"\r\n',
      'feature_id',
      new Set(['record-1']),
      ['feature_id', 'name'],
    );

    expect(csv).toBe("feature_id,name\r\nrecord-1,'=1+1\r\n");
  });

  it.each(['Town Hall', '  Town Hall', 'Café + bakery', 'email@example.test', '1919-1945'])(
    'preserves ordinary text: %s',
    (value) => expect(spreadsheetSafeText(value)).toBe(value),
  );
});
