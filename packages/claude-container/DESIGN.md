# Claude Sandbox: Design & Implementation Plan

**Status**: Draft v1
**Scope**: End-to-end design for a multi-tenant Claude Code sandbox orchestrator with custom-backed filesystems, portable across macOS (Apple Silicon) and Linux (NixOS x86_64 primary, generic Linux x86_64 secondary).

A reader of this document should be able to implement the system without further context.

---

## 1. Overview

The system spawns isolated Linux microVM sandboxes, each running an instance of Claude Code with bash, common dev tooling, and a workspace filesystem served by an external **FS server** chosen per session. A caller process (the "client") asks the **orchestrator** to create a sandbox, receives a Unix domain socket path on which the caller will listen and serve the 9P filesystem protocol, and receives an attach channel for streaming I/O to/from the sandbox.

Key properties:

- **Per-session FS backing**: each sandbox mounts a workspace served by the caller. The caller is free to back the FS with anything (memory, S3, a remote API, a database). The FS hop never crosses a network — it is a local UDS.
- **Strong network isolation**: sandboxes can reach the public internet (configurable) but cannot reach the host or the host's network neighbors (LAN, Tailscale, VPNs, link-local). Enforced at the kernel-firewall layer.
- **Portable orchestrator**: a Node.js process that drives QEMU directly. Same code runs on macOS arm64 and Linux x86_64.
- **No re-auth per session**: a credential broker holds the Anthropic credentials once; each new sandbox receives a session-scoped credential at boot.
- **Single-call session creation**: caller invokes one RPC and gets back a working sandbox plus the UDS endpoints to wire up.

---

## 2. Goals and Non-Goals

### Goals

- Multi-tenant, single-host orchestration of Linux microVM sandboxes.
- Cross-platform: macOS arm64 and Linux x86_64, identical orchestrator logic.
- Custom filesystem backend per session, with a clean wire protocol (9P2000.L over UDS).
- Strong network isolation enforced below the application layer.
- Reusable, type-checked Node.js stack between orchestrator and client.
- Defensive design assuming guest-side compromise.

### Non-Goals (v1)

- Snapshot/restore for sub-100ms cold starts. (Plan for v2.)
- Persistent session state across orchestrator restarts. (Plan for v2.)
- Cluster / multi-host orchestration.
- Windows support.
- Cross-architecture emulation. (arm64 guests on x86 hosts, or vice versa.)
- Per-session network policy granularity on macOS v1 (uniform policy via UID-based pf filtering; per-VM granularity deferred to v2 via vmnet.)
- A bundled FS server. The FS server is the caller's responsibility.

---

## 3. Threat Model

The orchestrator runs as a trusted process on the host. Inside the sandbox, all code (Claude Code itself, anything Claude Code spawns, anything fetched from the workspace FS or the network) is treated as **untrusted**.

### Adversary capabilities (in-sandbox)

- Arbitrary code execution as the unprivileged `claude` user inside the guest.
- Potential privilege escalation to root within the guest (assume it can happen).
- Compromise of the in-guest **runtime agent** process.
- Manipulation of guest filesystem state (workspace and rootfs writable regions).

### Adversary must NOT be able to

- Reach host services or host network neighbors (LAN, Tailscale, VPN, link-local) via the network.
- Read or alter any other session's data.
- Extract long-lived Anthropic credentials. Only short-lived session-scoped credentials may be present in the guest, and only for the duration of the session.
- Escape the VM boundary to the host kernel (relies on QEMU + HVF/KVM isolation).
- Address the orchestrator on behalf of a different session.

### Trust boundaries

```
+--------------------------------------------------------------+
|                       Host (trusted)                         |
|                                                              |
|  Orchestrator <-> Credential Broker                          |
|       |                                                      |
|       | UDS (control)                                        |
|       v                                                      |
|  QEMU process  <--- 9P UDS ---> Caller (FS server, trusted)  |
|       |                                                      |
|       | virtio (HVF / KVM boundary - hardware-enforced)      |
+-------|------------------------------------------------------+
        |
+-------|------------------------------------------------------+
|       v                Guest (UNTRUSTED)                     |
|                                                              |
|   bootstrap init  ─►  runtime agent  ─►  claude code         |
|   (1ms lifetime)      (narrow RPC)       (arbitrary code)    |
+--------------------------------------------------------------+
```

---

## 4. System Architecture

```
+---------------------------------------------------------------+
|                            HOST                               |
|                                                               |
|  +----------+   create     +-------------------+              |
|  |  CLIENT  |─────────────►|                   |              |
|  |  (node)  |              |   ORCHESTRATOR    |              |
|  |          |◄─────────────|  (node, JS+JSDoc) |              |
|  +----------+   {ids,paths}|                   |              |
|       |                    +-------------------+              |
|       | listen 9P                |       |                    |
|       v                          |       |                    |
|  +----------+                    |       v                    |
|  |  fs.sock |◄───────QEMU────────|  +-----------+             |
|  +----------+    chardev          |  | CRED      |            |
|       ▲                          |  | BROKER    |            |
|       |                          |  +-----------+            |
|       |                          |       |                    |
|  +----+---------------------------+-------+----+              |
|  |              QEMU (one per session)         |              |
|  |    -accel hvf (mac) / kvm (linux)           |              |
|  |    virtio-serial: fs, ctl                   |              |
|  |    virtio-net (egress-only, firewalled)     |              |
|  +---------------------------------------------+              |
|                       │                                       |
|       (HVF / KVM hardware virtualization boundary)            |
+-----------------------│---------------------------------------+
                        │
+-----------------------│---------------------------------------+
|                       v          GUEST                        |
|                                                               |
|  PID 1: bootstrap init (Hello, mount, drop priv, exec agent)  |
|         │                                                     |
|         └─► runtime agent (unprivileged)                      |
|                    │                                          |
|                    ├─► claude code                            |
|                    ├─► bash, apk, dev tools                   |
|                    └─► virtio-ports: orchestrator, workspace  |
+---------------------------------------------------------------+
```

### Component summary

| Component | Process | Role |
|---|---|---|
| Orchestrator | Node.js (host) | API server; spawns QEMU; manages networking; routes session lifecycle. |
| Credential Broker | Node.js (host) | Holds Anthropic credentials; mints session-scoped creds. |
| Client | Node.js (host, separate process) | Calls the orchestrator's API; serves the workspace FS over 9P. |
| QEMU | C binary (host, one per session) | Provides the VM. |
| Bootstrap Init | Static binary (guest, PID 1) | One-shot: Hello to orchestrator, mount 9P workspace, write creds, exec runtime agent. |
| Runtime Agent | Static binary (guest, unprivileged) | Spawns Claude Code in tmux; streams stdio; heartbeats; receives credential rotations. |

---

## 5. Component Specifications

### 5.1 Orchestrator

**Language**: Node.js (≥ 22 LTS). JavaScript source with JSDoc annotations, type-checked by `tsc --checkJs`. No Bun. No transpile step.

**Responsibilities**:

