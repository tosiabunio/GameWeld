import * as backlog from './backlog.ts';
import * as board from './board.ts';
import * as common from './common.ts';
import * as settings from './settings.ts';
import * as shell from './shell.ts';
import * as task from './task.ts';

/** Polish, one fragment per area of the interface; `common` is the shared vocabulary. */
const fragments = [common, shell, backlog, board, task, settings];

export const texts: Record<string, string> = Object.assign({}, ...fragments.map((f) => f.texts));
export const plurals = Object.assign({}, ...fragments.map((f) => f.plurals));
