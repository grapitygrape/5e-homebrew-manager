/**
 * Sending content-blocklist.json to Neptunium's World Content Blocklist: the
 * module's merge and its write (run against stand-ins for Foundry's globals),
 * and the manager's choice of worlds and its Deploy banner text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeWorldBlocklist } from '../../../../foundry-homebrew-bridge/scripts/lib/blocklist.js';
import { storeBlocklist } from '../../../../foundry-homebrew-bridge/scripts/blocklist.js';
import {
  blocklistWorlds,
  describeWorldPush,
  toWorldRules,
} from '../foundry/blocklist-push.ts';
import type { BridgeClientInfo } from '../foundry/types.ts';

const rule = (source: string, hash = '*', category = '*', isAuto = false) => ({
  displayName: hash,
  hash,
  category,
  source,
  isAuto,
});

describe('mergeWorldBlocklist', () => {
  it("replaces the world's own rules, so an unblock reaches Foundry", () => {
    const merged = mergeWorldBlocklist([rule('XPHB')], [rule('XDMG'), rule('XPHB')]);
    expect(merged.map((r) => r.source)).toEqual(['XPHB']);
  });

  it("keeps Neptunium's auto-managed rows the manager doesn't list", () => {
    const merged = mergeWorldBlocklist(
      [rule('XPHB')],
      [rule('XMM', '*', '*', true), rule('xphb', '*', '*', true)],
    );
    expect(merged).toEqual([rule('XPHB'), rule('XMM', '*', '*', true)]);
  });

  it('drops rows missing a field and collapses case-only duplicates', () => {
    const merged = mergeWorldBlocklist(
      [
        rule('XPHB', 'fireball_xphb', 'spell'),
        rule('xphb', 'FIREBALL_XPHB', 'Spell'),
        { hash: '*', category: '*' },
        null,
      ],
      [],
    );
    expect(merged).toEqual([rule('XPHB', 'fireball_xphb', 'spell')]);
  });
});

describe('storeBlocklist', () => {
  let stored: Record<string, unknown>;
  let isGM: boolean;
  let neptunium: boolean;
  const pSetList = vi.fn(async () => {});
  const info = vi.fn();

  beforeEach(() => {
    stored = { 'plutonium.blacklist': [rule('XDMG'), rule('XMM', '*', '*', true)] };
    isGM = true;
    neptunium = true;
    pSetList.mockClear();
    info.mockClear();
    vi.stubGlobal('game', {
      get user() {
        return { isGM };
      },
      modules: { get: (id: string) => (id === 'plutonium' ? { active: neptunium } : undefined) },
      settings: {
        settings: new Map([['plutonium.blacklist', {}]]),
        get: (mod: string, key: string) => stored[`${mod}.${key}`],
        set: async (mod: string, key: string, v: unknown) => {
          stored[`${mod}.${key}`] = v;
        },
      },
      i18n: { localize: (k: string) => k, format: (k: string) => k },
    });
    vi.stubGlobal('ui', { notifications: { info } });
    vi.stubGlobal('ExcludeUtil', { pSetList });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("writes Neptunium's world setting and its live copy", async () => {
    expect(await storeBlocklist([rule('XPHB')])).toEqual({ count: 2, changed: true });
    const want = [rule('XPHB'), rule('XMM', '*', '*', true)];
    expect(stored['plutonium.blacklist']).toEqual(want);
    expect(pSetList).toHaveBeenCalledWith(want);
    expect(info).toHaveBeenCalledOnce();
  });

  it('skips the write when the world already holds the list', async () => {
    await storeBlocklist([rule('XPHB')]);
    pSetList.mockClear();
    info.mockClear();
    expect(await storeBlocklist([rule('XPHB')])).toEqual({ count: 2, changed: false });
    expect(pSetList).not.toHaveBeenCalled();
    expect(info).not.toHaveBeenCalled();
  });

  it('refuses without Neptunium or off the GM', async () => {
    neptunium = false;
    await expect(storeBlocklist([])).rejects.toThrow('no-neptunium');
    neptunium = true;
    isGM = false;
    await expect(storeBlocklist([])).rejects.toThrow('not-gm');
    expect(stored['plutonium.blacklist']).toHaveLength(2);
  });
});

const world = (name: string, features: string[]): BridgeClientInfo => ({
  clientId: name,
  world: name,
  worldId: name,
  system: 'dnd5e',
  systemVersion: '5',
  foundryVersion: '14',
  user: 'GM',
  connectedAt: 0,
  origin: 'http://localhost:30001',
  moduleVersion: '1.4.0',
  features,
});

describe('the manager side', () => {
  it('sends only to modules that know the command', () => {
    const { ready, outdated } = blocklistWorlds([
      world('Test', ['send', 'blocklist']),
      world('Live', ['send']),
    ]);
    expect(ready.map((w) => w.world)).toEqual(['Test']);
    expect(outdated.map((w) => w.world)).toEqual(['Live']);
  });

  it("leaves out fields Neptunium doesn't store", () => {
    expect(
      toWorldRules([{ ...rule('XPHB'), extra: { note: 'x' } }]),
    ).toEqual([rule('XPHB')]);
  });

  it('says nothing when no world is connected', () => {
    expect(describeWorldPush([], [])).toEqual({ text: '', failed: false });
  });

  it('names updated, unchanged, failed and outdated worlds', () => {
    const { text, failed } = describeWorldPush(
      [
        { world: 'Test', ok: true, count: 3, changed: true },
        { world: 'Other', ok: true, count: 3, changed: false },
        { world: 'Broken', ok: false, error: 'Only a GM can.' },
      ],
      [world('Live', [])],
    );
    expect(failed).toBe(true);
    expect(text).toContain('in Test.');
    expect(text).toContain('Other already had');
    expect(text).toContain('Broken: Only a GM can.');
    expect(text).toContain('Live runs a bridge module too old');
  });
});