1. Expose a Unix-domain HTTP API (default `/run/claude-orch/api.sock`) for the client.
2. Spawn and supervise one QEMU process per session.
3. Manage host-side network primitives (bridge + tap on Linux; pf anchor on macOS).
4. Allocate per-session UDS paths and inform the client.
5. Mediate the bootstrap handshake from the guest init.
6. Stream stdio between the runtime agent and the client over the attach channel.
7. Handle session teardown: kill QEMU, free tap, delete UDS files, instruct credential broker to revoke.

**State** (v1): in-memory `Map<sessionId, SessionRecord>`. On shutdown, optionally dump to a JSON file; on startup, attempt to reattach to surviving QEMUs (by PID and UDS) — best-effort.

**Process model**: single Node.js process. Event-loop is sufficient for hundreds of sessions; QEMU subprocesses run independently.

**Required capabilities**:

- Linux: `CAP_NET_ADMIN` (bridge/tap/nft), membership in `kvm` group.
- macOS: a setuid pf helper or member of an admin group authorized via `/etc/sudoers.d` for `pfctl -a com.claude-orch -f -`.

### 5.2 Guest Image

A minimal Linux rootfs and a paired kernel image. Two pairs are produced: `aarch64` (for macOS hosts) and `x86_64` (for Linux hosts).

**Rootfs base**: Alpine Linux (musl, apk).

**Contents**:

- BusyBox + Alpine base utilities.
- `bash`, `coreutils`, `findutils`, `grep`, `sed`, `awk`, `git`, `curl`, `ca-certificates`, `tmux`, `ripgrep`, `jq`, `openssh-client`.
- `nodejs`, `npm`, `python3`, `py3-pip`.
- Build essentials (`build-base`, `pkgconfig`, `linux-headers`) for native module builds during sessions.
- `claude-code` installed globally via npm to a pinned version.
- The **bootstrap init** binary at `/sbin/init`.
- The **runtime agent** binary at `/usr/local/bin/claude-agent`.

**Kernel**: vanilla mainline Linux ≥ 6.6, configured for microVM (no module loading needed; everything we use compiled in: virtio-net, virtio-serial, virtio-9p client, virtio-blk for the rootfs, ext4, overlayfs, tmpfs, namespaces, seccomp). Built once per architecture. Approximate kernel image size: 4-6 MB.

**Disk layout**:

- Read-only `rootfs.ext4` mounted at `/` via virtio-blk.
- A tmpfs overlay at `/` so guest writes don't persist past the VM lifetime.
- `/workspace` mounted as 9P from the caller's UDS.
- `/run` and `/tmp` as tmpfs.
- `/home/claude` writable on the overlay.

**Approximate sizes**:

- Kernel: ~5 MB
- Rootfs (compressed): ~150 MB
- Rootfs (uncompressed ext4): ~400 MB

### 5.3 Two-Stage Init: Bootstrap

The bootstrap init is PID 1 in the guest, executed by the kernel. It performs **one-shot privileged setup**, then `exec()`s the runtime agent as an unprivileged user. The bootstrap binary itself is never accessible from the runtime; once `exec()`'d, its address space is replaced.

**Language**: Go or Rust. Statically linked, no external deps. Single file in the rootfs at `/sbin/init`.

**Boot sequence**:

1. Mount `/proc`, `/sys`, `/dev`, `/dev/pts`, `/run`, `/tmp` as appropriate.
2. Read kernel cmdline from `/proc/cmdline`. Extract `claude.boot_nonce=<value>` and `claude.session_id=<value>`.
3. Open `/dev/virtio-ports/orchestrator` (the control virtserialport).
4. Send a `Hello{session_id, boot_nonce, agent_version, hostname}` message to the orchestrator.
5. Receive `BootConfig{credentials, fs_mount_tag, workspace_uid_gid, env_extra, initial_prompt?}`.
6. Open `/dev/virtio-ports/workspace` (the FS virtserialport). Keep this fd; it is the transport for 9P.
7. `mount -t 9p -o trans=fd,rfdno=<fd>,wfdno=<fd>,version=9p2000.L,msize=131072 none /workspace`.
8. `chown` `/workspace` to the claude UID/GID, if the FS server permits.
9. Write the received credentials to `/home/claude/.claude/.credentials.json`, mode 0600, owned by claude:claude. The credentials in the message are then zeroed in memory.
10. Drop `CAP_*` capabilities. Setgroups to claude's groups. Setuid/setgid to claude.
11. `exec("/usr/local/bin/claude-agent", "--control-port=/dev/virtio-ports/agent", "--session-id=", ...)`.

The bootstrap process is gone after step 11. It cannot be re-invoked; if the agent dies, the VM is dead from the orchestrator's perspective (PID 1 exited).

**Why the boot nonce**: the orchestrator generates a 256-bit random nonce per session, sets it on the kernel cmdline, and records `(session_id, nonce, vm_pid, allocated_at)` in its session table. The Hello must include the nonce; the orchestrator validates and **single-uses** it. Re-sending a Hello (e.g., from compromised guest code after the boot window) fails. After Hello succeeds, the nonce is purged from the orchestrator's table.

**Failure mode**: if Hello does not arrive within `BOOT_DEADLINE` (default 30s), the orchestrator kills the QEMU and marks the session `boot_failed`.

### 5.4 Runtime Agent

The runtime agent is the only long-lived guest-side component. It runs as the unprivileged `claude` user and has a deliberately narrow vocabulary.

**Language**: Go or Rust. Statically linked.

**Capabilities** (Linux): none beyond the user's. No `CAP_NET_*`, no `CAP_SYS_*`. Optionally a seccomp-bpf filter further restricts syscalls (block ptrace, kernel keyring, BPF, module loading, perf_event_open).

**Filesystem view**: `/workspace` (the 9P mount), `/home/claude`, `/tmp`, system bin paths. Cannot read `/sbin/init` or anything outside its uid's perms.

**Control transport**: opens `/dev/virtio-ports/agent` for bidirectional newline-delimited JSON RPC with the orchestrator. **Different port** from the one bootstrap used; bootstrap closed its port at exec.

**RPC vocabulary** (agent ↔ orchestrator):

| Verb | Direction | Description |
|---|---|---|
| `Ready` | A→O | Agent is up; orchestrator may now route attach traffic. |
| `Heartbeat` | A→O | Periodic; carries `{last_input_at, cpu_pct, mem_rss, idle_seconds}`. |
| `Log` | A→O | Structured log line for orchestrator's logging. |
| `Exited` | A→O | Sent immediately before agent voluntarily exits. |
| `Attach` | O→A | Start streaming stdin/stdout of the claude-code tmux session over a new stream-id. |
| `Detach` | O→A | Stop streaming. |
| `RotateCreds` | O→A | Push: new credentials payload. Agent atomically replaces the creds file and SIGHUPs Claude Code if needed. |
| `Exec` | O→A | Run a one-shot command, return exit code + output. Optional; restrict to operator use, gate behind a per-session capability. |
| `Terminate` | O→A | Gracefully stop; agent has 5s before SIGKILL. |

