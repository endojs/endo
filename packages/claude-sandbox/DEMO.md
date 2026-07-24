# Demo: Claude Code in a podman sandbox with a 9P-projected workspace

This walks through running Claude Code inside an [`@endo/sandbox`](../sandbox/README.md)
rootless podman slice, with the workspace projected from an Endo `Filesystem`
capability via a host-side 9P mount ("plan B" — see
[`README.md`](./README.md)).

> Status: recorded runbook, **not** an automated test.
> The commands are accurate against the caplets on this branch but are not wired
> into CI (same posture as the [9P server DEMO](../9p-server/DEMO.md)).
> The dependency-injected unit tests (`yarn test`) cover the logic without
> podman or root; a podman-gated `yarn test:integration` exercises a real slice +
> bind mount + stdout in CI (`claude-sandbox-integration`).

## Prerequisites

- Linux with a kernel that has v9fs (`CONFIG_9P_FS`) — needed for the host 9P
  mount.
  macOS cannot 9P-mount; you can still drive the `Filesystem` cap as a
  capability but not project it into a container this way.
- **podman**, rootless-capable.
  Confirm `podman info` works as your user and that `newuidmap`/`newgidmap` are
  installed (`/etc/subuid` + `/etc/subgid` entries for your user).
- `mount(2)` privilege: either a privileged/root daemon with `CAP_SYS_ADMIN`,
  or passwordless `sudo mount`/`umount` (see step 3).
- An Endo daemon from this repo checkout.

## Build a Claude image

The sandbox needs an OCI image with `node` **and** the `claude` CLI on `PATH`.
This package ships a "just works" one at
[`oci/Containerfile`](./oci/Containerfile): node + the Claude Code CLI plus a
general programming toolchain (git, ripgrep, `build-essential`, python3/pip) so
Claude can run coding tasks and install new dependencies inside the sandbox.
Build and tag it once:

```bash
podman build -t localhost/claude-code:latest \
  -f packages/claude-sandbox/oci/Containerfile packages/claude-sandbox/oci
```

Then make it the default so the form's `rootfs` is pre-filled and
`createSession` needs no `rootfs`:

```bash
# on the container host, before/when provisioning (see step 3)
export CLAUDE_SANDBOX_IMAGE=oci:localhost/claude-code:latest
```

Sessions run with `network: 'private'` by default — NAT'd outbound internet
(so `npm`/`pip` installs and the Anthropic API work) with **no route to the
host** or its LAN. The only other profile is `none` (no network at all); there
is deliberately no host networking.

## 1. Start the daemon

```bash
yarn exec endo start
yarn exec endo ping        # -> ok
```

## 2. Expose a workspace directory as a `Filesystem` cap

The shipped `node-fs-module.js` caplet reads `ENDO_FS_ROOT` and returns a
high-fidelity Node-backed `Filesystem`:

```bash
yarn exec endo make --UNCONFINED \
  packages/platform/src/fs/extended/node-fs-module.js \
  --powers @none \
  -E ENDO_FS_ROOT="$PWD/my-project" \
  --name project-fs
```

(For a remote workspace held by another daemon, adopt it first per the
[9P DEMO](../9p-server/DEMO.md) Part B3, then use that pet name below.)

## 3. Provision the Claude sandbox stack

Provisioning is split by machine role, and everything nests under host
directories so the root inventory stays clean:

- **`setup-host.js`** (run on the container host) mints, under
  `claude-sandbox/`: `sandbox-factory` (the `@endo/sandbox` plugin),
  `fs-mounter` (the 9P mount caplet), `service` (the factory caplet — runs the
  mailbox/form loops), `profile` + `handle` (the factory guest), and a
  `readme`.
- **`setup-peer.js`** (run on the machine that owns the Anthropic account)
  mints, under `claude-credentials/`: `service`, `profile`, `handle`, and
  a `readme`. The long-lived key never leaves the peer.

For a **single-machine** demo, run both on the same daemon. Each directory
carries a `readme.md` describing its objects and the security of sharing each —
read it with `endo cat claude-sandbox/readme.md` (or list a directory with
`endo list claude-sandbox`).

