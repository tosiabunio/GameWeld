# Backups of gameweld.eu

**Status: in place since 29 September 2026.** gameweld.eu keeps teams' work beside the open
demo ([deployment.md](deployment.md#the-demo-beside-teams)), so its data is worth keeping. The
demo itself can always be rebuilt; the backups are for the teams.

## What is protected

| Data | Where it lives | Backed up |
| --- | --- | --- |
| Database | Dokploy Postgres, database `gameweld` | Yes, as a dump |
| Attachments and pictures | Docker volume `gameweld-attachments` (`/data/attachments`) | Yes |
| Dokploy's own configuration | Dokploy's internal database | No: rebuildable from the operator's notes |
| Server setup | The VPS | No: rebuildable from the operator's notes |

## How it works

[Duplicati](https://duplicati.com), installed on the server as a service, runs a job every
12 hours:

1. Before each run, a script dumps the database from its container (`pg_dump`, custom format)
   into a directory only root can read. It uses the container's own credentials, so no password
   is stored for it. If the dump fails, the job fails, rather than uploading an old dump.
2. The job uploads that dump and the attachments volume, encrypted with AES-256 before they leave
   the server, to a private **Cloudflare R2** bucket: outside OVH, so the copies survive a problem
   with the server or the account. The key it uses can reach only that bucket.
3. Duplicati keeps versions incrementally: one a day for a week, one a week for a month, and one
   a month for a year (`1W:1D,4W:1W,12M:1M`).

The data is a few megabytes, well inside R2's free 10 GB, and restoring costs nothing, since R2
does not charge for downloads.

The dump, not the database's files, is what is copied: files copied while Postgres runs may not
restore, a dump always does.

### R2 settings in Duplicati

R2 is reached as **S3 Compatible** storage at `<account id>.r2.cloudflarestorage.com`. Duplicati's
default AWS library does not work with R2 (its uploads fail with `STREAMING-AWS4-HMAC-SHA256-PAYLOAD
not implemented`, then with `You can only specify one non-default checksum at a time`), so the
destination's advanced options set `s3-client=minio`.

## What to keep outside the server

Without these, the copies in R2 cannot be restored. Both belong in the operator's password
manager:

- the job's **encryption passphrase**;
- the R2 **access key** of the bucket, or access to the Cloudflare account to make a new one.

## Restoring

In Duplicati: **Restore → GameWeld**, pick a version, and restore to a directory. The dump is
loaded into an empty database with
`pg_restore --clean --if-exists --no-owner -d <database URL> gameweld.dump`, and the attachments
go back into the volume. Without the server, Duplicati on any machine restores from R2 with the
passphrase and the key (**Restore → Direct restore from backup files**).

A test restore on 29 September 2026 brought back a dump identical to the one on the server, which
`pg_restore` reads, and every attachment. Repeat it every quarter, and after changing the job.

## Still open

- **Alerts when a backup fails.** Duplicati can report each run by e-mail or to an address such as
  ntfy; until that is set, a failure shows only in its web interface.
- **OVH automated VPS backup.** A few euros a month buys a daily snapshot of the whole machine,
  restoring the server in minutes instead of an hour of setup. It complements the copies in R2
  but does not replace them: the snapshots stay with OVH.
