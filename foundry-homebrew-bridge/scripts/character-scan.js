/**
 * character-scan.js — "Scan characters for replacements", in Foundry.
 *
 * Walks every character sheet against the world's replacement rules and lists
 * what it finds, so the GM can look before swapping. Names are @UUID enrichers:
 * click one to open the sheet. Each original lists every document that could
 * replace it (world Items and compendiums with the replacement's name), labelled
 * by source book and where it lives, and the GM picks one. The one matching the
 * rule's source comes pre-selected.
 *
 * Each row also lists what else on the sheet points at the original (a
 * subclass granting it, a feature casting it, a link), which the swap rewrites
 * too. An original that is only referenced, not held, gets a row of its own.
 *
 * The matching is scan.js and lib/replacements.js; the swap is replace.js.
 * GM only: a swap deletes an item from someone's sheet.
 */

import { currentRules } from './intercept.js';
import { runScan } from './scan.js';
import { findCandidates, runReferenceSwap, runReplace } from './replace.js';
import { readSourceLabels } from './lib/replacements.js';

const { ApplicationV2 } = foundry.applications.api;

const esc = (text) => foundry.utils.escapeHTML(String(text ?? ''));
const t = (key, data) =>
  data ? game.i18n.format(`HM-BRIDGE.${key}`, data) : game.i18n.localize(`HM-BRIDGE.${key}`);

/**
 * An @UUID enricher. With no name Foundry shows the document's own; an empty
 * `{}` wouldn't parse. A brace in the name would end the label early.
 */
function link(uuid, name) {
  const label = String(name ?? '').replace(/[{}]/g, '');
  return label ? `@UUID[${uuid}]{${esc(label)}}` : `@UUID[${uuid}]`;
}

/**
 * @typedef {object} ScanRow
 * @property {string} key unique per row; the same original can be on two sheets
 * @property {object} hit a scan hit (scan.js); for `refsOnly`, the referenced original
 * @property {object[]} refs references to the same rule on the same actor
 * @property {boolean} refsOnly the original isn't on the sheet, only referenced
 * @property {object} rule
 * @property {string} source the original's book label
 * @property {string} origin what the original was imported from, if recorded
 * @property {Awaited<ReturnType<typeof findCandidates>>} candidates
 * @property {string} chosen uuid of the picked candidate, '' for none
 * @property {{ uuid: string, name: string, dropped: number, updated: number }|null} done
 * @property {string} error
 */

/** Where a reference sits, for the "Also updates" line. */
function refLabel(ref) {
  const what =
    ref.kind !== 'grant'
      ? t(`scan-ref-${ref.kind}`)
      : ref.level
        ? t('scan-ref-grant', { level: ref.level })
        : t('scan-ref-grant-any');
  return `${link(ref.holderUuid, ref.holderName)} (${esc(what)})`;
}

