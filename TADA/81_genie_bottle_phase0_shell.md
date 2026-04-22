# Phase 0: Bottle script as a dumb shell recipe

Derived from
[`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md)
§ Implementation phases → Phase 0.

The goal of Phase 0 is _proof of composition_:
show that the bottle-script shape works end-to-end with only
already-existing Endo primitives, before any of the later phases
(R2's `--owner` flag, R3's primordial genie, systemd, etc.) land.
It deliberately stubs out what the later phases will replace.

## Scope

Phase 0 is in scope:

- A single shell script at `packages/genie/scripts/bottle.sh`.
- Assumes `endo` is already on `$PATH`
  (no install concerns — those are Phase 3).
- Runs against an isolated daemon in a throwaway state dir,
  much like `packages/genie/test/integration.sh` already does.
- Picks a transport.
  Default: libp2p via
  `packages/daemon/src/networks/setup-libp2p.js`.
  Fallback: TCP via the
  `tcp-listen-addr` + `tcp-netstring.js` recipe.
  Operator selects with `--transport=libp2p|tcp|both`.
- Runs `setup.js` in the Phase 0 _fallback_ shape: the existing
  `main-genie` path with `GENIE_MODEL` / `GENIE_WORKSPACE` from env.
  The `--owner` flag is left as a TODO comment in the script that
  points at Phase 1; this is explicitly called out in
  `PLAN/genie_in_bottle.md` as the interim composition.
- Runs `endo invite owner` at the _host_ level after setup completes.
- Emits the locator to both:
  - stdout, with a copy-paste-ready multi-line banner
  - `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`
- Emits a "waiting for owner…" readiness signal by polling the
  host inbox for a first message from a non-self locator, and
  removes `PENDING_OWNER_INVITE` once that message lands.

Phase 0 is _out_ of scope
(each goes to the phase it's listed under in the plan):

- `--owner` flag in `setup.js`           → Phase 1
- Primordial genie / `/model` builtin    → Phase 2
- Install-path work (yarn-global, BYOR)  → Phase 3
- systemd user unit generation           → Phase 4
- `sd_notify` / socket activation        → Phase 5
- Unix-domain / SSH-piped netlayers      → Phase 6

## Work items

- [x] Add `packages/genie/scripts/bottle.sh`.
  - [x] Shell options: `set -euo pipefail`.
  - [x] Argument parsing: `--transport=(libp2p|tcp|both)`
        (default `libp2p`), `--workspace=<path>`
        (default `$XDG_DATA_HOME/endo/genie/workspace`,
        falling back to `$HOME/.local/share/endo/genie/workspace`).
        Also accepts `tailscale` / `wireguard` as TCP aliases,
        per `PLAN/genie_in_bottle.md` § "Overlay / tunnel transports".
  - [x] `-E KEY=VAL` passthrough for model / workspace env,
        mirroring `test/integration.sh`.
        `-f <env-file>` also accepted.
- [x] Set up an isolated daemon environment
      (`ENDO_STATE_PATH`, `ENDO_EPHEMERAL_STATE_PATH`,
      `ENDO_SOCK_PATH`, `ENDO_CACHE_PATH`, `ENDO_ADDR=127.0.0.1:0`).
      Mirror the pattern from
      `packages/genie/test/integration.sh:87–104`.
- [x] Start the daemon (`endo start`) and wait for readiness
      via `endo ping` polling with a sane deadline.
      (Replaced by `sd_notify` in Phase 5.)
- [x] Transport turnup:
  - [x] `libp2p`: `endo run --UNCONFINED packages/daemon/src/networks/setup-libp2p.js --powers @agent`.
  - [x] `tcp`:
        `endo store --text "$ENDO_ADDR" --name tcp-listen-addr`
        then
        `endo make --UNCONFINED packages/daemon/src/networks/tcp-netstring.js --powers @agent --name network-service`
        then `endo mv network-service @nets/tcp`.
        (Matching the pet-path layout `setup-libp2p.js` uses for
        `@nets/libp2p`; MULTIPLAYER.md's `NETS/tcp` appears to be a
        doc typo — `@nets` is the special name for the networks hub
        in `guest.js:96`.)
  - [x] `both`: do libp2p first, then TCP. Invitation locator
        aggregates the `at=` parameters from both transports
        (per `MULTIPLAYER.md:168–172`), so we just let
        `endo invite` do the work.
- [x] Genie setup (Phase 0 shape):
  - [x] Require `GENIE_MODEL`; warn+continue if `GENIE_WORKSPACE`
        unset and use the default.
  - [x] Run `endo run --UNCONFINED packages/genie/setup.js --powers @agent -E GENIE_MODEL=… -E GENIE_WORKSPACE=…`.
  - [x] Leave a `# TODO(phase-1): --owner flag` comment immediately
        above this invocation, pointing at the Phase 1 section in
        `PLAN/genie_in_bottle.md`.
- [x] Owner invite:
  - [x] `endo invite owner` and capture stdout.
  - [x] Print the captured locator inside a banner
        (`=== OWNER INVITE ===` block with copy-paste instructions)
        to make SSH scrollback legible.
  - [x] Write the locator to
        `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`.
- [x] Readiness wait:
  - [x] Start an inbox tail (shell reasonable approach:
        poll `endo inbox` for the first non-self `sent`/`package`
        message).  Detection is via inbox.js's `"<name>" <verb>`
        prefix for messages with a reverse-locatable peer sender —
        self-originated messages render as `you ... yourself` and are
        excluded.
  - [x] On first owner message, delete
        `$GENIE_WORKSPACE/PENDING_OWNER_INVITE` and log
        "owner attached".
  - [x] `--no-wait` flag skips the readiness wait for operators who
        want to drive acceptance from a separate tool.
- [x] Cleanup trap: on `EXIT`, `endo purge -f` and `pkill`
      the daemon process tied to the state dir.
      Mirror `test/integration.sh:267–275`.
      Workspace contents are left in place (operator's data);
      only the throwaway state dir is removed.
- [x] Script banner: on start, print the chosen transport(s),
      workspace path, daemon state dir, sock path, listen addr,
      and model spec so the operator can tell what got built.

## Verification

This section is a checklist for the human reviewer, AI assistant leave it alone.

The script is considered working when all of these succeed in a
clean checkout with an Ollama/local model available:

- [x] **Dry-run help:** `./packages/genie/scripts/bottle.sh --help`
      prints flag docs and exits 0.
- [ ] **libp2p default:**
      `GENIE_MODEL=ollama/llama3.2 ./packages/genie/scripts/bottle.sh`
      — daemon starts, libp2p installs under `@nets/libp2p`,
      genie setup runs, invite locator appears on stdout and in
      `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`.
- [ ] **TCP fallback:**
      `./packages/genie/scripts/bottle.sh --transport=tcp` —
      same, but the locator's `at=` parameter is a TCP address.
- [ ] **Both transports:**
      `./packages/genie/scripts/bottle.sh --transport=both` —
      the invite locator includes both transports
      (per `MULTIPLAYER.md:168–172`).
- [ ] **Owner accept path:** from a _second_ endo daemon
      (the operator's), `endo accept bottle < PENDING_OWNER_INVITE`
      — handshake succeeds, first message from operator is
      delivered, bottle side's `PENDING_OWNER_INVITE` is removed.
      Reference acceptor flow:
      `packages/cli/src/commands/accept.js`.
- [ ] **Cleanup:** `Ctrl-C` or normal exit removes the daemon's
      state dir and leaves no `daemon-node` processes behind
      (`pgrep -f daemon-node` is empty afterward).
- [ ] **Re-run safety:** running the script twice back-to-back
      does not trip over leftover state — each run builds a
      fresh throwaway state tree.

## Hand-off

- [x] README stub written at `packages/genie/scripts/README.md`,
      pointing at `PLAN/genie_in_bottle.md` and
      `TODO/81_genie_bottle_phase0_shell.md`.
- [x] Commit the script plus the README stub.
- [x] Post a summary in the commit message covering: what the
      script does, which transports were exercised, and how the
      operator completes the owner handshake.
- [ ] Verification section remains unchecked — leave this TODO
      file in review-pending state until the human confirms they've
      run it end-to-end at least once.

## References

- [`PLAN/genie_in_bottle.md`](../PLAN/genie_in_bottle.md) — design
- [`packages/genie/test/integration.sh`](../packages/genie/test/integration.sh)
  — closest existing shell-recipe template
- [`packages/genie/setup.js`](../packages/genie/setup.js) — the
  genie provisioner invoked from the script
- [`packages/daemon/src/networks/setup-libp2p.js`](../packages/daemon/src/networks/setup-libp2p.js)
  — one-liner libp2p turnup
- [`packages/daemon/src/networks/tcp-netstring.js`](../packages/daemon/src/networks/tcp-netstring.js)
  — TCP turnup recipe
- [`packages/cli/src/commands/invite.js`](../packages/cli/src/commands/invite.js)
  — what `endo invite owner` prints to stdout
- [`packages/cli/src/commands/accept.js`](../packages/cli/src/commands/accept.js)
  — the matching acceptor used in verification
- [`packages/daemon/MULTIPLAYER.md`](../packages/daemon/MULTIPLAYER.md)
  — `ENDO_SOCK` / `ENDO_ADDR` / XDG conventions and
  multi-transport locator aggregation
