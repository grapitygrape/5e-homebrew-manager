/**
 * intercept.js — swap superseded items on import, and say so.
 *
 * Runs on EVERY client, not just the GM's: the player dragging a spell onto a
 * sheet is the one whose preCreateItem fires. The rules therefore live in a
 * world setting (pushed by the manager), not in the manager connection.
 *
 * WHAT HAPPENS
 *   1. An item matching a rule is about to land on an actor: before it is
 *      created, its data becomes the replacement's, with the slot's sort order.
 *   2. Once it lands, post a chat message with two buttons. The sheet's owner
 *      or a GM can Confirm the replacement or Allow the original, which puts it
 *      back and remembers the choice on that actor.
 *   A replacement that can't be found never blocks the player: the original
 *   goes in unchanged and the player is told.
 *
 * WHY SWAP IN PLACE, NOT CANCEL AND RE-CREATE
 *   Whoever asked for the item gets one back. Neptunium checks that every item
 *   it creates comes back and aborts the whole import when one doesn't, so a
 *   cancelled Fireball cost a creature every spell after it. The preCreateItem
 *   hook can't wait for the lookup, so this wraps Item#_preCreate, which
 *   Foundry awaits.
 *
 * LEVEL-UP GRANTS
 *   dnd5e records an item it grants by id on the class or subclass, and
 *   removes it by that id when leveling down. The swapped item keeps the id it
 *   was created with, so the record stays true.
 *
 * LINKS
 *   @UUID links to the original in the actor's biography and its items'
 *   descriptions are pointed at the replacement, and the label renamed. Only
 *   text: grants are dnd5e's to write mid level-up. What was overwritten rides
 *   in the chat message, so Allow puts it back.
 *
 * CAST ACTIVITIES
 *   A feature that casts a spell keeps its own copy of that spell on the sheet.
 *   That copy is left alone here; instead the feature's Cast activity is
 *   pointed at the replacement once it lands, and dnd5e swaps the copy.
 */

import CONSTANTS from './constants.js';
import { mightBeOriginal } from './scan.js';
import {
  importSwapData,
  indexRules,
  matchDocument,
  parseRules,
  readSourceLabels,
  replacesLabel,
  ruleKey,
} from './lib/replacements.js';
import {
  findReplacement,
  relinkOnImport,
  restoreReferences,
} from './replace.js';

const FLAG = CONSTANTS.MODULE_ID;

/** Rule keys a player tried to add this session, for the banner's wording. */
export const attempted = new Set();

/** Swaps made before creation, waiting for their item to land on this client. */
const landing = [];

let cacheText = null;
let cacheRules = [];
let cacheIndex = new Map();

/** The stored rules, parsed once per change. */
export function currentRules() {
  const text = game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.RULES);
  if (text !== cacheText) {
    cacheText = text;
    cacheRules = parseRules(text).map((r, i) => ({ ...r, id: String(i) }));
    cacheIndex = indexRules(cacheRules);
  }
  return { rules: cacheRules, byName: cacheIndex };
}

/** What a document would be replaced by, or null. */
export function ruleFor(raw) {
  const { rules, byName } = currentRules();
  const found = matchDocument(raw, byName);
  if (!found || found.state !== 'original') return null;
  return rules.find((r) => r.id === found.ruleId) ?? null;
}

const esc = (text) => foundry.utils.escapeHTML(String(text ?? ''));

export function registerInterceptor() {
  wrapPreCreate();

  Hooks.on('createItem', (item, _options, userId) => {
    if (userId !== game.user.id) return;
    const actor = item.parent;
    if (actor?.documentName !== 'Actor') return;
    const swap = takeLanded(actor, item);
    if (swap) void announceSwap(actor, item, swap);

    if (!game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.ENFORCE))
      return;
    if (item.getFlag('dnd5e', 'cachedFor')) return;
    const activities = Object.values(item.toObject().system?.activities ?? {});
    if (!activities.some((a) => a?.type === 'cast')) return;
    void swapCastSpells(actor, item);
  });

  Hooks.on('renderChatMessageHTML', (message, html) =>
    bindButtons(message, html),
  );
}

