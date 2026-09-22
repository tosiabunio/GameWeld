// Adds "Lanternfall", a larger sample project: about 175 Backlog items with some 600 tasks, eight
// months of accepted work, items waiting for review, open work in every lane (Should Have holds
// more than fifty, so the Backlog pages), and an active Workboard with cards in its columns. It is
// for trying GameWeld at the size of a real production, and it leaves the Demo project alone.
//
//   node scripts/populate-large.mjs [base-url] [--sql <file>]    default http://localhost:8090
//
// Everything goes through the API as the demo personas, so the rules and the history hold. The API
// records every change as happening now, so with --sql the script also writes a transaction that
// moves this project's times back to a believable past: when items were created and accepted,
// when tasks were completed, the history in the same order, and no notifications from the run.
// Apply it to the instance's database:
//
//   docker compose exec -T db psql -U gameweld -d gameweld -v ON_ERROR_STOP=1 < lanternfall.sql
//
// It touches only rows of this project. If the project exists already, the script stops.
// Needs mock sign-in (AUTH_MOCK=true) and the seeded personas.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const sqlAt = args.indexOf('--sql');
const SQL_FILE = sqlAt === -1 ? null : args[sqlAt + 1];
const BASE = (
  args.find((a, i) => !a.startsWith('--') && (sqlAt === -1 || i !== sqlAt + 1)) ??
  'http://localhost:8090'
).replace(/\/$/, '');
const PROJECT = 'Lanternfall';

// The same data on every instance: a seeded generator instead of Math.random.
let seed = 20260922;
function random() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (low, high) => low + random() * (high - low);
const pick = (list) => list[Math.floor(random() * list.length)];

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
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers['content-type'] = 'application/json';
    }
    const r = await fetch(`${BASE}/api${path}`, init);
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
}

// The game ---------------------------------------------------------------------------------------

const BIOMES = [
  [
    'Sunken Archive',
    'the Drowned Librarian',
    ['Ink wraith', 'Page swarm'],
    'Rising ink',
    'shelves, reading lamps, flooded desks',
    'Archivist Mira',
  ],
  [
    'Frostvein Caverns',
    'the Glacier Maw',
    ['Ice crawler', 'Frost bat'],
    'Falling icicles',
    'icicles, frozen carts, crystal veins',
    'Miner Oskar',
  ],
  [
    'Ashen Dunes',
    'the Cinder Serpent',
    ['Ash hound', 'Sand stalker'],
    'Sandstorm gusts',
    'bone arches, burnt banners, dune grass',
    'Nomad Sefa',
  ],
  [
    'Clockwork Quarter',
    'the Brass Regent',
    ['Gear sentry', 'Spring hopper'],
    'Crushing gears',
    'gears, pistons, clock faces',
    'Tinker Ludo',
  ],
  [
    'Skyreach Ruins',
    'the Storm Roc',
    ['Wind wisp', 'Stone gargoyle'],
    'Lightning strikes',
    'broken pillars, prayer flags, floating rocks',
    'Pilgrim Anouk',
  ],
  [
    'Mycelium Depths',
    'the Spore Mother',
    ['Spore puffer', 'Root lurker'],
    'Spore clouds',
    'glowing caps, root curtains, spore sacs',
    'Herbalist Yara',
  ],
  [
    'Stormbreak Coast',
    'the Wreck Leviathan',
    ['Crab knight', 'Gull diver'],
    'Tidal surges',
    'wrecks, nets, a ruined lighthouse',
    'Captain Ilse',
  ],
  [
    'Obsidian Keep',
    'the Lantern King',
    ['Obsidian guard', 'Shade archer'],
    'Creeping darkness',
    'thrones, chains, black glass',
    'the Last Knight',
  ],
].map(([name, boss, enemies, hazard, props, npc]) => ({ name, boss, enemies, hazard, props, npc }));

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Each area's items: [key, title, description, tasks as [category, title]]. */
const ASPECTS = [
  [
    'layout',
    (b) => `${b.name}: layout and blockout`,
    (b) =>
      `The rooms of ${b.name}, how they connect, and the critical path through them, blocked out and playable from end to end.`,
    (b) => [
      ['content', `Room graph for ${b.name}`],
      ['content', 'Blockout of the critical path'],
      ['content', 'Blockout of the side rooms'],
      ['code', 'Room transitions and camera bounds'],
      ['content', `Playtest the ${b.name} route`],
    ],
  ],
  [
    'enemies',
    (b) => `${b.name}: enemy roster`,
    (b) =>
      `${b.enemies[0]} and ${b.enemies[1]}: two enemies that teach what ${b.name} is about, and where they stand.`,
    (b) => [
      ['code', `${b.enemies[0]} behaviour`],
      ['code', `${b.enemies[1]} behaviour`],
      ['assets', `${b.enemies[0]} sprite and animations`],
      ['assets', `${b.enemies[1]} sprite and animations`],
      ['content', 'Enemy placement pass'],
    ],
  ],
  [
    'boss',
    (b) => `${b.name}: boss fight against ${b.boss}`,
    (b) =>
      `${cap(b.boss)} guards the way out of ${b.name}: three phases, each teaching one thing the player learned in the area.`,
    (b) => [
      ['code', `Boss phases for ${b.boss}`],
      ['code', 'Arena hazards'],
      ['assets', `${cap(b.boss)}: model and rig`],
      ['assets', 'Boss attack effects'],
      ['content', 'Boss tuning pass'],
      ['content', 'Intro and defeat lines'],
    ],
  ],
  [
    'dressing',
    (b) => `${b.name}: set dressing and props`,
    (b) => `Make ${b.name} look like a place: ${b.props}.`,
    (b) => [
      ['assets', `Tile set for ${b.name}`],
      ['assets', 'Background parallax layers'],
      ['assets', `Props: ${b.props}`],
      ['content', 'Dress the critical path'],
    ],
  ],
  [
    'traversal',
    (b) => `${b.name}: traversal challenges`,
    (b) => `Optional platforming for players who want it, built around ${b.hazard.toLowerCase()}.`,
    (b) => [
      ['content', 'Three optional platforming gauntlets'],
      ['code', `${b.hazard}: hazard behaviour`],
      ['assets', `${b.hazard}: effect`],
      ['content', 'Reward rooms at the end of each gauntlet'],
    ],
  ],
  [
    'secrets',
    (b) => `${b.name}: secrets and collectibles`,
    (b) => `Hidden rooms, lore, and collectibles that reward looking closely at ${b.name}.`,
    (b) => [
      ['content', 'Hidden rooms and breakable walls'],
      ['content', `Lore pages for ${b.name}`],
      ['assets', 'Collectible sprite'],
      ['code', 'Collectible count per area'],
    ],
  ],
  [
    'npc',
    (b) => `${b.name}: side quest for ${b.npc}`,
    (b) =>
      `${b.npc} asks for help; the quest sends the player back through ${b.name} with a new ability.`,
    (b) => [
      ['content', `Dialogue for ${b.npc}`],
      ['content', 'Quest steps and rewards'],
      ['assets', `${b.npc}: portrait and idle`],
      ['code', 'Quest state for the side quest'],
    ],
  ],
  [
    'audio',
    (b) => `${b.name}: music and ambience`,
    (b) =>
      `A theme for ${b.name} with a combat layer, and ambience that makes each room sound different.`,
    (b) => [
      ['assets', 'Exploration theme'],
      ['assets', 'Combat layer for the theme'],
      ['assets', 'Ambience loops'],
      ['code', 'Music layers that follow the threat'],
      ['content', `Sound pass on ${b.name}`],
    ],
  ],
  [
    'lighting',
    (b) => `${b.name}: lighting pass`,
    (b) => `Light and darkness in ${b.name}: where the lantern matters, and where it does not.`,
    () => [
      ['assets', 'Light cookies and glow sprites'],
      ['code', 'Lantern light against the area’s darkness'],
      ['content', 'Lighting pass on every room'],
    ],
  ],
  [
    'performance',
    (b) => `${b.name}: performance pass on Switch`,
    (b) => `${b.name} at a steady 60 frames per second on Switch, docked and handheld.`,
    () => [
      ['code', 'Profile the heaviest rooms'],
      ['code', 'Batch the background layers'],
      ['assets', 'Reduce overdraw in effects'],
      ['content', 'Frame rate check on every room'],
    ],
  ],
];

