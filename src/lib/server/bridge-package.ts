/**
 * src/lib/server/bridge-package.ts — builds the Foundry VTT manifest and
 * installable ZIP archive for the bundled `foundry-homebrew-bridge` module so
 * Foundry VTT (whether on the same LAN, in another Docker container, or on a
 * remote server) can install/update the bridge via Manifest URL:
 *   http://<manager-host>:5052/api/bridge/module.json
 */
import { crc32, deflateRawSync } from 'node:zlib';
import { fs, path } from '$lib/fs';
import {
  BRIDGE_MODULE_ID,
  bridgePaths,
  findModuleDir,
  moduleFiles,
} from '$lib/services/bridge-deploy';
import { resolveLocalDir } from '$lib/services/homebrew-deploy';

export type ZipEntry = { name: string; data: Buffer };

/** MS-DOS time and date, as zip stores them (2-second resolution, local time). */
function dosDateTime(date: Date) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const day =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, day };
}

/** Builds a zip archive. Names use forward slashes; files only, no directory entries. */
export function buildZip(entries: ZipEntry[], date = new Date()): Buffer {
  const { time, day } = dosDateTime(date);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const fileName = Buffer.from(name.replace(/\\/g, '/'), 'utf8');
    const packed = deflateRawSync(data);
    // Store tiny files whose deflate output is bigger than the original.
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    locals.push(local, fileName, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fileName);

    offset += local.length + fileName.length + body.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

async function resolveBundledSourceDir(): Promise<string> {
  const { repo } = bridgePaths();
  const candidate = repo || path.join(process.cwd(), BRIDGE_MODULE_ID);
  const sourceDir = await findModuleDir(resolveLocalDir(candidate));
  if (!sourceDir) {
    throw new Error(`Bundled ${BRIDGE_MODULE_ID} module directory not found.`);
  }
  return sourceDir;
}

/**
 * Returns the bridge `module.json` object with `manifest` and `download`
 * rewritten to point at the manager's `/api/bridge/*` endpoints for `origin`.
 */
export async function buildBridgeManifest(
  origin: string,
): Promise<Record<string, unknown>> {
  const sourceDir = await resolveBundledSourceDir();
  const raw = await fs().readText(path.join(sourceDir, 'module.json'));
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const cleanOrigin = origin.replace(/\/+$/, '');
  return {
    ...parsed,
    manifest: `${cleanOrigin}/api/bridge/module.json`,
    download: `${cleanOrigin}/api/bridge/foundry-homebrew-bridge.zip`,
  };
}

/**
 * Packages the bundled `foundry-homebrew-bridge` directory into a zip Buffer with
 * all entries prefixed under `foundry-homebrew-bridge/` and `module.json` rewritten
 * for `origin`.
 */
export async function buildBridgeZipBuffer(origin: string): Promise<Buffer> {
  const sourceDir = await resolveBundledSourceDir();
  const files = await moduleFiles(sourceDir);
  const manifest = await buildBridgeManifest(origin);
  const manifestBytes = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  const entries: ZipEntry[] = [];
  for (const rel of files) {
    const zipName = `${BRIDGE_MODULE_ID}/${rel}`;
    if (rel === 'module.json') {
      entries.push({ name: zipName, data: manifestBytes });
    } else {
      const content = await fs().readText(path.join(sourceDir, rel));
      entries.push({ name: zipName, data: Buffer.from(content, 'utf8') });
    }
  }
  return buildZip(entries);
}
