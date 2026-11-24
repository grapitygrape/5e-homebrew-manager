/**
 * mimic-ui class names belong to the wrappers in src/lib/ui. Pages use
 * <Badge>, <Banner> and the rest, so a breaking mimic release means changing
 * the wrappers rather than hunting through every page.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SRC = join(process.cwd(), 'src');
const UI = join(SRC, 'lib', 'ui');

// The classes this synced version of mimic actually defines, so the project
// name and the copies' file names don't count.
const MIMIC_CLASSES = new Set(
  readFileSync(join(UI, 'mimic', 'mimic-components.css'), 'utf8').match(
    /(?<=\.)mimic-[a-z0-9-]+/g,
  ),
);

/** Mimic classes used in a file's text. --mimic-* knobs don't count. */
function mimicClassesIn(text: string): string[] {
  const words = text.match(/(?<![\w-])mimic-[a-z0-9-]+/g) ?? [];
  return [...new Set(words.filter((word) => MIMIC_CLASSES.has(word)))];
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(svelte|ts|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('mimic class boundary', () => {
  it('finds mimic classes and ignores knobs and file names', () => {
    const text = `<span class="mimic-pill badge"></span>
      import '$lib/ui/mimic/mimic-tokens.css'; // from mimic-ui
      .x { --mimic-pill-bg: red; color: var(--mimic-tone); }`;
    expect(mimicClassesIn(text)).toEqual(['mimic-pill']);
  });

  it('keeps mimic classes inside src/lib/ui', () => {
    const outside = sourceFiles(SRC)
      .filter((file) => !file.startsWith(UI + sep))
      .flatMap((file) =>
        mimicClassesIn(readFileSync(file, 'utf8')).map(
          (name) => `${relative(SRC, file)}: ${name}`,
        ),
      );
    expect(outside).toEqual([]);
  });
});
