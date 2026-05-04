# @endo/genie

A Claw-like AI Agent framework for the Endo hardened JavaScript project.

## Overview

`@endo/genie` provides a complete system for building autonomous agents with:
- **Modular Tool System** - Extensible tools with security constraints
- **Memory Integration** - Persistent knowledge storage and search
- **Heartbeat Execution** - Autonomous task automation
- **System Prompt Builder** - LLM-ready prompts with workspace context

## Quick Start

```javascript
import { systemBuilder } from '@endo/genie';

// Build system prompt for your agent
const systemPrompt = systemBuilder({
  identity: 'You are an autonomous JavaScript developer assistant',
  soul: 'You help developers write secure, maintainable code',
  memory: './MEMORY.md',
  tools: './src/tools/',
  heartbeatPath: './HEARTBEAT.md',
});

console.log(systemPrompt);
```

## Daemon bootstrap (`setup.js`)

The genie ships with a `setup.js` script that provisions the genie
guest, mints supporting host-side capabilities, and watches the inbox
for the configuration form.
Run it via `endo run --UNCONFINED setup.js --powers @agent` and tune
its behaviour with the following environment variables:

| Variable          | Purpose                                                                                                                                                                                                                                                  |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `GENIE_MODEL`     | Model spec (e.g. `ollama/llama3.2`) auto-submitted into the configuration form. When absent the form is left for manual submission.                                                                                                                      |
| `GENIE_WORKSPACE` | Host filesystem path to the workspace directory the daemon should mount on the agent's behalf. When provided, `setup.js` mints a `workspace-mount` Mount cap on the host and introduces it into the genie guest as `workspace`. Omit to keep the legacy "workspace = host cwd, no slice" code path during rollout. |
| `GENIE_NAME`      | Pet name for the first agent guest. Defaults to `main-genie`.                                                                                                                                                                                            |

The slice's backend selector and network profile are not (yet) exposed
as env vars; they live on the **configuration form** the genie guest
emits on first boot.  The form fields are:

| Form field | Allowed values                                                                                            | Default          | Effect                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `backend`  | `auto` \| `bwrap` \| `podman` \| `lima` \| `containerization` \| `wsl`                                    | `auto`           | Selects the sandbox driver.  `auto` picks the first available driver reported by `E(sandboxes).listBackends()` (bwrap before podman). |
| `network`  | `none` \| `private` \| `host-loopback` \| `host-lan` \| `host-net`                                        | `private`        | Network profile applied to the slice; see [§ Network profile expectations](#network-profile-expectations) below.                   |
| `rootfs`   | `host-bind` \| `minimal` \| `oci:<ref>` \| `<pet-name>` (Mount cap introduced into the agent's namespace) | `host-bind`      | Sandbox rootfs; see [§ Rootfs form-field shapes](#rootfs-form-field-shapes) below.  `oci:<ref>` requires `backend: podman`.        |

`setup.js` only auto-submits `name`, `model`, and `workspace`.
Operators tuning `backend`, `network`, or `rootfs` answer the form
by hand (`endo inbox` → submit) on first boot; the fields are
persisted by the genie guest formula and survive daemon restarts.

`setup.js` also mints a `sandbox-factory` capability via the
`@endo/sandbox` plugin's `make-unconfined` entry point (see
[`packages/sandbox/README.md`](../sandbox/README.md)) and introduces
it into the genie guest as `sandboxes`.
Both `workspace` and `sandboxes` lookups in `main.js` are guarded with
structured-error fallbacks so partial rollouts surface clearly rather
than silently dropping back to direct host spawning.

Inside a sandbox slice the workspace surfaces at the slice-internal
path `/workspace`; the genie agent should `chdir` there before running
tool calls.
See [`TODO/44_genie_sandbox_workspace_slice.md`](../../TODO/44_genie_sandbox_workspace_slice.md)
for the cwd plumbing.

## Sandboxed workspace

The daemon-hosted genie can run its `bash` / `exec` / `git` tools
inside a confined sandbox slice rather than spawning straight onto the
host.
The slice is minted by [`@endo/sandbox`](../sandbox/README.md) and
GC-pinned by `main-genie`; cancellation tears down the bwrap (or
podman) subprocess and the scratch upper layer along with the agent.

### Host prerequisites

The slice driver shells out to an external sandbox tool.
Install one before kicking off `setup.js`:

```sh
sudo apt install bubblewrap        # Debian / Ubuntu
sudo dnf install bubblewrap        # Fedora
# OR, for the OCI rootfs path:
sudo apt install podman            # rootless podman 5.x
```

Then verify the binary is on PATH and the kernel cooperates:

```sh
bwrap --version                                            # must succeed
cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null # must be 1 on Debian-derived
```

The sandbox plugin's full operational matrix (kernel features,
seccomp, cgroup v2 delegation, podman rootless prerequisites) lives
in [`packages/sandbox/README.md`](../sandbox/README.md) §
"Operational prerequisites".

