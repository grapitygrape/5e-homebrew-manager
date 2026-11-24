/**
 * Tests for how the module drives Neptunium when the site browser sends. Runs
 * the module's own send.js against stand-ins for Foundry's globals and the parts
 * of Neptunium's API it calls. Fixtures are keyed by name, not call order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  listTargets,
  runSend,
} from '../../../../foundry-homebrew-bridge/scripts/send.js';

class FakeActor {
  id: string;
  uuid: string;
  name: string;
  type: string;
  system: Record<string, unknown>;
  update = vi.fn(async (changes: Record<string, unknown>) => {
    this.system.currency = changes['system.currency'];
  });
  constructor(id: string, type: string, currency?: Record<string, number>) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.name = id;
    this.type = type;
    this.system = { currency, playerCharacters: [] };
  }
}

class FakeImportOpts {
  constructor(public opts: Record<string, unknown>) {}
}

class FakeHelper {
  finalized = vi.fn(async () => {});
  pDoFinalize = this.finalized;
}

interface Imported {
  name: string;
  opts: Record<string, unknown>;
  dataOpts: unknown;
}

function setUp({ neptunium = true, failing = [] as string[] } = {}) {
  const imported: Imported[] = [];
  const importerFor: string[] = [];
  const actors = {
    pc: new FakeActor('pc', 'character', { gp: 10 }),
    crew: new FakeActor('crew', 'group', { gp: 1 }),
    npc: new FakeActor('npc', 'npc'),
  };
  const received: unknown[] = [];
  const onReceive = (evt: Event) => received.push((evt as CustomEvent).detail);
  const win = new EventTarget();
  win.addEventListener('rivet.receive', onReceive);

  const api = {
    importer: {
      ImportOpts: FakeImportOpts,
      ActorMultiImportHelper: FakeHelper,
      pGetImporter: async ({ page }: { page: string }) => {
        importerFor.push(page);
        if (page === 'nothing.html') return null;
        return {
          pImportEntry: async (
            entity: { name: string },
            importOpts: FakeImportOpts,
            dataOpts: unknown,
          ) => {
            if (failing.includes(entity.name)) throw new Error('import broke');
            imported.push({ name: entity.name, opts: importOpts.opts, dataOpts });
          },
        };
      },
    },
  };

  vi.stubGlobal('Actor', FakeActor);
  vi.stubGlobal('window', win);
  vi.stubGlobal(
    'fromUuid',
    async (uuid: string) =>
      Object.values(actors).find((a) => a.uuid === uuid) ?? null,
  );
  vi.stubGlobal('ui', { notifications: { info: vi.fn() } });
  vi.stubGlobal('game', {
    i18n: {
      localize: (key: string) => key,
      format: (key: string) => key,
    },
    modules: {
      get: () => (neptunium ? { active: true, api } : undefined),
    },
    actors: { party: null, contents: Object.values(actors) },
  });

  return { actors, imported, importerFor, received };
}

const entityPacket = (page: string, name: string, options?: object) => ({
  type: 'entity',
  data: { page, entity: { name }, options },
});

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('listTargets', () => {
  it('reads the world actors and leaves out the ones the menu has no group for', () => {
    setUp();
    const names = listTargets({ packets: [{ type: 'entity', page: 'items.html' }] }).map(
      (t: { name: string }) => t.name,
    );
    expect(names).toEqual(['pc', 'crew']);
  });
});

describe('runSend', () => {
  it('imports an entity onto the chosen actor', async () => {
    const { actors, imported } = setUp();
    const result = await runSend({
      targetUuid: 'Actor.pc',
      packets: [entityPacket('items.html', 'Rope')],
    });
    expect(result).toEqual({ sent: 1, failed: [] });
    expect(imported[0].name).toBe('Rope');
    expect(imported[0].opts.actor).toBe(actors.pc);
  });

  it('leaves spells to Neptunium, which picks scroll or spell by the actor', async () => {
    const { actors, imported } = setUp();
    await runSend({
      targetUuid: 'Actor.crew',
      packets: [entityPacket('spells.html', 'Fireball')],
    });
    expect(imported[0].opts.actor).toBe(actors.crew);
    expect(imported[0].opts.isSpellScroll).toBeUndefined();
  });

  it('adds a loot pile, keeping its scrolls and quantities as the site set them', async () => {
    const { actors, imported } = setUp();
    const result = await runSend({
      targetUuid: 'Actor.pc',
      packets: [
        {
          type: '5etools.lootgen.loot',
          data: {
            currency: { gp: 5, sp: 2 },
            entityInfos: [
              { page: 'items.html', entity: { name: 'Gem' }, options: { quantity: 3 } },
              { page: 'spells.html', entity: { name: 'Light' }, options: { isSpellScroll: true } },
            ],
          },
        },
      ],
    });

    expect(result).toEqual({ sent: 3, failed: [] });
    expect(actors.pc.system.currency).toEqual({ gp: 15, sp: 2 });

    const gem = imported.find((i) => i.name === 'Gem');
    expect(gem?.dataOpts).toEqual({ quantity: 3 });
    expect(gem?.opts.quantity).toBeUndefined();
    const light = imported.find((i) => i.name === 'Light');
    expect(light?.opts.isSpellScroll).toBe(true);
  });

  it('keeps what landed when one import fails, and names the failure', async () => {
    const { imported } = setUp({ failing: ['Cursed Rope'] });
    const result = await runSend({
      targetUuid: 'Actor.pc',
      packets: [
        entityPacket('items.html', 'Cursed Rope'),
        entityPacket('items.html', 'Lamp'),
      ],
    });
    expect(result.sent).toBe(1);
    expect(result.failed).toEqual([{ name: 'Cursed Rope', error: 'import broke' }]);
    expect(imported.map((i) => i.name)).toEqual(['Lamp']);
  });

  it('refuses what the actor cannot hold without importing it', async () => {
    const { imported } = setUp();
    const result = await runSend({
      targetUuid: 'Actor.crew',
      packets: [entityPacket('feats.html', 'Alert'), entityPacket('items.html', 'Rope')],
    });
    expect(result.sent).toBe(1);
    expect(result.failed[0].name).toBe('Alert');
    expect(imported.map((i) => i.name)).toEqual(['Rope']);
  });

  it('refuses an actor kind the menu never offers', async () => {
    const { imported } = setUp();
    const result = await runSend({
      targetUuid: 'Actor.npc',
      packets: [entityPacket('items.html', 'Rope')],
    });
    expect(result.sent).toBe(0);
    expect(imported).toEqual([]);
  });

  it('runs sends one at a time, so coins from both are counted', async () => {
    const { actors } = setUp();
    const coins = { type: 'currency', data: { currency: { gp: 1 } } };
    await Promise.all([
      runSend({ targetUuid: 'Actor.pc', packets: [coins] }),
      runSend({ targetUuid: 'Actor.pc', packets: [coins] }),
    ]);
    expect(actors.pc.system.currency).toEqual({ gp: 12 });
  });

  it('keeps going after a send that was refused outright', async () => {
    setUp();
    await expect(
      runSend({ targetUuid: 'Actor.gone', packets: [] }),
    ).rejects.toThrow();
    await expect(
      runSend({ targetUuid: 'Actor.pc', packets: [entityPacket('items.html', 'Rope')] }),
    ).resolves.toMatchObject({ sent: 1 });
  });

  it('hands a send with no actor to Neptunium as Rivet would', async () => {
    const { imported, received } = setUp();
    vi.stubGlobal('CustomEvent', CustomEvent);
    const packet = entityPacket('bestiary.html', 'Goblin');
    const result = await runSend({ targetUuid: null, packets: [packet] });
    expect(result).toEqual({ sent: 1, failed: [] });
    expect(received).toEqual([packet]);
    expect(imported).toEqual([]);
  });

  it('says so when Neptunium is missing, rather than reporting a send that vanished', async () => {
    const { received } = setUp({ neptunium: false });
    await expect(
      runSend({ targetUuid: null, packets: [entityPacket('items.html', 'Rope')] }),
    ).rejects.toThrow('err-no-neptunium');
    expect(received).toEqual([]);
  });
});
