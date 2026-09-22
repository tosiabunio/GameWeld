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

## gameweld.eu

gameweld.eu is a development and demonstration instance for showing GameWeld to prospective
users, not production. Its data is sample data that can be rebuilt, so it has no backups yet;
[backup-plan.md](backup-plan.md) describes what to set up before it holds data worth keeping.

It runs on a VPS under [Dokploy](https://dokploy.com), which manages the application and
database containers and HTTPS through Traefik, with the demonstration environment above. The
Dokploy panel is not exposed to the internet, and the firewall admits only SSH, HTTP, and HTTPS.

## Sample data

The demo seed creates the Demo project only when the database is empty.
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
