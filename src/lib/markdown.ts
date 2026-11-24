/**
 * markdown.ts — guide rendering via `marked`, configured once at module load.
 *
 * Guides embed raw HTML "property cards" (`<div class="prop-cards">…`) whose
 * `.prop-card-val` bodies separate examples with BLANK LINES. Per CommonMark, a
 * blank line terminates an HTML block, so marked v18 (strict) resumes markdown
 * parsing mid-card and treats the indented `<strong>` / `<pre>` lines as an
 * escaped indented-code block — the tags render as literal text. The old tool's
 * older marked build was lenient and never hit this.
 *
 * `rawDivBlock` restores that behaviour generically: when a block starts with
 * `<div …>` it consumes the BALANCED `<div>…</div>` region (blank lines and all)
 * and emits it verbatim, so the browser renders the embedded HTML as authored.
 * It only triggers when a block *starts* with `<div`, so fenced code and other
 * content is untouched. div tags never appear inside the guides' JSON examples,
 * so naive open/close counting is safe.
 */
import { marked, type TokenizerAndRendererExtension } from 'marked';

const rawDivBlock: TokenizerAndRendererExtension = {
  name: 'rawDivBlock',
  level: 'block',
  start(src: string) {
    const i = src.indexOf('<div');
    return i < 0 ? undefined : i;
  },
  tokenizer(src: string) {
    if (!/^<div\b[^>]*>/.test(src)) return undefined;
    const tagRe = /<(\/?)div\b[^>]*>/g;
    let depth = 0;
    let m: RegExpExecArray | null;
    let end = -1;
    while ((m = tagRe.exec(src)) !== null) {
      depth += m[1] ? -1 : 1;
      if (depth === 0) {
        end = m.index + m[0].length;
        break;
      }
    }
    if (end === -1) return undefined; // unbalanced — let marked's default handle it
    const raw = src.slice(0, end);
    return { type: 'rawDivBlock', raw, text: raw };
  },
  renderer(token) {
    return (token as unknown as { text: string }).text;
  },
};

marked.use({ extensions: [rawDivBlock] });

/** Render guide markdown (with embedded HTML cards) to an HTML string. */
export function renderGuide(md: string): string {
  return marked.parse(md) as string;
}