**Forbidden** (agent must not implement, and orchestrator must not accept):

- `GetCreds` — agent cannot ever ask for credentials by name. Push-only.
- File read/write RPCs — the agent does not act as a file proxy.
- Any verb that takes another session's ID.

### 5.5 Credential Broker

A separate daemon (Node.js) that holds the long-lived Anthropic credential.

**Inputs**: at startup, reads `ANTHROPIC_API_KEY` from a config file (mode 0600) or env var. Optionally supports OAuth refresh tokens with a single-process refresh loop.

**API** (UDS-only, accessible to orchestrator UID):

- `IssueCreds(session_id) → CredsPayload` — Returns a credentials object suitable for writing to `~/.claude/.credentials.json`. For API-key mode, this is the API key (or a key derived/scoped if Anthropic exposes that). For OAuth mode, the current access token plus expiry.
- `RevokeCreds(session_id) → ok` — Marks the session's creds as revoked in the broker's table. For OAuth, no upstream revocation in v1 (best effort).
- `PreemptiveRotate(session_id) → CredsPayload | null` — Called by orchestrator before TTL expiry; broker returns new creds if needed, null otherwise. Orchestrator forwards via `RotateCreds` to agent.

**Why split out**: separates the long-lived secret from the orchestrator's blast radius and centralizes refresh under a single mutex, preventing thundering-herd token refresh.

### 5.6 Network Controllers

Two implementations behind a common interface, selected by `process.platform`:

```js
/**
 * @typedef {object} NetworkController
 * @property {() => Promise<void>} initialize
 * @property {(sessionId: string, opts: NetworkOpts) => Promise<NetAttachment>} attachSession
 * @property {(sessionId: string) => Promise<void>} detachSession
 * @property {() => Promise<void>} shutdown
 */

/**
 * @typedef {object} NetworkOpts
 * @property {"egress" | "none"} mode
 */

/**
 * @typedef {object} NetAttachment
 * @property {string[]} qemuArgs
 * @property {() => Promise<void>} cleanup
 */
```

#### 5.6.1 Linux: `NftablesController`

- Creates bridge `claudebr0` at `10.42.0.1/24` on `initialize()`.
- Installs the `inet claude` nftables table (see §7.1).
- On `attachSession`: creates `tap-<sid8>`, brings it up, enslaves to bridge, returns QEMU args `-netdev tap,id=net0,ifname=tap-<sid8>,script=no,downscript=no -device virtio-net-pci,netdev=net0,mac=<derived>`.
- Per-VM MAC derived deterministically from session ID (avoids collisions across restarts).
- If `mode === "none"`: returns no `-netdev` args (or sets a non-routable tap on a separate dummy bridge).
- `detachSession`: removes tap.
- `shutdown`: tears down bridge and table.

#### 5.6.2 macOS: `PfController`

- On `initialize()`: writes anchor file at `/etc/pf.anchors/com.claude-orch` (see §7.3). Loads anchor via `pfctl -a com.claude-orch -f <path>`. Verifies pf is enabled (`pfctl -s info`); if not, requests operator to enable.
- All QEMU processes run under the orchestrator's UID, which matches the `user` clause in the pf rules.
- On `attachSession` (`mode === "egress"`): returns QEMU args `-netdev user,id=net0,net=10.0.2.0/24,hostfwd=... -device virtio-net-pci,netdev=net0`. SLIRP user-mode networking.
- If `mode === "none"`: omits `-netdev` entirely.
- `detachSession`: no-op in v1 (no per-session network state on macOS in this mode).
- `shutdown`: removes anchor.

### 5.7 Filesystem Handoff

This is the load-bearing architectural choice. Goals:

- Caller process serves the FS over a UDS using a small, standard protocol.
- No network hop between caller and guest.
- No coupling between caller and the hypervisor's internal protocols.
- Works identically on macOS and Linux.

**Solution**: 9P2000.L over a virtio-serial port whose host endpoint is a UDS.

**Wire path** (per session):

```
caller (9P server, UDS bind+listen)
  ↑
  | 9P2000.L over UDS stream
  ↓
QEMU -chardev socket,path=<fs.sock>  ↔  -device virtserialport,name=workspace
  ↑
  | bytes pass through unchanged
  ↓
guest /dev/virtio-ports/workspace (character device)
  ↑
  | mount -t 9p -o trans=fd,rfdno=N,wfdno=N
  ↓
guest kernel 9p client (v9fs)  →  /workspace VFS mount
```

**Why this layering works on macOS**:

- QEMU's `-chardev socket` and `-device virtserialport` are platform-agnostic.
- The Linux `v9fs` 9P client lives entirely in the **guest** kernel; the host kernel doesn't need any 9P support.
- The mount uses `trans=fd`, which doesn't require any specific virtio-9p device on the host (which QEMU on macOS would struggle with). The 9P frames are just bytes flowing through a virtio-serial channel.

**Handoff procedure**:

1. Orchestrator generates `session_id`. Reserves directory `/run/claude-orch/sessions/<session_id>/`.
2. Orchestrator returns `{ session_id, fs_socket_path: "/run/.../fs.sock", ... }` to client.
3. Client `socket(AF_UNIX, SOCK_STREAM)`, `bind(fs_socket_path)`, `listen(1)`. Sends `Ready` back to orchestrator.
4. Orchestrator spawns QEMU with `-chardev socket,id=fs,path=/run/.../fs.sock,server=off,reconnect=1 -device virtserialport,chardev=fs,name=workspace`.
5. QEMU connects to the UDS; the caller's `accept()` returns the connection.
6. Caller speaks 9P2000.L on that connection for the lifetime of the session.

**Caller responsibilities**:

- Implement 9P2000.L (Tversion, Tattach, Twalk, Topen, Tread, Twrite, Tclunk, Tstat, Tgetattr, Tsetattr, Treaddir, Tcreate, Tmkdir, Tunlink, Trename, Tlink, Tsymlink, Treadlink, Tfsync, Txattrwalk, Txattrcreate, Tlock, Tgetlock).
- Handle `msize` negotiation (default 131072).
- Implement at minimum: regular files, directories, symlinks. Hardlinks and xattrs recommended.
- Return ENOSYS for unsupported ops; the guest kernel tolerates this.

A reference implementation outline is provided in Appendix B.

### 5.8 Client SDK

A small Node.js package (`@claude-sandbox/client`) that wraps the orchestrator API. Type definitions imported from the shared `@claude-sandbox/protocol` package.

**Surface**:

```js
/**
 * @param {ClientOptions} opts
 * @returns {OrchestratorClient}
 */
function createClient(opts) { /* ... */ }

/**
 * @typedef {object} OrchestratorClient
 * @property {(req: CreateSessionRequest) => Promise<Session>} createSession
 * @property {() => Promise<SessionSummary[]>} listSessions
 * @property {(id: string) => Promise<void>} terminateSession
 */

/**
 * @typedef {object} Session
 * @property {string} id
 * @property {string} fsSocketPath      // caller listens here
 * @property {AttachStream} attach      // duplex stdio to claude-code
 * @property {() => Promise<void>} close
 */
```

