# Genie integration test improvement

Small reliability and correctness improvements to
`packages/genie/test/integration.sh`.

- [x] pull a `trace_reply()` from around line 382 thru 405
  - alongside the similar `wait_for_reply()` routine

- [x] see if we can share or merge any functionality between `trace_reply()` and `wait_for_reply()`
  - `trace_reply()` is now the core function: polls inbox, filters
    noise, and returns the extracted reply text on stdout.
  - `wait_for_reply()` is a thin wrapper that discards the text
    (preserving the original return-code-only contract).
  - The REPL recording path now calls `trace_reply()` directly,
    eliminating ~25 lines of duplicated polling logic and gaining
    the full set of message-type filters (requested, proposed) that
    the inline version was missing.
