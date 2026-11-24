/**
 * engine/render/render-rules.ts — rules-glossary sheets: conditions, statuses
 * and actions.
 */
import { renderEntry } from './entries.ts';
import { capitalize } from './format.ts';
import { row, type Renderer } from './sheet.ts';

export const renderCondition: Renderer = (entity, ctx) => {
  const typeName = capitalize((entity.__type as string) || 'condition');
  const color = entity.color ? `#${entity.color}` : null;
  return {
    badgeText: typeName,
    badgeClass: 'badge-condition',
    extraClass: 'condition-sheet',
    styleAttr: color ? ` style="border-left: 4px solid ${color};"` : '',
    badgeStyle: color
      ? ` style="background-color: ${color}; color: #fff;"`
      : '',
    metaRows: color
      ? [
          row(
            'Display Color',
            `<span style="display:inline-block; width:12px; height:12px; background:${color}; border:1px solid #fff; vertical-align:middle; margin-left:4px;"></span> ${color}`,
          ),
        ]
      : [],
    body: renderEntry(entity.entries),
    properties: { color },
    textSummary: `${typeName}. Source: ${ctx.source}${ctx.page}.`,
  };
};

export const renderAction: Renderer = (entity, { source, page }) => {
  const properties: Record<string, unknown> = {};
  const metaRows: string[] = [];
  if (Array.isArray(entity.time) && entity.time.length) {
    const v = entity.time
      .map(
        (t) =>
          `${(t as { number?: number }).number} ${capitalize((t as { unit?: string }).unit || '')}`,
      )
      .join(', ');
    properties.time = v;
    metaRows.push(row('Cost', v));
  }
  if (entity.fromVariant) {
    properties.fromVariant = entity.fromVariant;
    metaRows.push(row('Variant', entity.fromVariant));
  }
  if (Array.isArray(entity.seeAlsoAction)) {
    const v = entity.seeAlsoAction
      .map((a) => capitalize(String(a).split('|')[0]))
      .join(', ');
    properties.seeAlso = v;
    metaRows.push(row('See Also', v));
  }
  return {
    badgeText: 'Action',
    badgeClass: 'badge-action',
    extraClass: 'action-sheet',
    metaRows,
    body: renderEntry(entity.entries),
    properties,
    textSummary: `Action. Cost: ${properties.time || 'None'}. Source: ${source}${page}.`,
  };
};
