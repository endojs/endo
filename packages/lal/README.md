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

The agent is configured via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `LAL_HOST` | Ollama API host URL | `http://localhost:11434` |
| `LAL_MODEL` | Model name to use | `qwen3` |
| `LAL_AUTH_TOKEN` | Bearer token for authentication (optional) | - |

Example configuration files are provided:
- `local.env.example` - Local Ollama instance
- `cloud.env.example` - Remote Ollama with authentication

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
