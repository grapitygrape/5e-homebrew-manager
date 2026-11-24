/** Tests for scripts/lib/zip.ts — reads the archive back by its own headers. */
import { describe, it, expect } from 'vitest';
import { crc32, inflateRawSync } from 'node:zlib';
import { zip } from './zip.ts';

/** Reads every entry through the central directory, as unzip tools do. */
function unzip(archive: Buffer) {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(0x06054b50);
  const count = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const out: Record<string, { text: string; method: number }> = {};
  for (let i = 0; i < count; i++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50);
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const size = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const offset = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);

    expect(archive.readUInt32LE(offset)).toBe(0x04034b50);
    const localName = archive.readUInt16LE(offset + 26);
    const start = offset + 30 + localName;
    const body = archive.subarray(start, start + size);
    const data = method === 8 ? inflateRawSync(body) : body;
    expect(crc32(data)).toBe(crc);
    out[name] = { text: data.toString('utf8'), method };
    at += 46 + nameLength;
  }
  return out;
}

describe('zip', () => {
  it('round-trips files, deflating what shrinks and storing what does not', () => {
    const big = 'const x = 1;\n'.repeat(200);
    const archive = zip([
      { name: 'module.json', data: Buffer.from('{}') },
      { name: 'scripts\\lib\\match.js', data: Buffer.from(big) },
      { name: 'languages/ünï.json', data: Buffer.from('{"a":1}') },
    ]);
    expect(unzip(archive)).toEqual({
      'module.json': { text: '{}', method: 0 },
      'scripts/lib/match.js': { text: big, method: 8 },
      'languages/ünï.json': { text: '{"a":1}', method: 0 },
    });
  });

  it('writes an empty archive as just the end record', () => {
    expect(zip([]).length).toBe(22);
  });
});
