# @endo/genie rapid development harness

The new `packages/genie/main.js` code is awkward to test, since we must load it
into a running endo daemon, and then try to poke it through the web chat.

- [x] write a simple command line based repl that run @endo/genie's main
  outside of the endo daemon for easier development, debugging, and testing
  - we'll likely need to create in-memory structures like a mailbox and such
    powers as the endo daemon normally provides to make this possible

## Implementation Notes

Created `packages/genie/dev-repl.js` — a standalone CLI REPL that bypasses the
daemon entirely:

- **SES polyfill**: Uses identity `harden()` polyfill (same pattern as
  `test/setup.js`) so all `@endo/genie` modules load outside SES lockdown.
- **Direct tool wiring**: Instead of daemon mailbox powers, the REPL wires real
  tool implementations (bash, readFile, writeFile, editFile, git, webFetch,
  webSearch) directly into `makeAgent()` via `listTools`/`execTool`.
- **Conversation history**: Maintains in-session message history so multi-turn
  conversations work.
- **Streaming**: Shows `assistant_delta` events inline (dimmed), tool calls
  with args preview, and the final response prominently.
- **Commands**: `.exit`, `.clear` (history), `.tools` (list), `.help`.
- **CLI flags**: `--model provider/id`, `--workspace /path`, `--no-tools`,
  `--verbose`.

Run with:
```
cd packages/genie && yarn repl
# or
node packages/genie/dev-repl.js --model anthropic/claude-sonnet-4-20250514
```

Requires `ANTHROPIC_API_KEY` in the environment for the default provider.
