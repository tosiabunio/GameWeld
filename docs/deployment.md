# Deployment: gameweld.eu

GameWeld runs on an OVH VPS under [Dokploy](https://dokploy.com), which manages the containers,
the database, and HTTPS through Traefik. Every green build of `main` publishes an image to the
GitHub Container Registry and asks Dokploy to roll it out.

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

## Continuous deployment

`.github/workflows/ci.yml`:

1. `image` builds the Docker image for every change. On `main` it pushes
   `ghcr.io/tosiabunio/gameweld:sha-<commit>`.
2. `deploy` runs on `main` after `checks` and `image` pass. It tags that image as `latest` and,
   when the repository secret `DOKPLOY_DEPLOY_WEBHOOK` is set, calls Dokploy's deploy webhook,
   which pulls `latest` and restarts the application. Migrations run when the application
   starts.

The repository is private, so Dokploy pulls from the registry with a GitHub token that has only
the `read:packages` scope.
