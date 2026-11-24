/**
 * scripts/guide-enums.ts — keep the value lists in the guides in sync with the schema.
 *
 * The lists and how they render live in src/lib/engine/audit/guide-enums.ts,
 * which Deploy Site's Review uses too. This is the command-line run over every
 * guide.
 *
 * USAGE
 *   npm run guides:enums            # check; exit 1 if any list is stale or unknown
 *   npm run guides:enums -- --write # rewrite stale lists in place
 *   npm run guides:enums -- --if-configured  # skip (exit 0) with no local schemas
 *
 * CONFIG — as scripts/audit.ts (scripts/lib/config.ts).
 */
import { loadSchemaDir, requireLocalSource } from './lib/config.ts';
import { runGuideEnums } from './lib/guide-checks.ts';

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const IF_CONFIGURED = argv.includes('--if-configured');

const sourceOpts = {
  ifConfigured: IF_CONFIGURED,
  skipLabel: 'guide enum check',
};
const SCHEMA_DIR = requireLocalSource('schema', sourceOpts);
const GUIDES_DIR = requireLocalSource('guides', sourceOpts);

const { schemas } = loadSchemaDir(SCHEMA_DIR);
const report = runGuideEnums(schemas, GUIDES_DIR, { write: WRITE });
console.log(report.lines.join('\n'));

if ((report.stale && !WRITE) || report.unknown) process.exit(1);
