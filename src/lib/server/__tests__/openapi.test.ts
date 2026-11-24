import { describe, expect, it } from 'vitest';
import { buildOpenApiSpec } from '../openapi';

describe('buildOpenApiSpec', () => {
  it('produces an OpenAPI 3.1.0 document covering core namespaces and ops routes', () => {
    const spec = buildOpenApiSpec('http://localhost:5052') as {
      openapi: string;
      info: { title: string; version: string };
      servers: { url: string }[];
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toContain('5e Homebrew Manager');
    expect(spec.servers).toEqual([{ url: 'http://localhost:5052' }]);

    for (const route of [
      '/api/health',
      '/api/capabilities',
      '/api/openapi.json',
      '/api/homebrew',
      '/api/homebrew/files/{file}',
      '/api/validate',
      '/api/schema/types/{type}',
      '/api/blocklist',
      '/api/blocklist/sources/{source}/items',
      '/api/blocklist/types/{type}/items',
      '/api/replacement',
      '/api/item-prices',
    ]) {
      expect(spec.paths).toHaveProperty(route);
    }
  });
});
