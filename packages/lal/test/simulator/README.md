# Lal agent simulator

Run the Lal agent against **real LLM providers** (Anthropic, OpenAI, llama.cpp)
using **mock guest powers** instead of a full Endo daemon. Use this to debug
provider configuration, auth, and behavior without starting the daemon.

## Quick start

Set env from an example file, then run the simulator:

```bash
# Anthropic (set LAL_AUTH_TOKEN in opus.env.example first)
source opus.env.example
yarn simulator
```

Or set env inline:

```bash
LAL_HOST=https://api.anthropic.com \
  LAL_MODEL=claude-3-5-sonnet-20241022 \
  LAL_AUTH_TOKEN=sk-your-key \
  yarn simulator
```

## What it does

1. Builds **mock guest powers** (in-memory directory, single inbox message).
2. Instantiates the real Lal agent with `make(mockPowers, null, { env })`.
3. Delivers one inbox message from `HOST` asking the agent to reply and dismiss it.
4. Waits until the agent dismisses that message (or 2-minute timeout).
5. Logs any messages the agent sent (e.g. "Lal agent ready." and the reply).

The agent uses the **real** provider selected by `LAL_HOST` (see `providers/index.js`).
So you can point at Anthropic, OpenAI, or a local llama.cpp server and verify
auth, model names, and tool-calling behavior.

## Running as a test

The same flow is available as an Ava test so CI can run it when env is set:

```bash
LAL_AUTH_TOKEN=sk-... yarn test test/simulator/run-simulator.test.js
```

If `LAL_AUTH_TOKEN` is not set for Anthropic, the test skips.

## Files

- **mock-powers.js** – Mock implementation of guest powers (send, lookup,
  listMessages, followMessages, dismiss, evaluate, etc.). Exposes
  `whenDismissed(n)` and `sent` for the runner to wait and inspect.
- **run-simulator.js** – Standalone script (run with `yarn simulator`).
- **run-simulator.test.js** – Ava test that runs the same flow.
