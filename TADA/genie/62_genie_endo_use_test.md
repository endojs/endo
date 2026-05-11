# Next steps for the genie integration test

The integration test script lives at
`packages/genie/test/integration.sh` and can be run via:

```bash
GENIE_MODEL=ollama/llama3.2 yarn workspace @endo/genie run test:integration
# or with an env file:
yarn workspace @endo/genie run test:integration -- path/to/env
```

## Done

- [x] Run the integration test end-to-end against a real LLM provider
  and fix any issues that surface (port handling, daemon startup
  timing, setup.js exit behavior, etc.)

  Fixed issues:
  - **`@endo/platform` `system()` call-site mismatch**:
    `daemon/index.js` called `system(prog, ...args)` with spread
    args, but `system()` expects `(prog, argsArray, timeoutMs)`.
    Fixed all three call sites to pass arrays.
  - **Daemon startup timing**: `endo start` via systemd-run returns
    immediately; subsequent CLI commands tried to auto-start a second
    daemon before the socket was ready.  Added a `ping` polling loop
    after `endo start` to wait for readiness.
  - **`setup.js` never exits**: the `for await` message loop
    continued after form submission.  Added `return` after
    `Submitted.` so the script exits cleanly.
  - **`with_timeout` used system `timeout` command**: the `timeout`
    binary cannot call shell functions (`endo`).  Removed
    `with_timeout` entirely since `setup.js` now exits on its own.
  - **`wait_for_reply` race condition**: `CURRENT_MAX` was computed
    after sending, so fast replies could be missed.  Moved it before
    the `endo send` call.
  - **`wait_for_reply` matched own messages**: improved filtering to
    skip "sent" lines and "Thinking..." status updates.

- [x] Verify the test works with at least two provider backends
  (e.g. `ollama/llama3.2` local and an API-based provider) to
  ensure the env-var plumbing is correct.

  Verified with `ollama/qwen3.5:latest` and `ollama/qwen3.5:9b`.
  Both passed cleanly.

## TODO

- [ ] Add a mock/stub LLM provider option so the integration test can
  run in CI without real LLM credentials (similar to how
  `@endo/lal` has `test/simulator/mock-powers.js`).

- [ ] Consider converting the shell script into an Ava test file
  (like the CLI demo tests in `packages/cli/test/demo/`) for
  better assertion support and integration with `yarn test`.

- [ ] Add the integration test to CI once a mock provider or a
  reliable test provider is available.

- [ ] Explore multi-round conversation testing: send a sequence of
  messages and verify the agent maintains context across turns.