The SDK does **not** implement the 9P server; the caller does that in its own process. The SDK only orchestrates the lifecycle and exposes the attach stream.

---

## 6. Protocols

All control protocols are line-delimited JSON over Unix domain sockets unless noted. Schema validation uses a runtime validator (`ajv` or `zod`); message shapes live in `@claude-sandbox/protocol` as `.d.ts` declarations.

### 6.1 Caller ↔ Orchestrator API

**Transport**: HTTP/1.1 over UDS at `/run/claude-orch/api.sock`. Standard JSON request/response. Server-Sent Events for attach streams; or a separate UDS for the duplex attach connection.

**Endpoints**:

```
POST   /v1/sessions                  CreateSessionRequest -> Session
GET    /v1/sessions                                       -> SessionSummary[]
GET    /v1/sessions/:id                                   -> Session
POST   /v1/sessions/:id/ready        (caller signals it's listening on fs.sock)
DELETE /v1/sessions/:id              terminate
```

```js
// CreateSessionRequest
{
  arch?: "x86_64" | "aarch64",   // default: detect host
  resources?: { vcpus?: number, memMB?: number },  // defaults: 2 vCPU, 2048 MB
  network: "egress" | "none",
  envExtra?: Record<string, string>,
  initialPrompt?: string,
  attachMode: "stream" | "none"
}

// Session (response)
{
  id: string,
  fsSocketPath: string,         // caller MUST listen here before /ready
  controlSocketPath: string,    // for log/metric stream
  attachSocketPath?: string,    // duplex stdio, if attachMode=="stream"
  createdAt: string             // ISO8601
}
```

**Session creation sequence**:

```
client                       orchestrator
   |  POST /v1/sessions          |
   |---------------------------->|
   |                             |  (reserve session, generate paths/nonce)
   |  200 { id, fsSocketPath ... }
   |<----------------------------|
   |
   |  bind+listen(fsSocketPath)
   |
   |  POST /v1/sessions/:id/ready
   |---------------------------->|
   |                             |  spawn QEMU (with -chardev->fsSocketPath)
   |                             |  await Hello on /ctl
   |                             |  await Ready from agent
   |  204                        |
   |<----------------------------|
   |
   |  (optional) connect(attachSocketPath) for stdio
```

### 6.2 Bootstrap RPC (Orchestrator ↔ Bootstrap Init)

**Transport**: virtio-serial port `orchestrator` (host UDS at `/run/.../ctl.sock`). Newline-delimited JSON, single request-response.

```js
// Hello (init -> orchestrator)
{
  type: "hello",
  sessionId: string,
  bootNonce: string,    // 256-bit hex
  agentVersion: string,
  hostname: string
}

// BootConfig (orchestrator -> init)
{
  type: "boot_config",
  credentials: {
    apiKey?: string,
    oauthToken?: { accessToken: string, expiresAt: string }
  },
  fsMountTag: "workspace",
  workspaceUidGid: [1000, 1000],
  envExtra: Record<string, string>,
  initialPrompt?: string,
  agentControlPort: "/dev/virtio-ports/agent"
}
```

After BootConfig is sent, the orchestrator closes the bootstrap port. The bootstrap init also closes it before `exec`.

### 6.3 Agent RPC (Orchestrator ↔ Runtime Agent)

**Transport**: virtio-serial port `agent` (host UDS at `/run/.../agent.sock`). Newline-delimited JSON. Bidirectional.

```js
// Agent -> Orchestrator
{ type: "ready", capabilities: ["tmux", "exec"] }
{ type: "heartbeat", lastInputAt: string, cpuPct: number, memRss: number, idleSeconds: number }
{ type: "log", level: "info"|"warn"|"error", msg: string, fields?: object }
{ type: "exited", reason: string, exitCode: number }

// Orchestrator -> Agent
{ type: "attach", streamId: string }
{ type: "detach", streamId: string }
{ type: "rotate_creds", credentials: { ... } }
{ type: "exec", cmd: string, argv: string[], timeoutMs: number, streamId: string }
{ type: "terminate", graceMs: number }
```

**Stdio streams** for `attach` and `exec` are multiplexed on a separate virtio-serial port (`/dev/virtio-ports/stdio`) with framing `<streamId:8 bytes><len:4 bytes><payload>`. Keeps the control channel free of bulk data.

### 6.4 Credential Broker API

UDS at `/run/claude-orch/broker.sock`, line-delimited JSON.

```js
// Issue
{ type: "issue", sessionId: string }
// -> { type: "creds", credentials: { apiKey: string } }  (API-key mode)
// -> { type: "creds", credentials: { oauthToken: { accessToken, expiresAt } } }

// Revoke
{ type: "revoke", sessionId: string }
// -> { type: "ok" }

// Preemptive rotate
{ type: "rotate_if_needed", sessionId: string }
// -> { type: "creds", credentials: { ... } }  // if rotation occurred
// -> { type: "noop" }                          // if still valid
```

### 6.5 9P Filesystem

