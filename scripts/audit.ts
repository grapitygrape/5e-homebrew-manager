/**
 * scripts/audit.ts — run the guide-coverage audit from the command line.
 *
 * WHY THIS EXISTS
 *   Guide coverage is not a write-once property. The brew schemas drift upstream,
 *   and every added property silently regresses a guide that used to be at 100%.
 *   That is exactly how the 2026-07-14 pass ended up recording eight entities as
 *   "100%" that were in fact between 79% and 96% (see AUDIT.md). Nothing failed,
 *   because nothing checked. This script is the check.
 *
 * USAGE
 *   npm run audit            # report; exit 1 if any guide is below 100%
 *   npm run audit -- --json  # additionally rewrite audit.json
 *   npm run audit -- --quiet # only print failures
 *   npm run audit -- --if-configured  # skip (exit 0) when no local schema/guides
 *                                     # path is set, as `npm run verify` does
 *
 * CONFIG  (scripts/lib/config.ts: the same hbm-config.json the app reads)
 *   hbm-config.json → HBM_*_PATH env vars → DEFAULT_CONFIG
 *   Schema/guide sources must be local paths — this script does not fetch URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  loadSchemaDir,
  requireLocalSource,
  storePath,
} from './lib/config.ts';
import { formatGuideAudit, runGuideAudit } from './lib/guide-checks.ts';

const argv = process.argv.slice(2);
const WRITE_JSON = argv.includes('--json');
const QUIET = argv.includes('--quiet');
const IF_CONFIGURED = argv.includes('--if-configured');

const sourceOpts = {
  ifConfigured: IF_CONFIGURED,
  skipLabel: 'guide audit',
  hint: `Set it in ${storePath}, or via HBM_SCHEMA_PATH / HBM_GUIDES_PATH.`,
};
const SCHEMA_DIR = requireLocalSource('schema', sourceOpts);
const GUIDES_DIR = requireLocalSource('guides', sourceOpts);

const { schemas, badJson } = loadSchemaDir(SCHEMA_DIR, (key) =>
  console.error(`  ! unparseable schema: ${key}`),
);

const report = runGuideAudit(schemas, GUIDES_DIR, badJson);
const lines = formatGuideAudit(report, { quiet: QUIET });
console.log(`\n${lines.join('\n')}\n`);

if (WRITE_JSON) {
  const out = path.join(ROOT, 'audit.json');
  fs.writeFileSync(
    out,
    JSON.stringify({
      timestamp: Date.now(),
      summary: report.summary,
      details: report.details,
      branched: report.branched,
    }),
  );
  console.log(`Wrote ${path.relative(ROOT, out)}`);
}

if (report.problems) process.exit(1);
