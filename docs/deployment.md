# Deployment

How to run GameWeld on a server, how the demonstration instance at gameweld.eu is set up in
general terms, and how its sample data and continuous deployment work. Host addresses, logins,
and service names of gameweld.eu are kept out of this repository.

## What an instance needs

- The image `ghcr.io/tosiabunio/gameweld`, published from every green build of `main` as
  `sha-<commit>` and `latest`. There is no tagged release yet.
- PostgreSQL (17 is what CI and gameweld.eu use).
- A persistent volume for attachments.
- A reverse proxy with HTTPS in front of it. Claude Code installs the GameWeld plugin only over
  HTTPS ([api.md](api.md)).

Migrations run when the application starts.

## Environment

For a team, with sign-in by Google and invitations ([google-sign-in.md](google-sign-in.md)):

```sh
APP_ENV=production
DATABASE_URL=postgres://gameweld:<password>@<database host>:5432/gameweld
PORT=3000
WEB_DIST=/app/apps/web/dist
ATTACHMENTS_DIR=/data/attachments
PUBLIC_URL=https://gameweld.example.com
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
INITIAL_ADMIN_EMAIL=you@example.com
```

For a demonstration instance like gameweld.eu, with the persona sign-in and the Demo project:

```sh
APP_ENV=local        # keeps the demo personas; production mode refuses them
AUTH_MOCK=true
SEED_DEMO=true       # seeds the demo project when the database is empty
DATABASE_URL=postgres://gameweld:<password>@<database host>:5432/gameweld
PORT=3000
WEB_DIST=/app/apps/web/dist
ATTACHMENTS_DIR=/data/attachments
```

**Such an instance is open:** anyone who reaches it can sign in as any persona, including a Game
Director. To close it, follow [google-sign-in.md](google-sign-in.md): set `APP_ENV=production`,
the Google settings, and `PUBLIC_URL`, and drop `AUTH_MOCK` and `SEED_DEMO`.

### The demo beside teams

One instance can hold both: the open demo, and teams who sign in with Google and see only their
own projects. Add the Google settings from [google-sign-in.md](google-sign-in.md) to the
demonstration environment, and let only admins start team projects:

```sh
PUBLIC_URL=https://gameweld.example.com
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
INITIAL_ADMIN_EMAIL=you@example.com
PROJECT_CREATORS=admins   # only admins start team projects; the default is everyone signed in
```

The sign-in page then offers Google above the personas. The two never mix:

- **A project a persona creates is a demo project,** as are the seeded ones. It takes only
  personas as members, so nobody gets into the instance through an invitation from the demo.
- **A team project never takes a persona,** so no visitor can see into it. Its members see each
  other in the member picker, and nobody else.
- **The admin starts a team project for its Game Director:** **New project**, with the director's
  address. They are added, or invited if they have not signed in yet, and the admin does not join
  the project. The director then invites the team (**Project settings → Members**). Leaving the
  address empty makes the admin its Game Director instead.
- **No persona is an admin,** so the account with `INITIAL_ADMIN_EMAIL` becomes one at its first
  sign-in.
- **A demo reset** (below) replaces the demo projects and the personas, and nothing else.

Session cookies are marked `Secure` whenever `PUBLIC_URL` is HTTPS.

Once teams keep their work on an instance, it holds data worth keeping: set up backups first, as
[backup-plan.md](backup-plan.md) describes for gameweld.eu.

## gameweld.eu

gameweld.eu shows GameWeld to prospective users through the open demo, and teams keep their
work beside it. Its database and attachments are backed up every 12 hours to Cloudflare R2
([backup-plan.md](backup-plan.md)).

It runs on a VPS under [Dokploy](https://dokploy.com), which manages the application and
database containers and HTTPS through Traefik, with the demonstration environment above. The
Dokploy panel is not exposed to the internet, and the firewall admits only SSH, HTTP, and HTTPS.

## Sample data

The demo seed creates the personas and the Demo project when there are no personas yet.
`scripts/populate-demo.mjs` then fills it out: backlog items across every lane, tasks with
assignees, board progress (a fuller scope, tasks in each column, one item accepted), comments,
and pictures drawn in the script, through the API as the demo personas. Existing items are
skipped, so it is safe to run again; a second run only gives a picture to a listed item or task
that still has none:

```sh
node scripts/populate-demo.mjs https://gameweld.eu
```

A second project, **Lanternfall**, shows GameWeld at the size of a real production: about 175
Backlog items with some 600 tasks, eight months of accepted work, more than fifty items in
Should Have, and an active Workboard. `scripts/populate-large.mjs` makes it through the API, as
the demo personas, and stops if the project exists. The API records everything as happening now,
so with `--sql` the script also writes a transaction that moves the project's times back: when
items were made and accepted, when tasks were completed, the history in that order, and no
notifications from the setup. It touches only that project's rows, and is applied to the
instance's database with `psql`:

```sh
node scripts/populate-large.mjs <instance URL> --sql lanternfall.sql
psql <database URL> -v ON_ERROR_STOP=1 -q < lanternfall.sql
```

Locally, the second step is
`docker compose exec -T db psql -U gameweld -d gameweld -v ON_ERROR_STOP=1 -q < lanternfall.sql`.

## Resetting to the sample data

Visitors change the demo, so it can go back to its sample data on a schedule. Set
`DEMO_RESET_HOURS` beside the demonstration environment above:

```sh
DEMO_RESET_HOURS=24  # back to the sample data every 24 hours
```

Resets fall on whole multiples of the interval counted from midnight UTC, whenever the
application was started: `24` is every midnight UTC, `6` is 00:00, 06:00, 12:00, and 18:00 UTC.
It must be a whole number of hours, it needs `SEED_DEMO=true` and `AUTH_MOCK=true`, and a
production configuration that sets it is refused at startup.

At each reset the application itself deletes the demo projects and the personas, with their
attachment files and pictures, seeds, runs `scripts/populate-demo.mjs` and
`scripts/populate-large.mjs` against itself, and applies Lanternfall's SQL, so the demo ends up
as the steps above leave it. Team projects and their people are not touched. It takes about ten
seconds. Meanwhile the API answers personas and persona sign-ins from outside the container
with 503 and `Retry-After`, while teams carry on; persona sessions end with the personas, so
visitors pick one again afterwards. A reset that fails is logged (`demo reset failed`), and the
next one is still attempted on time.

The sign-in page tells visitors how often the data is reset and when next, and the MCP tool
`list_projects` returns the time as `demoResetAt`, so an assistant can warn before work that
would be lost. Locally, `DEMO_RESET_HOURS=1 make up` tries it.

## Continuous deployment

`.github/workflows/ci.yml`:

1. `image` builds the Docker image for every change. On `main` it pushes
   `ghcr.io/tosiabunio/gameweld:sha-<commit>`.
2. `deploy` runs on `main` after `checks` and `image` pass. It tags that image as `latest` and
   connects over SSH to the server, which asks Dokploy to deploy the application.

The job takes three repository secrets; without `DEPLOY_SSH_KEY` it only tags the image:

| Secret | Holds |
| --- | --- |
| `DEPLOY_SSH_KEY` | The private key of the server's `deploy` user |
| `DEPLOY_HOST` | The server's address |
| `DEPLOY_HOST_KEY` | The server's SSH host key (`ssh-ed25519 AAAA…`), pinned so the key is only ever offered to that server |

On the server, that key can do exactly one thing: its `authorized_keys` entry forces a single
deploy script with `restrict`, so it has no shell, no tunnels, and no forwarding. The script
calls Dokploy's local API, so the panel stays off the internet. The `deploy` user has no password
and no sudo.