9P2000.L (the Linux extension). Reference: [https://github.com/chaos/diod/blob/master/protocol.md](https://github.com/chaos/diod/blob/master/protocol.md). The caller must handle the message types listed in §5.7.

`msize` of 128 KiB is recommended. Larger improves throughput on large reads/writes; smaller reduces per-message memory. The guest mount specifies `msize=131072`.

---

## 7. Platform-Specific Configuration

### 7.1 Linux (generic + NixOS shared)

**Kernel modules to load at boot**:
- `kvm` (and `kvm_intel` or `kvm_amd`)
- `tun`
- `vhost_net` (optional, performance improvement)

**Sysctls**:
- `net.ipv4.ip_forward = 1`
- `net.ipv6.conf.all.forwarding = 1` (if v6 enabled in guests)

**nftables ruleset** (orchestrator installs at startup; idempotent):

```nft
table inet claude {
  set private4 {
    type ipv4_addr
    flags interval
    elements = {
      10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,
      100.64.0.0/10, 169.254.0.0/16, 127.0.0.0/8,
      224.0.0.0/4
    }
  }
  set private6 {
    type ipv6_addr
    flags interval
    elements = { fc00::/7, fe80::/10, ::1/128, ff00::/8 }
  }

  chain forward {
    type filter hook forward priority 0; policy drop;

    iifname "claudebr0" ip  daddr @private4 reject with icmp  type net-unreachable
    iifname "claudebr0" ip6 daddr @private6 reject with icmpv6 type no-route
    iifname "claudebr0" oifname != "claudebr0" accept

    oifname "claudebr0" ct state established,related accept
  }

  chain input {
    type filter hook input priority 0; policy accept;
    iifname "claudebr0" drop
  }

  chain postrouting {
    type nat hook postrouting priority 100;
    ip saddr 10.42.0.0/24 oifname != "claudebr0" masquerade
  }
}
```

**Bridge setup** (orchestrator runs at startup):

```
ip link add claudebr0 type bridge
ip addr add 10.42.0.1/24 dev claudebr0
ip link set claudebr0 up
```

**Per-session tap setup**:

```
ip tuntap add tap-<sid8> mode tap user claude-orch
ip link set tap-<sid8> master claudebr0
ip link set tap-<sid8> up
```

**DNS**: VMs are given `1.1.1.1` and `9.9.9.9` via kernel cmdline as `nameserver` overrides (read by a minimal resolv.conf written in the rootfs at boot). Do not expose the host resolver.

### 7.2 NixOS Module

The orchestrator runtime is identical to generic Linux. The NixOS module only handles boot-time and packaging concerns. The orchestrator never imports anything Nix-specific.

```nix
# nixos-module.nix
{ config, lib, pkgs, ... }:

let
  cfg = config.services.claude-orch;
in {
  options.services.claude-orch = {
    enable = lib.mkEnableOption "Claude sandbox orchestrator";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The orchestrator package (containing bin/, share/images/).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "claude-orch";
    };

    socketPath = lib.mkOption {
      type = lib.types.str;
      default = "/run/claude-orch/api.sock";
    };
  };

  config = lib.mkIf cfg.enable {
    boot.kernelModules = [ "tun" "vhost_net" "kvm-intel" "kvm-amd" ];
    boot.kernel.sysctl = {
      "net.ipv4.ip_forward" = 1;
      "net.ipv6.conf.all.forwarding" = 1;
    };

    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.user;
      extraGroups = [ "kvm" ];
    };
    users.groups.${cfg.user} = {};

    systemd.tmpfiles.rules = [
      "d /run/claude-orch 0750 ${cfg.user} ${cfg.user} -"
      "d /var/lib/claude-orch 0750 ${cfg.user} ${cfg.user} -"
    ];

    systemd.services.claude-orch = {
      description = "Claude sandbox orchestrator";
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];
      environment = {
        CLAUDE_ORCH_SOCKET = cfg.socketPath;
        CLAUDE_ORCH_IMAGE_DIR = "${cfg.package}/share/claude-orch/images";
      };
      serviceConfig = {
        ExecStart = "${cfg.package}/bin/claude-orch";
        User = cfg.user;
        Group = cfg.user;
        AmbientCapabilities = [ "CAP_NET_ADMIN" ];
        Restart = "on-failure";
        RestartSec = "5s";
        # Hardening
        NoNewPrivileges = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ReadWritePaths = [ "/run/claude-orch" "/var/lib/claude-orch" ];
      };
    };

    services.claude-broker = lib.mkIf cfg.enable {
      # similar unit for the credential broker
    };
  };
}
```

The orchestrator binary, guest kernels, and rootfs images are bundled in the `cfg.package` derivation. The NixOS module merely installs and starts them.

### 7.3 macOS

**Dedicated user**: `_claude-orch` (system user, UID < 500).

**pf anchor** at `/etc/pf.anchors/com.claude-orch`:

```
# /etc/pf.anchors/com.claude-orch
table <claude_private> persist {                                       \
  10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16,                          \
  100.64.0.0/10, 169.254.0.0/16, 127.0.0.0/8,                         \
  224.0.0.0/4                                                          \
}

# Deny VM egress to any private destination.
block drop log quick proto { tcp udp icmp icmp6 } \
  from any to <claude_private> user _claude-orch

# Default-allow public-internet egress from the orchestrator user.
pass out proto { tcp udp icmp icmp6 } user _claude-orch keep state
```

**Anchor loading** in `/etc/pf.conf`:

```
# At the end of /etc/pf.conf
anchor "com.claude-orch"
load anchor "com.claude-orch" from "/etc/pf.anchors/com.claude-orch"
```

**Enable pf at boot** (one-time setup):

```
sudo pfctl -e
sudo pfctl -f /etc/pf.conf
```

**LaunchDaemon** at `/Library/LaunchDaemons/com.anthropic.claude-orch.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.anthropic.claude-orch</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/claude-orch</string>
  </array>
  <key>UserName</key>
  <string>_claude-orch</string>
  <key>GroupName</key>
  <string>_claude-orch</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>StandardOutPath</key>
  <string>/var/log/claude-orch.log</string>
  <key>StandardErrorPath</key>
  <string>/var/log/claude-orch.err</string>
</dict>
</plist>
```

**SLIRP per VM**: `-netdev user,id=net0,net=10.0.2.0/24 -device virtio-net-pci,netdev=net0,mac=<derived>`. SLIRP appears to pf as traffic originating from `_claude-orch`'s UID, which is the filtering anchor for the `block drop ... user _claude-orch` rule.

**Limitation (v1)**: all sessions share the same UID-based pf policy. Per-session network policy on macOS is deferred to v2, which would switch to `-netdev vmnet-host` per VM and per-interface pf rules — requiring either root or a `com.apple.developer.networking.vmnet` entitlement on the orchestrator binary.

---

## 8. Build Pipeline

All builds run in a Linux container (Docker, Podman, OrbStack, or colima — all work on macOS dev machines). The build is fully reproducible from the source repo without Nix.

### 8.1 Rootfs Build

Tool: **mkosi**. Configuration in `images/mkosi.conf.d/`.

```ini
# images/mkosi.conf.d/00-base/mkosi.conf
[Distribution]
Distribution=alpine
Release=3.20

[Output]
Format=disk
ImageId=claude-sandbox
Output=rootfs

[Content]
Packages=
    busybox
    bash
    coreutils findutils grep sed gawk
    git curl ca-certificates
    tmux ripgrep jq
    openssh-client
    nodejs npm
    python3 py3-pip
    build-base pkgconfig linux-headers
    util-linux e2fsprogs
```

```ini
# images/mkosi.conf.d/10-claude/mkosi.conf
[Content]
ExtraTrees=
    %D/files
PostInstallationScripts=%D/postinst.sh
```

`files/` contains the bootstrap init at `/sbin/init`, the agent at `/usr/local/bin/claude-agent`, the resolv.conf template, and any /etc files.

`postinst.sh` runs `npm install -g @anthropic-ai/claude-code@<pinned>` inside the chroot.

Built per architecture:

```
mkosi --architecture=x86_64 build -o build/x86_64/
mkosi --architecture=arm64   build -o build/arm64/
```

Outputs:
- `build/x86_64/rootfs.raw` — flat ext4 image
- `build/arm64/rootfs.raw`

### 8.2 Kernel Build

Kernel source: upstream `linux-stable` (≥ 6.6).

Config: a minimal microVM config. Strip everything not needed for a virtio guest. Key options:

```
CONFIG_VIRTIO=y
CONFIG_VIRTIO_PCI=y
CONFIG_VIRTIO_BLK=y
CONFIG_VIRTIO_NET=y
CONFIG_VIRTIO_CONSOLE=y           # virtio-serial / virtserialport
CONFIG_NET_9P=y
CONFIG_NET_9P_VIRTIO=y            # not strictly used (we use trans=fd) but cheap
CONFIG_9P_FS=y
CONFIG_9P_FS_POSIX_ACL=y
CONFIG_EXT4_FS=y
CONFIG_OVERLAY_FS=y
CONFIG_TMPFS=y
CONFIG_NAMESPACES=y
CONFIG_USER_NS=y
CONFIG_SECCOMP=y
CONFIG_BPF=y
# disable modules entirely
CONFIG_MODULES=n
```

Cross-builds inside the container for both archs. Output: `vmlinux-x86_64`, `Image-arm64`.

### 8.3 Guest Binaries

Bootstrap init and runtime agent are Rust or Go, static. Built once per arch in CI.

Rust example using `cross`:

```
cross build --release --target=x86_64-unknown-linux-musl
cross build --release --target=aarch64-unknown-linux-musl
```

### 8.4 Orchestrator and Broker

Node.js. No build step beyond `npm install` and `tsc` for type-checking. Distributed as:

- A tarball containing `node_modules/`, source files, and a launcher script.
- Or via a per-platform installer that bundles a pinned Node runtime (`node-v22.x.x-darwin-arm64`, `node-v22.x.x-linux-x64`).

**Why a bundled Node**: avoids depending on the host's Node version. The deploy artifact is "drop in `/opt/claude-orch/`, point launchd or systemd at the launcher."

### 8.5 Build artifact bundle

The final deployable artifact per platform:

```
claude-orch-<version>-<platform>-<arch>.tar.gz
├── bin/
│   ├── claude-orch           # launcher shell script
│   └── claude-broker
├── lib/
│   └── node/                 # bundled Node runtime
├── node_modules/
├── src/                      # orchestrator and broker source
├── share/
│   └── images/
│       ├── vmlinux
│       └── rootfs.raw
└── share/
    └── systemd/              # linux only
        └── claude-orch.service
└── share/
    └── launchd/              # macos only
        └── com.anthropic.claude-orch.plist
```

---

## 9. Repository Layout

npm workspaces monorepo:

```
claude-sandbox/
├── package.json                       # workspaces config
├── tsconfig.base.json
├── typedoc.json
├── README.md
├── DESIGN.md                          # this document
├── packages/
│   ├── protocol/                      # shared types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.js
│   │       ├── api.d.ts               # CreateSessionRequest, Session, ...
│   │       ├── bootstrap.d.ts         # Hello, BootConfig
│   │       ├── agent.d.ts             # Heartbeat, Attach, RotateCreds
│   │       └── broker.d.ts
│   ├── orchestrator/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/claude-orch
│   │   └── src/
│   │       ├── main.js
│   │       ├── api/                   # HTTP+UDS server
│   │       ├── sessions/              # session lifecycle
│   │       ├── qemu/                  # process management, QMP
│   │       ├── network/               # Nftables + Pf controllers
│   │       ├── bootstrap/             # init RPC server
│   │       ├── agent/                 # agent RPC server
│   │       └── broker-client/
│   ├── broker/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── bin/claude-broker
│   │   └── src/
│   │       └── main.js
│   ├── client/                        # SDK for callers
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.js
│   └── nine-p/                        # optional: reference 9P server library
│       ├── package.json
│       └── src/
├── guest/
│   ├── bootstrap-init/                # Rust crate
│   │   ├── Cargo.toml
│   │   └── src/main.rs
│   └── runtime-agent/
│       ├── Cargo.toml
│       └── src/main.rs
├── images/
│   ├── mkosi.conf
│   ├── mkosi.conf.d/
│   │   ├── 00-base/
│   │   └── 10-claude/
│   └── kernel/
│       ├── config-x86_64
│       └── config-arm64
└── nixos/
    └── module.nix
```

**tsconfig.base.json**:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowJs": true,
    "checkJs": true,
    "noEmit": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"],
    "composite": true,
    "incremental": true
  }
}
```

**Per-package tsconfig.json** extends the base and sets `include` and `references` to other workspace packages where needed.

**Root package.json scripts**:

```json
{
  "scripts": {
    "typecheck": "tsc -b packages/protocol packages/orchestrator packages/broker packages/client packages/nine-p",
    "test": "node --test packages/*/src/**/*.test.js",
    "docs": "typedoc",
    "build:guest": "cargo build --release --workspace --manifest-path=guest/Cargo.toml",
    "build:image": "scripts/build-image.sh",
    "package": "scripts/package.sh"
  }
}
```

**Coding style**:

- JavaScript source files (`.js`), authored with JSDoc type annotations.
- Shared types live in `.d.ts` files in `packages/protocol`.
- Runtime validation via `zod` (preferred for JSON-RPC) for any boundary parsing.
- `node --test` for tests; no jest/vitest dependency.
- ESM modules (`"type": "module"` in every package.json).

---

## 10. Implementation Plan

Six milestones, each independently demoable.

### Milestone 1: Single-host Linux end-to-end (estimated 2-3 weeks)

**Deliverable**: a single Linux x86_64 machine where a client can call the orchestrator API, get back a UDS path, listen with a trivial 9P server (serving `/tmp` or in-memory), and shell into a sandboxed bash that sees the workspace mount. Claude Code not yet involved.

**Tasks**:

1. Repo skeleton: workspaces, tsconfig, typedoc, lint, test.
2. Define `@claude-sandbox/protocol` types end-to-end.
3. Build minimal Alpine rootfs via mkosi. Boot it under QEMU manually to validate.
4. Write the bootstrap init (Rust): parse cmdline, send Hello over virtserialport, receive BootConfig, mount 9P with `trans=fd`, exec a stub agent.
5. Write a stub runtime agent: send Ready, spawn a `bash`, stream over a virtserialport.
6. Implement the orchestrator: HTTP+UDS API, QEMU spawn, network controller (Linux nftables), bootstrap RPC server, agent RPC server, attach stream multiplexer.
7. Implement the client SDK with `createSession` and an `attach` duplex stream.
8. Write a reference 9P server in `packages/nine-p` that serves a passthrough directory.
9. Manual smoke test: client creates session, opens shell, `ls /workspace` shows the passthrough.

**Exit criteria**: single bash session in the sandbox can read and write files in `/workspace` and those operations hit the caller's 9P server.

### Milestone 2: macOS support (estimated 1-2 weeks)

**Deliverable**: same end-to-end demo, on an M-series Mac.

**Tasks**:

1. Build arm64 rootfs and kernel in CI.
2. Implement `PfController`. Test pf anchor install on a fresh macOS host.
3. Conditional QEMU invocation: `-accel hvf` on darwin, `-accel kvm` on linux; correct binary per arch.
4. Validate virtio-serial port semantics on macOS QEMU (timing, reconnect behavior).
5. LaunchDaemon plist and install script.
6. Document the one-time pf enablement step in install docs.

**Exit criteria**: same smoke test passes on macOS.

### Milestone 3: Claude Code integration + credential broker (estimated 1-2 weeks)

**Tasks**:

1. Pin a Claude Code version in the rootfs. Verify it runs under tmux from the agent.
2. Build the credential broker. v1 supports API-key mode only.
3. Wire `IssueCreds` into the bootstrap path. Write `~/.claude/.credentials.json` from BootConfig.
4. Implement `RotateCreds` push from orchestrator → agent. Agent atomically replaces creds file.
5. Add `initialPrompt` plumbing through to Claude Code.
6. End-to-end: client creates session with an initial prompt, attaches to stdio, sees Claude Code respond.

**Exit criteria**: Claude Code runs autonomously inside a sandbox with credentials supplied by the broker.

### Milestone 4: Security hardening (estimated 2 weeks)

**Tasks**:

1. Run the runtime agent as unprivileged `claude` user (not root). Verify it cannot read `/sbin/init` or anything privileged.
2. Apply a seccomp-bpf filter to the runtime agent: deny ptrace, kernel keyring, module loading, BPF, perf_event_open, kexec.
3. Audit the agent RPC vocabulary; ensure no `GetCreds`, no file proxy, no cross-session addressing.
4. Validate boot nonce single-use enforcement. Write an integration test that replays a Hello and confirms rejection.
5. Audit nftables ruleset: verify Tailscale (100.64/10), LAN (192.168/16), and host (127/8) are all blocked from a real VM. Verify SLIRP+pf blocks the same on macOS.
6. Verify the orchestrator runs without root on both platforms (caps on Linux, dedicated UID + pf anchor on macOS).
7. Threat-model review of every host-to-guest and guest-to-host message.
8. Disable IPv6 in guests unless explicitly enabled (avoids dual-stack leak surface).

**Exit criteria**: a hostile in-guest user cannot reach host services, cannot escalate via the agent RPC, and the agent process has no path to extract credentials beyond what was already issued.

### Milestone 5: Operational maturity (estimated 1-2 weeks)

**Tasks**:

1. Structured logging from all components (JSON; pino in Node, env_logger in Rust).
2. Metrics: Prometheus textfile or HTTP endpoint with per-session counters (created, terminated, qemu_runtime_seconds, mem_bytes, cpu_seconds, 9p_bytes_in, 9p_bytes_out).
3. Resource limits: cgroup-v2 controls on Linux for each QEMU child; macOS uses QEMU's `-cpu` / `-m` ceilings only.
4. Idle timeout: orchestrator terminates sessions whose `idleSeconds` exceeds a configurable threshold.
5. Graceful shutdown: SIGTERM to orchestrator → terminate all sessions with a grace period → exit. Surface session-termination reason to the client.
6. Persisted state across orchestrator restarts: write `sessions.json` to `/var/lib/claude-orch/` on each transition; on startup, attempt to reattach by reconnecting to existing UDS endpoints and PIDs. Sessions whose QEMU is dead get marked `gone`.
7. CLI: `claude-orch list`, `claude-orch terminate <id>`, `claude-orch logs <id>`.

**Exit criteria**: the orchestrator survives operator restarts without orphaning VMs; metrics and logs are sufficient to diagnose a broken session.

### Milestone 6: Documentation & release

**Tasks**:

1. Operator install docs for macOS and Linux. NixOS module published.
2. Client SDK tutorial: a worked example of a passthrough FS server and a sample session.
3. Reference 9P server documentation.
4. Security model document (extracted from §3 and §5).
5. Upgrade guide for image rebuilds.
6. CI: full test matrix (linux x86_64 + macos arm64), release artifacts published per tag.

---

## 11. Operational Considerations

### Deployment

**Linux generic**:
- Extract tarball to `/opt/claude-orch/`.
- Install `systemd/claude-orch.service` to `/etc/systemd/system/`, `systemctl enable --now`.
- Ensure `kvm` group exists and orchestrator user is in it.

**NixOS**: `services.claude-orch.enable = true;`, point `package` at the bundle derivation.

**macOS**:
- Extract to `/opt/claude-orch/`.
- Install LaunchDaemon plist.
- Run one-time pf enable script.

### Logging

- Orchestrator: JSON to stderr → systemd-journald (Linux) or `/var/log/claude-orch.log` (macOS).
- Agent logs come over the agent RPC `Log` verb; orchestrator forwards to its own log.

### Failure modes and responses

| Failure | Detection | Response |
|---|---|---|
| QEMU crashes | `child_process` `exit` event | Mark session `terminated`, free resources, notify client. |
| Boot timeout (no Hello) | 30s timer | Kill QEMU, mark `boot_failed`. |
| Agent unreachable | Heartbeat gap > 60s | Mark `unhealthy`. After 5min, terminate. |
| Caller FS server drops | QEMU's chardev disconnects | Guest filesystem hangs. Orchestrator detects via chardev event or guest heartbeat reporting stuck I/O; can either terminate or wait. v1: terminate. |
| Credential broker dies | RPC fails | Existing sessions continue with current creds; new sessions fail to create until broker recovers. |
| Network controller errors | `nft`/`pfctl` non-zero exit | Refuse to start (fail-closed). |
| Orchestrator OOM | systemd / launchd restart | On restart, attempt to reattach to live sessions. |

### Resource limits

- Per-session: 2 vCPU, 2048 MB RAM by default. Configurable via `CreateSessionRequest.resources`.
- Total host: configurable cap on concurrent sessions; orchestrator rejects with 429 once reached.
- Linux: cgroup-v2 per QEMU child with `cpu.max`, `memory.max`, `pids.max`.
- macOS: QEMU's `-smp` and `-m` only (no cgroup equivalent).

### Backups and data persistence

Sessions are ephemeral. The rootfs is non-persistent (tmpfs overlay). The only durable data is whatever the caller's FS server backs the workspace with. Persistence is entirely the caller's concern.

---

## 12. Open Questions and Deferred Decisions

| Topic | Status | Notes |
|---|---|---|
| Snapshot/restore for fast cold start | Deferred to v2 | QEMU's `savevm` works; needs benchmarking. |
| Per-session network policy on macOS | Deferred to v2 | Requires vmnet + entitlements or root. |
| Multi-host orchestration | Out of scope | Would need a shared session store, leader election, networking overlay. |
| Windows host | Out of scope | No KVM/HVF equivalent without WSL2. |
| In-guest GPU access | Out of scope | Possible via virtio-gpu but rarely needed for Claude Code workloads. |
| OAuth credential mode | Sketched, not implemented | API-key mode is sufficient for v1. |
| Per-session egress allowlist | Deferred | Could plug into nftables/pf with per-IP rules; v1 is binary egress on/off. |
| Inter-session communication | Out of scope | Explicitly not a feature. |

---

## Appendix A: Example QEMU invocation

### Linux x86_64

```
qemu-system-x86_64 \
  -machine microvm,acpi=off,pic=off,pit=off,rtc=on \
  -cpu host -accel kvm \
  -smp 2 -m 2048 \
  -nodefaults -no-user-config -no-reboot \
  -kernel /opt/claude-orch/share/images/vmlinux-x86_64 \
  -append "console=hvc0 root=/dev/vda ro rootfstype=ext4 quiet \
           claude.session_id=<sid> claude.boot_nonce=<nonce>" \
  -drive id=rootfs,file=/opt/claude-orch/share/images/rootfs-x86_64.raw,format=raw,if=none,readonly=on \
  -device virtio-blk-device,drive=rootfs \
  -device virtio-serial-device \
  -chardev socket,id=ctl,path=/run/claude-orch/sessions/<sid>/ctl.sock,server=on,wait=off \
  -device virtserialport,chardev=ctl,name=orchestrator \
  -chardev socket,id=fs,path=/run/claude-orch/sessions/<sid>/fs.sock,server=off,reconnect=1 \
  -device virtserialport,chardev=fs,name=workspace \
  -chardev socket,id=agent,path=/run/claude-orch/sessions/<sid>/agent.sock,server=on,wait=off \
  -device virtserialport,chardev=agent,name=agent \
  -chardev socket,id=stdio,path=/run/claude-orch/sessions/<sid>/stdio.sock,server=on,wait=off \
  -device virtserialport,chardev=stdio,name=stdio \
  -netdev tap,id=net0,ifname=tap-<sid8>,script=no,downscript=no \
  -device virtio-net-device,netdev=net0,mac=<derived> \
  -qmp unix:/run/claude-orch/sessions/<sid>/qmp.sock,server=on,wait=off
