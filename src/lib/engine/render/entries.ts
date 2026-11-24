/**
 * engine/render/entries.ts — recursive 5etools "entries" → HTML renderer.
 *
 * INTENT
 *   Walk the nested `entries` structure (strings, lists, tables, quotes, etc.)
 *   and emit HTML, delegating inline `{@tag}` resolution to tags.ts. Pure and
 *   total: unknown node types fall back to rendering their `entries`, never throw.
 *   Ported from translate.js renderEntry().
 *
 * REUSE NOTES
 *   - The single place that understands 5etools' entry node grammar. Extend the
 *     switch to support a new node type; everything upstream gets it for free.
 */
import type { Entry, EntryObject } from '../types.ts';
import { parseInlineTags } from './tags.ts';

export function renderEntry(entry: Entry | null | undefined): string {
  if (entry === null || entry === undefined) return '';
  if (typeof entry === 'string') return `<p>${parseInlineTags(entry)}</p>`;
  if (typeof entry === 'number') return `<p>${entry}</p>`;
  if (Array.isArray(entry)) return entry.map(renderEntry).join('');

  const node = entry as EntryObject;
  const type = node.type || 'entries';

  switch (type) {
    case 'entries':
    case 'section':
    case 'inset':
    case 'insetReadaloud': {
      const title = node.name
        ? `<h5 class="entry-title">${parseInlineTags(node.name)}</h5>`
        : '';
      const content = Array.isArray(node.entries)
        ? node.entries.map(renderEntry).join('')
        : '';
      return `<div class="entry-block">${title}${content}</div>`;
    }

    case 'list': {
      const listTag = node.style === 'ordered' ? 'ol' : 'ul';
      const items = Array.isArray(node.items)
        ? node.items.map(renderListItem).join('')
        : '';
      return `<${listTag} class="entry-list">${items}</${listTag}>`;
    }

    case 'table':
      return renderTable(node);

    case 'quote': {
      const content = Array.isArray(node.entries)
        ? node.entries.map(renderEntry).join('')
        : '';
      const footer = node.by
        ? `<footer>— <cite>${parseInlineTags(String(node.by))}</cite></footer>`
        : '';
      return `<blockquote class="entry-quote">${content}${footer}</blockquote>`;
    }

    case 'paper': {
      const title = node.name
        ? `<h5 class="paper-title">${parseInlineTags(node.name)}</h5>`
        : '';
      const content = Array.isArray(node.entries)
        ? node.entries.map(renderEntry).join('')
        : '';
      return `<div class="entry-paper">${title}${content}</div>`;
    }

    case 'hr':
      return "<hr class='entry-hr' />";

    case 'abilityDc':
      return `<p class="entry-dc"><strong>${node.name} Saving Throw:</strong> DC ${node.dc}</p>`;

    case 'abilityAttackMod': {
      const atk = Number(node.atk) || 0;
      return `<p class="entry-attack"><strong>${node.name} Attack Modifier:</strong> ${atk >= 0 ? '+' : ''}${atk}</p>`;
    }

    case 'inlineBlock':
      return Array.isArray(node.entries)
        ? node.entries
            .map((e) =>
              typeof e === 'string' ? parseInlineTags(e) : renderEntry(e),
            )
            .join(' ')
        : '';

    default:
      return Array.isArray(node.entries)
        ? node.entries.map(renderEntry).join('')
        : '';
  }
}

function renderListItem(item: Entry): string {
  if (typeof item === 'string') return `<li>${parseInlineTags(item)}</li>`;
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const obj = item as EntryObject & { entry?: Entry };
    const itemName = obj.name
      ? `<strong>${parseInlineTags(obj.name)}.</strong> `
      : '';
    let content = '';
    if (obj.entry !== undefined) {
      content =
        typeof obj.entry === 'string'
          ? parseInlineTags(obj.entry)
          : renderEntry(obj.entry);
    } else if (Array.isArray(obj.entries)) {
      content = obj.entries.map(renderEntry).join('');
    }
    return `<li>${itemName}${content}</li>`;
  }
  return '';
}

function renderTable(node: EntryObject): string {
  const caption = node.caption
    ? `<caption>${parseInlineTags(String(node.caption))}</caption>`
    : '';
  const colLabels = (node.colLabels || node.colHeaders) as
    unknown[] | undefined;
  const colStyles = (node.colStyles as string[]) || [];

  const headers = Array.isArray(colLabels)
    ? `<thead><tr>${colLabels
        .map(
          (h, i) =>
            `<th${colStyles[i] ? ` class="${colStyles[i]}"` : ''}>${parseInlineTags(String(h))}</th>`,
        )
        .join('')}</tr></thead>`
    : '';

  const rows = Array.isArray(node.rows)
    ? `<tbody>${(node.rows as unknown[])
        .map((row) => {
          if (!Array.isArray(row)) return '<tr></tr>';
          const cells = row
            .map((cell, i) => {
              let cellContent = '';
              if (typeof cell === 'string') cellContent = parseInlineTags(cell);
              else if (cell && typeof cell === 'object') {
                const c = cell as Record<string, unknown>;
                if (c.type === 'cell') {
                  const roll = c.roll as
                    { entry?: string; min?: number; max?: number } | undefined;
                  cellContent = roll
                    ? `<strong>${parseInlineTags(String(roll.entry ?? `${roll.min}-${roll.max}`))}</strong>`
                    : c.entry !== undefined
                      ? renderEntry(c.entry as Entry)
                      : '';
                } else {
                  cellContent = renderEntry(cell as Entry);
                }
              }
              return `<td${colStyles[i] ? ` class="${colStyles[i]}"` : ''}>${cellContent}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')}</tbody>`
    : '';

  return `<div class="table-container"><table class="entry-table">${caption}${headers}${rows}</table></div>`;
}
