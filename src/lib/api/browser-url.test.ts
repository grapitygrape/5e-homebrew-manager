import { describe, expect, it } from 'vitest';
import { reachableFrom } from './browser-url.ts';

describe('reachableFrom', () => {
  it('swaps a loopback host for the page hostname', () => {
    expect(reachableFrom('http://localhost:5050', 'nas.local')).toBe(
      'http://nas.local:5050',
    );
    expect(reachableFrom('http://127.0.0.1:15050/', '192.168.1.20')).toBe(
      'http://192.168.1.20:15050/',
    );
  });

  it('leaves the URL alone when the page is on this machine', () => {
    expect(reachableFrom('http://localhost:5050', 'localhost')).toBe(
      'http://localhost:5050',
    );
  });

  it('leaves an explicit non-loopback URL alone', () => {
    expect(reachableFrom('https://preview.example.com', 'nas.local')).toBe(
      'https://preview.example.com',
    );
  });

  it('passes through text that is not a URL', () => {
    expect(reachableFrom('', 'nas.local')).toBe('');
  });
});
