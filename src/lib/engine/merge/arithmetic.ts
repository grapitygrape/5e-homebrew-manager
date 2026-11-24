/**
 * engine/merge/arithmetic.ts — safe arithmetic for homebrew-supplied formulas.
 *
 * INTENT
 *   5etools evaluates `valueExpression` / `calculateProp` math with eval(); we
 *   never do. A tiny recursive-descent parser limited to + - * / ( ) and
 *   numbers, so untrusted homebrew can never execute code in our process.
 */
/** Characters permitted in a `valueExpression` after `[[baseItem.value]]` substitution. */
const ARITHMETIC_CHARS = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '+',
  '-',
  '*',
  '/',
  '(',
  ')',
  ' ',
  '\t',
  '\n',
  '\r',
]);

/**
 * Evaluate a simple arithmetic expression (+ - * / parentheses, decimals).
 * Returns the number, or null on any malformed/empty input. No `eval`, no
 * identifiers, no function calls — safe for untrusted homebrew strings.
 */
export function safeArithmetic(input: string): number | null {
  // Strict gate: only genuine arithmetic is allowed through. Anything else
  // (identifiers, dots-as-members, unresolved [[refs]]) is rejected outright,
  // so we never silently extract a sub-expression like "(1)" from "exit(1)".
  if (typeof input !== 'string') return null;
  for (const ch of input) if (!ARITHMETIC_CHARS.has(ch)) return null;
  const tokens = input.match(/\d+\.?\d*|[()+\-*/]/g);
  if (!tokens || tokens.length === 0) return null;
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  const parseExpr = (): number => {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };
  const parseTerm = (): number => {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  };
  const parseFactor = (): number => {
    const t = next();
    if (t === '(') {
      const v = parseExpr();
      if (next() !== ')') throw new Error('unbalanced');
      return v;
    }
    if (t === '-') return -parseFactor();
    if (t === '+') return parseFactor();
    const n = Number(t);
    if (Number.isNaN(n)) throw new Error(`unexpected token ${t}`);
    return n;
  };

  try {
    const result = parseExpr();
    if (pos !== tokens.length || !Number.isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}