/** Run swapBeforeCreate ahead of every Item's own _preCreate, on the creating client. */
function wrapPreCreate() {
  const proto = CONFIG.Item.documentClass.prototype;
  const base = proto._preCreate;
  proto._preCreate = async function (data, options, user) {
    if (user?.id === game.user.id) {
      // A bug here must not stop anyone adding an item.
      try {
        await swapBeforeCreate(this, data, options);
      } catch (err) {
        console.error(`${FLAG} | import swap failed`, err);
      }
    }
    return base.call(this, data, options, user);
  };
}

/** Turn a pending item that a rule supersedes into its replacement. */
async function swapBeforeCreate(item, data, options) {
  if (options?.hbmBridge) return;
  if (!game.settings.get(CONSTANTS.MODULE_ID, CONSTANTS.SETTINGS.ENFORCE))
    return;
  const actor = item.parent;
  if (actor?.documentName !== 'Actor') return;

  const original = item.toObject();
  if (original.flags?.dnd5e?.cachedFor) return;
  const rule = ruleFor(original);
  if (!rule) return;
  if ((actor.getFlag(FLAG, 'allowed') ?? []).includes(ruleKey(rule))) return;

  attempted.add(ruleKey(rule));

  try {
    const replacement = await findReplacement(rule);
    const swapped = importSwapData(original, replacement.raw, rule, replacement.uuid);
    if (!swapped)
      throw new Error(
        game.i18n.format('HM-BRIDGE.err-replacement-type', {
          name: replacement.raw.name,
          type: replacement.raw.type,
        }),
      );
    // Every field, so nothing of the original's is left behind.
    const source = item.constructor.cleanData(swapped);
    delete source._id;
    item.updateSource(source, { recursive: false });
    // Hooks after this one read the creation data, Neptunium's among them.
    for (const key of Object.keys(data)) if (key !== '_id') delete data[key];
    Object.assign(data, foundry.utils.deepClone(source));
    landing.push({ actorUuid: actor.uuid, label: replacesLabel(rule), original, rule, replacement });
  } catch (err) {
    // Never leave the player without their item: it goes in as it came.
    console.warn(`${FLAG} | could not swap ${original.name}`, err);
    ui.notifications.warn(
      game.i18n.format('HM-BRIDGE.swap-failed', {
        item: original.name,
        error: err.message,
      }),
    );
  }
}

/** The swap a newly landed item came from, if it came from one. */
function takeLanded(actor, item) {
  if (!landing.length) return null;
  const { custom } = readSourceLabels(item.toObject());
  const i = landing.findIndex((s) => s.actorUuid === actor.uuid && s.label === custom);
  return i < 0 ? null : landing.splice(i, 1)[0];
}

/** Relink the sheet to a swapped item and say what happened in chat. */
async function announceSwap(actor, created, { original, rule, replacement }) {
  // A level-up grant or an importer that set the id (see LEVEL-UP GRANTS).
  const keepId = !!original._id && created.id === original._id;

  // A biography or description linking the original follows it (see LINKS).
  let restore = null;
  try {
    restore = await relinkOnImport(actor, rule, replacement);
  } catch (err) {
    console.warn(`${FLAG} | links to ${original.name} left as they were`, err);
  }

  const text = game.i18n.format('HM-BRIDGE.chat-replaced', {
    actor: esc(actor.name),
    item: esc(original.name),
    replacement: esc(created.name),
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: buttonsHtml(text, original.name),
    flags: {
      [FLAG]: {
        replacement: {
          state: 'pending',
          actorUuid: actor.uuid,
          createdUuid: created.uuid,
          ruleKey: ruleKey(rule),
          itemName: original.name,
          replacementName: created.name,
          original,
          keptId: keepId,
          restore,
        },
      },
    },
  });
}

/**
 * Point a newly added item's Cast activities at the replacements of the spells
 * they cast. dnd5e then drops its copy of the old spell and makes one of the new.
 */
