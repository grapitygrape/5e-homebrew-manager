/**
 * OpenAPI 3.1 specification for the Homebrew Manager HTTP API.
 * Served at `GET /api/openapi.json` so scripts, Foundry macros, and external
 * tools can discover and validate against every endpoint.
 */
import pkg from '../../../package.json';

interface OpSpec {
  summary: string;
  tags: string[];
  parameters?: Record<string, unknown>[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
}

const jsonBody = (schema: Record<string, unknown>, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

const jsonResponse = (
  description: string,
  schema: Record<string, unknown> = { type: 'object' },
) => ({
  description,
  content: { 'application/json': { schema } },
});

const errorResponses = {
  '400': { $ref: '#/components/responses/ErrorResponse' },
  '500': { $ref: '#/components/responses/ErrorResponse' },
};

const queryParam = (
  name: string,
  description: string,
  required = false,
  schema: Record<string, unknown> = { type: 'string' },
) => ({ name, in: 'query', required, description, schema });

const pathParam = (name: string, description: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string' },
});

export function buildOpenApiSpec(serverUrl?: string): Record<string, unknown> {
  const paths: Record<string, Record<string, OpSpec>> = {
    '/api/health': {
      get: {
        summary: 'Server health, version, and uptime',
        tags: ['Ops'],
        responses: {
          '200': jsonResponse('Healthy server status', {
            type: 'object',
            properties: {
              ok: { type: 'boolean' },
              name: { type: 'string' },
              version: { type: 'string' },
              runtime: { type: 'string', enum: ['node', 'container'] },
              uptimeMs: { type: 'number' },
            },
          }),
        },
      },
    },
    '/api/capabilities': {
      get: {
        summary: 'Runtime feature flags (desktop, Node web, or container)',
        tags: ['Ops'],
        responses: { '200': jsonResponse('Capabilities flags') },
      },
    },
    '/api/openapi.json': {
      get: {
        summary: 'OpenAPI 3.1 schema for this server',
        tags: ['Ops'],
        responses: { '200': jsonResponse('OpenAPI document') },
      },
    },
    '/api/dashboard': {
      get: {
        summary:
          'Dashboard overview (homebrew listing, links, setup flags, optional audit)',
        tags: ['Dashboard'],
        parameters: [
          queryParam(
            'deferAudit',
            'Set to 1 to skip running a cold guide audit',
          ),
        ],
        responses: { '200': jsonResponse('DashboardView') },
      },
    },
    '/api/dashboard/content': {
      get: {
        summary: 'Counts of active core, homebrew, and dependency sources',
        tags: ['Dashboard'],
        responses: {
          '200': jsonResponse('DashboardContent'),
          ...errorResponses,
        },
      },
    },
    '/api/homebrew': {
      get: {
        summary: 'List working homebrew files and index.json mismatch info',
        tags: ['Homebrew'],
        responses: { '200': jsonResponse('HomebrewFiles'), ...errorResponses },
      },
    },
    '/api/homebrew/files/{file}': {
      get: {
        summary: 'Read a working homebrew file as parsed JSON or raw text',
        tags: ['Homebrew'],
        parameters: [
          pathParam('file', 'Bare .json filename in the homebrew folder'),
          queryParam('format', 'Pass "raw" for exact on-disk text'),
        ],
        responses: {
          '200': jsonResponse('Homebrew JSON or raw text'),
          ...errorResponses,
        },
      },
      put: {
        summary:
          'Overwrite a working homebrew file with validated raw JSON text',
        tags: ['Homebrew'],
        parameters: [pathParam('file', 'Bare .json filename')],
        requestBody: jsonBody({
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string' } },
        }),
        responses: { '200': jsonResponse('Saved path'), ...errorResponses },
      },
      delete: {
        summary:
          'Retire a homebrew file into each live folder unused/ and drop from index.json',
        tags: ['Homebrew'],
        parameters: [pathParam('file', 'Bare .json filename')],
        responses: { '200': jsonResponse('LibraryResult'), ...errorResponses },
      },
    },
    '/api/homebrew/files/{file}/validate': {
      post: {
        summary:
          'Validate a working homebrew file on disk against brew schemas and links',
        tags: ['Homebrew', 'Validation'],
        parameters: [
          pathParam('file', 'Bare .json filename'),
          queryParam('detail', 'Set to 1 to include per-entity issues'),
        ],
        responses: {
          '200': jsonResponse('Validation summary or full report'),
          ...errorResponses,
        },
      },
    },
    '/api/homebrew/deploy': {
      post: {
        summary:
          'Copy one or all working homebrew files to configured deploy destinations',
        tags: ['Homebrew'],
        requestBody: jsonBody({
          type: 'object',
          properties: { file: { type: 'string' }, all: { type: 'boolean' } },
        }),
        responses: {
          '200': jsonResponse('DeployResult or DeployAllResult'),
          ...errorResponses,
        },
      },
    },
    '/api/homebrew/index': {
      get: {
        summary: 'Check disagreements between homebrew/ files and index.json',
        tags: ['Homebrew'],
        responses: { '200': jsonResponse('IndexMismatch'), ...errorResponses },
      },
      post: {
        summary:
          'Resolve one index.json mismatch (keep, park, restore, or drop)',
        tags: ['Homebrew'],
        requestBody: jsonBody({
          type: 'object',
          required: ['action', 'file'],
          properties: { action: { type: 'string' }, file: { type: 'string' } },
        }),
        responses: {
          '200': jsonResponse('Updated mismatch state'),
          ...errorResponses,
        },
      },
    },
    '/api/homebrew/library': {
      get: {
        summary:
          'List all brews in the configured homebrew-repo checkout, or read one',
        tags: ['Homebrew'],
        parameters: [
          queryParam('folder', 'Repo subfolder when reading a single brew'),
          queryParam('file', 'Filename when reading a single brew'),
        ],
        responses: {
          '200': jsonResponse('LibraryListing or brew JSON'),
          ...errorResponses,
        },
      },
      post: {
        summary:
          'Install a repo brew into live folders (`action: "add"`) or retire one (`action: "remove"`)',
        tags: ['Homebrew'],
        requestBody: jsonBody({
          type: 'object',
          required: ['action', 'file'],
          properties: {
            action: { type: 'string', enum: ['add', 'remove'] },
            folder: { type: 'string' },
            file: { type: 'string' },
          },
        }),
        responses: { '200': jsonResponse('LibraryResult'), ...errorResponses },
      },
    },
    '/api/validate': {
      post: {
        summary:
          'Validate an arbitrary homebrew JSON document against brew schemas and content links',
        tags: ['Validation'],
        requestBody: jsonBody({ type: 'object' }),
        responses: {
          '200': jsonResponse('DocumentValidation'),
          ...errorResponses,
        },
      },
    },
    '/api/lint': {
      get: {
        summary:
          'Run 5etools submission lint and collision checks for a file on disk',
        tags: ['Validation'],
        parameters: [queryParam('file', 'Bare .json filename', true)],
        responses: { '200': jsonResponse('FileCheck'), ...errorResponses },
      },
      post: {
        summary:
          'Run 5etools submission lint and collision checks for an unsaved document',
        tags: ['Validation'],
        requestBody: jsonBody({
          type: 'object',
          required: ['file', 'doc'],
          properties: {
            file: { type: 'string' },
            doc: { type: 'object' },
            raw: { type: 'string' },
          },
        }),
        responses: { '200': jsonResponse('FileCheck'), ...errorResponses },
      },
    },
    '/api/resolve': {
      post: {
        summary:
          'Resolve `_copy`, `_mod`, `_templates`, and `_versions` for a single entity',
        tags: ['Validation'],
        requestBody: jsonBody({ type: 'object' }),
        responses: {
          '200': jsonResponse('ResolvedPreview'),
          ...errorResponses,
        },
      },
    },
    '/api/collisions': {
      get: {
        summary:
          'Cross-corpus collision report across official data and homebrew',
        tags: ['Validation'],
        parameters: [queryParam('refresh', 'Set to 1 to force recompute')],
        responses: {
          '200': jsonResponse('CollisionReport'),
          ...errorResponses,
        },
      },
    },
    '/api/schema/map': {
      get: {
        summary: 'Property surface map for all conversion guides',
        tags: ['Schema'],
        responses: {
          '200': jsonResponse('GuideSchema map'),
          ...errorResponses,
        },
      },
    },
    '/api/schema/types': {
      get: {
        summary: 'List every homebrew entity array declared in the brew schema',
        tags: ['Schema'],
        responses: {
          '200': jsonResponse('Array of { type, label }'),
          ...errorResponses,
        },
      },
    },
    '/api/schema/types/{type}': {
      get: {
        summary:
          'Resolved schema properties for one homebrew array key or guide file',
        tags: ['Schema'],
        parameters: [
          pathParam('type', 'Array key (e.g. item, monster, spell)'),
        ],
        responses: { '200': jsonResponse('TypeSchema'), ...errorResponses },
      },
    },
    '/api/blocklist': {
      get: {
        summary:
          'Load and diagnose content-blocklist.json against the content index',
        tags: ['Blocklist'],
        responses: {
          '200': jsonResponse('LoadedBlocklist'),
          ...errorResponses,
        },
      },
      put: {
        summary: 'Save content-blocklist.json (rotates previous copy to .bak)',
        tags: ['Blocklist'],
        requestBody: jsonBody({
          type: 'object',
          required: ['entries'],
          properties: {
            entries: { type: 'array', items: { type: 'object' } },
            envelope: { type: 'object' },
          },
        }),
        responses: { '200': jsonResponse('Save count'), ...errorResponses },
      },
    },
    '/api/blocklist/sources': {
      get: {
        summary: 'List every indexed source with per-type entity counts',
        tags: ['Blocklist'],
        parameters: [
          queryParam('refresh', 'Set to 1 to bypass caches and rescan'),
        ],
        responses: { '200': jsonResponse('SourceListing'), ...errorResponses },
      },
    },
    '/api/blocklist/sources/{source}/items': {
      get: {
        summary: 'List sorted entities for one source and content type',
        tags: ['Blocklist'],
        parameters: [
          pathParam('source', 'Source code (e.g. PHB, XPHB)'),
          queryParam('type', 'Entity prop (e.g. spell, item, monster)', true),
        ],
        responses: {
          '200': jsonResponse('{ items: IndexedEntity[] }'),
          ...errorResponses,
        },
      },
    },
    '/api/blocklist/types/{type}/items': {
      get: {
        summary: 'List all entities of one content type grouped by source',
        tags: ['Blocklist'],
        parameters: [
          pathParam('type', 'Entity prop (e.g. spell, item, monster)'),
        ],
        responses: {
          '200': jsonResponse('{ bySource: Record<string, IndexedEntity[]> }'),
          ...errorResponses,
        },
      },
    },
    '/api/blocklist/search': {
      get: {
        summary: 'Search indexed entity names across the full corpus',
        tags: ['Blocklist'],
        parameters: [
          queryParam('q', 'Search query (min 2 chars)', true),
          queryParam('type', 'Optional entity prop filter'),
          queryParam('limit', 'Max results (default 100)'),
        ],
        responses: {
          '200': jsonResponse('EntitySearchResult'),
          ...errorResponses,
        },
      },
    },
    '/api/blocklist/children': {
      get: {
        summary:
          'List structural descendants (subclasses, subraces, derived items) of a blocklist target',
        tags: ['Blocklist'],
        parameters: [
          queryParam('source', 'Source code', true),
          queryParam('type', 'Category prop', true),
          queryParam('hash', 'Entity hash or *', true),
        ],
        responses: {
          '200': jsonResponse('{ children: IndexedEntity[] }'),
          ...errorResponses,
        },
      },
    },
    '/api/blocklist/orphans': {
      post: {
        summary:
          'Find allowed entities whose structural parent/ancestor is blocked',
        tags: ['Blocklist'],
        requestBody: jsonBody({
          type: 'object',
          required: ['entries'],
          properties: { entries: { type: 'array', items: { type: 'object' } } },
        }),
        responses: {
          '200': jsonResponse('{ items: AllowedChildWithBlockedParent[] }'),
          ...errorResponses,
        },
      },
    },
    '/api/replacement': {
      get: {
        summary:
          'Load content-replacement.json (rows, review items, override rules)',
        tags: ['Replacement'],
        responses: {
          '200': jsonResponse('LoadedSupersessions'),
          ...errorResponses,
        },
      },
      put: {
        summary: 'Expand override rules and save content-replacement.json',
        tags: ['Replacement'],
        requestBody: jsonBody({
          type: 'object',
          required: ['rows'],
          properties: {
            rows: { type: 'array', items: { type: 'object' } },
            review: { type: 'array', items: { type: 'object' } },
            envelope: { type: 'object' },
            overrides: { type: 'array', items: { type: 'object' } },
          },
        }),
        responses: {
          '200': jsonResponse('Save result with warnings'),
          ...errorResponses,
        },
      },
    },
    '/api/replacement/scan': {
      get: {
        summary:
          'Scan homebrew files for "Replaces:" markers and duplicate names',
        tags: ['Replacement'],
        responses: { '200': jsonResponse('ScanResult'), ...errorResponses },
      },
    },
    '/api/replacement/deploy': {
      post: {
        summary:
          'Copy saved content-replacement.json into the 5etools data root',
        tags: ['Replacement'],
        responses: { '200': jsonResponse('{ from, to }'), ...errorResponses },
      },
    },
    '/api/item-prices': {
      get: {
        summary: 'Load content/item-prices.json',
        tags: ['Shops & Prices'],
        responses: {
          '200': jsonResponse('LoadedItemPrices'),
          ...errorResponses,
        },
      },
      put: {
        summary: 'Validate and save content/item-prices.json',
        tags: ['Shops & Prices'],
        requestBody: jsonBody({
          type: 'object',
          required: ['rows'],
          properties: { rows: { type: 'array', items: { type: 'object' } } },
        }),
        responses: {
          '200': jsonResponse('Save count and path'),
          ...errorResponses,
        },
      },
    },
    '/api/item-prices/names': {
      get: {
        summary: 'Map of lower-cased item names to sources shown on the site',
        tags: ['Shops & Prices'],
        responses: {
          '200': jsonResponse('Record<string, string[]>'),
          ...errorResponses,
        },
      },
    },
    '/api/item-prices/seed': {
      get: {
        summary:
          'List homebrew sources with item prices, or seed price rows for one source',
        tags: ['Shops & Prices'],
        parameters: [
          queryParam('source', 'Optional source code to seed rows from'),
        ],
        responses: {
          '200': jsonResponse('Seed sources or ItemPrice[]'),
          ...errorResponses,
        },
      },
    },
    '/api/shops': {
      get: {
        summary: 'List shops or open one resolved shop file',
        tags: ['Shops & Prices'],
        parameters: [queryParam('file', 'Optional shop .json filename')],
        responses: {
          '200': jsonResponse('ShopListing or OpenedShop'),
          ...errorResponses,
        },
      },
      post: {
        summary: 'Create or import a shop list',
        tags: ['Shops & Prices'],
        requestBody: jsonBody({ type: 'object' }),
        responses: { '200': jsonResponse('ShopSummary'), ...errorResponses },
      },
    },
    '/api/guides': {
      get: {
        summary: 'List conversion guides or read one guide markdown file',
        tags: ['Guides'],
        parameters: [queryParam('file', 'Optional guide .md filename')],
        responses: {
          '200': jsonResponse('Guide list or markdown text'),
          ...errorResponses,
        },
      },
    },
    '/api/audit': {
      get: {
        summary: 'Run or return the cached guide-coverage audit',
        tags: ['Guides'],
        parameters: [queryParam('refresh', 'Set to 1 to recompute')],
        responses: { '200': jsonResponse('AuditReport'), ...errorResponses },
      },
    },
    '/api/settings': {
      get: {
        summary: 'Read stored and effective configuration',
        tags: ['Settings'],
        responses: {
          '200': jsonResponse('Settings payload'),
          ...errorResponses,
        },
      },
      put: {
        summary: 'Update stored configuration in hbm-config.json',
        tags: ['Settings'],
        requestBody: jsonBody({ type: 'object' }),
        responses: {
          '200': jsonResponse('Updated settings payload'),
          ...errorResponses,
        },
      },
    },
    '/api/foundry/status': {
      get: {
        summary: 'Connected Foundry VTT worlds, allowlist, and bridge stats',
        tags: ['Foundry'],
        responses: { '200': jsonResponse('FoundryBridgeStatus') },
      },
    },
    '/api/foundry/stream': {
      get: {
        summary:
          'Inbound Server-Sent Events stream opened by foundry-homebrew-bridge',
        tags: ['Foundry'],
        responses: { '200': { description: 'text/event-stream' } },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: '5e Homebrew Manager API',
      version: pkg.version,
      description:
        'HTTP API for managing 5etools homebrew files, content blocklists, content replacements, item prices, shops, validation, and Foundry VTT bridge integration.',
    },
    ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
    paths,
    components: {
      responses: {
        ErrorResponse: jsonResponse('Structured error response', {
          type: 'object',
          required: ['message', 'error'],
          properties: {
            message: { type: 'string' },
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {},
              },
            },
          },
        }),
      },
    },
  };
}
