# lal

This `@endo/lal` package is an unconfined `@endo/daemon` plugin that provides
an LLM-powered agent with Endo Guest capabilities.

The LLM agent uses tool calls to interact with the Endo daemon, enabling it to:

- Manage pet names (list, lookup, remove, move, copy)
- Send and receive messages
- Adopt capabilities from messages
- Request capabilities from its host
- Inspect capabilities via their `help()` methods

## Architecture

Lal's agent harness is built directly on
`@earendil-works/pi-agent-core` + `@earendil-works/pi-ai`. Each worker is a
single `PiAgent` whose internal message history is the durable transcript
for the worker's lifetime. The Endo capability tool surface (the `help`,
`list`, `lookup`, `send`, `reply`, `evaluate`, `define`, ... family) is
dispatched through a `listTools` / `execTool` pair constructed at worker
spawn; tool arguments are SmallCaps-decoded per call so BigInt-shaped
strings (`"+5"`) and `"#undefined"` continue to round-trip correctly.

`packages/lal/providers/` remains in place as a stable surface for
downstream consumers (jaine, fae). It is no longer used by lal's own
agent loop, which now goes through pi-ai's multi-provider registry.

## Configuration

The agent is configured via environment variables. The legacy
`LAL_HOST` + `LAL_MODEL` + `LAL_AUTH_TOKEN` triple is translated at
worker spawn time into a pi-ai `provider/modelId` string:

| `LAL_HOST` matches                              | pi-ai provider                               |
| ----------------------------------------------- | -------------------------------------------- |
| `anthropic.com`                                 | `anthropic`                                  |
| `generativelanguage.googleapis.com` or `gemini` | `google`                                     |
| `openrouter`                                    | `openrouter`                                 |
| `openai.com`                                    | `openai`                                     |
| `:11434` (default Ollama port)                  | `ollama` (OpenAI-compatible local endpoint)  |
| anything else with `/v1`                        | `openai` (OpenAI-compatible, e.g. llama.cpp) |

`LAL_AUTH_TOKEN` is forwarded into `process.env.<PROVIDER>_API_KEY` so
pi-ai's adaptor finds it.

| Variable         | Description                          | Default                  |
| ---------------- | ------------------------------------ | ------------------------ |
| `LAL_HOST`       | API base URL                         | `http://localhost:11434` |
| `LAL_MODEL`      | Model identifier within the provider | provider-specific        |
| `LAL_AUTH_TOKEN` | API key                              | -                        |

Example configuration files are provided:

- `local.env.example` - Local Ollama instance
- `cloud.env.example` - Remote Ollama with authentication
- `openai.env.example` - OpenAI API
- `opus.env.example` - Anthropic Claude (Opus)

## Usage

```bash
# Source your configuration
source local.env.example

# Start the agent
yarn setup
```

The agent will:

1. Send a configuration form to the host
2. On submission, create a guest profile and start monitoring its inbox
3. Respond to messages using LLM-driven tool calls
4. Send replies back to message senders