```

### macOS arm64

```
qemu-system-aarch64 \
  -machine virt,gic-version=3 -cpu host -accel hvf \
  -smp 2 -m 2048 \
  -nodefaults -no-user-config -no-reboot \
  -kernel /opt/claude-orch/share/images/Image-arm64 \
  -append "console=hvc0 root=/dev/vda ro rootfstype=ext4 quiet \
           claude.session_id=<sid> claude.boot_nonce=<nonce>" \
  -drive id=rootfs,file=/opt/claude-orch/share/images/rootfs-arm64.raw,format=raw,if=none,readonly=on \
  -device virtio-blk-pci,drive=rootfs \
  -device virtio-serial-pci \
  -chardev socket,id=ctl,path=/var/run/claude-orch/sessions/<sid>/ctl.sock,server=on,wait=off \
  -device virtserialport,chardev=ctl,name=orchestrator \
  -chardev socket,id=fs,path=/var/run/claude-orch/sessions/<sid>/fs.sock,server=off,reconnect=1 \
  -device virtserialport,chardev=fs,name=workspace \
  -chardev socket,id=agent,path=/var/run/claude-orch/sessions/<sid>/agent.sock,server=on,wait=off \
  -device virtserialport,chardev=agent,name=agent \
  -chardev socket,id=stdio,path=/var/run/claude-orch/sessions/<sid>/stdio.sock,server=on,wait=off \
  -device virtserialport,chardev=stdio,name=stdio \
  -netdev user,id=net0,net=10.0.2.0/24 \
  -device virtio-net-pci,netdev=net0,mac=<derived> \
  -qmp unix:/var/run/claude-orch/sessions/<sid>/qmp.sock,server=on,wait=off
