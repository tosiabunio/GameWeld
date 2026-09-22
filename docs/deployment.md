# Deployment: gameweld.eu

GameWeld runs on an OVH VPS under [Dokploy](https://dokploy.com), which manages the containers,
the database, and HTTPS through Traefik. Every green build of `main` publishes an image to the
GitHub Container Registry and asks Dokploy to roll it out.

gameweld.eu is a development and demonstration instance for showing GameWeld to prospective
users, not production. Its data is sample data that can be rebuilt, so it has no backups yet;
[backup-plan.md](backup-plan.md) describes what to set up before it holds data worth keeping.
(Dokploy calls its default environment "production"; that is only the name.)

## Server

| | |
| --- | --- |
| Host | `146.59.103.109` (IPv6 `2001:41d0:601:1100::9f61`), OVH VPS `vps-df3617b6` |
| System | Ubuntu 26.04 LTS, x86_64, 2 vCPU, 3.7 GB RAM, 38 GB disk |
| Login | `ssh ubuntu@146.59.103.109` with a key; `ubuntu` has passwordless sudo |
| DNS | `gameweld.eu` and `www.gameweld.eu` → `146.59.103.109` (OVH zone; MX records serve mail) |
| Docker | 29.8.1, packages held (`apt-mark hold docker-ce docker-ce-cli docker-ce-rootless-extras`) |
| Dokploy | v0.30.7: services `dokploy` and `dokploy-postgres` in a single-node swarm, container `dokploy-traefik` on ports 80 and 443 |

Docker was installed before running the Dokploy installer, because the installer pins Docker
28.5.0, which has no packages for Ubuntu 26.04. With Docker already present, the installer skips
that step.

### Firewall

- `ufw` denies incoming traffic except SSH (22/tcp), HTTP (80/tcp), and HTTPS (443/tcp and
  443/udp for HTTP/3), for IPv4 and IPv6. This also closes the swarm ports 2377, 7946, and 4789.
- Ports published by Docker bypass `ufw` for IPv4, so the Dokploy panel on port 3000 is dropped
  on the public interface `ens3` by `dokploy-panel-private.service`. That systemd unit inserts
  the rules into `DOCKER-USER` (IPv4 and IPv6) and IPv6 `INPUT`, and runs again whenever Docker
  starts.

### Dokploy panel

The panel is not exposed to the internet. Reach it through an SSH tunnel:

```sh
ssh -N -L 3000:127.0.0.1:3000 ubuntu@146.59.103.109
```

then open <http://localhost:3000>. The first visit registers the administrator.

## Dokploy project

Project **GameWeld**, environment **production**:

| Service | Details |
| --- | --- |
| Database | Postgres `postgres:17-alpine`, service `gameweld-db-tiqbym`, database and user `gameweld`; the password lives only in Dokploy |
| Application | `ghcr.io/tosiabunio/gameweld:latest`, service `gameweld-app-re6cku`, pulled from GHCR with a GitHub token that has only `read:packages` |
| Attachments | Docker volume `gameweld-attachments` mounted at `/data/attachments` |
| Domains | `gameweld.eu` and `www.gameweld.eu`, HTTPS with Let's Encrypt; `www` and plain HTTP redirect permanently to `https://gameweld.eu` |

Application environment:

```sh
APP_ENV=local        # keeps the demo personas; production mode refuses them
AUTH_MOCK=true
SEED_DEMO=true       # seeds the demo project when the database is empty
DATABASE_URL=postgres://gameweld:<password>@gameweld-db-tiqbym:5432/gameweld
PORT=3000
WEB_DIST=/app/apps/web/dist
ATTACHMENTS_DIR=/data/attachments
```

**The instance is open:** anyone who reaches gameweld.eu can sign in as any persona, including a
Game Director. That is deliberate while it is a demonstration instance. To close it, follow
[google-sign-in.md](google-sign-in.md): set `APP_ENV=production`, the Google settings, and
`PUBLIC_URL=https://gameweld.eu`, and drop `AUTH_MOCK` and `SEED_DEMO`.

Let's Encrypt registers without a contact address: Dokploy's placeholder
`test@localhost.com` was removed from `/etc/dokploy/traefik/traefik.yml` (original kept as
`traefik.yml.orig`). Setting a panel domain in Dokploy rewrites that file.

### Sample data

The demo seed creates the Demo project only when the database is empty. It was then filled out
with `scripts/populate-demo.mjs`, which adds backlog items across every lane, tasks with
assignees, board progress (a fuller scope, tasks in each column, one item accepted), comments,
and pictures drawn in the script (covers for eleven items, reference images for seventeen tasks),
through the API as the demo personas. Existing items are skipped, so it is safe to run again; a
second run only gives a picture to a listed item or task that still has none:

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
instance's database:

```sh
node scripts/populate-large.mjs https://gameweld.eu --sql lanternfall.sql
ssh ubuntu@146.59.103.109 'sudo docker exec -i $(sudo docker ps -qf name=gameweld-db-tiqbym) \
  psql -U gameweld -d gameweld -v ON_ERROR_STOP=1 -q' < lanternfall.sql
```

Locally, the second step is
`docker compose exec -T db psql -U gameweld -d gameweld -v ON_ERROR_STOP=1 -q < lanternfall.sql`.

## Continuous deployment

`.github/workflows/ci.yml`:

1. `image` builds the Docker image for every change. On `main` it pushes
   `ghcr.io/tosiabunio/gameweld:sha-<commit>`.
2. `deploy` runs on `main` after `checks` and `image` pass. It tags that image as `latest` and
   connects over SSH as `deploy@146.59.103.109`, with the key in the repository secret
   `DEPLOY_SSH_KEY` and the server's host key pinned in the workflow. Migrations run when the
   application starts.

On the server, that key can do exactly one thing. `~deploy/.ssh/authorized_keys` forces
`command="/usr/local/bin/gameweld-deploy",restrict`: no shell, no tunnels, no forwarding.
Whatever the client asks for, the script runs; it takes a bare commit hash as the deployment's
title and asks Dokploy's local API to deploy the application. The Dokploy panel therefore stays
off the internet. The script authenticates with the Dokploy API key `ci-deploy`, kept in
`/etc/gameweld/dokploy-api-key` (`root:deploy`, mode 640). The `deploy` user has no password and
no sudo.

Deploy by hand, from a machine whose key is allowed for `ubuntu`:

```sh
ssh ubuntu@146.59.103.109 'sudo -u deploy /usr/local/bin/gameweld-deploy'
```

or use **Deploy** on the application in the Dokploy panel.

## Rotating credentials

- **CI key:** generate a new ed25519 key, replace the line in `~deploy/.ssh/authorized_keys`
  (keeping the `command=...,restrict` prefix), and update the `DEPLOY_SSH_KEY` secret.
- **Dokploy API key for the script:** create one in the panel (Settings → Profile → API) with
  rate limiting off, write it to `/etc/gameweld/dokploy-api-key`, and delete `ci-deploy`.

### When the deploy job fails with 401

The script's `curl` got `401 Unauthorized` from Dokploy, which says nothing more, whatever the
reason. A key made without turning rate limiting off gets Dokploy's default of 10 requests per
24 hours, and a busy day of pushes uses that up; the limit resets only after 24 hours without an
accepted request. The panel cannot show or edit a key's settings, but Dokploy's database can show
them (the stored key hash is left out):

```sh
ssh ubuntu@146.59.103.109 'sudo docker exec $(sudo docker ps -qf name=dokploy-postgres) \
  psql -U dokploy -d dokploy -Atc "select jsonb_pretty(to_jsonb(a) - '"'"'key'"'"') from apikey a"'
```

Look at `rate_limit_enabled` with `request_count` against `rate_limit_max`, at `expires_at`,
`remaining`, and `enabled`. Then rotate the key as above. The tested image is already `latest`,
so **Deploy** in the panel, or re-running the failed job, rolls it out.
- **GHCR token:** create a classic token with only `read:packages` and update the application's
  registry password in Dokploy (Application → General → Provider).
