/**
 * engine/audit/json-locate.ts — find where JSON pointers sit in the raw text.
 *
 * INTENT
 *   Schema issues come back as JSON pointers (`/spell/0/entries/2`); the
 *   parser needs editor offsets to underline them. One pass over the text
 *   records the value span (and the property-name span) of every pointer
 *   asked for. The text must already be valid JSON: the parser only gets here
 *   after JSON.parse succeeded.
 */

export interface PointerSpan {
  /** The value: from its first character to just after its last. */
  from: number;
  to: number;
  /** The property name including quotes, when the value is an object member. */
  keyFrom?: number;
  keyTo?: number;
}

const escapeSeg = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');

/** Spans for each wanted pointer that exists in `text`. */
export function locatePointers(
  text: string,
  wanted: Iterable<string>,
): Map<string, PointerSpan> {
  const want = new Set(wanted);
  const out = new Map<string, PointerSpan>();
  if (!want.size) return out;
  // Only descend into containers on the way to a wanted pointer.
  const prefixes = new Set<string>();
  for (const p of want) {
    let cut = p;
    while (cut) {
      prefixes.add(cut);
      cut = cut.slice(0, cut.lastIndexOf('/'));
    }
  }
  prefixes.add('');

  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };
  const skipString = (): string => {
    // Returns the decoded string; i ends just past the closing quote.
    const start = ++i;
    let raw = false;
    while (i < n) {
      const c = text[i];
      if (c === '\\') {
        raw = true;
        i += 2;
      } else if (c === '"') break;
      else i++;
    }
    const body = text.slice(start, i);
    i++;
    if (!raw) return body;
    try {
      return JSON.parse(`"${body}"`);
    } catch {
      return body;
    }
  };
  // Skip a value without recording anything inside it.
  const skipValue = () => {
    const c = text[i];
    if (c === '"') return void skipString();
    if (c === '{' || c === '[') {
      let depth = 0;
      while (i < n) {
        const ch = text[i];
        if (ch === '"') {
          skipString();
          continue;
        }
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') {
          depth--;
          if (depth === 0) {
            i++;
            return;
          }
        }
        i++;
      }
      return;
    }
    while (i < n && !/[\s,\]}]/.test(text[i])) i++;
  };

  const value = (ptr: string, keyFrom?: number, keyTo?: number) => {
    ws();
    const from = i;
    if (!prefixes.has(ptr)) return skipValue();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') i++;
      else
        while (i < n) {
          ws();
          const kFrom = i;
          const key = skipString();
          const kTo = i;
          ws();
          i++; // ':'
          value(`${ptr}/${escapeSeg(key)}`, kFrom, kTo);
          ws();
          if (text[i] === ',') i++;
          else {
            i++; // '}'
            break;
          }
        }
    } else if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') i++;
      else
        for (let idx = 0; i < n; idx++) {
          value(`${ptr}/${idx}`);
          ws();
          if (text[i] === ',') i++;
          else {
            i++; // ']'
            break;
          }
        }
    } else skipValue();
    if (want.has(ptr)) out.set(ptr, { from, to: i, keyFrom, keyTo });
  };

  value('');
  return out;
}