/**
 * What happened to each area's items. Dn: accepted n days ago. R: ready for review.
 * M, S, C with a fraction: open in Must, Should, or Could Have, with that share of tasks complete.
 */
const AREA_FATES = [
  'D238 D233 D228 D222 D216 D211 D205 D199 D193 D187',
  'D183 D178 D172 D166 D160 D155 D149 D144 D139 D134',
  'D131 D126 D120 D114 D108 D102 D97 D91 R M0.5',
  'D78 D66 D52 D38 D31 R M0.6 M0.3 M0 S0',
  'D14 D4 M0.4 M0.2 M0 S0 S0 S0.25 S0 S0',
  'S0.4 S0 S0 S0 S0 S0 S0 S0 S0 S0',
  'S0 S0 S0 S0 S0 S0 S0 S0 S0 S0',
  'M0 M0 M0 C0 C0 C0 C0 C0 C0 C0',
].map((row) => row.split(' '));

/** Items of the game as a whole: [title, fate, description, tasks as "c:…|a:…|t:…"]. */
const SYSTEMS = [
  [
    'Lantern: light radius and fuel',
    'D240',
    'The lantern lights the way and burns fuel, and darkness hurts. The game’s central mechanic.',
    'c:Light radius and falloff|c:Fuel drain and refill|a:Lantern sprite and flame|a:Darkness vignette|t:Fuel tuning in the first area',
  ],
  [
    'Movement: run, jump, and dash',
    'D236',
    'Responsive running and jumping, and a short dash with brief invulnerability.',
    'c:Run and jump with coyote time|c:Dash with invulnerability frames|a:Dash trail|t:Movement values pass',
  ],
  [
    'Combat: light attack combo',
    'D226',
    'A three-hit combo that feels heavy without being slow.',
    'c:Three-hit combo|c:Hit stop and knockback|a:Slash effects|t:Combo timing pass',
  ],
  [
    'Health, damage, and death',
    'D219',
    'Health, hit reactions, and a death that gets the player back in within two seconds.',
    'c:Damage and knockback|c:Respawn at the last shrine|a:Hit flash shader|t:Death screen copy',
  ],
  [
    'Save system with three slots',
    'D213',
    'Three slots, autosave at shrines, and writes that never leave a broken file.',
    'c:Save slots with atomic writes|c:Autosave at shrines|t:Save slot screen copy',
  ],
  [
    'Checkpoint shrines',
    'D204',
    'Shrines restore health and fuel and become the place to respawn.',
    'c:Shrine activation and respawn|a:Shrine sprite and glow|t:Shrine placement in the first two areas',
  ],
  [
    'Map with markers',
    'D196',
    'The map fills in as rooms are visited; the player can pin markers.',
    'c:Map reveal as rooms are visited|c:Player markers|a:Map icons|t:Map legend text',
  ],
  [
    'Main menu',
    'D188',
    'Start, continue, settings, and quit, fully usable with a gamepad.',
    'c:Menu navigation with a gamepad|a:Menu background art|t:Menu labels',
  ],
  [
    'Pause menu and settings',
    'D176',
    'Pause at any time, with audio, video, and control settings.',
    'c:Pause and resume|c:Audio and video settings|t:Settings help text',
  ],
  [
    'HUD: health, fuel, and currency',
    'D168',
    'A HUD that reads at a glance and stays out of the way.',
    'c:HUD layout that scales with resolution|a:HUD icons and frames|t:HUD readability check',
  ],
  [
    'Grapple hook traversal',
    'D152',
    'Grapple points that open up the second half of the map.',
    'c:Grapple targeting|c:Swing physics|a:Hook and rope sprites|t:Grapple points in the Frostvein Caverns',
  ],
  [
    'Parry and riposte',
    'D141',
    'A tight parry window that rewards reading the enemy.',
    'c:Parry window and riposte|a:Parry flash|t:Parry tutorial room|t:Parry timing pass',
  ],
  [
    'Currency and shops',
    'D127',
    'Currency dropped by enemies, pulled to the player, and spent at shops.',
    'c:Currency drops and pickup magnet|c:Shop screen|a:Shopkeeper sprite|t:Prices for the first three areas',
  ],
  [
    'Charms and loadouts',
    'D112',
    'Charms change how the player fights; three slots, more found later.',
    'c:Charm slots and effects|a:Twelve charm icons|t:Charm descriptions|t:Charm balance pass',
  ],
  [
    'Fast travel between shrines',
    'D99',
    'Travel between discovered shrines once the map is large.',
    'c:Travel menu at a shrine|a:Travel transition effect|t:Which shrines connect',
  ],
  [
    'Dialogue system',
    'D89',
    'Dialogue boxes with portraits, choices, and flags the quests can read.',
    'c:Dialogue boxes with portraits|c:Choices and flags|t:Dialogue style guide',
  ],
  [
    'Wall jump',
    'D73',
    'Wall slide and wall jump, found in the Ashen Dunes.',
    'c:Wall slide and jump|a:Wall slide dust|t:Wall jump gates in the Ashen Dunes',
  ],
  [
    'Quest log',
    'D57',
    'The side quests, what the player has done, and what is next.',
    'c:Quest log screen|c:Quest states from flags|t:Quest descriptions',
  ],
  [
    'Bestiary',
    'D42',
    'Every enemy the player has met, with a line of lore.',
    'c:Bestiary unlocks on first kill|a:Bestiary portraits|t:Bestiary entries for the first four areas',
  ],
  [
    'Controller remapping',
    'D23',
    'Every action can be moved to another button.',
    'c:Remap screen|c:Conflict warnings|t:Remap labels for three controller families',
  ],
  [
    'Subtitles and captions',
    'D9',
    'Subtitles for every line and captions for the sounds that matter.',
    'c:Subtitle rendering with a background|c:Captions for important sounds|t:Caption text for the first area',
  ],
  [
    'Double jump',
    'M0.5',
    'The last movement ability, found in the Clockwork Quarter.',
    'c:Double jump with its own arc|a:Double jump wing effect|t:Double jump gates in the Clockwork Quarter|t:Backtracking secrets that need it',
  ],
  [
    'Tutorial prompts',
    'M0.6',
    'Prompts that appear when needed and follow the controller in use.',
    'c:Context prompts that follow the controller|t:Prompt text|t:Tutorial playtest with new players',
  ],
  [
    'Opening cinematic',
    'M0.4',
    'Ninety seconds that set up the Lantern King and the fading light.',
    'a:Opening storyboard|a:Opening illustrations|c:Skippable cinematic player|t:Opening narration',
  ],
  [
    'Skill tree',
    'M0.3',
    'Twenty skills bought with currency at shrines.',
    'c:Skill tree screen|c:Skill unlocks and costs|a:Skill icons|t:Twenty skills and their costs|t:Skill balance pass',
  ],
  [
    'Load times under ten seconds',
    'M0.2',
    'No load longer than ten seconds on the slowest platform.',
    'c:Profile loading on every platform|c:Stream rooms in the background|c:Compress textures|t:Measure loads on the slowest device',
  ],
  [
    'Crafting at the forge',
    'M0',
    'Materials from every area become upgrades at the forge.',
    'c:Recipes and materials|c:Forge screen|a:Forge and smith sprites|t:Recipe list',
  ],
  [
    'Credits',
    'M0',
    'Everyone who made the game, and the backers.',
    'c:Scrolling credits|t:Credits list|a:Credits background',
  ],
  [
    'Ending cinematics',
    'M0',
    'Two endings, depending on whether the player kept the lantern.',
    'a:Storyboards for the two endings|a:Ending illustrations|c:Cinematic sequencing|t:Ending narration',
  ],
  [
    'Steam Deck verification',
    'S0.5',
    'Verified on Steam Deck: controls, glyphs, and text size.',
    'c:Deck controls and glyphs|c:Text size at 800p|t:Verification checklist',
  ],
  [
    'Switch port: performance',
    'S0.2',
    'A steady frame rate on Switch across the whole game.',
    'c:Profile on the dev kit|c:Lighter effects on Switch|a:Switch icon and store art|t:Frame rate check in every area',
  ],
  [
    'Steam achievements',
    'S0.3',
    'Thirty achievements that point players at what they might miss.',
    'c:Steamworks achievements|t:Achievement list|a:Achievement icons',
  ],
  [
    'PlayStation trophies',
    'S0',
    'Trophies matching the Steam achievements, with a platinum.',
    'c:Trophy integration|t:Trophy list and descriptions|a:Trophy icons',
  ],
  [
    'Xbox achievements',
    'S0',
    'Achievements matching the Steam ones, within Xbox’s point budget.',
    'c:Achievement integration|t:Achievement list with points|a:Achievement art',
  ],
  [
    'Cloud saves',
    'S0',
    'Saves follow the player between a desktop and a Steam Deck.',
    'c:Steam Cloud|c:Conflicts between devices|t:Cloud save help text',
  ],
  [
    'Keyboard and mouse remapping',
    'S0',
    'Full remapping for keyboard and mouse players.',
    'c:Keyboard remap screen|c:Mouse aiming for the grapple|t:Key glyphs',
  ],
  [
    'Colour-blind palettes',
    'S0',
    'Alternative palettes for telegraphs, pickups, and hazards.',
    'c:Palette swap for telegraphs|a:Three palettes|t:Check with colour-blind players',
  ],
  [
    'Screen shake and flash settings',
    'S0.5',
    'Sliders for screen shake and a switch for flashes.',
    'c:Screen shake slider|c:Flash reduction|t:Settings text',
  ],
  [
    'Assist mode',
    'S0',
    'Damage, speed, and invulnerability options, without judgement.',
    'c:Damage and speed sliders|c:Invulnerability switch|t:Assist mode wording',
  ],
  [
    'German localization',
    'S0',
    'All text in German, checked in context.',
    't:Translate all text into German|c:Text expansion in menus|t:German proofreading',
  ],
  [
    'French localization',
    'S0',
    'All text in French, checked in context.',
    't:Translate all text into French|t:French proofreading',
  ],
  [
    'Polish localization',
    'S0.3',
    'All text in Polish, checked in context.',
    't:Translate all text into Polish|t:Polish proofreading|c:Polish characters in the fonts',
  ],
  [
    'Japanese localization',
    'S0',
    'All text in Japanese, with fonts and line breaking that suit it.',
    't:Translate all text into Japanese|c:Japanese font and line breaking|t:Japanese proofreading',
  ],
  [
    'Crash reporting',
    'S0.5',
    'Crashes reach the team with enough to reproduce them.',
    'c:Crash handler with minidumps|c:Upload on the next start|t:Privacy note',
  ],
  [
    'Analytics events',
    'S0',
    'Where players die and where they quit, by room.',
    'c:Event pipeline|c:Deaths and quits by room|t:Event list',
  ],
  [
    'Console build pipeline',
    'S0.4',
    'Nightly builds for every console, with a message when one breaks.',
    'c:Nightly Switch build|c:Nightly PlayStation build|c:Build notifications',
  ],
  [
    'Memory budget on Switch',
    'S0',
    'Every room within the Switch memory budget.',
    'c:Memory report per room|a:Texture budget per area|c:Unload unused atlases',
  ],
  [
    'Charged heavy attack',
    'S0.3',
    'Hold to charge a heavy attack that breaks guards.',
    'c:Charge and release|a:Charge glow|t:Heavy attack tuning',
  ],
  [
    'Dash attack',
    'S0',
    'A strike at the end of a dash, for players who move a lot.',
    'c:Dash strike|a:Dash strike effect|t:Dash attack tuning',
  ],
  [
    'Festival demo build',
    'S0.6',
    'Fifteen minutes of the first area for the autumn festival.',
    'c:Demo build with a time limit|t:Demo route through the first area|t:Booth instructions',
  ],
  [
    'Trailer capture build',
    'S0',
    'A build for capturing the release trailer.',
    'c:Free camera and hidden HUD|c:Scripted camera paths|t:Trailer shot list',
  ],
  [
    'Press kit',
    'S0',
    'Screenshots, key art, and a fact sheet for the press.',
    't:Twenty screenshots across the areas|a:Key art|t:Fact sheet',
  ],
  [
    'New Game Plus',
    'S0',
    'A second run with the player’s abilities and harder enemies.',
    'c:What carries over|c:Harder enemy variants|t:New Game Plus balance',
  ],
  [
    'Boss rush mode',
    'C0',
    'Every boss in a row, unlocked after the ending.',
    'c:Boss rush sequence|t:Boss rush rewards',
  ],
  [
    'Photo mode',
    'C0',
    'Pause, a free camera, a few filters, and the interface hidden.',
    'c:Free camera|c:Filters and hidden HUD|a:Filter looks',
  ],
  [
    'Speedrun timer',
    'C0.5',
    'An optional timer with splits per area.',
    'c:In-game timer with splits|t:Timer settings text',
  ],
  [
    'Hard mode',
    'C0',
    'More damage and more aggressive enemies, chosen at the start.',
    'c:Enemy damage and aggression scaling|t:Hard mode balance',
  ],
  [
    'Daily challenge',
    'C0',
    'A seeded challenge room every day, with a leaderboard.',
    'c:Seeded challenge rooms|c:Leaderboard|t:Challenge rules',
  ],
  [
    'Music player in the menu',
    'C0',
    'The soundtrack, playable from the main menu after the ending.',
    'c:Music player|t:Track names',
  ],
  [
    'Concept art gallery',
    'C0',
    'Concept art unlocked by collectibles.',
    'c:Gallery unlocks|a:Gallery selection',
  ],
  [
    'Developer commentary',
    'C0',
    'Commentary nodes placed through the game, for a second playthrough.',
    't:Commentary script|c:Commentary nodes in rooms|a:Commentary icon',
  ],
  [
    'Alternate costumes',
    'C0',
    'Three costumes for players who finish the game.',
    'a:Three costumes|c:Costume select',
  ],
  [
    'Lantern colours',
    'C0',
    'Five lantern colours, unlocked by secrets.',
    'a:Five lantern colours|c:Unlock rules',
  ],
];

