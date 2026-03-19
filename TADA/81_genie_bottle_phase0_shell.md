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

- A single shell script at `packages/genie/scripts/bottle.sh` with two
  modes dispatched by subcommand:
  - `invoke` — runs _inside_ the bottle; brings up an endo daemon
    under the invoking user's XDG paths, provisions the transport
    and the genie guest, emits the owner invite.
    The daemon it starts is long-lived; the script does _not_ tear
    it down when it exits.
  - `evoke` — runs on the _operator's_ workstation; reaches into a
    remote SSH target, places the endo CLI there, and runs
    `bottle.sh invoke` on that host.
- For `invoke`:
  - Assumes `endo` is already on `$PATH`
    (install-path work is in `evoke` for Phase 0, and is revisited
    in Phase 3).
  - Uses the invoking user's own XDG state / socket paths; no
    throwaway state dir, no purge-on-start, no cleanup trap.
    The bottle's daemon is meant to outlive any single turn-up.
    Tear-down is the operator's job (`endo stop`, or the systemd
    unit landed in Phase 4).
  - Re-runs are idempotent: transport turnup is skipped when
    `@nets/<transport>` already exists, and `endo start` does
    nothing when a daemon is already running.
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
  - Runs `endo invite owner` at the _host_ level after setup
    completes.
  - Emits the locator to both:
    - stdout, with a copy-paste-ready multi-line banner
    - `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`
  - Emits a "waiting for owner…" readiness signal by polling the
    host inbox for a first message from a non-self locator, and
    removes `PENDING_OWNER_INVITE` once that message lands.
- For `evoke`:
  - SSH target is positional (`user@host[:port]`).
  - `--install=push` (default): uses the bring-your-own-repo push
    mode from `PLAN/genie_in_bottle.md` § 2 _install_ — pushes the
    local checkout's `HEAD` (overridable with `--ref`) to a bare
    repo on the remote, clones it into a work tree, runs
    `corepack yarn install`, and invokes `bottle.sh invoke` from
    the checkout.
  - `--install=yarn-global`: runs `yarn global add
    github:endojs/endo#<branch>` on the remote.
    Left in-place but flagged with the caveat from the plan that
    the repo root's `"private": true` may stop yarn-global from
    linking the `endo` bin; Phase 3 settles this.
  - `--install=none`: skips install entirely and just runs
    `bottle.sh invoke` on the remote (for hosts where endo is
    already available).
  - Pass-through: anything after `--` is forwarded verbatim to the
    remote `bottle.sh invoke`.

