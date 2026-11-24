/**
 * engine/render/tags.ts — 5etools inline `{@tag ...}` enricher renderer.
 *
 * INTENT
 *   Convert every inline enricher 5etools homebrew actually uses into display
 *   HTML. Pure string → string; no DOM. Link-tag pipe semantics (which slot is
 *   the source, which is display text) come from the shared engine/tag-registry
 *   so this renderer and the link audit can never disagree again.
 *
 * COVERAGE
 *   - Enrichers: formatting ({@b}/{@i}/{@u}/{@s}/{@code}/{@note}/
 *     {@color}/{@highlight}/…), dice ({@dice}/{@damage}/{@scaledice}/{@chance}/
 *     {@ability}/{@savingThrow}/{@skillCheck}), 2014 & 2024 statblock shorthands
 *     ({@atk}/{@atkr}/{@h}/{@actSave}/{@actTrigger}/…), and references
 *     ({@link}/{@filter}/{@book}/{@adventure}/{@quickref}/{@area}/{@footnote}).
 *   - Nesting: tags are resolved innermost-first, so {@b {@item x}} works.
 *   - No-arg tags ({@h}, {@hitYourSpellAttack}, {@coinflip}) are recognised.
 *   - {@condition x|SRC|display} & friends: slot 1 is the SOURCE, not display
 *     text, so `{@condition dazed|MyBrew}` reads "dazed".
 *
 * REUSE NOTES
 *   - Cross-links render as <a href="#section"> so the SPA can route on them.
 *   - Unknown tags degrade to their first pipe part (never throw, never leak braces).
 */
import { LINK_TAGS, splitLinkTag } from '../tag-registry.ts';

/** Innermost tags only ([^{}] content) — the outer loop resolves nesting. */
const TAG_RE = /\{@([a-zA-Z][a-zA-Z0-9]*)(?: ([^{}]*))?\}/g;
const MAX_NESTING = 10;

// --- broken-enricher highlighting -------------------------------------------
// The link audit (audit/link-check.ts) knows which raw tags are broken; the
// renderer shouldn't. `withTagIssues` scopes an issues map (raw tag text →
// severity + plain reason) around a render call: any tag in the map renders its
// REAL output, wrapped in a highlight with the reason as its hover title.

export interface TagIssueInfo {
  severity: 'error' | 'warning';
  reason: string;
}

let activeIssues: Map<string, TagIssueInfo> | null = null;

/** Run `fn` with broken-tag highlighting active (nesting-safe, always restored). */
export function withTagIssues<T>(
  issues: Map<string, TagIssueInfo> | null | undefined,
  fn: () => T,
): T {
  const prev = activeIssues;
  activeIssues = issues && issues.size ? issues : null;
  try {
    return fn();
  } finally {
    activeIssues = prev;
  }
}

export function parseInlineTags(str: unknown): string {
  if (typeof str !== 'string') return String(str ?? '');
  let out = str;
  for (let i = 0; i < MAX_NESTING && out.includes('{@'); i++) {
    const next = out.replace(
      TAG_RE,
      (m: string, tag: string, inner: string | undefined) => {
        const html = renderTag(tag, inner ?? '');
        const issue = activeIssues?.get(m);
        if (!issue) return html;
        return `<span class="tag-issue tag-issue-${issue.severity}" title="${attr(issue.reason)}">${html}</span>`;
      },
    );
    if (next === out) break; // unmatched braces — leave as-is rather than loop
    out = next;
  }
  return out;
}

