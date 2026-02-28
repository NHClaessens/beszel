# Contributing to Beszel

This document describes how to build and run the hub and agent from source so you can test local changes. It assumes you have [Docker](https://docs.docker.com/engine/install/), and to build Beszel-hub you need [Bun](https://bun.sh/).

## Running the hub locally

The hub serves the web UI and embeds the built frontend. You must build the site before building the hub image.

### 1. Build the frontend

From the repository root:

```bash
bun install --no-save --cwd ./internal/site
bun run --cwd ./internal/site build
```

This creates `internal/site/dist`. The hub Dockerfile embeds this directory; `.dockerignore` is set up so `internal/site/dist` is included in the hub build context.

### 2. Build the hub image

```bash
docker build -f internal/dockerfile_hub -t beszel-hub:local .
```

### 3. Run the hub

```bash
docker run --rm -p 8090:8090 -v beszel_data:/beszel_data beszel-hub:local serve --http=0.0.0.0:8090
```

Open http://localhost:8090. On first run you’ll go through setup (admin user, etc.). Note the connection details (port, key) so the agent can register.

---

## Running the agent locally

The agent runs on the host (or in a container) and reports metrics to the hub. To test agent changes, build and run the agent image with your hub URL and token.

### 1. Build the agent image

From the repository root:

```bash
docker build -f internal/dockerfile_agent -t beszel-agent:local .
```

### 2. Run the agent

You need:

- **HUB_URL** – URL of your hub (e.g. `http://192.168.x.x:8090` or `http://host.docker.internal:8090` if the hub runs in Docker on the same machine).
- **KEY** – The hub’s public SSH key (shown in the hub UI when adding a system).
- **TOKEN** – The one-time token shown in the hub when adding a system.

Example (replace values as needed):

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e PORT=45876 \
  -e KEY='ssh-ed25519 AAAA...' \
  -e TOKEN='your-one-time-token' \
  -e HUB_URL='http://192.168.10.88:8090' \
  beszel-agent:local
```

The agent will register with the hub and start sending metrics. You should see the system appear on the dashboard.

### Optional: debug logging

To see debug logs (e.g. container blkio totals, Docker requests):

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -e PORT=45876 \
  -e KEY='...' \
  -e TOKEN='...' \
  -e HUB_URL='...' \
  -e LOG_LEVEL=debug \
  beszel-agent:local
```

---

## Quick reference

| Step           | Hub                                                                                              | Agent                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Build frontend | `bun install` + `bun run build` in `internal/site`                                               | —                                                                                                                      |
| Build image    | `docker build -f internal/dockerfile_hub -t beszel-hub:local .`                                  | `docker build -f internal/dockerfile_agent -t beszel-agent:local .`                                                    |
| Run            | `docker run -p 8090:8090 -v beszel_data:/beszel_data beszel-hub:local serve --http=0.0.0.0:8090` | `docker run -v /var/run/docker.sock:/var/run/docker.sock:ro -e KEY=... -e TOKEN=... -e HUB_URL=... beszel-agent:local` |

After changing **hub or site** code: rebuild the site, then rebuild and rerun the hub image. After changing **agent** code: rebuild and rerun the agent image.