### Slice vs. dev-repl

`dev-repl.js` and `main.js` share the same agent loop and tool
registry, but they differ in **where** the command tools execute:

| Surface                          | Spawn target            | Workspace path seen by `bash` | Network                    |
| -------------------------------- | ----------------------- | ----------------------------- | -------------------------- |
| `dev-repl.js` (interactive host) | `child_process.spawn`   | host `--workspace` flag       | unfiltered host network    |
| `main.js` (daemon, no factory)   | `child_process.spawn`   | host `GENIE_WORKSPACE` path   | unfiltered host network    |
| `main.js` (daemon, with factory) | `slice.spawn` via bwrap | `/workspace` (bind-mounted)   | per `GENIE_NETWORK` profile |

The "daemon, no factory" row is the legacy direct-spawn path that
remains available during rollout.
It triggers automatically when `setup.js` cannot mint a
`sandbox-factory` (no driver available, plugin not loaded, etc.).
The "agent ready" announcement reports `backend: (host),
network: (host)` so operators can grep for the mode in effect.

When a `sandbox-factory` *is* present, `setup.js` requires
`GENIE_WORKSPACE` and the agent refuses to start without a slice —
the security boundary is binary, never a silent fall-through to host
spawning (PLAN § "Security boundary clarity").

### Workspace form-field shapes

The configuration form's `workspace` field accepts two shapes:

| Form value                       | Behaviour                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absolute host path (e.g. `/srv/genie-ws`) | Legacy.  `spawnAgent` mints a fresh per-agent Mount via `E(host).provideMount(path, '${name}-workspace')`, so the daemon ends up with one `workspace-mount` from `setup.js` plus one `${name}-workspace` per agent.                                                            |
| Pet name already introduced into the agent's namespace (e.g. `workspace`) | Recommended.  `spawnAgent` resolves the cap via `E(agentGuest).lookup(petName)`, validates the `MountInterface` surface, and reuses it.  All agents share the single `workspace-mount` minted by `setup.js`; no per-agent mount is created.                                     |

`setup.js` auto-submits `workspace: 'workspace'` (the pet name) when
`GENIE_WORKSPACE` was set at boot, since both the genie guest and the
agent guest already have `workspace-mount` introduced under that pet
name.
Operators submitting the form by hand can pass either shape.

When the form value starts with `/` (POSIX-absolute path) it is
treated as a host path and flows down the legacy `provideMount` path;
otherwise it is treated as a pet name and resolved through
`E(agentGuest).lookup(...)`, with the result rejected by a structured
error if it does not expose the `MountInterface` method surface.

### Rootfs form-field shapes

The configuration form's `rootfs` field selects the userland tree the
slice's `bwrap` (or `podman`) driver mounts as `/`.  Four shapes are
accepted:

| Form value                                          | Backend constraints                | Behaviour                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host-bind` (default)                               | `bwrap`, `podman`                  | Bind-mounts the host's `/usr` / `/etc` / `/lib` etc. read-only.  The Flatpak pattern; same byte-image as the host but read-only and inside a fresh mount namespace.    |
| `minimal`                                           | `bwrap`, `podman`                  | Backend-supplied empty / busybox rootfs.  Caller must supply their own bin dirs via additional `mounts` if the agent needs more than busybox.                          |
| `oci:<ref>` (e.g. `oci:docker.io/library/alpine:3.19`) | `podman` only (bwrap rejects)   | Materialised from an OCI image reference.  Podman pulls the image into the user's container storage on first use.                                                     |
| `<pet-name>` (e.g. `rootfs-mount`)                  | `bwrap`, `podman`                  | Resolves via `E(agentGuest).lookup(petName)` to a Mount cap rooted at a userland tree.  The cap is validated against `MountInterface` and used as the slice's rootfs. |

Unlike the `workspace` field, `rootfs` has no legacy host-path branch;
values that don't match a recognised keyword or `oci:<ref>` shape are
treated as pet names and resolved against the agent guest's namespace.
A typo surfaces as a structured `Error creating agent: …` reply on the
configuration form (and in the daemon log) listing the methods the
looked-up cap exposed, mirroring the `workspace` pet-name validation.

`setup.js` does **not** auto-mint a `rootfs` Mount cap.  Operators
wanting the pet-name path mint and introduce one before submitting
the form:

```sh
# 1. Mint a Mount cap at the host directory holding the rootfs tree
#    (must contain `/usr`, `/lib`, `/bin`, etc.) and introduce it
#    under a stable pet name in the genie guest's namespace.
endo make-mount /srv/genie-rootfs rootfs-mount
endo introduce setup-genie rootfs-mount rootfs-mount

