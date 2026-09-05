import { describe, expect, it } from 'vitest';
import { filterCsvByRecordIds, publicCsvByRecordIds } from './csv';

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
});
