# Genie integration test improvement

Small reliability and correctness improvements to
`packages/genie/test/integration.sh`.

- [x] implement the TODOs around lines 145-147 in `trace_reply()`
  - trace should default to stderr verbose for its TTY-repl use case
  - test scenarios can then stuff its stderr into /dev/null or use the `wait_for_reply` convenience wrapper which does that
  - Replaced `echo | grep` pipelines with a `case` statement using shell glob patterns
  - Insubstantive (skipped) lines now echo to stderr with a `(skip ...)` prefix
  - Also replaced `grep -oE '^[0-9]+'` with `${line%%.*}` parameter expansion
