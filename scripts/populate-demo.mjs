// Fills the Demo project with a fuller backlog, tasks, board progress, comments, and pictures,
// through the application's own API as the demo personas would. Items that already exist are left
// alone, so running it again adds nothing twice; it does give a picture to any listed item or
// task that still lacks one, so a second run completes an instance filled by an earlier version.
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

// The seeded items, and one more, so that most of the Backlog's first screen has a face.
const bat = (x, y, s, fill, opacity = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${opacity}"><path d="M0 0C-20-30-60-30-90-5C-70-10-60 0-55 12C-40 0-25 5-15 18C-8 8 8 8 15 18C25 5 40 0 55 12C60 0 70-10 90-5C60-30 20-30 0 0Z"/><ellipse cy="4" rx="10" ry="16"/></g>`;
const scene = (body) => (w, h) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 1600 900">${body}</svg>`;
Object.assign(COVERS, {
  'Ranged enemy':
    scene(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d1b4e"/><stop offset="1" stop-color="#e76f51"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><path d="M0 760 L260 600 L480 720 L760 540 L1040 700 L1300 580 L1600 740 V900 H0Z" fill="#1a1030"/>
    ${[0, 1, 2].map((i) => `<path d="M260 ${520 - i * 40} Q 760 ${180 - i * 50} 1180 ${430 - i * 10}" stroke="#fff" stroke-width="7" fill="none" opacity="${0.35 + i * 0.2}"/>`).join('')}
    <circle cx="1240" cy="430" r="92" fill="#fff"/><circle cx="1240" cy="430" r="64" fill="#e5484d"/><circle cx="1240" cy="430" r="36" fill="#fff"/><circle cx="1240" cy="430" r="14" fill="#e5484d"/>`),
  'Flying enemy':
    scene(`<rect width="1600" height="900" fill="#1f4e79"/><circle cx="1180" cy="40" r="150" fill="#fdf6d8"/>
    ${Array.from({ length: 26 }, (_, i) => `<circle cx="${(i * 389) % 1600}" cy="${(i * 211) % 620}" r="${2 + (i % 3)}" fill="#fff" opacity=".7"/>`).join('')}
    <path d="M0 900 Q 400 700 800 860 T 1600 820 V900Z" fill="#dbe9f4"/>${bat(760, 420, 4.2, '#0d1b2a')}
    <circle cx="738" cy="420" r="7" fill="#e5484d"/><circle cx="782" cy="420" r="7" fill="#e5484d"/>`),
  'Boss arena':
    scene(`<rect width="1600" height="900" fill="#1c0f0a"/><ellipse cx="800" cy="700" rx="720" ry="170" fill="#3b2116"/>
    ${[170, 420, 1180, 1430].map((x) => `<g transform="translate(${x} 0)"><rect x="-38" y="250" width="76" height="430" fill="#5c3a2a"/><rect x="-56" y="230" width="112" height="34" fill="#7a4e38"/></g>`).join('')}
    <ellipse cx="800" cy="720" rx="230" ry="52" fill="none" stroke="#f4a261" stroke-width="10"/><ellipse cx="800" cy="720" rx="150" ry="32" fill="none" stroke="#e76f51" stroke-width="8"/>
    <path d="M800 680 L860 745 H740Z" fill="none" stroke="#f4a261" stroke-width="8"/>`),
  'Improve level iteration tooling': scene(`<rect width="1600" height="900" fill="#12355b"/>
    ${Array.from({ length: 21 }, (_, i) => `<path d="M${i * 80} 0V900" stroke="#fff" opacity=".12" stroke-width="3"/>`).join('')}${Array.from({ length: 12 }, (_, i) => `<path d="M0 ${i * 80}H1600" stroke="#fff" opacity=".12" stroke-width="3"/>`).join('')}
    ${[
      [240, 720, 4],
      [640, 640, 3],
      [960, 560, 2],
      [1200, 480, 2],
    ]
      .map(([x, y, n]) =>
        Array.from(
          { length: n },
          (_, i) => `<rect x="${x + i * 84}" y="${y}" width="72" height="72" fill="#dbe7ff"/>`,
        ).join(''),
      )
      .join('')}
    <rect x="1040" y="620" width="72" height="72" fill="none" stroke="#ffd166" stroke-width="8" stroke-dasharray="16 12"/><path d="M1130 680 l70 130 l-38 -14 l-24 40z" fill="#ffd166"/>`),
  'Main menu and pause':
    scene(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b132b"/><stop offset="1" stop-color="#3a506b"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><circle cx="1240" cy="230" r="110" fill="#f4f1de" opacity=".9"/>
    <path d="M0 900 V640 L300 430 L560 640 L820 470 L1140 700 L1360 560 L1600 700 V900Z" fill="#1c2541"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="180" y="${300 + i * 96}" width="${i === 0 ? 420 : 340}" height="60" rx="14" fill="${i === 0 ? '#5bc0be' : '#fff'}" opacity="${i === 0 ? 1 : 0.28}"/>`).join('')}`),
});

// Pictures for tasks: what the work looks like in progress. Most belong to Assets tasks, as art
// does; a few Code and Content tasks have a sketch or a capture too.
const figure = (x, pose) =>
  `<g transform="translate(${x} 0)" stroke="#2b2d42" stroke-width="16" stroke-linecap="round" fill="none"><circle cx="0" cy="330" r="44" fill="#2b2d42" stroke="none"/><path d="M0 380 V560 M0 560 L-50 720 M0 560 L50 720 M0 430 L${70 + pose * 14} ${400 - pose * 22} M0 430 L${90 + pose * 8} ${470 - pose * 10}"/><path d="M${70 + pose * 14} ${400 - pose * 22} L${200 + pose * 30} ${440 - pose * 30}" stroke="#d62828" stroke-width="10"/></g>`;
const TASK_ART = {
  Targeting:
    scene(`<rect width="1600" height="900" fill="#0b1f17"/><circle cx="800" cy="450" r="330" fill="#123524"/>
    <circle cx="800" cy="450" r="250" fill="none" stroke="#5fd38a" stroke-width="8"/><circle cx="800" cy="450" r="150" fill="none" stroke="#5fd38a" stroke-width="8" stroke-dasharray="34 22"/>
    <path d="M800 80V820M430 450H1170" stroke="#5fd38a" stroke-width="6"/><circle cx="800" cy="450" r="12" fill="#e5484d"/>`),
  'Attack animation': scene(`<rect width="1600" height="900" fill="#f1e9da"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${60 + i * 380}" y="120" width="340" height="660" fill="#fff" stroke="#c9bfa9" stroke-width="6"/>${figure(180 + i * 380, i)}`).join('')}`),
  'Configure and place the enemy':
    scene(`<rect width="1600" height="900" fill="#7fb069"/><path d="M0 640 Q 400 560 800 660 T 1600 620 V900 H0Z" fill="#e6c78b"/><path d="M0 730 Q 400 660 800 750 T 1600 710 V900 H0Z" fill="#4e9ac7"/>
    ${Array.from({ length: 22 }, (_, i) => `<circle cx="${80 + ((i * 263) % 1460)}" cy="${60 + ((i * 149) % 480)}" r="${30 + (i % 3) * 8}" fill="#4a7c3a"/>`).join('')}
    <rect x="640" y="250" width="300" height="190" rx="10" fill="#d9a066" stroke="#8a5a2b" stroke-width="10"/>
    ${[
      [470, 300],
      [1060, 210],
      [880, 540],
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${x}" cy="${y}" r="30" fill="#e5484d" stroke="#fff" stroke-width="8"/><path d="M${x - 12} ${y - 12}l24 24m0-24l-24 24" stroke="#fff" stroke-width="7"/>`,
      )
      .join('')}`),
  'Flight path steering': scene(`<rect width="1600" height="900" fill="#14213d"/>
    <path d="M140 700 C 420 200 640 820 880 420 S 1300 160 1480 380" fill="none" stroke="#fca311" stroke-width="10" stroke-dasharray="30 22"/>
    ${[
      [140, 700],
      [560, 545],
      [880, 420],
      [1230, 275],
      [1480, 380],
    ]
      .map(
        ([x, y], i) =>
          `<circle cx="${x}" cy="${y}" r="24" fill="#14213d" stroke="#fff" stroke-width="8"/><path d="M${x} ${y} l${60 - i * 8} ${-70 + i * 22}" stroke="#8ecae6" stroke-width="7"/>`,
      )
      .join('')}${bat(1010, 350, 1.4, '#e5e5e5')}`),
  'Swoop animation':
    scene(`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffd6a5"/><stop offset="1" stop-color="#ff8fab"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><path d="M180 200 Q 800 1240 1420 200" fill="none" stroke="#fff" stroke-width="9" stroke-dasharray="4 26" stroke-linecap="round"/>
    ${[
      [230, 270, 0.3],
      [480, 570, 0.5],
      [800, 720, 1],
      [1120, 570, 0.5],
      [1370, 270, 0.3],
    ]
      .map(([x, y, o]) => bat(x, y, 1.9, '#3d2c5e', o))
      .join('')}`),
  'Dash trail effect': scene(`<rect width="1600" height="900" fill="#10002b"/>
    ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${140 + i * 60}" y="${330 + i * 14}" width="${1000 - i * 120}" height="${26 - i * 3}" rx="13" fill="#9d4edd" opacity="${0.15 + i * 0.12}"/>`).join('')}
    ${[0, 1, 2, 3].map((i) => `<g opacity="${0.18 + i * 0.27}" transform="translate(${760 + i * 150} 470)"><circle cy="-130" r="46" fill="#e0aaff"/><rect x="-44" y="-84" width="88" height="170" rx="34" fill="#e0aaff"/></g>`).join('')}`),
  'Hit flash shader':
    scene(`<rect width="800" height="900" fill="#22223b"/><rect x="800" width="800" height="900" fill="#4a4e69"/>
    ${[
      [400, '#9a8c98'],
      [1200, '#ffffff'],
    ]
      .map(
        ([x, fill]) =>
          `<g transform="translate(${x} 480)" fill="${fill}"><circle cy="-190" r="78"/><rect x="-90" y="-110" width="180" height="300" rx="60"/><rect x="-150" y="-80" width="60" height="200" rx="30"/><rect x="90" y="-80" width="60" height="200" rx="30"/></g>`,
      )
      .join('')}
    <path d="M800 0V900" stroke="#f2e9e4" stroke-width="8" stroke-dasharray="24 18"/>${Array.from({ length: 8 }, (_, i) => `<path d="M1200 290 l${Math.round(260 * Math.cos((i * Math.PI) / 4))} ${Math.round(260 * Math.sin((i * Math.PI) / 4))}" stroke="#fff" stroke-width="10" opacity=".35"/>`).join('')}`),
  'Menu background art':
    scene(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03045e"/><stop offset="1" stop-color="#f77f00"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g)"/><circle cx="800" cy="610" r="170" fill="#ffd166"/>
    <path d="M0 900V620L260 470L520 640L800 430L1100 650L1340 520L1600 660V900Z" fill="#240046" opacity=".75"/><path d="M0 900V740L340 610L700 770L1040 640L1600 800V900Z" fill="#10002b"/>`),
  'Coin and orb sprites': scene(`<rect width="1600" height="900" fill="#2b2d42"/>
    ${Array.from({ length: 8 }, (_, i) => `<g transform="translate(${190 + (i % 4) * 400} ${260 + Math.floor(i / 4) * 380})"><rect x="-150" y="-150" width="300" height="300" fill="none" stroke="#8d99ae" stroke-width="4" stroke-dasharray="14 12"/>${i < 4 ? `<ellipse rx="${110 - i * 30}" ry="110" fill="#ffd166" stroke="#e09f3e" stroke-width="14"/><ellipse rx="${Math.max(8, 56 - i * 16)}" ry="62" fill="none" stroke="#e09f3e" stroke-width="10"/>` : `<circle r="${70 + (i - 4) * 12}" fill="#5fd38a" opacity=".35"/><circle r="70" fill="#5fd38a"/><circle cx="-24" cy="-24" r="20" fill="#fff" opacity=".8"/>`}</g>`).join('')}`),
  'Replace placeholder combat sounds': scene(`<rect width="1600" height="900" fill="#1b1b2f"/>
    ${Array.from({ length: 44 }, (_, i) => {
      const hgt = 60 + Math.round(Math.abs(Math.sin(i * 0.9) * Math.cos(i * 0.23)) * 520);
      return `<rect x="${112 + i * 32}" y="${450 - hgt / 2}" width="18" height="${hgt}" rx="9" fill="${i > 14 && i < 27 ? '#e43f5a' : '#5d6d9e'}"/>`;
    }).join('')}`),
  'Tutorial set dressing':
    scene(`<rect width="1600" height="900" fill="#caf0f8"/><rect y="640" width="1600" height="260" fill="#588157"/>
    <rect x="300" y="420" width="26" height="240" fill="#7f5539"/><path d="M190 420 h250 l50 46 l-50 46 h-250z" fill="#ddb892" stroke="#7f5539" stroke-width="10"/>
    ${[
      [760, 520],
      [900, 520],
      [830, 400],
    ]
      .map(
        ([x, y]) =>
          `<rect x="${x}" y="${y}" width="130" height="120" fill="#b08968" stroke="#7f5539" stroke-width="10"/><path d="M${x} ${y} l130 120 m0 -120 l-130 120" stroke="#7f5539" stroke-width="8"/>`,
      )
      .join('')}
    ${[1180, 1300, 1400].map((x, i) => `<path d="M${x} 650 q -50 -${120 + i * 30} 0 -${190 + i * 30} q 50 ${70 + i * 10} 0 ${190 + i * 30}" fill="#344e41"/>`).join('')}`),
  'Photo filters': scene(`${[
    ['#8ecae6', '#219ebc', '#ffb703', 1],
    ['#d8d8d8', '#8a8a8a', '#f2f2f2', 1],
    ['#e6ccb2', '#9c6644', '#ede0d4', 1],
  ]
    .map(
      ([sky, hill, sun], i) =>
        `<g transform="translate(${i * 534} 0)"><rect width="534" height="900" fill="${sky}"/><circle cx="380" cy="250" r="90" fill="${sun}"/><path d="M0 900V620L180 440L360 640L534 520V900Z" fill="${hill}"/></g>`,
    )
    .join('')}
    <path d="M534 0V900M1068 0V900" stroke="#fff" stroke-width="12"/>`),
  'Deuteranopia and protanopia palettes': scene(`<rect width="1600" height="900" fill="#f8f9fa"/>
    ${[
      ['#e5484d', '#f59e0b', '#17803d', '#3b82f6', '#5944d9'],
      ['#a89a3c', '#d9b13b', '#8a8240', '#3f7fe0', '#4a55c8'],
      ['#9c9440', '#e0bd3a', '#7d7a45', '#2f86e6', '#3d5bd0'],
    ]
      .map((row, r) =>
        row
          .map(
            (c, i) =>
              `<rect x="${170 + i * 260}" y="${130 + r * 230}" width="220" height="180" rx="22" fill="${c}"/>`,
          )
          .join(''),
      )
      .join('')}`),
  'Checkpoint placement pass':
    scene(`<rect width="1600" height="900" fill="#22333b"/><path d="M80 700 H420 V520 H760 V640 H1100 V380 H1520" fill="none" stroke="#eae0d5" stroke-width="26" stroke-linejoin="round"/>
    ${[
      [420, 520],
      [1100, 380],
      [1520, 380],
    ]
      .map(
        ([x, y], i) =>
          `<path d="M${x} ${y - 13} V${y - 200}" stroke="#eae0d5" stroke-width="12"/><path d="M${x} ${y - 200} h110 l-30 40 l30 40 h-110z" fill="${i === 2 ? '#c6ac8f' : '#5fd38a'}"/>`,
      )
      .join('')}
    <circle cx="240" cy="655" r="34" fill="#ffd166"/>`),
  'Tutorial layout blockout': scene(`<rect width="1600" height="900" fill="#e9ecef"/>
    ${[
      [100, 640, 420, 160],
      [600, 560, 260, 240],
      [940, 460, 220, 340],
      [1240, 360, 280, 440],
      [520, 300, 200, 60],
      [820, 220, 200, 60],
    ]
      .map(
        ([x, y, w, hh]) =>
          `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#adb5bd" stroke="#6c757d" stroke-width="8"/>`,
      )
      .join('')}
    <path d="M160 600 Q 400 300 620 520 T 1000 420 T 1380 320" fill="none" stroke="#e5484d" stroke-width="9" stroke-dasharray="26 20"/><circle cx="160" cy="600" r="26" fill="#e5484d"/>`),
  'First three encounter waves': scene(`<rect width="1600" height="900" fill="#1d3557"/>
    ${[3, 5, 8].map((n, r) => `<rect x="120" y="${150 + r * 220}" width="1360" height="170" rx="20" fill="#fff" opacity=".07"/>${Array.from({ length: n }, (_, i) => `<g transform="translate(${260 + i * 150} ${235 + r * 220})"><circle r="46" fill="${r === 2 && i > 5 ? '#e63946' : '#a8dadc'}"/><circle cx="-16" cy="-8" r="9" fill="#1d3557"/><circle cx="16" cy="-8" r="9" fill="#1d3557"/></g>`).join('')}`).join('')}`),
  'Timer and splits':
    scene(`<rect width="1600" height="900" fill="#0d1b2a"/><circle cx="520" cy="480" r="270" fill="#1b263b" stroke="#e0e1dd" stroke-width="22"/><rect x="480" y="150" width="80" height="70" rx="12" fill="#e0e1dd"/>
    <path d="M520 480 V270 M520 480 L680 560" stroke="#ffd166" stroke-width="18" stroke-linecap="round"/><circle cx="520" cy="480" r="22" fill="#ffd166"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="920" y="${250 + i * 120}" width="${520 - i * 40}" height="70" rx="16" fill="${i === 1 ? '#5fd38a' : i === 2 ? '#e5484d' : '#415a77'}"/>`).join('')}`),
};

