import { createReadStream, createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

export { PREVIEW_IMAGE_TYPES } from '@gameweld/domain';

/**
 * T2: attachment storage behind an interface. The MVP ships a filesystem implementation; an
 * S3-compatible one can replace it without touching the routes.
 */
export interface Storage {
  put(key: string, data: Readable, limitBytes: number): Promise<{ sizeBytes: number }>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}

export class PayloadTooLarge extends Error {
  constructor() {
    super('The file is larger than the allowed maximum.');
  }
}

export class FilesystemStorage implements Storage {
  constructor(private readonly root: string) {}

  /**
   * Keys are `project/attachment` or `avatars/user/picture`, optionally with one suffix for a
   * derived file such as a cover.
   */
  private resolve(key: string): string {
    if (!/^(avatars\/)?[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9-]+)?$/i.test(key))
      throw new Error(`invalid storage key ${key}`);
    return path.join(this.root, key);
  }

  async put(key: string, data: Readable, limitBytes: number): Promise<{ sizeBytes: number }> {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    let sizeBytes = 0;
    const counter = async function* (source: Readable) {
      for await (const chunk of source) {
        sizeBytes += (chunk as Buffer).length;
        if (sizeBytes > limitBytes) throw new PayloadTooLarge();
        yield chunk;
      }
    };
    // Write beside the target and rename, so a reader never sees a partial file and two writers
    // of the same key cannot interleave.
    const partial = `${file}.${randomUUID()}.partial`;
    try {
      await pipeline(data, counter, createWriteStream(partial));
      await rename(partial, file);
    } catch (err) {
      await unlink(partial).catch(() => undefined);
      throw err;
    }
    return { sizeBytes };
  }

  async get(key: string): Promise<Readable> {
    const file = this.resolve(key);
    await stat(file);
    return createReadStream(file);
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}