const POLISH = [
  ['Polish: hit stop on heavy hits', 'D27', 'c:Hit stop by attack weight|t:Tune hit stop'],
  [
    'Polish: lantern flicker when fuel is low',
    'D24',
    'a:Flicker frames|c:Flicker below a quarter of the fuel',
  ],
  [
    'Polish: footstep sounds by surface',
    'D19',
    'a:Footsteps on stone, wood, sand, and ice|c:Surface tags on tiles',
  ],
  ['Polish: camera look-ahead when dashing', 'D16', 'c:Look-ahead on dash|t:Camera feel pass'],
  ['Polish: menu sounds', 'D12', 'a:Move, confirm, and back sounds|c:Menu sound hooks'],
  ['Polish: faster respawn', 'D6', 'c:Respawn under two seconds|t:Check respawn in every area'],
  ['Polish: pickup magnet feel', 'D2', 'c:Magnet radius and easing|t:Pickup feel pass'],
  [
    'Polish: enemy death effects',
    'R',
    'a:Death dissolve effect|c:Death effect hook|t:Death effect review in game',
  ],
  ['Polish: screen transitions', 'S0.5', 'c:Fade and wipe between rooms|a:Transition patterns'],
  ['Polish: damage numbers option', 'S0', 'c:Damage numbers|t:Damage numbers setting text'],
  [
    'Polish: gamepad rumble presets',
    'S0',
    'c:Rumble for hits, dashes, and pickups|t:Rumble feel pass',
  ],
  [
    'Polish: coyote time on moving platforms',
    'S0.5',
    'c:Coyote time relative to the platform|t:Check every moving platform',
  ],
  ['Polish: text speed setting', 'S0', 'c:Text speed option|t:Setting text'],
  [
    'Polish: shop animations',
    'S0',
    'a:Shopkeeper idle and reactions|c:Shop open and close animation',
  ],
  ['Polish: idle animations', 'C0', 'a:Player idle variations|c:Idle after ten seconds'],
  ['Polish: ambient critters', 'C0', 'a:Critters for each area|c:Critters that flee the player'],
  ['Polish: weather on the Stormbreak Coast', 'C0', 'a:Rain and spray|c:Weather cycles'],
  ['Polish: lantern swing physics', 'C0', 'c:Lantern swing with movement|a:Lantern swing frames'],
  ['Polish: title screen parallax', 'C0', 'a:Title screen layers|c:Parallax on the title screen'],
];