export default class CharacterScan extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: 'foundry-homebrew-bridge-character-scan',
    tag: 'div',
    classes: ['hm-bridge', 'hm-character-scan'],
    window: {
      title: 'HM-BRIDGE.scan-title',
      icon: 'fas fa-right-left',
      resizable: true,
      // Core's form styling: fieldsets, hints and the footer, as in dnd5e's settings.
      contentClasses: ['standard-form'],
    },
    position: { width: 760, height: 640 },
  };

  /** @type {ScanRow[]|null} null while scanning */
  #rows = null;
  #error = '';
  #characters = 0;
  #alreadyReplaced = 0;
  #busy = '';

  async _onFirstRender(...args) {
    await super._onFirstRender?.(...args);
    void this.#scan();
  }

  async #scan() {
    this.#rows = null;
    this.#error = '';
    this.render();
    try {
      await this.#collect();
    } catch (err) {
      console.error('foundry-homebrew-bridge | character scan failed', err);
      this.#error = err?.message ?? String(err);
      this.#rows = [];
    }
    this.render();
  }

  async #collect() {
    const { rules } = currentRules();
    const { hits, refs, scanned } = await runScan({
      rules,
      scope: { characters: true },
      references: true,
    });
    this.#characters = scanned.actors;
    this.#alreadyReplaced = hits.filter((h) => h.state === 'replaced').length;

    // References by actor and rule. The first row for that pair carries them;
    // a pair with no item on the sheet becomes a row from its first reference.
    const pairKey = (actorUuid, ruleId) => `${actorUuid}|${ruleId}`;
    const refsByPair = new Map();
    for (const ref of refs) {
      const key = pairKey(ref.location.actorUuid, ref.ruleId);
      if (!refsByPair.has(key)) refsByPair.set(key, []);
      refsByPair.get(key).push(ref);
    }
    const sources = hits
      .filter((h) => h.state === 'original')
      .map((hit) => ({ hit, refsOnly: false }));
    const held = new Set(sources.map((s) => pairKey(s.hit.location.actorUuid, s.hit.ruleId)));
    for (const [key, list] of refsByPair) {
      if (held.has(key)) continue;
      const [first] = list;
      sources.push({
        hit: { uuid: first.uuid, name: first.name, ruleId: first.ruleId, location: first.location },
        refsOnly: true,
      });
    }

    const rows = [];
    const given = new Set();
    for (const { hit, refsOnly } of sources) {
      const rule = rules.find((r) => r.id === hit.ruleId);
      const item = await fromUuid(hit.uuid);
      if (!rule || !item) continue;
      const pair = pairKey(hit.location.actorUuid, hit.ruleId);
      const rowRefs = given.has(pair) ? [] : (refsByPair.get(pair) ?? []);
      given.add(pair);
      const candidates = await findCandidates(rule);
      rows.push({
        key: `${hit.location.actorUuid}|${hit.uuid}`,
        hit,
        refs: rowRefs,
        refsOnly,
        rule,
        source: readSourceLabels(item.toObject()).book,
        origin: item._stats?.compendiumSource ?? '',
        candidates,
        chosen: candidates.find((c) => c.suggested)?.uuid ?? '',
        done: null,
        error: '',
      });
    }
    this.#rows = rows;
  }

  /** Where a candidate lives: a compendium, or a folder in world Items. */
  #where(c) {
    if (c.pack !== 'world') return t('scan-in-compendium', { pack: esc(c.packLabel) });
    const path = [c.packLabel, c.folder].filter(Boolean).join(' › ');
    const from = c.origin ? ` ${t('scan-imported-from', { link: link(c.origin, '') })}` : '';
    return `${esc(path)}${from}`;
  }

  #candidateHtml(row, index) {
    if (row.done) {
      const target = link(row.done.uuid, row.done.name);
      const said = row.refsOnly
        ? t('scan-refs-done', { link: target })
        : t('scan-replaced-with', { link: target });
      const updated = row.done.updated ? ` ${t('scan-updated', { n: row.done.updated })}` : '';
      const lost = row.done.dropped ? ` ${t('scan-dropped', { n: row.done.dropped })}` : '';
      return `<p class="hm-scan-done">${said}${updated}${lost}</p>`;
    }
    if (!row.candidates.length)
      return `<p class="hm-scan-missing">${t('err-no-replacement', { name: esc(row.rule.replacementName) })}</p>`;

    const options = row.candidates
      .map(
        (c) => `<label class="hm-scan-candidate">
          <input type="radio" name="pick-${index}" value="${esc(c.uuid)}" ${c.uuid === row.chosen ? 'checked' : ''}>
          <span class="hm-scan-candidate-name">${link(c.uuid, c.name)}</span>
          <span class="hm-scan-candidate-where hint">${esc(c.source || t('scan-no-source'))} · ${this.#where(c)}</span>
        </label>`,
      )
      .join('');
    const pick =
      row.candidates.length > 1 && !row.chosen
        ? `<p class="hm-scan-hint hint">${t('scan-pick-one')}</p>`
        : '';
    return `<div class="hm-scan-candidates">${options}</div>${pick}`;
  }

  #rowHtml(row, index) {
    const origin = row.origin
      ? `<span class="hm-scan-origin hint">${t('scan-imported-from', { link: link(row.origin, '') })}</span>`
      : '';
    const busy = this.#busy === row.key;
    const label = row.refsOnly ? t('scan-update-refs') : t('scan-replace');
    const button = row.done
      ? ''
      : `<button type="button" data-action="replace" data-row="${index}" ${!row.chosen || this.#busy ? 'disabled' : ''}>
          <i class="fas ${busy ? 'fa-spinner fa-spin' : 'fa-right-left'}"></i> ${label}</button>`;
    const absent = row.refsOnly
      ? `<span class="hm-scan-absent hint">${t('scan-not-on-sheet')}</span>`
      : '';
    // The same holder can reference it twice the same way (two links); say it once.
    const where = [...new Set(row.refs.map(refLabel))];
    const refs = where.length
      ? `<span class="hm-scan-refs hint">${t('scan-also-updates')} ${where.join(', ')}</span>`
      : '';
    return `<div class="hm-scan-row">
      <div class="hm-scan-original">
        <span class="hm-scan-original-name">${link(row.hit.uuid, row.hit.name)}</span>
        <span class="hm-scan-original-source hint">${esc(row.source || t('scan-no-source'))}</span>
        ${origin}
        ${absent}
        ${refs}
      </div>
      <div class="hm-scan-replacement">${this.#candidateHtml(row, index)}
        ${row.error ? `<p class="hm-bridge-message">${esc(row.error)}</p>` : ''}</div>
      <div class="hm-scan-action">${button}</div>
    </div>`;
  }

  async _renderHTML() {
    if (!this.#rows) return `<p class="hm-scan-status"><i class="fas fa-spinner fa-spin"></i> ${t('scan-scanning')}</p>`;

    const rules = currentRules().rules.length;
    const referenced = this.#rows.filter((r) => r.refsOnly).length;
    const summary = [
      t('scan-summary', {
        items: this.#rows.length - referenced,
        characters: this.#characters,
        replaced: this.#alreadyReplaced,
      }),
      referenced ? t('scan-summary-refs', { n: referenced }) : '',
    ].join(' ');

    // One group per character, in the order the scan met them.
    const groups = new Map();
    this.#rows.forEach((row, index) => {
      const key = row.hit.location.actorUuid;
      if (!groups.has(key)) groups.set(key, { name: row.hit.location.actorName, rows: [] });
      groups.get(key).rows.push(this.#rowHtml(row, index));
    });
    const body = [...groups]
      .map(
        ([uuid, g]) => `<fieldset class="hm-scan-actor">
          <legend>${link(uuid, g.name)}</legend>
          ${g.rows.join('')}
        </fieldset>`,
      )
      .join('');

    const empty = rules
      ? `<p class="hm-scan-status">${t('scan-none')}</p>`
      : `<p class="hm-scan-status">${t('scan-no-rules')}</p>`;

    const html = `
      ${this.#error ? `<p class="hm-bridge-message">${esc(this.#error)}</p>` : ''}
      <p class="hm-scan-status">${summary}</p>
      <p class="hint">${t('scan-hint')}</p>
      <div class="hm-scan-body">${body || empty}</div>
      <footer class="form-footer">
        <button type="button" data-action="rescan"><i class="fas fa-rotate"></i> ${t('scan-rescan')}</button>
      </footer>`;
    return foundry.applications.ux.TextEditor.implementation.enrichHTML(html);
  }

  async _replaceHTML(result, content) {
    content.innerHTML = result;
    content.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', (ev) => this.#onAction(ev));
    });
    content.querySelectorAll('.hm-scan-candidate input').forEach((el) => {
      el.addEventListener('change', (ev) => this.#onPick(ev));
    });
  }

  #onPick(ev) {
    const index = Number(ev.currentTarget.name.slice('pick-'.length));
    const row = this.#rows?.[index];
    if (!row) return;
    row.chosen = ev.currentTarget.value;
    // Only the button changes, so don't re-enrich the whole list for it.
    const button = this.element.querySelector(`[data-action="replace"][data-row="${index}"]`);
    if (button) button.disabled = !!this.#busy;
    this.element
      .querySelector(`[name="pick-${index}"]`)
      ?.closest('.hm-scan-replacement')
      ?.querySelector('.hm-scan-hint')
      ?.remove();
  }

  async #onAction(ev) {
    const button = ev.currentTarget;
    if (button.dataset.action === 'rescan') return this.#scan();
    if (button.dataset.action !== 'replace') return;

    const row = this.#rows?.[Number(button.dataset.row)];
    if (!row?.chosen || this.#busy) return;
    this.#busy = row.key;
    row.error = '';
    this.render();
    try {
      const result = row.refsOnly
        ? await runReferenceSwap({
            actorUuid: row.hit.location.actorUuid,
            rule: row.rule,
            replacementUuid: row.chosen,
          })
        : await runReplace({
            uuid: row.hit.uuid,
            rule: row.rule,
            replacementUuid: row.chosen,
          });
      row.done = {
        uuid: result.uuid,
        name: result.name,
        dropped: result.dropped ?? 0,
        updated: result.updated ?? 0,
      };
    } catch (err) {
      console.error('foundry-homebrew-bridge | replace failed', err);
      row.error = err?.message ?? String(err);
    } finally {
      this.#busy = '';
      this.render();
    }
  }
}

/** A button on the Actors sidebar, for GMs. Also reachable from module settings. */
export function registerCharacterScan() {
  Hooks.on('renderActorDirectory', (_app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const actions = root?.querySelector('.header-actions');
    if (!actions || actions.querySelector('.hm-scan-characters')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hm-scan-characters';
    button.innerHTML = `<i class="fas fa-right-left"></i> ${esc(t('scan-button'))}`;
    button.addEventListener('click', () =>
      new CharacterScan().render({ force: true }),
    );
    actions.append(button);
  });
}