**Host setup — privileged / root daemon** (e.g. a `--privileged` container or
dev VM), no `NINEP_SUDO`:

```bash
yarn exec endo run --UNCONFINED \
  packages/claude-sandbox/setup-host.js --powers @agent \
  -E CLAUDE_SANDBOX_IMAGE=localhost/claude-code:latest
```

**Host setup — unprivileged daemon** (typical workstation) — route
mount/umount through `sudo`:

```bash
yarn exec endo run --UNCONFINED \
  packages/claude-sandbox/setup-host.js --powers @agent \
  -E NINEP_SUDO=1 \
  -E CLAUDE_SANDBOX_IMAGE=localhost/claude-code:latest
```

**Peer setup — the credential holder's machine** (also run here for a
single-box demo):

```bash
yarn exec endo run --UNCONFINED \
  packages/claude-sandbox/setup-peer.js --powers @agent
```

```
# /etc/sudoers.d/endo-9p
youruser ALL=(root) NOPASSWD: /usr/bin/mount, /usr/bin/umount
```

## 4. Store your Claude auth as a `ClaudeCredentials` cap

A credential has a `kind`: `apiKey` (a raw Anthropic API key, injected as
`ANTHROPIC_API_KEY`) or `oauthToken` (a long-lived OAuth token from
`claude setup-token`, injected as `CLAUDE_CODE_OAUTH_TOKEN`).

**OAuth (subscription login) — recommended for the bring-your-own-auth flow.**
Mint a headless OAuth token on the machine that owns the Claude login, then
store it as a credential:

```bash
claude setup-token            # prints an OAuth token (sk-ant-oat...)

yarn exec endo inbox          # find the "Create Claude Credentials" form, note its number
yarn exec endo submit <n> \
  name: claude-creds \
  kind: oauthToken \
  apiKey: sk-ant-oat...
# -> 'ClaudeCredentials "claude-creds" created.'
```

**API key:**

```bash
yarn exec endo submit <n> \
  name: claude-creds \
  kind: apiKey \
  apiKey: sk-ant-...
```

The secret is written to `~/.endo-claude-credentials/claude-creds.key` (mode
`0600`); the formula store only sees that path. Because `issue()`/`materialise()`
are eventual-sends, this cap can live on a **remote peer** that mints a
short-lived token per session — the host then only ever sees the short-lived
secret. `E(claude-creds).kind()` reports the kind the session uses to pick the
env var.

## 5. Create the sandbox session

There are two ways to create a session. Both are **mailbox**-based and leave the
session **host-rooted** (destroy with `endo remove <name>`): a capability can
only cross a daemon boundary by `send`/`adopt`, so there is no cap-argument
method.