const WONT = [
  ['Online co-op', 'Not for this release: the netcode alone would take the rest of the schedule.'],
  ['PvP arena', 'Not the game we are making.'],
  ['Level editor', 'Tempting, but it would need its own tools pass and support.'],
  ['Mod support', 'Revisit after launch if the community asks for it.'],
  ['VR mode', 'A 2D game; nothing to gain.'],
  ['Mobile port', 'Touch controls would not do the combat justice.'],
  ['Battle pass', 'No live service in this game.'],
  ['Procedural dungeons', 'Every room is made by hand, and that is the point.'],
  ['Voice acting for every line', 'Out of budget; key scenes only, if at all.'],
  ['Pet companion', 'Would fight the lantern for attention.'],
  ['Player housing', 'Nice to have in another game.'],
  ['Fishing', 'Every game has fishing. Not this one.'],
];

const NOTES = [
  'Plays well.',
  'Checked on every platform we have.',
  'Good. The last round of tuning did it.',
  'Accepted: reads clearly in play.',
  'Plays well; small notes go to polish.',
  '',
  '',
];

const CATEGORY = { c: 'code', a: 'assets', t: 'content' };
const tasksOf = (spec) => spec.split('|').map((part) => [CATEGORY[part[0]], part.slice(2)]);

function parseFate(fate) {
  if (fate === 'R') return { state: 'review' };
  if (fate[0] === 'D') return { state: 'done', daysAgo: Number(fate.slice(1)) };
  const lane = { M: 'must', S: 'should', C: 'could' }[fate[0]];
  return { state: 'open', category: lane, progress: Number(fate.slice(1)) };
}

