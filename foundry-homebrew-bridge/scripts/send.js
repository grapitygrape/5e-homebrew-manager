/**
 * send.js — import what the manager's site browser sends into this world.
 *
 * WHY NOT JUST RIVET'S EVENT
 *   Neptunium's `rivet.receive` reads one saved target and gives no signal when
 *   it's done, so it can't send to a chosen actor or report the outcome. Sends
 *   to an actor use Neptunium's public importer API instead. Sends with no actor
 *   do go through the event, so they behave exactly as Rivet's do.
 *
 * Who can receive what is lib/send.js, pure and tested.
 */

import { addCurrency, buildTargets, canReceive, targetKind } from './lib/send.js';

/** One send at a time: currency is read, added to and written back. */
let queue = Promise.resolve();

function neptunium() {
  const module = game.modules.get('plutonium');
  if (!module?.active || !module.api) {
    throw new Error(game.i18n.localize('HM-BRIDGE.err-no-neptunium'));
  }
  return module.api;
}

/** Just what the rules look at, from a full packet. */
const summarize = ({ type, data }) => ({ type, page: data?.page });

/** The menu's entries for what's about to be sent. */
export function listTargets({ packets }) {
  const primary = game.actors.party?.id ?? null;
  return buildTargets(game.actors.contents, primary, packets ?? []);
}

/** @returns {Promise<{ sent: number, failed: { name: string, error: string }[] }>} */
export function runSend(command) {
  const run = queue.then(() => send(command));
  queue = run.catch(() => {});
  return run;
}

async function send({ targetUuid, packets }) {
  // Without Neptunium nothing hears the event, and we'd report a send that vanished.
  const api = neptunium();

  if (!targetUuid) {
    for (const packet of packets) {
      window.dispatchEvent(new CustomEvent('rivet.receive', { detail: packet }));
    }
    return { sent: packets.length, failed: [] };
  }

  const actor = await fromUuid(targetUuid);
  if (!(actor instanceof Actor)) {
    throw new Error(game.i18n.format('HM-BRIDGE.err-no-doc', { uuid: targetUuid }));
  }

  const kind = targetKind(actor, game.actors.party?.id ?? null);
  const out = { sent: 0, failed: [] };

  // Keep what landed and report what didn't, rather than stopping at a failure.
  for (const packet of packets) {
    if (!kind || !canReceive(kind, summarize(packet))) {
      out.failed.push({
        name: packet.data?.entity?.name ?? packet.type,
        error: game.i18n.format('HM-BRIDGE.send-refused', { name: actor.name }),
      });
      continue;
    }
    await sendPacket(api, packet, actor, out);
  }

  if (out.sent) {
    ui.notifications.info(
      game.i18n.format('HM-BRIDGE.sent-to', { n: out.sent, name: actor.name }),
    );
  }
  return out;
}

async function sendPacket(api, { type, data }, actor, out) {
  if (type === 'currency') {
    await sendCurrency(data.currency, actor, out);
  } else if (type === '5etools.lootgen.loot') {
    if (data.currency) await sendCurrency(data.currency, actor, out);
    for (const info of data.entityInfos ?? []) {
      await sendEntity(api, info, actor, out);
    }
  } else {
    await sendEntity(api, data, actor, out);
  }
}

async function sendCurrency(currency, actor, out) {
  try {
    await actor.update({
      'system.currency': addCurrency(actor.system.currency, currency),
    });
    out.sent += 1;
  } catch (err) {
    fail(out, game.i18n.localize('HM-BRIDGE.currency'), err);
  }
}

async function sendEntity(api, { page, entity, options }, actor, out) {
  try {
    const importer = await api.importer.pGetImporter({
      page: entity?.__prop || page,
    });
    if (!importer) throw new Error(game.i18n.format('HM-BRIDGE.err-no-importer', { page }));

    entity._isFromRivet = true;
    const { quantity, ...importOptions } = options ?? {};
    const helper = new api.importer.ActorMultiImportHelper({ actor });
    const importOpts = new api.importer.ImportOpts({
      ...importOptions,
      actor,
      actorMultiImportHelper: helper,
    });
    await importer.pImportEntry(entity, importOpts, { quantity });
    await helper.pDoFinalize();
    out.sent += 1;
  } catch (err) {
    fail(out, entity?.name ?? page, err);
  }
}

function fail(out, name, err) {
  console.error(`foundry-homebrew-bridge | could not send ${name}`, err);
  out.failed.push({ name, error: err?.message ?? String(err) });
}
