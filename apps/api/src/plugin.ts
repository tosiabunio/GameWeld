import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateRawSync } from 'node:zlib';

/**
 * The Claude Code plugin in plugins/gameweld, as the zip an instance serves: its marketplace names
 * the zip as the plugin's source, so anyone who can reach the instance can install the skill,
 * whether or not they can read the repository. The zip is made the same way every time (entries
 * in order, fixed times), so its digest changes only when the plugin does, and the digest is what
 * tells Claude Code there is an update.
 */

export const PLUGIN_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../plugins/gameweld',
);

export interface PluginArchive {
  zip: Buffer;
  sha256: string;
}

let built: Promise<PluginArchive> | null = null;

/** The plugin's zip, made once per process. */
export function pluginArchive(): Promise<PluginArchive> {
  built ??= (async () => {
    const zip = makeZip(await readTree(PLUGIN_DIR));
    return { zip, sha256: createHash('sha256').update(zip).digest('hex') };
  })();
  return built;
}

/** Every file under a directory, by its path relative to it with forward slashes, in order. */
async function readTree(root: string): Promise<{ name: string; data: Buffer }[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath, e.name)).split(path.sep).join('/'))
    .sort();
  return Promise.all(
    files.map(async (name) => ({ name, data: await readFile(path.join(root, name)) })),
  );
}

// 1 January 1980, 00:00: the earliest time a zip can hold, so the archive does not depend on when
// the files were checked out.
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;
/** Made by Unix, version 2.0, so that extracted files get ordinary permissions. */
const MADE_BY = (3 << 8) | 20;
const UTF8 = 0x0800;
const DEFLATE = 8;

/** A zip of the files, each deflated: what the ZIP format's first version and every tool reads. */
export function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const deflated = deflateRawSync(file.data);
    const crc = crc32(file.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(DEFLATE, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(deflated.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, name, deflated);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(MADE_BY, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(UTF8, 8);
    header.writeUInt16LE(DEFLATE, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(deflated.length, 20);
    header.writeUInt32LE(file.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    // Extra field, comment, disk number, internal attributes: none.
    header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.length + name.length + deflated.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}