// Every item of the game, with what happened to it.
const items = [];
BIOMES.forEach((b, area) =>
  ASPECTS.forEach(([key, title, description, tasks], n) => {
    const fate = parseFate(AREA_FATES[area][n]);
    items.push({
      title: title(b),
      description: description(b),
      tasks: tasks(b),
      // Finished work was a priority; an area's early items were Must Have.
      category: fate.category ?? (area < 5 ? 'must' : 'should'),
      performance: key === 'performance',
      ...fate,
    });
  }),
);
for (const [title, fate, description, spec] of SYSTEMS) {
  const f = parseFate(fate);
  items.push({ title, description, tasks: tasksOf(spec), category: f.category ?? 'must', ...f });
}
for (const [title, fate, spec] of POLISH) {
  const f = parseFate(fate);
  items.push({
    title,
    description: '',
    tasks: tasksOf(spec),
    category: f.category ?? 'should',
    ...f,
  });
}
for (const [title, description] of WONT)
  items.push({ title, description, tasks: [], category: 'wont', state: 'open', progress: 0 });

/** Open items interleaved, so that areas and systems share each lane's priorities. */
function interleave(lists) {
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}
const openIn = (category, pred) =>
  items.filter((i) => i.state === 'open' && i.category === category && pred(i));
const isArea = (i) => BIOMES.some((b) => i.title.startsWith(`${b.name}:`));
const isPolish = (i) => i.title.startsWith('Polish:');
const order = [
  // Finished work first, in the order it was accepted, then what is waiting for review.
  ...items.filter((i) => i.state === 'done').sort((a, b) => b.daysAgo - a.daysAgo),
  ...items.filter((i) => i.state === 'review'),
  ...interleave([openIn('must', (i) => !isArea(i)), openIn('must', isArea)]),
  ...interleave([
    openIn('should', isArea),
    openIn('should', (i) => !isArea(i) && !isPolish(i)),
    openIn('should', isPolish),
  ]),
  ...interleave([
    openIn('could', (i) => !isArea(i) && !isPolish(i)),
    openIn('could', isArea),
    openIn('could', isPolish),
  ]),
  ...openIn('wont', () => true),
];
if (order.length !== items.length) throw new Error('an item was left out of the order');

