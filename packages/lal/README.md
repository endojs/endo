# lal

This `@endo/lal` package is an unconfined `@endo/daemon` plugin that provides
an LLM-powered agent with Endo Guest capabilities.

The LLM agent uses tool calls to interact with the Endo daemon, enabling it to:
- Manage pet names (list, lookup, remove, move, copy)
- Send and receive messages
- Adopt capabilities from messages
- Request capabilities from its host
- Inspect capabilities via their help() methods

## Configuration

The agent is configured via environment variables.
If `LAL_HOST` contains `anthropic.com`, the Anthropic provider is used;
otherwise the llama.cpp (OpenAI-compatible) provider is used.

| Variable | Description | Default |
|----------|-------------|---------|
| `LAL_HOST` | API base URL (Ollama, llama.cpp, or Anthropic) | `http://localhost:11434/v1` |
| `LAL_MODEL` | Model name | `qwen3` (llama.cpp) or `claude-opus-4-5-20251101` (Anthropic) |
| `LAL_AUTH_TOKEN` | API key (optional for local servers) | - |
| `LAL_MAX_TOKENS` | Max completion tokens (llama.cpp provider) | `4096` |
| `LAL_MAX_MESSAGES` | Truncate to last N messages before sending (avoids context-size errors) | - |

Example configuration files are provided:
- `local.env.example` - Local Ollama instance
- `cloud.env.example` - Remote Ollama with authentication
- `openai.env.example` - OpenAI API (OpenAI-compatible provider)
- `opus.env.example` - Anthropic Claude (Opus)

For a llama.cpp server that returns "context size" errors, set `LAL_MAX_MESSAGES`
(e.g. to `30`) to send only the last N messages and stay under the server's limit.

## Usage

```bash
# Source your configuration
source local.env.example

# Start the agent
yarn start
```

The agent will:
1. Create a guest profile named `lal`
2. Start monitoring its inbox for messages
3. Respond to messages using LLM-driven tool calls
4. Send replies back to message senders