# 2. Submit the configuration form by hand and pass the same pet
#    name as the `rootfs` field value (alongside `backend: podman`
#    or `bwrap` — both are compatible with the Mount-cap shape).
endo inbox                       # find the pending form's number
endo submit <form#> name=main-genie model=ollama/llama3.2 \
  workspace=workspace rootfs=rootfs-mount backend=bwrap
```

The "agent ready" announcement renders the rootfs as
`pet-name:<petName>` so operators can grep the daemon log for which
cap a slice was minted from.

### Network profile expectations

`GENIE_NETWORK` (or the `network` form field) maps directly to
[`@endo/sandbox`'s network profiles](../sandbox/README.md#network-profiles).
Defaults to `private`.
Concretely:

| Profile         | Reachable                                        | Blocked                                                  |
| --------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `none`          | nothing (loopback only inside slice)             | everything off-slice                                     |
| `private`       | public Internet via NAT'd egress                 | RFC 1918, CGNAT, link-local, host loopback, VPN ranges   |
| `host-loopback` | host `127.0.0.0/8` / `::1`                       | Internet, LAN (operator-installed firewall enforces)     |
| `host-lan`      | RFC 1918 LAN + loopback                          | public Internet (operator-installed firewall enforces)   |
| `host-net`      | everything the host can reach                    | nothing — explicit opt-in only                           |

`private` is recommended: the genie can fetch from the public
Internet (model APIs, package registries) but cannot reach the Endo
daemon over loopback or pivot onto the operator's LAN.
The blocklist for `private` is exported as
[`PRIVATE_BLOCKED_RANGES`](../sandbox/src/net/blocked-ranges.js); a
unit test keeps the list and the in-netns nft ruleset in lockstep.

`host-*` profiles never auto-upgrade — a misconfiguration is an
error, not a relaxation.

### Operator quickstart

Fresh Linux host, no Endo daemon yet:

```sh
# 1. One-time sandbox dependency.
sudo apt install bubblewrap
bwrap --version          # confirm the binary works

# 2. Repo bootstrap.
npx corepack yarn install

# 3. Start the daemon.
endo start

# 4. Provision the genie guest with a sandbox slice.
GENIE_MODEL=ollama/llama3.2 \
  GENIE_WORKSPACE=$HOME/genie-ws \
  yarn --cwd packages/genie setup

