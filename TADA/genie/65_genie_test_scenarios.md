# Genie test scenarios and REPL mode

Extends the integration test (`packages/genie/test/integration.sh`)
with pluggable scenario scripts and an interactive recording mode.

## Scenario script support

- [x] Add `GENIE_TEST` env var support to `integration.sh`
  - When set, source/execute the script instead of the hardcoded
    `TEST_PROMPT`
  - The scenario script receives helper functions (`endo`, `wait_for`,
    `wait_for_reply`, `send_and_wait`, `assert_reply_contains`,
    `current_max_msg`) and env vars (`CURRENT_MAX`, etc.)
  - Scenario exits 0 on success, nonzero on failure
  - `.txt` files are replayed as recordings; other files are sourced
    as bash scenario scripts

- [x] Write a simple multi-round scenario: `test/scenarios/multi-turn.sh`
  - Send "Remember the number 42"
  - Wait for acknowledgment
  - Send "What number did I ask you to remember?"
  - Assert the reply contains "42"

- [x] Write a tool-use scenario: `test/scenarios/workspace-tool.sh`
  - Create a file in `$GENIE_WORKSPACE`
  - Ask the genie to read or describe it
  - Assert the reply references the file content

## REPL recording mode

When `integration.sh` detects an interactive TTY and no `GENIE_TEST`
is set, it enters REPL mode:

- [x] Detect TTY: `[[ -t 0 ]]`
- [x] Read prompts from stdin in a loop
  - Display `genie> ` prompt
  - Send each line via `endo send setup-genie "$line"`
  - Poll and print all new inbox messages to stdout
  - Special commands: `/quit` exits, `/inbox` dumps full inbox

- [x] Record to file: `test/recordings/<timestamp>.txt`
  - Format: alternating `USER: ...` and `AGENT: ...` blocks
  - Strip inbox metadata (message numbers, sender names)

- [x] Replay a recording as a scenario
  - `GENIE_TEST=test/recordings/2026-04-01_1200.txt integration.sh`
  - Parse `USER:` lines as prompts to send
  - Parse `AGENT:` lines as expected-substring assertions
  - This lets a developer interactively demonstrate a workflow, then
    turn the recording into a regression test