// Who does what: code is Devin's, art is Dana's, content is Tess's, and some is nobody's yet.
function assigneeFor(category, open) {
  const roll = random();
  if (open && roll < 0.35) return null;
  if (category === 'code') return roll < 0.9 ? 'developer' : 'director';
  if (category === 'assets') return roll < 0.8 ? 'director' : 'developer';
  return roll < 0.8 ? 'tester' : 'developer';
}

// The run ----------------------------------------------------------------------------------------

const as = {
  director: await signIn('director'),
  developer: await signIn('developer'),
  tester: await signIn('tester'),
};
if ((await as.director('GET', '/projects')).some((p) => p.name === PROJECT)) {
  console.log(`"${PROJECT}" exists already; nothing added.`);
  process.exit(0);
}
const project = await as.director('POST', '/projects', {
  name: PROJECT,
  description:
    'A larger sample project: a 2D action-adventure eight months into production, with a few hundred Backlog items and their tasks. For trying GameWeld at the size of a real game.',
});
const p = (path) => `/projects/${project.id}${path}`;
for (const role of ['developer', 'tester'])
  await as.director('POST', p('/members'), { email: `${role}@gameweld.local`, roles: [role] });
const members = (await as.director('GET', p(''))).members;
const userId = Object.fromEntries(members.map((m) => [m.email.split('@')[0], m.userId]));

const labels = {};
for (const [name, color] of [
  ['Performance', 'orange'],
  ['Console', 'blue'],
  ['Accessibility', 'teal'],
  ['Needs art', 'purple'],
])
  labels[name] = (await as.director('POST', p('/labels'), { name, color })).find(
    (l) => l.name === name,
  ).id;

/** The newest entry in the project's history, by id: the SQL tells the phases of the run apart. */
const newestEntry = async () => (await as.director('GET', p('/activity?limit=1')))[0]?.id ?? 0;
const setupEnd = await newestEntry();

const NOW = Date.now();
const DAY = 86_400_000;
const at = (ms) => new Date(Math.round(ms)).toISOString();
/** What the SQL moves back in time, filled in as items are made. */
const stamps = { items: [], tasks: [] };
let taskCount = 0;

