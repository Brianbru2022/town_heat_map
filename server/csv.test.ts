import { describe, expect, it } from 'vitest';
import { filterCsvByRecordIds } from './csv';

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
});
