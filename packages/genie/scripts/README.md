# genie scripts

Operator-facing shell recipes that compose `@endo/genie` with other
Endo primitives.
These are deliberately thin wrappers around the CLI so they can be
read as executable documentation.

## `bottle.sh` — genie in a bottle (Phase 0)

Stands up a throwaway Endo daemon, installs a network transport,
provisions the genie guest, and emits an `endo invite owner` locator
to stdout and to `$GENIE_WORKSPACE/PENDING_OWNER_INVITE`.
Removes the `PENDING_OWNER_INVITE` file once the operator's
`endo accept` lands.

Phase 0 is the "proof of composition" milestone — every piece is an
already-existing Endo primitive, so later phases
(R2 `--owner` flag, R3 primordial genie, systemd unit, `sd_notify`,
additional netlayers, install-path work) can replace them one at a
time.
See [`PLAN/genie_in_bottle.md`](../../../PLAN/genie_in_bottle.md) for
the surrounding design and
[`TODO/81_genie_bottle_phase0_shell.md`](../../../TODO/81_genie_bottle_phase0_shell.md)
for the scope this script implements.

Usage summary:

```sh
# libp2p default
GENIE_MODEL=ollama/llama3.2 ./packages/genie/scripts/bottle.sh

# TCP fallback
./packages/genie/scripts/bottle.sh --transport=tcp

# Both transports, locator aggregates across them
./packages/genie/scripts/bottle.sh --transport=both
```

The script prints flag documentation via `--help`.

## Related

- [`packages/genie/test/integration.sh`](../test/integration.sh) —
  closest existing shell-recipe template.
  `bottle.sh` mirrors its isolated-daemon layout.
- [`packages/genie/setup.js`](../setup.js) — the genie provisioner
  invoked from the script.
- [`packages/daemon/MULTIPLAYER.md`](../../daemon/MULTIPLAYER.md) —
  `ENDO_SOCK` / `ENDO_ADDR` / XDG conventions and multi-transport
  locator aggregation.