for (const [index, item] of order.entries()) {
  const created = await as.director('POST', p('/backlog'), {
    title: item.title,
    description: item.description,
    category: item.category,
  });
  const open = item.state === 'open';
  const tasks = [];
  for (const [category, title] of item.tasks) {
    const who = assigneeFor(category, open);
    // Made by whoever takes it on, so nobody is told about their own work.
    const task = await as[who ?? 'developer']('POST', p(`/backlog/${created.id}/tasks`), {
      category,
      title,
      ...(who ? { assigneeId: userId[who] } : {}),
    });
    tasks.push({ ...task, who });
    taskCount += 1;
  }
  const finish = item.state === 'open' ? Math.floor(tasks.length * item.progress) : tasks.length;
  for (const task of tasks.slice(0, finish))
    await as[task.who ?? 'tester']('POST', p(`/tasks/${task.id}/complete`));
  if (item.state === 'done')
    await as.director('POST', p(`/backlog/${created.id}/accept`), { note: pick(NOTES) });

  // When it all happened: accepted items over the last eight months, open ones made along the way.
  const accepted =
    item.state === 'done' ? NOW - item.daysAgo * DAY - between(1, 8) * 3_600_000 : null;
  const end = accepted ?? NOW - between(0.5, 3) * DAY;
  const start = accepted
    ? accepted - between(18, 45) * DAY
    : NOW - Math.min(245, 20 + (order.length - index) * 1.1 + between(0, 10)) * DAY;
  const doneTimes = tasks
    .slice(0, finish)
    .map(() =>
      accepted ? start + (end - start) * between(0.35, 0.97) : NOW - between(1, 16) * DAY,
    )
    .sort((a, b) => a - b);
  const ready = item.state === 'open' ? null : Math.max(...doneTimes, start + DAY);
  stamps.items.push({
    id: created.id,
    created: at(start),
    updated: at(accepted ?? ready ?? Math.max(start, ...doneTimes)),
    ready: ready && at(ready),
    accepted: accepted && at(accepted),
  });
  tasks.forEach((task, n) =>
    stamps.tasks.push({
      id: task.id,
      created: at(start + (n + 1) * 7 * 60_000),
      completed: n < finish ? at(Math.max(doneTimes[n], start + (n + 2) * 7 * 60_000)) : null,
    }),
  );
  if (index % 20 === 19) console.log(`items: ${index + 1}/${order.length}`);
}
console.log(`backlog: ${order.length} items with ${taskCount} tasks`);
const itemsEnd = await newestEntry();

// Labels, dates, and blocks on the open work --------------------------------------------------------
const backlog = await as.director('GET', p('/backlog'));
const byTitle = Object.fromEntries(backlog.map((i) => [i.title, i]));
const openTasks = [];
for (const item of backlog.filter((i) => i.state === 'open' && i.category !== 'wont'))
  for (const task of await as.developer('GET', p(`/backlog/${item.id}/tasks`)))
    if (!task.completed) openTasks.push({ task, item });
const day = (offset) => new Date(NOW + offset * DAY).toISOString().slice(0, 10);
let touched = 0;
for (const { task, item } of openTasks) {
  const change = {};
  const want = [];
  if (/performance|Switch|load|memory/i.test(`${item.title} ${task.title}`))
    want.push(labels.Performance);
  if (/Switch|PlayStation|Xbox|console|Deck/i.test(`${item.title} ${task.title}`))
    want.push(labels.Console);
  if (/colour-blind|subtitle|caption|assist|flash|remap/i.test(item.title))
    want.push(labels.Accessibility);
  if (task.category === 'assets' && !task.assignee && random() < 0.5)
    want.push(labels['Needs art']);
  if (want.length) change.labelIds = [...new Set(want)];
  if (item.category === 'must' && random() < 0.3) change.dueDate = day(Math.round(between(-6, 21)));
  if (random() < 0.04) {
    change.blocked = true;
    change.blockedReason = pick([
      'Waiting for the dev kit to come back from repair.',
      'Needs the final boss design first.',
      'The composer is away until next week.',
      'Blocked on the room streaming change.',
    ]);
  }
  if (Object.keys(change).length === 0) continue;
  await as.developer('PATCH', p(`/tasks/${task.id}`), { version: task.version, ...change });
  touched += 1;
}
console.log(`open tasks: ${touched} of ${openTasks.length} given labels, dates, or blocks`);

// The Workboard: the next items in priority, with cards in every column ----------------------------
let board = await as.director('POST', p('/boards'), {
  name: 'Sprint 19',
  description: 'Clockwork Quarter content, and the last movement ability.',
});
board = await as.director('POST', p(`/boards/${board.id}/columns`), { name: 'Making' });
board = await as.director('POST', p(`/boards/${board.id}/columns`), { name: 'Check in game' });
while (board.counts.scopeItems < board.scopeLimit && board.nextEligible)
  board = await as.director('POST', p(`/boards/${board.id}/scope`), {
    itemId: board.nextEligible.id,
  });