**A. The `@host` form (operator path).**
The operator submits the form with **host pet names** (resolved with the
operator's own authority); the `ClaudeClient` is stored under the chosen name:

```bash
yarn exec endo inbox            # find the "Create Claude Sandbox" form, note its number
yarn exec endo submit <n> \
  name: claude-1 \
  filesystem: project-fs \
  rootfs: oci:localhost/claude-code:latest \
  network: private \
  model: claude-sonnet-4-6 \
  credentials: claude-creds \
  initialPrompt:
```

**B. Remote peer — `send` a session-request package.**
The peer brings its own caps without naming them on the host: it `send`s the
host a package whose `filesystem` (+ optional `credentials`) edge carries the
caps and whose first string is the JSON config. The config must be marked
`"kind":"claude-sandbox-session"` so the factory recognises it (and ignores
unrelated `filesystem`-edged traffic). The factory `adopt`s the caps and replies
with a `client` edge to adopt. (Establish the mailbox first with `endo invite` /
`endo accept`.)

Caps ride as inline `@edge:petName` refs; the text before the first ref is
`strings[0]`, the JSON config:

```bash
# On the peer (which holds `project-fs`, `claude-creds`, and a `host` handle):
yarn exec endo send host \
  '{"kind":"claude-sandbox-session","name":"claude-1","rootfs":"oci:localhost/claude-code:latest","network":"private"} @filesystem:project-fs @credentials:claude-creds'
# …then adopt the factory's reply:
yarn exec endo inbox                 # note the reply message number <r>
yarn exec endo adopt <r> client --name claude-1
```

Either way the session is a first-class `claude-client` formula that provisions
lazily on the first `send()`:

1. `E(fs-mounter).mount(project-fs, <tmp>/claude-sandbox-claude-1-<id>)` — stands
   up the 9P bridge and runs `mount -t 9p`,
2. `E(@host).provideMount(<mountpoint>, claude-claude-1-<id>-workspace)`,
3. materialise the credential and pick its env var by `kind`
   (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`),
4. `E(sandbox-factory).make({ rootfs, mounts:[{cap → /workspace, mode:'rw'}],
   network, env:{ <credentialVar> }, cwd:'/workspace', backend:'podman' })`.

The credential is referenced by pet name and materialised inside the session at
spawn time, so no secret enters the formula `env`.

## 6. Talk to Claude

`send()` returns a reader of stream-json events; drive it with `makeRefIterator`:

```bash
yarn exec endo eval --UNCONFINED \
  '(async () => { const r = makeRefIterator(await E(c).send("List the files in the workspace and summarise the README.")); for await (const ev of r) console.log(JSON.stringify(ev)); })()' \
  c:claude-1
```

Each line is one stream-json event (`{"type":"system",…}`,
`{"type":"assistant",…}`, `{"type":"result",…}`), followed by a terminal
`{"type":"end"}` (or `{"type":"abort","reason":…}` on error). Closing the reader
early aborts the turn (kills the `claude` process). Subsequent `send()` calls
queue and pass `--continue`, so the conversation builds up in the workspace.

Check status or interrupt a long turn:

```bash
yarn exec endo eval 'E(c).status()' c:claude-1
yarn exec endo eval 'E(c).interrupt()' c:claude-1   # kills the in-flight claude; slice survives
```

## 7. Tear down

`terminate()` stops the session but **leaves the formula**, which re-provisions
a fresh container on the next `send()`:

```bash
yarn exec endo eval 'E(c).terminate()' c:claude-1   # dispose slice + unmount; formula survives
```

To **destroy** the session permanently — dispose the container, unmount the
workspace, and delete the formula — the teardown is wired to the daemon's
cancellation, so any of these does the full cleanup:

```bash
# Form/host-rooted session: remove its pet name.
yarn exec endo remove claude-1
# (equivalently: yarn exec endo cancel claude-1)
```

Both create paths are host-rooted (mailbox delivery attaches the client by
name), so removing the pet name is how you destroy a session — there is no
caller-held cap to drop. A peer-initiated destroy (so a peer can tear down its
own session without operator action) is future work.
See [DESIGN.md § Session lifecycle, teardown & GC](./DESIGN.md#session-lifecycle-teardown--gc).

## Troubleshooting

- **`claude: not found` inside the slice** — your image lacks the CLI; rebuild
  per "Build a Claude image" and pass that ref as `rootfs`.
- **`mount: only root can use "--types" option` / `EPERM`** — the daemon is
  unprivileged and `NINEP_SUDO` was not set (step 3), or the sudoers entry is
  missing.
- **Workspace files owned by `nobody`** — rootless podman's uid mapping over the
  9P-synthesized uid/gid 1000; usually harmless for Claude's edits.
  Try `cache=loose` via the mount caplet's `extraMountOptions`.
- **`podman` pull/permission errors** — verify rootless podman works standalone
  (`podman run --rm localhost/claude-code:latest claude --version`) before
  blaming the slice.
- **Container gone after `endo restart`, but the session still answers** —
  expected: the `ClaudeClient` is a pure-`env` formula that reincarnates, and the
  next `send()` re-mounts the workspace and mints a fresh container (the podman
  driver sweeps `endo-sandbox-*` orphans at boot). The workspace and conversation
  persist in the `Filesystem` cap; `claude --continue` resumes. See
  [`README.md`](./README.md) § "Lifecycle".