```

---

## Appendix B: Reference 9P Server Outline (Node.js)

For a passthrough implementation backed by a host directory:

```js
import net from "node:net";
import fs from "node:fs/promises";

/**
 * Minimal 9P2000.L server. Listens on a UDS, services a single connection.
 * @param {string} socketPath
 * @param {string} rootDir
 */
export function serve(socketPath, rootDir) {
  const server = net.createServer((conn) => {
    /** @type {Map<number, Fid>} */
    const fids = new Map();
    const msize = 131072;

    conn.on("data", async (buf) => {
      // parse 9P frame: <size:4><type:1><tag:2><payload>
      const frames = splitFrames(buf);
      for (const frame of frames) {
        const { type, tag, payload } = parseFrame(frame);
        const reply = await dispatch(type, tag, payload, fids, rootDir);
        conn.write(reply);
      }
    });
  });

  server.listen(socketPath);
  return server;
}

// Implement Tversion, Tattach, Twalk, Topen, Tread, Twrite, Tclunk,
// Tgetattr, Tsetattr, Treaddir, Tcreate, Tmkdir, Tunlink, Trename, ...
```

The 9P2000.L spec (~50 pages, well-documented): [https://github.com/chaos/diod/blob/master/protocol.md](https://github.com/chaos/diod/blob/master/protocol.md).

For production callers, prefer a tested 9P library or implement against a passthrough reference plus a test suite (e.g., POSIX FS tests run inside the guest against `/workspace`).

---

## Appendix C: Example Session Lifecycle

```
T+0     client          POST /v1/sessions { network: "egress", arch: "x86_64" }
T+1ms   orchestrator    generate session_id="abc12345"
                        generate boot_nonce (32 random bytes)
                        reserve /run/claude-orch/sessions/abc12345/
                        record session in memory (state=pending)
                        request creds from broker → API key
                        return Session { fsSocketPath: ".../fs.sock", ... }
