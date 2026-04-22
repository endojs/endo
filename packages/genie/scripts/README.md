# genie scripts

Operator-facing shell recipes that compose `@endo/genie` with other
Endo primitives.
These are deliberately thin wrappers around the CLI so they can be
read as executable documentation.

## `bottle.sh` — genie in a bottle (Phase 0)

Two-mode shell recipe for the "genie in a bottle" deployment shape.
The bottle itself is a long-lived Endo daemon on some host — not a
throwaway test fixture — hosting a root genie agent that the
operator attaches to via invite/accept.

- **`bottle.sh invoke [options]`** runs _inside_ the bottle.
  Starts the daemon under the invoking user's XDG paths (no
  throwaway state dir), installs a network transport, provisions
  the genie guest, and emits an `endo invite owner` locator to
  stdout and to `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`.
  Removes the `PENDING_OWNER_INVITE` file once the operator's
  `endo accept` lands.
  The daemon is explicitly _not_ torn down when the script exits;
  use `endo stop` (or the systemd unit landed in Phase 4) when
  you're done with the bottle.

- **`bottle.sh evoke [options] <user@host>`** runs on the
  _operator's_ workstation.
  Places a copy of endo on the remote (default: `git push` the
  current checkout to `~/endo.git` on the remote, clone it into
  `~/endo`, `corepack yarn install`) and then execs into
  `bottle.sh invoke` on that host.
  Arguments after `--` are forwarded verbatim to the remote invoke.

Phase 0 is the "proof of composition" milestone — every piece is an
already-existing Endo primitive, so later phases
(R2 `--owner` flag, R3 primordial genie, systemd unit, `sd_notify`,
additional netlayers, hardening the install path) can replace them
one at a time.
See [`PLAN/genie_in_bottle.md`](../../../PLAN/genie_in_bottle.md) for
the surrounding design and
[`TODO/81_genie_bottle_phase0_shell.md`](../../../TODO/81_genie_bottle_phase0_shell.md)
for the scope this script implements.

Usage summary:

```sh
# Run directly on a bottle host (endo already on PATH).
GENIE_MODEL=ollama/llama3.2 \
  ./packages/genie/scripts/bottle.sh invoke

# TCP fallback transport.
./packages/genie/scripts/bottle.sh invoke --transport=tcp

# Both transports; the locator aggregates across them.
./packages/genie/scripts/bottle.sh invoke --transport=both

# From your workstation: push this checkout to the bottle and run
# invoke on the other side, forwarding GENIE_MODEL through.
./packages/genie/scripts/bottle.sh evoke user@bottle-host -- \
  -E GENIE_MODEL=ollama/llama3.2
```

The script prints flag documentation via `--help`.

## Related

- [`packages/genie/test/integration.sh`](../test/integration.sh) —
  the closest existing shell recipe.
  Unlike `bottle.sh`, integration.sh _is_ throwaway: it builds an
  isolated daemon under `packages/genie/tmp/` and tears it down on
  exit.  `bottle.sh invoke` intentionally runs under the user's
  own XDG tree so the bottle daemon can outlive any single turn-up.
- [`packages/genie/setup.js`](../setup.js) — the genie provisioner
  invoked from the script.
- [`packages/daemon/MULTIPLAYER.md`](../../daemon/MULTIPLAYER.md) —
  `ENDO_SOCK` / `ENDO_ADDR` / XDG conventions and multi-transport
  locator aggregation.
