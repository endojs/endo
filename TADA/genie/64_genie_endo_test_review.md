# Next steps for the genie integration test

- [x] review `# TODO` feedback left in `packages/genie/test/integration.sh`
  - update this task file with your understanding of those notes

## Inline TODO inventory

### 1. Deadline-based timeout (lines 95, 130)

Both `wait_for` and `wait_for_reply` track elapsed time with a counter
incremented by the sleep interval.
The note suggests computing `deadline=$(( $(date +%s) + max_wait ))`
and comparing `$(date +%s) < deadline` in the loop condition.
This is more accurate because it accounts for the wall-clock time
consumed by `endo inbox` itself, not just the sleeps.

### 2. `ENDO_ADDR="127.0.0.1:0"` — XXX does this work? (line 62)

Port 0 is OS-assigned, which is the standard trick for test isolation
(see CLAUDE.md: "Port 0 is falsy in JavaScript").
The question is whether the daemon and CLI properly propagate the
randomly assigned port.
The gateway tests already use this pattern successfully, so it should
work here too, but the XXX suggests it hasn't been confirmed for this
code-path yet.

### 3. Skip tool-call messages (line 157)

`wait_for_reply` currently skips "Thinking…" status lines but does not
filter out tool-call messages (e.g. file reads, web fetches).
These are intermediate and should not count as a substantive reply.
Need a heuristic or message-type check to distinguish tool calls from
final assistant text.

### 4. Detect final assistant reply (line 159)

Related to #3 — ideally we stop polling only when we see a true
"assistant reply" message, not an intermediate status or tool result.
Open question: can we determine the message type from `endo inbox`
output alone, or does it require an inbox format change / new flag?

### 5. Inject genie via `ENDO_EXTRA` at daemon startup (lines 230–232)

Currently Phase 1 starts the daemon, waits for it to be pingable, then
Phase 2 runs `endo run --UNCONFINED setup.js`.
If the daemon supported an `ENDO_EXTRA` env var (or similar) to load
additional formulas at boot, setup could run as part of Phase 1 and
Phase 3's "wait for ready" would be the only gate needed, eliminating
the separate ping loop.

### 6. Extensible test scenarios via `GENIE_TEST` (line 259)

The hardcoded `TEST_PROMPT` should be replaceable by an external
scenario script (pointed to by a `GENIE_TEST` env var).
This is the hook for multi-round conversation tests and the REPL
recording feature described below.

---

- [x] Explore multi-round conversation testing:
  - send a sequence of messages and verify the agent maintains context
    across turns
  - such testing can be done as a downstream `GENIE_TEST` scenario
    script as mentioned in the inline TODO #6 above
  - [x] plan an optional "REPL" mode to the test script
    - when run from an interactive TTY
    - read prompts from terminal user (stdin)
    - write (all!) replies to terminal user (stdout)
    - have a recording file alongside that captures user prompts, and
      final useful replies…
    - …this recording should itself be usable as a test scenario script
    - …so that a user can demonstrate expected behavior, and then make
      an expected test scenario
  - See `TODO/65_genie_test_scenarios.md` for the concrete plan.

- [x] create follow-up task(s)
  - `TODO/65_genie_test_scenarios.md` — scenario scripts and REPL mode
  - `TODO/66_genie_test_hardening.md` — timeout, message filtering,
    and daemon-startup improvements