const png = (draw) =>
  sharp(Buffer.from(draw(1600, 900)))
    .png()
    .toBuffer();
async function attach(call, path, name, draw) {
  const form = new FormData();
  form.append('file', new Blob([await png(draw)], { type: 'image/png' }), name);
  await call('POST', path, form);
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
  created.push(item);
}
console.log(`backlog: ${created.length} items added (${existing.size} were there)`);

// Pictures: the newest image on an item or a task becomes its cover. Whatever already has a cover
// keeps it, so this fills the gaps on an instance that was populated before, and nothing else.
const pictures = { items: 0, tasks: 0 };
for (const item of await as.director('GET', p('/backlog'))) {
  if (COVERS[item.title] && !item.coverAttachmentId) {
    await attach(
      as.director,
      p(`/backlog/${item.id}/attachments`),
      'cover.png',
      COVERS[item.title],
    );
    pictures.items += 1;
  }
  for (const task of await as.developer('GET', p(`/backlog/${item.id}/tasks`))) {
    if (!TASK_ART[task.title] || task.coverAttachmentId || task.archived) continue;
    await attach(
      as.developer,
      p(`/tasks/${task.id}/attachments`),
      'reference.png',
      TASK_ART[task.title],
    );
    pictures.tasks += 1;
  }
}
console.log(`pictures: ${pictures.items} item covers and ${pictures.tasks} task pictures added`);
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