# 5. Talk to it.
endo send main-genie 'hello'
```

Skip step 4's `GENIE_WORKSPACE` to exercise the legacy direct-spawn
path during rollout — see "Slice vs. dev-repl" above.
To override the slice defaults, answer the configuration form by hand
(`endo inbox` lists the pending form; submit a non-default `backend`
or `network` field) instead of `endo send`-ing a free-form message.

### Failure-mode cookbook

Operators see slice-mint failures verbatim in the daemon log and as
an `Error creating agent: …` reply on the configuration form.
Common surfaces and their fixes:

| Symptom                                                         | Cause                                                                                     | Fix                                                                                                                           |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `no sandbox backends available; refusing to start`              | `bwrap` (and `podman`) absent from PATH.                                                  | `sudo apt install bubblewrap` (or `podman`); re-run `setup`.                                                                  |
| `bwrap: Creating new namespace failed: Operation not permitted` | Kernel rejects unprivileged user namespaces (AppArmor `userns` rule, sysctl set to `0`).  | `sudo sysctl -w kernel.unprivileged_userns_clone=1` and/or relax the AppArmor profile per distro docs.                        |
| `sandbox-factory configured but no workspace Mount cap`         | `GENIE_WORKSPACE` was unset *after* a slice-capable rollout.                              | Re-run `setup.js` with `GENIE_WORKSPACE=/path/to/workspace`; `setup.js` mints `workspace-mount` and re-introduces it.         |
| `mount cap not resolvable` from `provideHostPath`               | Daemon predates [`41_genie_sandbox_provide_host_path.md`](../../TODO/41_genie_sandbox_provide_host_path.md). | Upgrade the daemon; it must expose `provideHostPath` so `@endo/sandbox` can resolve `Mount` caps to host paths.               |
| `egress filter blocked X` (slice has no Internet)               | `network: 'private'` blocks RFC 1918 / loopback as documented.                            | Opt into a less-confined profile (`host-loopback`, `host-lan`) — never silently widen the default.  Set `GENIE_NETWORK=…`.    |
| `agent ready (… backend: (host), network: (host))`              | Plugin / factory missing; agent fell through to direct spawn.                             | Confirm `setup.js` minted `sandbox-factory` (look for the `Minted sandbox-factory` log line) and that `@endo/sandbox` builds. |
| `rootfs "oci:<ref>" is incompatible with "backend: bwrap"; set "backend" to "podman" or pick a non-oci rootfs` | Form requested an `oci:<ref>` rootfs but the resolved backend is `bwrap` (the bwrap driver has no OCI image store; see [`packages/sandbox/README.md` § "Capability surface" / "Driver auto-registration"](../sandbox/README.md#driver-auto-registration)). | Re-submit the configuration form with `backend: 'podman'`, or pick a non-`oci:` rootfs (`host-bind`, `minimal`, or a `<pet-name>` Mount cap) — see [§ Rootfs form-field shapes](#rootfs-form-field-shapes). |

Slice failures **never** silently downgrade to host spawning when a
factory was introduced; the agent refuses to start instead.

## Features

### Core Components

#### System Builder
- Combines identity, soul, memory, tools, and workspace context
- Generates complete system prompts for LLMs
- Supports custom suffixes and policies

#### Tools Module
- with security validation
- Path traversal prevention
- Code injection protection
- Dangerous command detection

#### Heartbeat Runner
- Loads tasks from `HEARTBEAT.md`
- Parses and executes tasks
- Updates task status automatically

#### Memory System
- Search over memory files
- Line-specific content retrieval
- Extensible indexing strategy

### Security

All tools implement:
- Input validation
- Path traversal prevention
- Code injection prevention
- Dangerous operation detection
- Content validation

## Tools Reference

| Tool            | Description                            |
|-----------------|----------------------------------------|
| `memory_get`    | Fetch specific lines from memory files |
| `memory_search` | Semantic search over memory files      |
| `readFile`      | Read file contents with offset/limit   |
| `writeFile`     | Write content to files                 |
| `editFile`      | Replace strings in files               |
| `webFetch`      | Fetch URLs with timeout                |
| `webSearch`     | Search web (DuckDuckGo)                |
| `bash`          | Execute shell commands safely          |

## API

### System Builder

```javascript
import { systemBuilder } from '@endo/genie';

const prompt = systemBuilder({
  identity: 'string',        // User identity
  soul: 'string',            // Internal truths
  memory: 'string',          // Path to MEMORY.md
  tools: 'string',           // Path to tools directory
  heartbeatPath: 'string',   // Path to HEARTBEAT.md
  disableSuffix: boolean,    // Disable security suffix
  disablePolicy: boolean,    // Disable policy section
  strictPolicy: boolean,     // Enable strict policy
  securityNotes: 'string',   // Custom security notes
});
```

### Heartbeat Runner

```javascript
import { HeartbeatRunner } from '@endo/genie';

const runner = new HeartbeatRunner({ heartbeatPath: './HEARTBEAT.md' });
const result = await runner.run();
```

## Testing

### Unit tests

```bash
cd packages/genie && npx ava
```

### Integration tests

`yarn test:integration` boots a real Endo daemon, runs `setup.js`, waits
for the agent to announce readiness, and then sources the scenario
indicated by `GENIE_TEST`.
The default scenario exercises the workspace file tools.

```bash
cd packages/genie
yarn test:integration                     # default: workspace-tool scenario
yarn test:integration:sandbox-slice       # sandbox slice probes
```

The sandbox-slice scenario verifies that the agent's `bash` tool
actually runs inside a confined bwrap slice (workspace bind, mount
table, host filesystem isolation, network profile).
It is **Linux-only** and requires the `bubblewrap` package on the host
runner; install it with:

```bash
sudo apt install bubblewrap        # Debian / Ubuntu
sudo dnf install bubblewrap        # Fedora
```

When `bwrap --version` fails — or when the kernel rejects unprivileged
user-namespace creation (e.g. AppArmor `userns` rule,
`kernel.unprivileged_userns_clone=0`) — the scenario exits cleanly with
a `SKIP:` notice rather than failing.

## Documentation

- [Design Document](DESIGN.md) - Complete architecture and implementation details
- [Tool Schema](src/tools/) - Tool definitions and schemas