const column = (name) => board.columns.find((c) => c.name === name);
const cards = Object.values(board.cards).flat();
for (const [n, card] of cards.entries()) {
  const target = n % 5 === 0 ? 'Making' : n % 7 === 0 ? 'Check in game' : null;
  if (target)
    board = await as.developer('POST', p(`/boards/${board.id}/placements/${card.id}/move`), {
      columnId: column(target).id,
    });
}
const doneColumn = board.columns.find((c) => c.kind === 'done');
for (const card of cards.filter((_, n) => n % 9 === 4))
  board = await as.tester('POST', p(`/boards/${board.id}/placements/${card.id}/move`), {
    columnId: doneColumn.id,
  });
console.log(`board: ${board.scope.length} items in scope, ${cards.length} cards`);

// A little conversation ----------------------------------------------------------------------------
const comments = [
  [
    'Double jump',
    'developer',
    'The second jump keeps its own arc now; the float at the top is gone.',
  ],
  ['Double jump', 'director', 'Better. Can the wing effect fade a little sooner?'],
  [
    'Skill tree',
    'tester',
    'Twenty skills is a lot for the first playthrough. Could some unlock later?',
  ],
  [
    'Load times under ten seconds',
    'developer',
    'Switch is at fourteen seconds in the Clockwork Quarter; streaming should get it under ten.',
  ],
  [
    'Opening cinematic',
    'director',
    'Storyboard is in the attachments folder on the drive. Narration still needs a pass.',
  ],
  ['Steam Deck verification', 'tester', 'Glyphs are right; the map legend is too small at 800p.'],
  ['Festival demo build', 'director', 'The festival wants the build by the end of next month.'],
];
for (const [title, who, body] of comments)
  if (byTitle[title]) await as[who]('POST', p(`/backlog/${byTitle[title].id}/comments`), { body });
console.log(`comments: ${comments.length}`);

// The times the API could not set --------------------------------------------------------------------
if (SQL_FILE) {
  const q = (s) => `'${s}'`;
  // The project began a little before its oldest item.
  const began = at(Math.min(...stamps.items.map((s) => Date.parse(s.created))) - 2 * DAY);
  const lines = [
    `-- Moves "${PROJECT}" (${project.id}) back in time; made by scripts/populate-large.mjs.`,
    'BEGIN;',
    `UPDATE projects SET created_at = ${q(began)} WHERE id = ${q(project.id)};`,
    // Making the project, its members, and its labels.
    `UPDATE activity SET created_at = ${q(began)} WHERE project_id = ${q(project.id)} AND id <= ${setupEnd};`,
  ];
  // Only what the Backlog phase recorded moves; later edits, board moves, and comments are recent.
  const inItems = `id > ${setupEnd} AND id <= ${itemsEnd}`;
  for (const s of stamps.items) {
    lines.push(
      `UPDATE backlog_items SET created_at = ${q(s.created)}, updated_at = ${q(s.updated)} WHERE id = ${q(s.id)};`,
    );
    if (s.accepted)
      lines.push(
        `UPDATE acceptances SET accepted_at = ${q(s.accepted)} WHERE item_id = ${q(s.id)} AND invalidated_at IS NULL;`,
      );
    lines.push(
      `UPDATE activity SET created_at = CASE action WHEN 'item.created' THEN ${q(s.created)}::timestamptz` +
        (s.accepted ? ` WHEN 'item.accepted' THEN ${q(s.accepted)}::timestamptz` : '') +
        ` ELSE ${s.ready ? `${q(s.ready)}::timestamptz` : 'created_at'} END` +
        ` WHERE entity_type = 'backlog_item' AND entity_id = ${q(s.id)} AND ${inItems};`,
    );
  }
  for (const s of stamps.tasks) {
    lines.push(
      s.completed
        ? `UPDATE tasks SET created_at = ${q(s.created)}, updated_at = ${q(s.completed)}, completed_at = ${q(s.completed)} WHERE id = ${q(s.id)};`
        : `UPDATE tasks SET created_at = ${q(s.created)} WHERE id = ${q(s.id)};`,
      `UPDATE activity SET created_at = CASE WHEN action = 'task.completed' THEN ${q(s.completed ?? s.created)}::timestamptz ELSE ${q(s.created)}::timestamptz END` +
        ` WHERE entity_type = 'task' AND entity_id = ${q(s.id)} AND ${inItems};`,
    );
  }
  lines.push(
    // The history reads newest first by id, so its ids follow the new times.
    `CREATE TEMP TABLE remap ON COMMIT DROP AS
  SELECT o.id AS old_id, i.id AS new_id
    FROM (SELECT id, row_number() OVER (ORDER BY created_at, id) AS n FROM activity WHERE project_id = ${q(project.id)}) o
    JOIN (SELECT id, row_number() OVER (ORDER BY id) AS n FROM activity WHERE project_id = ${q(project.id)}) i USING (n);`,
    `UPDATE activity SET id = -id WHERE project_id = ${q(project.id)};`,
    `UPDATE activity a SET id = r.new_id FROM remap r WHERE a.id = -r.old_id;`,
    // Setting the project up told the personas about hundreds of things; none of it is news.
    `DELETE FROM notifications WHERE project_id = ${q(project.id)};`,
    'COMMIT;',
  );
  writeFileSync(SQL_FILE, `${lines.join('\n')}\n`);
  console.log(`sql: ${SQL_FILE}, ${lines.length} statements`);
}
console.log(`done: ${BASE}/projects/${project.id}/backlog`);