T+5ms   client          listen on fs.sock
                        POST /v1/sessions/abc12345/ready
T+6ms   orchestrator    create tap-abc12345 on bridge claudebr0
                        spawn QEMU with the argv from Appendix A
T+50ms  QEMU            boot kernel, mount initrd
T+800ms init            opens /dev/virtio-ports/orchestrator
                        sends Hello{abc12345, nonce, ...}
T+801ms orchestrator    validates nonce, single-uses it
                        sends BootConfig{creds, mount_tag, env}
T+810ms init            opens /dev/virtio-ports/workspace as fd 9
                        mount -t 9p -o trans=fd,rfdno=9,wfdno=9 ...
T+812ms QEMU            connects to fs.sock
T+813ms client          accept() returns 9P connection
                        begins serving 9P
T+820ms init            writes ~/.claude/.credentials.json
                        execs /usr/local/bin/claude-agent as uid 1000
T+830ms agent           opens /dev/virtio-ports/agent
                        sends Ready
T+832ms orchestrator    marks state=ready
                        forwards initial prompt via attach stream
T+835ms agent           spawns tmux + claude-code
                        wires stdio to stream multiplexer
... session runs ...
T+5min  client          DELETE /v1/sessions/abc12345
T+5m+1s orchestrator    sends Terminate to agent (5s grace)
T+5m+6s orchestrator    SIGKILL QEMU if still running
                        removes tap, deletes UDS files, frees session
                        broker.RevokeCreds(abc12345)
```

---

## Appendix D: Recommended Reading

- 9P2000.L protocol: [diod docs](https://github.com/chaos/diod/blob/master/protocol.md)
- Linux `v9fs` mount options: kernel docs at `Documentation/filesystems/9p.rst`
- QEMU `microvm` machine type: [QEMU docs](https://www.qemu.org/docs/master/system/i386/microvm.html)
- QEMU `virtio-serial` device: [QEMU docs](https://www.qemu.org/docs/master/system/devices/virtio-serial.html)
- Apple Hypervisor.framework: Apple developer docs
- nftables manual: `man 8 nft`
- macOS pf manual: `man 5 pf.conf`
- mkosi: [systemd/mkosi on GitHub](https://github.com/systemd/mkosi)

---

*End of document.*