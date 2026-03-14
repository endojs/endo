# Daemon Docker Self-Hosting

| | |
|---|---|
| **Created** | 2026-03-02 |
| **Updated** | 2026-03-02 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Endo daemon currently runs only as a local process managed by the
Familiar (Electron shell) or manually via the CLI. There is no supported
way to run a daemon as an always-on server — the kind of setup where
someone rents a VPS, deploys a container, and has their daemon available
24/7 for remote control.

Self-hosting requires:

1. **A container image.** A Docker image that bundles the daemon, its
   bundled worker, and the CLI, with appropriate defaults for headless
   operation.
2. **State persistence.** The daemon's state directory must survive
   container restarts.
3. **Network exposure.** The gateway's HTTP/WebSocket endpoint must be
   reachable from outside the container, with TLS termination handled
   either by the daemon or a reverse proxy.
4. **Remote authentication.** The gateway currently rejects non-localhost
   connections. A self-hosted daemon must accept authenticated remote
   connections. (See [gateway-bearer-token-auth](gateway-bearer-token-auth.md)
   for the authentication design.)

## Design

### Docker image

The image is based on a Node.js LTS base and contains the pre-built
daemon bundle, worker bundle, and CLI bundle — the same artifacts the
Familiar ships.

```dockerfile
FROM node:22-slim

WORKDIR /opt/endo

# Copy pre-built bundles
COPY bundles/ ./bundles/

# Copy entrypoint
COPY docker-entrypoint.sh ./

# State directory — mount a volume here
VOLUME /data/endo

# Gateway port
EXPOSE 8920

ENV ENDO_STATE=/data/endo
ENV ENDO_ADDR=0.0.0.0:8920

ENTRYPOINT ["./docker-entrypoint.sh"]
```

The entrypoint script starts the daemon in foreground mode:

```bash
#!/bin/bash
set -eu

# Initialize state directory if needed
if [ ! -d "$ENDO_STATE/state" ]; then
  node bundles/endo-cli.cjs init --state "$ENDO_STATE"
fi

exec node bundles/endo-daemon.cjs \
  --state "$ENDO_STATE" \
  --addr "$ENDO_ADDR"
```

### State persistence

The daemon's state directory (`$ENDO_STATE`) contains:

- `state/` — formula store (formula graphs, pet names, message logs)
- `keys/` — agent keypairs (256-bit identifiers)
- `worker/` — worker process logs

This directory is exposed as a Docker volume. Users mount a host
directory or named volume:

```bash
docker run -d \
  -v endo-state:/data/endo \
  -p 8920:8920 \
  endojs/daemon:latest
```

### Network binding

The daemon binds to `0.0.0.0:8920` inside the container (overriding the
default `127.0.0.1:8920`). The user maps the port to their host or
configures their reverse proxy to forward to it.

**TLS termination** is handled externally. The daemon speaks plain
HTTP/WebSocket inside the container. Users place a reverse proxy (nginx,
Caddy, Traefik, cloud load balancer) in front for TLS. This is the
standard Docker pattern and avoids bundling certificate management into
the daemon.

For users who want TLS without a separate proxy, a future enhancement
could add `--tls-cert` and `--tls-key` flags to the daemon, but this is
not required for the initial Docker image.

### Remote authentication

The gateway must accept remote connections authenticated by bearer token.
See [gateway-bearer-token-auth](gateway-bearer-token-auth.md) for the
full design. In Docker mode, the `ENDO_GATEWAY_REMOTE=true` environment
variable enables remote authentication.

### Bundled agents (optional)

If the Familiar bundled agents design is implemented, the Docker image
can also include Lal and Fae bundles:

```dockerfile
# Optional: bundled AI agents
COPY bundles/endo-lal.cjs ./bundles/
COPY bundles/endo-fae.cjs ./bundles/

ENV ENDO_LAL_PATH=/opt/endo/bundles/endo-lal.cjs
ENV ENDO_FAE_PATH=/opt/endo/bundles/endo-fae.cjs
```

This gives self-hosted users the same out-of-the-box AI agent experience
as Familiar users, with form-based provisioning of API keys.

### Docker Compose example

```yaml
version: '3.8'

services:
  endo:
    image: endojs/daemon:latest
    ports:
      - "8920:8920"
    volumes:
      - endo-state:/data/endo
    environment:
      - ENDO_GATEWAY_REMOTE=true
    restart: unless-stopped

  # Optional: TLS reverse proxy
  caddy:
    image: caddy:2
    ports:
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
    depends_on:
      - endo

volumes:
  endo-state:
```

### Chat UI hosting

A self-hosted daemon should also serve the Chat UI. The gateway already
serves static files; the Docker image includes the Chat bundle:

```dockerfile
COPY bundles/endo-chat/ ./bundles/endo-chat/
```

When a user navigates to `https://my-daemon.example.com/`, the gateway
serves the Chat UI. The user appends their agent ID to the URL anchor
(`#agent=<id>`) to authenticate. See
[gateway-bearer-token-auth](gateway-bearer-token-auth.md).

### Build pipeline

The Docker image is built from the same bundles that the Familiar
packages. The build script:

1. Runs the existing `packages/familiar/scripts/bundle.mjs` to produce
   all CJS bundles.
2. Copies bundles into a Docker build context.
3. Builds the image with `docker build`.

```bash
# In CI or local build
cd packages/familiar && yarn bundle
mkdir -p docker/bundles
cp bundles/*.cjs docker/bundles/
cp -r ../chat/dist docker/bundles/endo-chat
docker build -t endojs/daemon:latest docker/
```

## Files Modified

| File | Change |
|------|--------|
| `docker/Dockerfile` | New — Docker image definition |
| `docker/docker-entrypoint.sh` | New — entrypoint script |
| `docker/docker-compose.yml` | New — example compose file |
| `packages/daemon/src/daemon-node.js` | Add `--addr` flag for bind address override |
| `packages/daemon/src/gateway.js` | Support `ENDO_GATEWAY_REMOTE` for remote auth mode |

## Design Decisions

1. **External TLS.** The daemon does not handle TLS itself. This keeps
   the daemon simple and follows Docker conventions. Users who want
   HTTPS use a reverse proxy, which also handles certificate renewal.

2. **Same bundles as Familiar.** The Docker image reuses the Familiar's
   bundle pipeline. No separate build system. This ensures parity
   between the desktop and server deployments.

3. **Volume for state.** Docker volumes are the standard persistence
   mechanism. Named volumes survive container recreation; bind mounts
   give users direct access to the state directory for backup.

4. **`0.0.0.0` binding.** Inside Docker, binding to localhost makes the
   gateway unreachable from outside the container. The default bind
   address in Docker mode is `0.0.0.0`.

## Related Designs

- [gateway-bearer-token-auth](gateway-bearer-token-auth.md) — remote
  authentication for the gateway, required for Docker self-hosting.
- [familiar-bundled-agents](familiar-bundled-agents.md) — bundled Lal/Fae
  agents, optionally included in the Docker image.
- [familiar-daemon-bundling](familiar-daemon-bundling.md) — bundle
  pipeline that produces the CJS bundles used by the Docker image.
