/**
 * Tests for the Foundry module's connection helpers. Imports the module's own
 * lib/connection.js, like foundry-match.test.ts does, so the shipped code is
 * what's tested.
 */
import { describe, it, expect } from 'vitest';
import {
  BACKOFF,
  DEFAULT_MANAGER_URLS,
  REFUSED_RETRY_MS,
  aggregateStatus,
  parseManagerUrls,
  readProbe,
  retryDelay,
} from '../../../../foundry-homebrew-bridge/scripts/lib/connection.js';

describe('parseManagerUrls', () => {
  it('reads the default as the desktop app, then the dev server', () => {
    expect(parseManagerUrls(DEFAULT_MANAGER_URLS)).toEqual([
      'http://localhost:5051',
      'http://localhost:5173',
    ]);
  });

  it('splits on commas or spaces, trims slashes, drops duplicates and junk', () => {
    expect(
      parseManagerUrls(
        ' http://a:1/ ,http://b:2//\nhttp://A:1  ftp://c localhost:9 ,, ',
      ),
    ).toEqual(['http://a:1', 'http://b:2']);
  });

  it('is empty for nothing', () => {
    expect(parseManagerUrls('')).toEqual([]);
    expect(parseManagerUrls(undefined)).toEqual([]);
  });
});

describe('aggregateStatus', () => {
  it('is connected when any manager is, however the others are doing', () => {
    expect(aggregateStatus(['offline', 'connected'])).toBe('connected');
    expect(aggregateStatus(['refused', 'busy'])).toBe('busy');
  });

  it('surfaces a refusal over a manager that just isn’t running', () => {
    expect(aggregateStatus(['offline', 'refused'])).toBe('refused');
  });

  it('is disconnected with no connections', () => {
    expect(aggregateStatus([])).toBe('disconnected');
  });
});

describe('retryDelay', () => {
  it('backs off for a manager that isn’t running, up to the cap', () => {
    expect(retryDelay('offline', 1)).toBe(BACKOFF[0]);
    expect(retryDelay('offline', 3)).toBe(BACKOFF[2]);
    expect(retryDelay('offline', 99)).toBe(BACKOFF.at(-1));
  });

  it('retries a refusal quickly, so Allow takes effect within seconds', () => {
    expect(retryDelay('refused', 50)).toBe(REFUSED_RETRY_MS);
  });
});

describe('readProbe', () => {
  it('tells refused from offline', () => {
    expect(
      readProbe({ status: 403, body: { message: 'Origin x is not allowed.' } }),
    ).toEqual({ kind: 'refused', message: 'Origin x is not allowed.' });
    expect(readProbe({ error: 'Failed to fetch' })).toEqual({
      kind: 'offline',
      message: 'Failed to fetch',
    });
  });

  it('reads a reachable manager as ok and anything else as an error', () => {
    expect(readProbe({ status: 200, body: {} }).kind).toBe('ok');
    expect(readProbe({ status: 500, body: null })).toEqual({
      kind: 'error',
      message: 'HTTP 500',
    });
  });
});
