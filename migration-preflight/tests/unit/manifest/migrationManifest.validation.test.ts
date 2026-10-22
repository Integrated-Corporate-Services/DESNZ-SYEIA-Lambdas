import { parseManifest } from '../../../src/manifest/migrationManifest.validation';
import { createManifest } from '../../fixtures/migrationManifest.fixture';

describe('manifest validation', () => {
  it('parses a valid package and hashes the exact JSON text', () => {
    const manifest = createManifest();
    const compact = parseManifest(JSON.stringify(manifest));
    const spaced = parseManifest(JSON.stringify(manifest, null, 2));
    expect(compact.manifest).toEqual(manifest);
    expect(compact.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(spaced.sha256).not.toBe(compact.sha256);
  });

  it('rejects malformed JSON', () => {
    expect(() => parseManifest('{broken')).toThrow('not valid JSON');
  });

  it('rejects unknown manifest properties', () => {
    expect(() => parseManifest(JSON.stringify({ ...createManifest(), unexpected: true }))).toThrow(
      'additional properties'
    );
  });

  it('rejects document count mismatch', () => {
    expect(() =>
      parseManifest(JSON.stringify(createManifest({ expectedDocumentCount: 2 })))
    ).toThrow('Document count');
  });

  it.each([
    { schemaVersion: '2.0' },
    { sourceSystem: 'OTHER' },
    { expectedCaseCount: -1 },
    {
      casesFile: {
        key: 'cases.csv',
        sizeBytes: 20,
        checksum: 'wrong',
        checksumAlgorithm: 'SHA256',
      },
    },
  ])('rejects invalid schema fields %j', (invalid) => {
    expect(() => parseManifest(JSON.stringify({ ...createManifest(), ...invalid }))).toThrow();
  });

  it('accepts a known-empty document inventory', () => {
    expect(
      parseManifest(JSON.stringify(createManifest({ documents: [], expectedDocumentCount: 0 })))
        .manifest.documents
    ).toEqual([]);
  });
});