Phase 0 is _out_ of scope
(each goes to the phase it's listed under in the plan):

- `--owner` flag in `setup.js`           → Phase 1
- Primordial genie / `/model` builtin    → Phase 2
- Hardening the install story,
  validating yarn-global in a clean VM   → Phase 3
- systemd user unit generation           → Phase 4
- `sd_notify` / socket activation        → Phase 5
- Unix-domain / SSH-piped netlayers      → Phase 6

## Work items

### Invoke mode (runs inside the bottle)

- [x] Add `packages/genie/scripts/bottle.sh`.
  - [x] Shell options: `set -euo pipefail`.
  - [x] Subcommand dispatch: first non-flag arg picks
        `invoke` or `evoke`.  `--help` works at any level.
  - [x] Argument parsing for invoke: `--transport=(libp2p|tcp|both)`
        (default `libp2p`), `--workspace=<path>`
        (default `$XDG_DATA_HOME/endo/genie/workspace`,
        falling back to `$HOME/.local/share/endo/genie/workspace`).
        The tailscale / wireguard aliases were pruned — per
        `PLAN/genie_in_bottle.md` § "Overlay / tunnel transports",
        overlay networks present as plain TCP, so the operator
        just supplies the overlay IP via `--listen`.
  - [x] `-E KEY=VAL` passthrough for model / workspace env.
        `-f <env-file>` also accepted.
- [x] Use the invoking user's own XDG tree; no throwaway state dir.
      The bottle's daemon is meant to outlive the turn-up script,
      so we don't export `ENDO_STATE_PATH` / `ENDO_EPHEMERAL_STATE_PATH`
      / `ENDO_SOCK_PATH` / `ENDO_CACHE_PATH` at all — they default to
      the standard XDG layout.
- [x] Start the daemon (`endo start`) and wait for readiness via
      `endo ping` polling with a sane deadline.
      No purge-on-start: `endo start` is idempotent and we do _not_
      wipe an already-running daemon.
      (Replaced by `sd_notify` in Phase 5.)
- [x] Transport turnup (idempotent — skipped when
      `@nets/<transport>` already exists):
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
  - [x] Poll `endo inbox` for the first non-self `sent` / `replied to`
        / `sent form` / `sent value` message.  Detection uses
        inbox.js's `"<name>" <verb>` prefix for messages with a
        reverse-locatable peer sender — self-originated messages
        render as `you ... yourself` and are excluded.
  - [x] On first owner message, delete
        `$GENIE_WORKSPACE/PENDING_OWNER_INVITE` and log
        "owner attached".
  - [x] `--no-wait` flag skips the readiness wait for operators who
        want to drive acceptance from a separate tool.
- [x] **No cleanup trap**: the bottle daemon survives the script.
      After the readiness wait resolves (or `--no-wait` exits
      early), the script just returns and the daemon keeps running.
      Operator tears it down with `endo stop` when done.
- [x] Script banner: on start, print the chosen transport(s),
      workspace path, listen addr, and model spec so the operator
      can tell what got built.

### Evoke mode (runs on the operator's workstation)

- [x] Positional SSH target (`user@host[:port]`).
- [x] `--install=(push|yarn-global|none)` chooses how to get endo
      onto the remote.
  - [x] `push` (default): bring-your-own-repo push mode from
        `PLAN/genie_in_bottle.md` § 2 _install_.
        SSH in to `git init --bare` if the bare repo is missing;
        `git push --force <target>:<remote-bare> <ref>:refs/heads/<branch>`;
        clone/checkout the work tree on the remote;
        `corepack yarn install --immutable`.
  - [x] `yarn-global`: `yarn global add github:endojs/endo#<branch>`
        on the remote.  Flagged in-script with the caveat from the
        plan that the repo-root `"private": true` may stop
        yarn-global from linking the `endo` bin; Phase 3 validates
        this in a clean VM.
  - [x] `none`: assume endo is already on the remote PATH; just
        run `bottle.sh invoke` there.
- [x] `--ref` (default `HEAD`), `--branch` (default `bottle`),
      `--remote-bare` (default `$HOME/endo.git`),
      `--remote-work` (default `$HOME/endo`) flags.
- [x] Everything after `--` is forwarded verbatim to the remote
      `bottle.sh invoke`.  `printf '%q '` is used to preserve
      argument quoting across the SSH shell.
- [x] `exec ssh -t` handoff: once install is done, the script
      `exec`s into the remote invoke and does not return.

## Verification

This section is a checklist for the human reviewer, AI assistant leave it alone.

The script is considered working when all of these succeed in a
clean checkout with an Ollama/local model available:

- [x] **Dry-run help:** `./packages/genie/scripts/bottle.sh --help`
      prints flag docs and exits 0.
- [ ] **libp2p default (invoke):**
      `GENIE_MODEL=ollama/llama3.2 ./packages/genie/scripts/bottle.sh invoke`
      — daemon starts (or was already running), libp2p installs
      under `@nets/libp2p`, genie setup runs, invite locator
      appears on stdout and in
      `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`.
- [ ] **TCP fallback (invoke):**
      `./packages/genie/scripts/bottle.sh invoke --transport=tcp`
      — same, but the locator's `at=` parameter is a TCP address.
- [ ] **Both transports (invoke):**
      `./packages/genie/scripts/bottle.sh invoke --transport=both`
      — the invite locator includes both transports
      (per `MULTIPLAYER.md:168–172`).
- [ ] **Owner accept path:** from a _second_ endo daemon
      (the operator's), `endo accept bottle < PENDING_OWNER_INVITE`
      — handshake succeeds, first message from operator is
      delivered, bottle side's `PENDING_OWNER_INVITE` is removed.
      Reference acceptor flow:
      `packages/cli/src/commands/accept.js`.
- [ ] **Daemon survives:** after invoke returns (owner attached or
      `--no-wait` exit), `endo ping` still succeeds on the bottle
      host.  The daemon is explicitly _not_ torn down by the
      script; `endo stop` is the way out.
- [ ] **Re-run safety:** running `invoke` twice in a row on the
      same host does not double-install transports
      (`@nets/<name>` presence check short-circuits) and does not
      purge any state.  A second `invite owner` produces a fresh
      locator; the prior locator is overwritten in
      `PENDING_OWNER_INVITE`.
- [ ] **Evoke push:**
      `./packages/genie/scripts/bottle.sh evoke <user@host> -- -E GENIE_MODEL=ollama/llama3.2`
      — local checkout pushes to `<host>:~/endo.git`, clones into
      `~/endo`, runs `yarn install`, execs into `bottle.sh invoke`
      there.  Owner invite locator is printed back over the SSH
      session.
- [ ] **Evoke idempotency:** re-running `evoke` against the same
      host updates the bottle branch with a `--force` push,
      re-runs `yarn install` (idempotent), and re-enters invoke.

## Hand-off

- [x] README stub written at `packages/genie/scripts/README.md`,
      pointing at `PLAN/genie_in_bottle.md` and
      `TODO/81_genie_bottle_phase0_shell.md`.
- [x] Commit the script plus the README stub.
- [x] Post a summary in the commit message covering: what the
      script does, which transports were exercised, and how the
      operator completes the owner handshake.
- [x] Follow-up round (2026-04-22): pruned the throwaway assumptions
      that had leaked in from `test/integration.sh`, split the
      script into `invoke` / `evoke` modes, added the
      bring-your-own-repo push flow in evoke.  Tracked in
      `TODO/81_genie_bottle_not_throwaway.md`.
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