async function swapCastSpells(actor, item) {
  const allowed = actor.getFlag(FLAG, 'allowed') ?? [];
  const { byName } = currentRules();
  const update = {};
  const oldUuids = new Set();
  for (const [id, act] of Object.entries(item.toObject().system?.activities ?? {})) {
    const uuid = act?.type === 'cast' ? act.spell?.uuid : '';
    if (!uuid) continue;
    if (!mightBeOriginal(uuid, byName)) continue;
    const spell = await fromUuid(uuid).catch(() => null);
    const rule = spell?.documentName === 'Item' ? ruleFor(spell.toObject()) : null;
    if (!rule || allowed.includes(ruleKey(rule))) continue;
    try {
      update[`system.activities.${id}.spell.uuid`] = (await findReplacement(rule)).uuid;
      oldUuids.add(uuid);
    } catch (err) {
      console.warn(`${FLAG} | ${item.name} still casts ${spell.name}`, err);
    }
  }
  if (!oldUuids.size) return;
  await item.update(update, { hbmBridge: true });

  // dnd5e only drops a copy that existed when the activity changed; one it was
  // still making for the old spell at that moment is left behind, so sweep.
  const prefix = `.Item.${item.id}.Activity.`;
  const stale = actor.items
    .filter((i) => {
      const cachedFor = String(i.getFlag('dnd5e', 'cachedFor') ?? '');
      return cachedFor.startsWith(prefix) && oldUuids.has(i._stats?.compendiumSource);
    })
    .map((i) => i.id);
  if (stale.length) await actor.deleteEmbeddedDocuments('Item', stale);
}

function buttonsHtml(text, itemName) {
  const confirm = game.i18n.localize('HM-BRIDGE.confirm-replacement');
  const allow = game.i18n.format('HM-BRIDGE.allow-item', {
    item: esc(itemName),
  });
  return `<div class="hm-replacement"><p>${text}</p><div class="hm-replacement-buttons">
    <button type="button" data-hm-action="confirm">${confirm}</button>
    <button type="button" data-hm-action="allow">${allow}</button>
  </div></div>`;
}

/** Wire the buttons on a rendered message, or remove them for who can't use them. */
function bindButtons(message, html) {
  const info = message.getFlag(FLAG, 'replacement');
  const box = html.querySelector?.('.hm-replacement-buttons');
  if (!info || !box) return;

  const actor = fromUuidSync(info.actorUuid);
  const may = info.state === 'pending' && (game.user.isGM || actor?.isOwner);
  if (!may) {
    box.remove();
    return;
  }
  box
    .querySelector('[data-hm-action="confirm"]')
    ?.addEventListener('click', () => resolve(message, 'confirm'));
  box
    .querySelector('[data-hm-action="allow"]')
    ?.addEventListener('click', () => resolve(message, 'allow'));
}

async function resolve(message, choice) {
  const info = message.getFlag(FLAG, 'replacement');
  if (!info || info.state !== 'pending') return;
  const actor = await fromUuid(info.actorUuid);
  if (!actor) return;

  try {
    if (choice === 'allow') {
      const original = { ...info.original };
      const allowed = new Set(actor.getFlag(FLAG, 'allowed') ?? []);
      allowed.add(info.ruleKey);
      await actor.setFlag(FLAG, 'allowed', [...allowed]);
      const stand = await fromUuid(info.createdUuid);
      if (info.keptId) {
        // The stand-in holds the id the grant recorded; free it for the original.
        await stand?.delete({ hbmBridge: true });
        await actor.createEmbeddedDocuments('Item', [original], {
          hbmBridge: true,
          keepId: true,
        });
      } else {
        delete original._id;
        await actor.createEmbeddedDocuments('Item', [original], {
          hbmBridge: true,
        });
        await stand?.delete({ hbmBridge: true });
      }
      await restoreReferences(actor, info.restore);
    }
    const key = choice === 'allow' ? 'resolved-allowed' : 'resolved-confirmed';
    const line = game.i18n.format(`HM-BRIDGE.${key}`, {
      user: esc(game.user.name),
      item: esc(info.itemName),
      replacement: esc(info.replacementName),
    });
    await message.update({
      content: `<div class="hm-replacement"><p>${line}</p></div>`,
      [`flags.${FLAG}.replacement.state`]:
        choice === 'allow' ? 'allowed' : 'confirmed',
    });
  } catch (err) {
    console.error(`${FLAG} | could not resolve replacement`, err);
    ui.notifications.error(err.message);
  }
}
