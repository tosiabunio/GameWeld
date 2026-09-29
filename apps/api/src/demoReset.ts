import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction, type Db } from './db.ts';
import { seedDemo } from './seed.ts';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts');
const HOUR = 60 * 60 * 1000;
// setTimeout holds at most this long; a later reset is waited for in steps.
const LONGEST_WAIT = 2 ** 31 - 1;

/**
 * When a demonstration instance next goes back to its sample data. Resets fall on whole
 * multiples of the interval counted from midnight UTC, so every 24 hours is at midnight UTC and
 * every 6 at 00:00, 06:00, 12:00, and 18:00, whenever the server was started.
 */
export function nextDemoReset(everyHours: number, now = Date.now()): Date {
  const period = everyHours * HOUR;
  return new Date((Math.floor(now / period) + 1) * period);
}

/** Fills the freshly seeded instance at `baseUrl`; returns SQL to apply afterwards, if any. */
export type Populate = (baseUrl: string, log: (msg: string) => void) => Promise<string | null>;

/**
 * Brings the demo back to its sample data every `DEMO_RESET_HOURS`: deletes the demo projects
 * and the personas, with their files, seeds, and runs the scripts that fill out the Demo project
 * and make Lanternfall (docs/deployment.md). Team projects and their people are not touched.
 * While it runs, personas from outside the server are turned away (see `resetting`), so nobody
 * works on data that is about to go.
 */
export class DemoReset {
  /** True while the data is being replaced. */
  resetting = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly db: Db,
    private readonly attachmentsDir: string,
    readonly everyHours: number,
    private readonly log: (msg: string) => void,
    private readonly populate: Populate = runPopulateScripts,
  ) {}

  next(now = Date.now()): Date {
    return nextDemoReset(this.everyHours, now);
  }

  /** Waits for each reset in turn, filling the instance through the API at `baseUrl`. */
  start(baseUrl: string): void {
    const at = this.next().getTime();
    this.log(`demo reset every ${this.everyHours} h, next at ${new Date(at).toISOString()}`);
    const wait = () => {
      const left = at - Date.now();
      if (left > 0) {
        this.timer = setTimeout(wait, Math.min(left, LONGEST_WAIT));
        return;
      }
      this.run(baseUrl)
        .catch((err: unknown) => this.log(`demo reset failed: ${String(err)}`))
        .finally(() => {
          if (this.timer) this.start(baseUrl);
        });
    };
    this.timer = setTimeout(wait, 0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async run(baseUrl: string): Promise<void> {
    if (this.resetting) return;
    this.resetting = true;
    const started = Date.now();
    try {
      this.log('demo reset: replacing the demo');
      const gone = await withTransaction(this.db, async (tx) => {
        const projects = await tx.query<{ id: string }>(
          'DELETE FROM projects WHERE demo RETURNING id',
        );
        const personas = await tx.query<{ id: string }>(
          `DELETE FROM users u WHERE EXISTS
             (SELECT 1 FROM identities i WHERE i.user_id = u.id AND i.provider = 'mock')
           RETURNING id`,
        );
        return [...projects.rows.map((r) => r.id), ...personas.rows.map((r) => `avatars/${r.id}`)];
      });
      // Attachments are kept under the project's id, pictures under avatars/ and the user's.
      await Promise.all(
        gone.map((key) =>
          rm(path.join(this.attachmentsDir, key), { recursive: true, force: true }),
        ),
      );
      await seedDemo(this.db);
      const sql = await this.populate(baseUrl, this.log);
      if (sql) await this.db.query(sql);
      this.log(`demo reset: done in ${Math.round((Date.now() - started) / 1000)} s`);
    } finally {
      this.resetting = false;
    }
  }
}

/** scripts/populate-demo.mjs, then scripts/populate-large.mjs with the SQL that dates Lanternfall. */
const runPopulateScripts: Populate = async (baseUrl, log) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gameweld-demo-'));
  try {
    const sqlFile = path.join(dir, 'lanternfall.sql');
    await runScript('populate-demo.mjs', [baseUrl], log);
    await runScript('populate-large.mjs', [baseUrl, '--sql', sqlFile], log);
    return await readFile(sqlFile, 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

function runScript(name: string, args: string[], log: (msg: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(scriptsDir, name), ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let errors = '';
    child.stderr.on('data', (chunk: Buffer) => (errors += chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        log(`demo reset: ${name} done`);
        resolve();
      } else reject(new Error(`${name} exited with ${code}: ${errors.trim().slice(-500)}`));
    });
  });
}
