/**
 * compendium.js — mark replaced entries in a compendium's list.
 *
 * Each row whose entry a rule supersedes gets a swap icon at its end, with a
 * tooltip naming the replacement. Matching reads the pack index, which carries
 * `system.source` for Items (dnd5e adds it), so no document is loaded.
 *
 * Shown to everyone, GMs included: unlike the banner it never gets in the way,
 * and it is how a GM browsing a pack sees which entries the rules cover.
 */

import { ruleFor } from './intercept.js';

const CLASS = 'hm-compendium-replaced';

function mark(app, element) {
  const pack = app.collection;
  if (pack?.documentName !== 'Item') return;

  for (const row of element.querySelectorAll('li.entry[data-entry-id]')) {
    if (row.querySelector(`.${CLASS}`)) continue;
    const entry = pack.index.get(row.dataset.entryId);
    const rule = entry && ruleFor(entry);
    if (!rule) continue;

    const label = game.i18n.format('HM-BRIDGE.compendium-replaced', {
      replacement: rule.replacementName,
    });
    const icon = document.createElement('i');
    icon.className = `${CLASS} fa-solid fa-right-left`;
    icon.dataset.tooltip = label;
    icon.setAttribute('aria-label', label);
    row.append(icon);
  }
}

export function registerCompendiumMarks() {
  Hooks.on('renderCompendium', (app, element) => mark(app, element));
}
