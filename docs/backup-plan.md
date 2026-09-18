# Backup plan for gameweld.eu (deferred)

**Status: not implemented, on purpose.** gameweld.eu is a development and demonstration
instance for showing GameWeld to prospective users, not production. Everything on it can be
rebuilt: a fresh database gets the Demo project from the seed, and
`node scripts/populate-demo.mjs https://gameweld.eu` adds the sample work (see
[deployment.md](deployment.md)). Losing the server today costs a redeploy, not data.

Put this plan in place before the instance holds data someone would miss: real accounts once
Google sign-in lands, a pilot team's work, or anything entered during a demo that should outlive
it.

## What to protect

| Data | Where it lives | Notes |
| --- | --- | --- |
| Database | Dokploy Postgres `gameweld-db-tiqbym`, database `gameweld` | Projects, backlog, tasks, boards, history, users |
| Attachments and pictures | Docker volume `gameweld-attachments` (`/data/attachments`) | Originals are needed; cover renditions (`*.cover-*`) are regenerated on request |
| Dokploy's own configuration | Dokploy's internal database | Application, domains, environment, registry credentials |
| Server setup | The VPS | Rebuildable from [deployment.md](deployment.md): Docker, Dokploy, `ufw`, the panel firewall unit, the `deploy` user |

## The plan

### 1. Off-site copies of the data, made by Dokploy (the core)

Dokploy v0.30.7 on the server schedules both kinds of backup to S3-compatible storage, with a
retention count and failure notifications.

| What | Schedule | Keep |
| --- | --- | --- |
| Postgres dump | daily at 03:00 | 14 |
| Attachments volume | daily at 03:15 | 14 |
| Dokploy configuration | weekly | 4 |

The volume backup runs after the dump, so every file the dump refers to is in the copy; at
worst it holds a few files deleted in between, which is harmless. Daily copies lose at most a
day. Dumps are a few megabytes, so the database can go every six hours once a team works on the
instance.

In Dokploy: add an S3 destination (Settings → S3 Destinations), then a backup on the database
service and a volume backup on the application, both pointing at it. Through the API these are
`destination.create`, `backup.create`, and `volumeBackups.create`.

### 2. Storage with another provider

Keep the copies outside OVH, so they survive a problem with the account as well as the server.
At this size any of these costs next to nothing:

- **Cloudflare R2** (recommended): 10 GB free, no fees for downloading during a restore.
- **Backblaze B2**: similar price, simple.
- **OVH Object Storage in another region**: one provider, protects against losing the server
  but not the account.

The bucket stays private, and the access key is limited to that bucket. Dokploy does not
encrypt backups on its side, so the key is what protects them.

### 3. Alerts when a backup fails

A backup that silently stopped is worse than none. Dokploy notifies on database and volume
backup failures by email, Discord, Slack, Telegram, ntfy, and others.

### 4. A rehearsed restore

The implementation plan's Phase 8 already asks for a restore rehearsed on a fresh host.

- `make restore`: fetch the latest backup and load it into the local stack. This also gives a
  copy of the instance's data for local work.
- A one-time restore into a fresh Dokploy project, written up step by step here.
- Repeat the rehearsal every quarter.

### 5. Optional: OVH automated VPS backup

A few euros a month buys a daily snapshot of the whole machine, including Docker, Dokploy, the
firewall, and every setting. It restores the server in minutes instead of an hour of setup. It
complements the off-site copies but does not replace them: the snapshots stay with OVH, and they
capture the database as if power had been cut.

## Decisions to make when this is picked up

- Where the copies go (section 2); then create the bucket and a key limited to it.
- Which channel receives failure alerts (section 3).
- Whether to enable OVH's VPS backup (section 5), which is switched on in the OVH control panel.
- Whether the schedule and retention in section 1 fit how the instance is used by then.
