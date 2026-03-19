# Genie integration test hardening

Small reliability and correctness improvements to
`packages/genie/test/integration.sh`.

## Deadline-based timeouts

- [x] Refactor `wait_for` to use `date +%s` deadline instead of
      elapsed counter
  - `local deadline=$(( $(date +%s) + max_wait ))`
  - Loop condition: `while (( $(date +%s) < deadline ))`
  - This accounts for wall-clock time spent in `endo inbox` calls

- [x] Apply the same refactor to `wait_for_reply`

- [x] Apply the same refactor to the REPL inline polling loop

## Message filtering in `wait_for_reply`

- [x] Skip tool-call messages
  - Endo inbox displays message types via verbs: "sent" (package),
    "requested" (request/tool-call), "proposed" (definition),
    form submissions.
  - Added filters to skip "requested" and "proposed" lines,
    matching only substantive "sent" replies from the agent.

- [x] Only match on final assistant reply messages
  - `endo inbox` does expose message type via the verb in each
    line but does NOT have `--type` or `--json` flags.
  - Filtering by verb ("requested", "proposed", "Thinking...")
    is sufficient for now; adding `--json` to `endo inbox`
    would be a separate enhancement.

## Confirm `ENDO_ADDR=127.0.0.1:0`

- [x] Verify the daemon correctly binds to an OS-assigned port and
      the CLI resolves it via the socket/state path
  - Confirmed: the gateway binds to port 0 and logs the
    OS-assigned port, but the CLI connects via the Unix socket
    (`config.sockPath`), not the gateway.  All `endo` CLI
    commands (inbox, send, ping, etc.) use the socket path.
  - Gateway tests (`gateway.test.js`) and fae integration tests
    (`channel-mention.test.js`) both use `127.0.0.1:0`
    successfully.
  - Removed the `XXX` comment from integration.sh.

## Daemon startup with `ENDO_EXTRA`

- [x] Investigate whether an `ENDO_EXTRA` mechanism exists or could
      be added to load formulas at daemon boot
  - `ENDO_EXTRA` exists in `daemon-node.js` (lines 182-196).
    It takes a comma-separated list of module specifiers, each
    exporting `main(host)`.
  - `setup.js` already exports `main(agent)` — compatible.
  - **Blocker**: `filterEnv()` in `daemon/index.js` only passes
    `ENDO_*` and `LOCKDOWN_*` env vars to the daemon subprocess.
    `GENIE_MODEL` and `GENIE_WORKSPACE` would not reach the
    daemon.  Would need to rename them or extend `filterEnv`.
  - Added a NOTE comment in integration.sh explaining this.
    The explicit `endo run` approach is kept for now.
