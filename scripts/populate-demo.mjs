// Fills the Demo project with a fuller backlog, tasks, board progress, comments, and covers,
// through the application's own API as the demo personas would. Items that already exist are left
// alone, so running it again adds nothing twice.
//
//   node scripts/populate-demo.mjs [base-url]      default http://localhost:8090
//
// Needs mock sign-in (AUTH_MOCK=true) and the seeded personas.
import sharp from 'sharp';

const BASE = (process.argv[2] ?? 'http://localhost:8090').replace(/\/$/, '');

async function signIn(persona) {
  const res = await fetch(`${BASE}/api/auth/mock/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ persona }),
  });
  if (res.status !== 204) throw new Error(`sign-in as ${persona}: ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async function call(method, path, body) {
    const init = { method, headers: { cookie } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const r = await fetch(`${BASE}/api${path}`, init);
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

// title, category, description, tasks: [category, title, assignee persona or null]
const ITEMS = [
  [
    'Player movement and dash',
    'must',
    'Responsive running, jumping, and a short dash with brief invulnerability. The feel of the whole game rests on this.',
    [
      ['code', 'Dash with invulnerability frames', 'developer'],
      ['code', 'Coyote time and jump buffering', 'developer'],
      ['assets', 'Dash trail effect', 'director'],
      ['content', 'Tune movement values in the test level', 'tester'],
    ],
  ],
  [
    'Health, damage, and death',
    'must',
    'Player health, hit reactions, and a death and retry loop that gets the player back in within two seconds.',
    [
      ['code', 'Damage and knockback system', 'developer'],
      ['assets', 'Hit flash shader', 'director'],
      ['content', 'Death screen copy', 'tester'],
    ],
  ],
  [
    'Save and load',
    'must',
    'Three save slots, autosave at checkpoints, and a safe write that never leaves a broken file.',
    [
      ['code', 'Save slots with atomic writes', 'developer'],
      ['code', 'Autosave at checkpoints', null],
      ['content', 'Checkpoint placement pass', 'tester'],
    ],
  ],
  [
    'Main menu and pause',
    'must',
    'Start, continue, settings, and quit, fully usable with a gamepad.',
    [
      ['code', 'Menu navigation with a gamepad', null],
      ['assets', 'Menu background art', null],
      ['content', 'Settings labels and help text', null],
    ],
  ],
  [
    'Loot and pickups',
    'should',
    'Health orbs and currency dropped by enemies, pulled toward the player when close.',
    [
      ['code', 'Pickup magnet radius', null],
      ['assets', 'Coin and orb sprites', null],
      ['content', 'Drop tables for the first biome', null],
    ],
  ],
  [
    'Audio mix pass',
    'should',
    'Balance music, effects, and voice so combat stays readable by ear.',
    [
      ['code', 'Volume buses and ducking', null],
      ['assets', 'Replace placeholder combat sounds', null],
    ],
  ],
  [
    'Tutorial level',
    'should',
    'Teach move, jump, dash, and attack without a single text box if we can manage it.',
    [
      ['content', 'Tutorial layout blockout', null],
      ['content', 'Playtest with three new players', null],
      ['assets', 'Tutorial set dressing', null],
    ],
  ],
  [
    'Enemy spawner',
    'should',
    'Waves driven by data so designers can tune encounters without code changes.',
    [
      ['code', 'Wave definitions from data files', null],
      ['content', 'First three encounter waves', null],
    ],
  ],
  [
    'Controller rumble',
    'should',
    'Short, distinct rumble for hits, dashes, and pickups.',
    [['code', 'Rumble presets', null]],
  ],
  [
    'Photo mode',
    'could',
    'Pause, free camera, a few filters, and hide the interface.',
    [
      ['code', 'Free camera with collision', null],
      ['assets', 'Photo filters', null],
    ],
  ],
  [
    'Speedrun timer',
    'could',
    'An optional in-game timer with splits per level.',
    [['code', 'Timer and splits', null]],
  ],
  [
    'Colour-blind palettes',
    'could',
    'Alternative palettes for enemy telegraphs and pickups.',
    [
      ['assets', 'Deuteranopia and protanopia palettes', null],
      ['content', 'Accessibility options page', null],
    ],
  ],
  [
    'Achievements',
    'could',
    'Twenty achievements that point players at things they might miss.',
    [['content', 'Achievement list and descriptions', null]],
  ],
  [
    'Online co-op',
    'wont',
    'Not for this release: the netcode alone would take the rest of the schedule.',
    [],
  ],
  ['Level editor', 'wont', 'Tempting, but it would need its own tools pass and support.', []],
  ['Mod support', 'wont', 'Revisit after launch if the community asks for it.', []],
];

// Illustrations for a few cards, drawn here so the script needs no image files.
const COVERS = {
  'Player movement and dash': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1d2b64"/><stop offset="1" stop-color="#f8cdda"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><rect y="700" width="1600" height="200" fill="#20163a"/>
    ${[0, 1, 2, 3].map((i) => `<g opacity="${0.2 + i * 0.25}" transform="translate(${420 + i * 180} 470)"><circle cy="-120" r="42" fill="#fff"/><rect x="-40" y="-78" width="80" height="150" rx="30" fill="#fff"/></g>`).join('')}
    <path d="M300 520 H980" stroke="#fff" stroke-width="10" stroke-dasharray="40 30" opacity=".6"/></svg>`,
  'Health, damage, and death': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#2b0f14"/>
    ${[0, 1, 2, 3, 4].map((i) => `<path transform="translate(${420 + i * 190} 360) scale(2.2)" d="M0 30 C -40 0 -30 -35 0 -18 C 30 -35 40 0 0 30Z" fill="${i < 3 ? '#e5484d' : '#5a2a30'}"/>`).join('')}
    <rect x="400" y="560" width="800" height="36" rx="18" fill="#5a2a30"/><rect x="400" y="560" width="480" height="36" rx="18" fill="#e5484d"/></svg>`,
  'Save and load': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#0f2a2e"/>
    ${[0, 1, 2].map((i) => `<g transform="translate(${260 + i * 380} 250)"><rect width="320" height="400" rx="24" fill="${i === 1 ? '#2ec4b6' : '#1b4d52'}"/><rect x="40" y="40" width="240" height="160" rx="12" fill="#0f2a2e" opacity=".5"/><rect x="40" y="240" width="200" height="24" rx="12" fill="#fff" opacity=".7"/><rect x="40" y="290" width="140" height="20" rx="10" fill="#fff" opacity=".4"/></g>`).join('')}</svg>`,
  'Loot and pickups': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#3b2a10"/>
    ${Array.from({ length: 14 }, (_, i) => `<circle cx="${300 + ((i * 173) % 1000)}" cy="${250 + ((i * 97) % 420)}" r="${36 + (i % 3) * 10}" fill="${i % 4 === 0 ? '#5fd38a' : '#ffd166'}" stroke="#fff3" stroke-width="8"/>`).join('')}</svg>`,
  'Tutorial level': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#bde0fe"/><rect y="680" width="1600" height="220" fill="#6a994e"/>
    <rect x="520" y="560" width="220" height="120" fill="#a7c957"/><rect x="900" y="460" width="260" height="220" fill="#a7c957"/>
    <path d="M200 600 q 150 -160 300 -40" stroke="#fff" stroke-width="10" fill="none" stroke-dasharray="20 18"/>
    <circle cx="1300" cy="200" r="80" fill="#ffd166"/></svg>`,
  'Photo mode': (
    w,
    h,
  ) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">
    <rect width="1600" height="900" fill="#14213d"/><rect x="300" y="200" width="1000" height="560" rx="30" fill="#fca311"/>
    <circle cx="800" cy="480" r="190" fill="#14213d"/><circle cx="800" cy="480" r="120" fill="#e5e5e5"/><rect x="1120" y="240" width="120" height="60" rx="14" fill="#14213d"/></svg>`,
};

async function coverFor(title) {
  const svg = COVERS[title];
  return svg
    ? sharp(Buffer.from(svg(1600, 900)))
        .png()
        .toBuffer()
    : null;
}

const as = {
  director: await signIn('director'),
  developer: await signIn('developer'),
  tester: await signIn('tester'),
};
const projects = await as.director('GET', '/projects');
const demo = projects.find((p) => p.name === 'Demo project');
if (!demo) throw new Error('No "Demo project" here; is the demo seed enabled?');
const p = (path) => `/projects/${demo.id}${path}`;
const detail = await as.director('GET', p(''));
const person = Object.fromEntries(
  detail.members.map((m) => [m.email?.split('@')[0], m.userId]).filter(([k]) => k),
);

// Backlog items and their tasks ---------------------------------------------------------------
const existing = new Set((await as.director('GET', p('/backlog'))).map((i) => i.title));
const created = [];
for (const [title, category, description, tasks] of ITEMS) {
  if (existing.has(title)) continue;
  const item = await as.director('POST', p('/backlog'), { title, category, description });
  for (const [taskCategory, taskTitle, assignee] of tasks) {
    const task = await as.developer('POST', p(`/backlog/${item.id}/tasks`), {
      category: taskCategory,
      title: taskTitle,
    });
    if (assignee) {
      await as.developer('PATCH', p(`/tasks/${task.id}`), {
        version: task.version,
        assigneeId: person[assignee],
      });
    }
  }
  const cover = await coverFor(title);
  if (cover) {
    const form = new FormData();
    form.append('file', new Blob([cover], { type: 'image/png' }), 'cover.png');
    await as.director('POST', p(`/backlog/${item.id}/attachments`), form);
  }
  created.push(item);
}
console.log(`backlog: ${created.length} items added (${existing.size} were there)`);
if (created.length === 0) process.exit(0);

// The Workboard: room for more scope, filled in priority order ----------------------------------
const fresh = await as.director('GET', p(''));
if (fresh.scopeLimit < 6)
  await as.director('PATCH', p(''), { version: fresh.version, scopeLimit: 6 });
let board = await as.director('GET', p('/board'));
while (board && board.counts.scopeItems < 6 && board.nextEligible) {
  board = await as.director('POST', p(`/boards/${board.id}/scope`), {
    itemId: board.nextEligible.id,
  });
}
console.log(`board: ${board.scope.length} items in scope`);

// Progress on the new work: some in the middle columns, some done, one item accepted.
const column = (name) => board.columns.find((c) => c.name === name);
const cardsOf = (itemTitle) =>
  Object.values(board.cards)
    .flat()
    .filter((c) => c.itemTitle === itemTitle && !c.completed);
async function move(card, name) {
  const target = column(name);
  if (target)
    board = await as.developer('POST', p(`/boards/${board.id}/placements/${card.id}/move`), {
      columnId: target.id,
    });
}
async function complete(card) {
  await as.tester('POST', p(`/tasks/${card.id}/complete`));
}
const movement = cardsOf('Player movement and dash');
if (movement[0]) await move(movement[0], 'Making');
if (movement[1]) await move(movement[1], 'Check in game');
if (movement[2]) await complete(movement[2]);
const saves = cardsOf('Save and load');
if (saves[0]) await move(saves[0], 'Making');
const health = board.scope.find((s) => s.title === 'Health, damage, and death');
if (health) {
  for (const card of cardsOf(health.title)) await complete(card);
  await as.director('POST', p(`/backlog/${health.id}/accept`), {
    note: 'Plays well: hits read clearly and the retry loop is quick.',
  });
}
board = await as.director('GET', p('/board'));
console.log(
  `board: ${board.counts.placedTasks - board.counts.unfinishedTasks}/${board.counts.placedTasks} tasks done`,
);

// A little conversation --------------------------------------------------------------------------
const byTitle = Object.fromEntries(created.map((i) => [i.title, i]));
const comments = [
  [
    'Player movement and dash',
    'developer',
    'Dash feels great at 0.18 s. Longer and it starts to float.',
  ],
  [
    'Player movement and dash',
    'tester',
    'Coyote time saved me twice on the spike section. Keep it.',
  ],
  [
    'Save and load',
    'director',
    'Let us not ship without the atomic write. Corrupt saves cost reviews.',
  ],
  [
    'Tutorial level',
    'tester',
    'New players missed the dash entirely. Maybe gate the first gap on it?',
  ],
  ['Online co-op', 'director', 'Parked on purpose; see the scope discussion from last week.'],
];
for (const [title, persona, body] of comments) {
  if (byTitle[title])
    await as[persona]('POST', p(`/backlog/${byTitle[title].id}/comments`), { body });
}
console.log(`comments: ${comments.filter(([t]) => byTitle[t]).length} added`);
