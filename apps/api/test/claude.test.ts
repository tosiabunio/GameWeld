import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeZip, PLUGIN_DIR } from '../src/plugin.ts';
import { startApp, type TestContext } from './helpers.ts';

/** The files in a zip, read back from its central directory as any unzip tool would. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    files.set(name, inflateRawSync(zip.subarray(start, start + size)));
    at += 46 + nameLength;
  }
  return files;
}

async function pluginFiles(): Promise<Map<string, Buffer>> {
  const entries = await readdir(PLUGIN_DIR, { recursive: true, withFileTypes: true });
  const files = new Map<string, Buffer>();
  for (const e of entries.filter((x) => x.isFile())) {
    const full = path.join(e.parentPath, e.name);
    files.set(path.relative(PLUGIN_DIR, full).split(path.sep).join('/'), await readFile(full));
  }
  return files;
}

describe('the Claude Code plugin, served by the instance', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp({ PUBLIC_URL: 'http://localhost:8090' });
  });
  afterAll(async () => {
    await t.close();
  });

  it('serves a marketplace that names the zip, with its digest, to anyone', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/claude/marketplace.json' });
    expect(res.statusCode).toBe(200);
    const marketplace = res.json();
    expect(marketplace).toMatchObject({
      name: 'gameweld',
      owner: { name: 'GameWeld' },
      plugins: [
        {
          name: 'gameweld',
          source: { source: 'archive', url: 'http://localhost:8090/api/claude/gameweld.zip' },
        },
      ],
    });
    // No version: the digest is what tells Claude Code the plugin changed.
    expect(marketplace.plugins[0].version).toBeUndefined();

    const zip = await t.app.inject({ method: 'GET', url: '/api/claude/gameweld.zip' });
    expect(zip.statusCode).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(createHash('sha256').update(zip.rawPayload).digest('hex')).toBe(
      marketplace.plugins[0].source.sha256,
    );
  });

  it('zips the plugin as it is in the repository, the manifest at the top', async () => {
    const zip = (await t.app.inject({ method: 'GET', url: '/api/claude/gameweld.zip' })).rawPayload;
    const inZip = unzip(zip);
    const onDisk = await pluginFiles();
    expect([...inZip.keys()]).toEqual([...onDisk.keys()].sort());
    expect([...inZip.keys()]).toContain('.claude-plugin/plugin.json');
    expect([...inZip.keys()]).toContain('skills/gameweld/SKILL.md');
    for (const [name, data] of onDisk) expect(inZip.get(name)?.equals(data), name).toBe(true);
  });

  it('makes the same zip from the same files, whenever and wherever', () => {
    const files = [
      { name: 'b.md', data: Buffer.from('second') },
      { name: 'a/ą.md', data: Buffer.from('first, with a name in UTF-8') },
    ];
    expect(makeZip(files).equals(makeZip(files))).toBe(true);
    expect([...unzip(makeZip(files)).entries()].map(([n, d]) => [n, d.toString()])).toEqual([
      ['b.md', 'second'],
      ['a/ą.md', 'first, with a name in UTF-8'],
    ]);
  });
});

describe('the plugin marketplace without PUBLIC_URL', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });

  it('names the zip at the address the request came to, through the proxy', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/claude/marketplace.json',
      headers: { host: 'gameweld.example', 'x-forwarded-proto': 'https' },
    });
    expect(res.json().plugins[0].source.url).toBe(
      'https://gameweld.example/api/claude/gameweld.zip',
    );
  });
});
