// Bundles the injected browser scripts from modular ESM sources into single
// non-minified IIFEs committed on disk (so `cargo test`, `tauri build`, and
// `script_names.rs` work out-of-the-box without requiring a build step).
//
// Usage:
//   npm run scripts:bundle            # rebuild both bundles
//   npm run scripts:bundle -- --check # fail if any bundle on disk is out of date

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

interface BundleTarget {
  name: string;
  entry: string;
  out: string;
  banner: string;
}

const TARGETS: BundleTarget[] = [
  {
    name: 'site-browser',
    entry: 'src/lib/site-browser/index.js',
    out: 'src-tauri/src/site-browser.js',
    banner:
      '// GENERATED — do not edit directly; edit src/lib/site-browser/ and run: npm run scripts:bundle',
  },
  {
    name: 'renderer-supersede',
    entry: 'src/lib/renderer-supersede/index.js',
    out: 'deploy-modules/content-replacement/renderer-supersede.js',
    banner:
      '// GENERATED — do not edit directly; edit src/lib/renderer-supersede/ and run: npm run scripts:bundle',
  },
];

const normalizeEol = (s: string) => s.replace(/\r\n/g, '\n');

async function buildOne(target: BundleTarget): Promise<string> {
  const bundle = await rolldown({
    input: resolve(ROOT, target.entry),
    // The injected scripts are plain JS. Auto-discovery would pick up the root
    // tsconfig, which extends .svelte-kit's generated one and fails to resolve
    // anything before `svelte-kit sync` has run (as on a fresh CI checkout).
    tsconfig: false,
  });
  try {
    const { output } = await bundle.generate({
      format: 'iife',
      minify: false,
      banner: target.banner,
    });
    const chunk = output.find((item) => item.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') {
      throw new Error(`No JS chunk produced for ${target.name}`);
    }
    return `${normalizeEol(chunk.code).trimEnd()}\n`;
  } finally {
    await bundle.close();
  }
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const stale: string[] = [];

  for (const target of TARGETS) {
    const built = await buildOne(target);
    const outPath = resolve(ROOT, target.out);

    let current = '';
    try {
      current = normalizeEol(readFileSync(outPath, 'utf8'));
    } catch {
      current = '';
    }

    if (checkOnly) {
      if (current !== built) stale.push(target.out);
    } else if (current !== built) {
      writeFileSync(outPath, built, 'utf8');
      console.log(`bundled ${target.out}`);
    } else {
      console.log(`up-to-date ${target.out}`);
    }
  }

  if (checkOnly) {
    if (stale.length) {
      console.error(
        `Injected script bundle(s) out of date:\n${stale.map((f) => `  - ${f}`).join('\n')}\nRun: npm run scripts:bundle`,
      );
      process.exit(1);
    }
    console.log(`Injected script bundles OK (${TARGETS.length}/${TARGETS.length})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