function renderTag(tag: string, inner: string): string {
  const link = LINK_TAGS[tag];
  if (link) {
    const { name, source, display } = splitLinkTag(link, inner);
    const src = source ? ` data-source="${attr(source)}"` : '';
    if (link.route)
      return `<a href="#${link.route}" class="tag-${tag}" data-name="${attr(name)}"${src}>${display}</a>`;
    if (link.emph === 'strong')
      return `<strong class="tag-${tag}" data-name="${attr(name)}">${display}</strong>`;
    if (link.emph === 'em')
      return `<em class="tag-${tag}" data-name="${attr(name)}">${display}</em>`;
    return `<span class="tag-${tag}" data-name="${attr(name)}"${src}>${display}</span>`;
  }

  const parts = inner.split('|');
  const first = parts[0] ?? '';

  switch (tag) {
    // --- formatting ----------------------------------------------------------
    case 'b':
    case 'bold':
      return `<strong>${first}</strong>`;
    case 'i':
    case 'italic':
      return `<em>${first}</em>`;
    case 'u':
    case 'underline':
      return `<u>${first}</u>`;
    case 'u2':
    case 'underlineDouble':
      return `<u style="text-decoration-style:double">${first}</u>`;
    case 's':
    case 'strike':
      return `<s>${first}</s>`;
    case 's2':
    case 'strikeDouble':
      return `<s style="text-decoration-style:double">${first}</s>`;
    case 'code':
      return `<code>${first}</code>`;
    case 'kbd':
      return `<kbd>${first}</kbd>`;
    case 'sup':
      return `<sup>${first}</sup>`;
    case 'sub':
      return `<sub>${first}</sub>`;
    case 'note':
      return `<em class="tag-note">${first}</em>`;
    case 'tip':
      return parts[1]
        ? `<span title="${attr(parts[1])}">${first}</span>`
        : first;
    case 'highlight':
      return `<mark>${first}</mark>`;
    case 'color': {
      const hex = (parts[1] ?? '').replace(/^#/, '');
      return /^[0-9a-fA-F]{3,8}$/.test(hex)
        ? `<span style="color:#${hex}">${first}</span>`
        : first;
    }
    case 'style':
    case 'font':
      return first;
    case 'comic':
    case 'comicH1':
    case 'comicH2':
    case 'comicH3':
    case 'comicH4':
    case 'comicNote':
      return `<em>${first}</em>`;

    // --- dice & rolls --------------------------------------------------------
    case 'dice':
    case 'damage':
    case 'autodice':
      return `<span class="tag-dice">${parts[1] || first}</span>`;
    case 'scaledice':
    case 'scaledamage':
      return `<span class="tag-dice">${parts[parts.length - 1] || first}</span>`;
    case 'hit':
    case 'd20':
      return signedNumber(first);
    case 'initiative':
      return parts[1] || signedNumber(first);
    case 'dc':
      return `DC ${first}`;
    case 'chance':
      return parts[1] || `${first} percent`;
    case 'recharge':
      return rechargeLabel(first);
    case 'coinflip':
      return first || 'flip a coin';
    case 'ability':
      return parts[1] || abilityScore(first);
    case 'savingThrow':
    case 'skillCheck':
      return parts[1] || signedTail(first);

    // --- statblock shorthands (2014 + 2024) ----------------------------------
    case 'atk':
      return `<em>${attackLabel(first)}</em>`;
    case 'atkr':
      return `<em>${attackRollLabel(first)}</em>`;
    case 'h':
      return '<em>Hit:</em> ';
    case 'm':
      return '<em>Miss:</em> ';
    case 'hom':
      return '<em>Miss:</em> ';
    case 'hitYourSpellAttack':
      return first || 'your spell attack modifier';
    case 'dcYourSpellSave':
      return first || 'your spell save DC';
    case 'actSave':
      return `<em>${abilityName(first)} Saving Throw:</em>`;
    case 'actSaveFail':
      return `<em>Failure${first ? ` (${first})` : ''}:</em>`;
    case 'actSaveFailBy':
      return `<em>Failure by ${first} or More:</em>`;
    case 'actSaveSuccess':
      return '<em>Success:</em>';
    case 'actSaveSuccessOrFail':
      return '<em>Failure or Success:</em>';
    case 'actTrigger':
      return '<em>Trigger:</em>';
    case 'actResponse':
      return `<em>Response${first ? ` (${first})` : ''}:</em>`;

    // --- external / structural refs (display-only here) ----------------------
    case 'link': {
      const url = parts[1] ?? '';
      return /^https?:\/\//.test(url)
        ? `<a href="${attr(url)}" rel="noopener" target="_blank">${first}</a>`
        : first;
    }
    case '5etools':
    case 'filter':
    case 'book':
    case 'adventure':
    case 'footnote':
    case 'area':
    case 'homebrew':
    case 'loader':
    case 'cite':
      return first;
    case 'unit':
      return parts[1] ? `${first} ${parts[1]}` : first;

    default:
      // Unknown tag: degrade to its first pipe part, never leak braces.
      return first;
  }
}

const attr = (s: string): string => s.replace(/"/g, '&quot;');

function attackLabel(kind: string): string {
  switch (kind) {
    case 'mw':
      return 'Melee Weapon Attack:';
    case 'rw':
      return 'Ranged Weapon Attack:';
    case 'ms':
      return 'Melee Spell Attack:';
    case 'rs':
      return 'Ranged Spell Attack:';
    case 'mw,rw':
    case 'm,r':
      return 'Melee or Ranged Weapon Attack:';
    case 'ms,rs':
      return 'Melee or Ranged Spell Attack:';
    default:
      return 'Attack:';
  }
}

/** 2024-style attack rolls: {@atkr m}, {@atkr r}, {@atkr m,r}. */
function attackRollLabel(kind: string): string {
  switch (kind) {
    case 'm':
      return 'Melee Attack Roll:';
    case 'r':
      return 'Ranged Attack Roll:';
    case 'm,r':
      return 'Melee or Ranged Attack Roll:';
    default:
      return 'Attack Roll:';
  }
}

const ABILITY_NAMES: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};
const abilityName = (abbr: string): string =>
  ABILITY_NAMES[abbr.toLowerCase().trim()] ?? abbr;

/** "{@ability str 20}" → "20 (+5)". */
function abilityScore(raw: string): string {
  const m = /(-?\d+)\s*$/.exec(raw);
  if (!m) return raw;
  const score = parseInt(m[1], 10);
  const mod = Math.floor((score - 10) / 2);
  return `${score} (${mod >= 0 ? '+' : ''}${mod})`;
}

/** "{@savingThrow str 5}" → "+5" (renders the trailing bonus, signed). */
function signedTail(raw: string): string {
  const m = /(-?\d+)\s*$/.exec(raw);
  return m ? signedNumber(m[1]) : raw;
}

function signedNumber(raw: string): string {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return raw;
  return n >= 0 ? `+${n}` : `${n}`;
}

/** "{@recharge}" → "(Recharge 6)"; "{@recharge 5}" → "(Recharge 5–6)". */
function rechargeLabel(raw: string): string {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n >= 6) return '(Recharge 6)';
  return `(Recharge ${n}–6)`;
}

/** Strip inline tags down to plain text (for search indexes and card previews). */
export function stripInlineTags(str: unknown): string {
  if (typeof str !== 'string') return String(str ?? '');
  let out = str;
  for (let i = 0; i < MAX_NESTING && out.includes('{@'); i++) {
    const next = out.replace(
      TAG_RE,
      (_m, tag: string, inner: string | undefined) => {
        const link = LINK_TAGS[tag];
        if (link) return splitLinkTag(link, inner ?? '').display;
        const parts = (inner ?? '').split('|');
        switch (tag) {
          case 'dice':
          case 'damage':
          case 'autodice':
            return parts[1] || parts[0];
          case 'scaledice':
          case 'scaledamage':
            return parts[parts.length - 1] || parts[0];
          case 'hit':
          case 'd20':
            return signedNumber(parts[0]);
          case 'initiative':
            return parts[1] || signedNumber(parts[0]);
          case 'dc':
            return `DC ${parts[0]}`;
          case 'recharge':
            return rechargeLabel(parts[0] ?? '');
          default:
            return parts[0] ?? '';
        }
      },
    );
    if (next === out) break;
    out = next;
  }
  return out.trim();
}
