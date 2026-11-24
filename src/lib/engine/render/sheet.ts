/**
 * engine/render/sheet.ts — the shape every per-type renderer returns, the
 * helpers they share, and buildSheet, which assembles the final HTML.
 */
import type { Entity } from '../types.ts';
import { formatProfList, formatResistList } from './format.ts';

export interface SheetParts {
  badgeText: string;
  badgeClass: string;
  extraClass?: string;
  styleAttr?: string;
  badgeStyle?: string;
  metaRows: string[];
  body: string;
  properties: Record<string, unknown>;
  textSummary: string;
}

export type Renderer = (
  entity: Entity,
  ctx: { name: string; source: string; page: string },
) => SheetParts;

export const row = (label: string, value: unknown): string =>
  `<div><strong>${label}:</strong> ${value}</div>`;

/** Collect the common proficiency/resist rows shared by feats, races, optional features. */
export function collectProfAndResistRows(
  entity: Entity,
  props: Record<string, unknown>,
): string[] {
  const rows: string[] = [];
  const add = (label: string, key: string, value: string) => {
    if (value) {
      props[key] = value;
      rows.push(row(label, value));
    }
  };
  add('Skills', 'skills', formatProfList(entity.skillProficiencies as never));
  add('Tools', 'tools', formatProfList(entity.toolProficiencies as never));
  add(
    'Weapons',
    'weapons',
    formatProfList(entity.weaponProficiencies as never),
  );
  add('Armor', 'armor', formatProfList(entity.armorProficiencies as never));
  add(
    'Languages',
    'languages',
    formatProfList(entity.languageProficiencies as never),
  );
  add('Expertise', 'expertise', formatProfList(entity.expertise as never));
  add('Resistances', 'resist', formatResistList(entity.resist as never));
  add('Immunities', 'immune', formatResistList(entity.immune as never));
  add(
    'Vulnerabilities',
    'vulnerable',
    formatResistList(entity.vulnerable as never),
  );
  add(
    'Condition Immunities',
    'conditionImmune',
    formatResistList(entity.conditionImmune as never),
  );
  return rows;
}

export function buildSheet(
  name: string,
  source: string,
  page: string,
  parts: SheetParts,
): string {
  const metaRows = parts.metaRows.join('\n            ');
  return `
        <div class="translated-sheet ${parts.extraClass || 'general-sheet'}"${parts.styleAttr || ''}>
          <header class="sheet-header">
            <h3>${name}</h3>
            <span class="sheet-badge ${parts.badgeClass}"${parts.badgeStyle || ''}>${parts.badgeText}</span>
          </header>
          <div class="sheet-meta">
            ${metaRows}
            <div><strong>Source:</strong> <em>${source}${page}</em></div>
          </div>
          <div class="sheet-body">
            ${parts.body}
          </div>
        </div>
      `;
}
