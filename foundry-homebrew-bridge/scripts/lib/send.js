/**
 * lib/send.js — who can receive what from the manager's site browser. Pure, so
 * the manager's tests can import it; the Foundry calls are in ../send.js.
 *
 * Spells aren't special-cased: Neptunium already imports them as scrolls onto
 * group and encounter actors, and as normal spells onto a character.
 */

/** Sending one of these makes a new actor; it can't go in another's inventory. */
const ACTOR_PAGES = new Set(['bestiary.html', 'vehicles.html', 'objects.html']);

/** What a party, group or encounter can hold. A character takes these and more. */
const HOLDABLE = new Set(['item', 'spell', 'loot', 'currency']);

const KIND_ORDER = ['character', 'party', 'group', 'encounter'];

/**
 * @param {{ type: string, page?: string }} packet
 * @returns {'loot'|'currency'|'actor'|'item'|'spell'|'other'}
 */
export function classifyPacket({ type, page }) {
  if (type === '5etools.lootgen.loot') return 'loot';
  if (type === 'currency') return 'currency';
  const name = String(page ?? '').toLowerCase();
  if (ACTOR_PAGES.has(name)) return 'actor';
  if (name === 'items.html') return 'item';
  if (name === 'spells.html') return 'spell';
  return 'other';
}

/**
 * @param {string} kind a target kind from `targetKind`
 * @param {{ type: string, page?: string }} packet
 */
export function canReceive(kind, packet) {
  const what = classifyPacket(packet);
  if (what === 'actor') return false;
  return kind === 'character' || HOLDABLE.has(what);
}

/**
 * dnd5e has no party type: a party is a `group` actor, so call it one if it's
 * the primary party or holds a character.
 * @returns {'character'|'party'|'group'|'encounter'|null} null for anything else
 */
export function targetKind(actor, primaryPartyId) {
  if (actor.type === 'character' || actor.type === 'encounter') return actor.type;
  if (actor.type !== 'group') return null;
  const isParty =
    actor.id === primaryPartyId || actor.system?.playerCharacters?.length > 0;
  return isParty ? 'party' : 'group';
}

/**
 * The menu's entries: by kind, then name, with the primary party first.
 * @param {Iterable<object>} actors world actors
 * @param {string|null} primaryPartyId
 * @param {{ type: string, page?: string }[]} packets what's being sent
 */
export function buildTargets(actors, primaryPartyId, packets) {
  const targets = [];
  for (const actor of actors) {
    const kind = targetKind(actor, primaryPartyId);
    if (!kind) continue;
    targets.push({
      uuid: actor.uuid,
      name: actor.name,
      kind,
      // Worlds often hold several actors with one name.
      folder: actor.folder?.name ?? '',
      blocked: !packets.every((p) => canReceive(kind, p)),
      isPrimary: actor.id === primaryPartyId,
    });
  }
  return targets
    .sort(
      (a, b) =>
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        Number(b.isPrimary) - Number(a.isPrimary) ||
        a.name.localeCompare(b.name),
    )
    .map(({ isPrimary, ...target }) => target);
}

/** What an actor holds once `incoming` is added. Coins it doesn't get are left alone. */
export function addCurrency(existing, incoming) {
  const out = { ...existing };
  for (const [coin, amount] of Object.entries(incoming ?? {})) {
    out[coin] = (out[coin] ?? 0) + amount;
  }
  return out;
}
