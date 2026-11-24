/**
 * engine/render/translate.ts — render a resolved 5etools entity into a display "sheet".
 *
 * INTENT
 *   Turn one entity into { html, textSummary, properties } and attach it as
 *   `entity._display`. This is the single rendering authority for server and
 *   browser preview — keep it pure (no DOM/fs) so both the SvelteKit server and
 *   the client import the exact same output.
 *
 * DESIGN
 *   Each entity type is a small `Renderer` returning structured parts,
 *   assembled by one `buildSheet`. Adding a type = add a function + one
 *   RENDERERS entry. Keep output class names stable: app CSS styles them.
 *
 * MODULES
 *   sheet.ts (shared parts + buildSheet), tables.ts (code → name lookups),
 *   render-items-spells.ts, render-character.ts and render-rules.ts (the
 *   per-type renderers). This file maps a type to its renderer.
 *
 * REUSE NOTES
 *   - `properties` is a flat bag used by cards/tables; `html` is the full sheet.
 *   - Unknown types fall through to a generic sheet.
 */
import type { Entity, EntityDisplay } from '../types.ts';
import { renderEntry } from './entries.ts';
import { buildSheet, type Renderer, type SheetParts } from './sheet.ts';
import { renderItem, renderSpell } from './render-items-spells.ts';
import {
  renderBackground,
  renderClass,
  renderFeat,
  renderOptionalFeature,
  renderRace,
} from './render-character.ts';
import { renderAction, renderCondition } from './render-rules.ts';

const RENDERERS: Record<string, Renderer> = {
  feat: renderFeat,
  spell: renderSpell,
  item: renderItem,
  race: renderRace,
  background: renderBackground,
  class: renderClass,
  optionalfeature: renderOptionalFeature,
  condition: renderCondition,
  status: renderCondition,
  action: renderAction,
};

/**
 * Render `entity` for display, attach `entity._display`, and return the entity.
 * `type` is the renderer key (e.g. 'item', 'spell'); unknown types get a generic sheet.
 */
export function translateEntity(
  entity: Entity | null,
  type: string,
): Entity | null {
  if (!entity) return null;

  const name = entity.name || 'Unnamed';
  const source = entity.source || 'Unknown';
  const page = entity.page ? ` p. ${entity.page}` : '';

  // condition/status need to know which they are inside the shared renderer.
  if (type === 'condition' || type === 'status') entity.__type = type;

  const renderer = RENDERERS[type];
  let parts: SheetParts;
  if (renderer) {
    parts = renderer(entity, { name, source, page });
  } else {
    parts = {
      badgeText: type,
      badgeClass: 'badge-general',
      extraClass: 'general-sheet',
      metaRows: [],
      body: renderEntry(entity.entries),
      properties: {},
      textSummary: `${type.toUpperCase()} entity: ${name}`,
    };
  }
  if (type === 'condition' || type === 'status') delete entity.__type;

  const display: EntityDisplay = {
    html: buildSheet(name, source, page, parts),
    textSummary: parts.textSummary,
    properties: {
      name,
      source,
      page: entity.page,
      isHomebrew: !!entity._isHomebrew,
      ...parts.properties,
    },
  };
  entity._display = display;
  return entity;
}
