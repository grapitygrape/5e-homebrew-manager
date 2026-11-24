/** Tests for the Foundry file check over a stand-in bridge transport. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkFoundryFile,
  FoundryCheckError,
  type BridgeTransport,
} from '../foundry-check-service.ts';
import { setConfigProvider } from '../config.ts';
import { createFileConfigProvider } from '../file-config.ts';
import { resetDataSource } from '../datasource.ts';
import { nodeConfigProvider } from '$lib/server/config-store';
import type {
  BridgeClientInfo,
  FoundryQuery,
} from '$lib/engine/foundry/types.ts';

const world = (clientId: string, name: string): BridgeClientInfo => ({
  clientId,
  world: name,
  worldId: name.toLowerCase(),
  system: 'dnd5e',
  systemVersion: '5.0.0',
  foundryVersion: '13',
  user: 'GM',
  connectedAt: 1,
  origin: 'http://localhost:30000',
  moduleVersion: '1.1.0',
  features: ['open'],
});

/** A transport that answers every query by echoing no matches. */
function fakeTransport(clients: BridgeClientInfo[]) {
  const asked: { clientId: string; query: Omit<FoundryQuery, 'requestId'> }[] =
    [];
  const transport: BridgeTransport = {
    listClients: async () => clients,
    ask: async (clientId, query) => {
      asked.push({ clientId, query });
      return { clientId, requestId: 'r1', ok: true, results: [] };
    },
  };
  return { transport, asked };
}

/** The status a check fails with, or null when it succeeds. */
async function statusOf(run: Promise<unknown>): Promise<number | null> {
  try {
    await run;
    return null;
  } catch (e) {
    expect(e).toBeInstanceOf(FoundryCheckError);
    return (e as FoundryCheckError).status;
  }
}

let root = '';
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'hbm-foundry-check-'));
  await mkdir(path.join(root, 'homebrew'));
  await writeFile(
    path.join(root, 'homebrew', 'brew.json'),
    JSON.stringify({ item: [{ name: 'Rope of Holding', source: 'TST' }] }),
  );
  await writeFile(path.join(root, 'homebrew', 'empty.json'), '{}');
  const configPath = path.join(root, 'hbm-config.json');
  await writeFile(
    configPath,
    JSON.stringify({ homebrew: { path: './homebrew' } }),
  );
  const provider = createFileConfigProvider(configPath);
  await provider.refresh();
  setConfigProvider(provider);
  resetDataSource();
});
afterEach(async () => {
  setConfigProvider(nodeConfigProvider);
  resetDataSource();
  await rm(root, { recursive: true, force: true });
});

describe('checkFoundryFile', () => {
  it('asks the only connected world and builds the report', async () => {
    const { transport, asked } = fakeTransport([world('a', 'Alpha')]);
    const report = await checkFoundryFile({ file: 'brew.json' }, transport);

    expect(asked).toHaveLength(1);
    expect(asked[0].clientId).toBe('a');
    expect(asked[0].query.candidates.map((c) => c.name)).toEqual([
      'Rope of Holding',
    ]);
    expect(asked[0].query.options).toEqual({
      fuzzy: true,
      fuzzyThreshold: 0.72,
      maxMatches: 8,
    });
    expect(report.world).toBe('Alpha');
    expect(report.client.clientId).toBe('a');
    expect(report.rows).toHaveLength(1);
  });

  it('needs a clientId when several worlds are connected', async () => {
    const { transport, asked } = fakeTransport([
      world('a', 'Alpha'),
      world('b', 'Beta'),
    ]);
    expect(
      await statusOf(checkFoundryFile({ file: 'brew.json' }, transport)),
    ).toBe(409);
    await checkFoundryFile({ file: 'brew.json', clientId: 'b' }, transport);
    expect(asked[0].clientId).toBe('b');
  });

  it('answers with the status the route used for each failure', async () => {
    const none = fakeTransport([]).transport;
    const one = fakeTransport([world('a', 'Alpha')]).transport;
    const silent: BridgeTransport = {
      listClients: one.listClients,
      ask: async () => {
        throw new Error('Foundry did not answer within 90s.');
      },
    };
    const failing: BridgeTransport = {
      listClients: one.listClients,
      ask: async () => ({
        clientId: 'a',
        requestId: 'r',
        ok: false,
        error: 'x',
      }),
    };

    expect(await statusOf(checkFoundryFile({}, one))).toBe(400);
    expect(await statusOf(checkFoundryFile({ file: 'brew.json' }, none))).toBe(
      409,
    );
    expect(
      await statusOf(checkFoundryFile({ file: 'missing.json' }, one)),
    ).toBe(404);
    expect(await statusOf(checkFoundryFile({ file: 'empty.json' }, one))).toBe(
      422,
    );
    expect(
      await statusOf(checkFoundryFile({ file: 'brew.json' }, silent)),
    ).toBe(504);
    expect(
      await statusOf(checkFoundryFile({ file: 'brew.json' }, failing)),
    ).toBe(502);
  });
});
