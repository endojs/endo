# Work on @endo/genie — repl session continuation

Okay continuing to work on `packages/genie/dev-repl.js`.

As you previously found:
> **Conversation history in `-c` mode** —
> The one-shot mode discards history.
> For multi-turn testing, consider a `--script` flag that reads
> newline-delimited prompts from a file.

- [x] Okay let's add a new flag `--session <file>` with a short `-s <file>` form also
  - if no session file is given, no state is preserved
  - but if given, we read it at start (being resilient to if it does not exist) for prior system prompt and messages, and append to it

- [x] session file format should be Pi jsonl format, perhaps natively updated out of the PiAgent instance under our Agent
  - Implemented as JSONL: each line is `{ "role": "...", "content": "...", "timestamp": ... }`
  - `loadSession()` reads and parses at startup, skipping malformed lines
  - `appendSession()` appends new user+assistant messages after each chat round
  - Works in both interactive REPL and `-c` one-shot mode
  - Session info shown in describe output and verbose one-shot mode

Use this command to run the repl for testing:
```bash
OPENAI_API_KEY=ollama yarn workspace @endo/genie run repl -c "<Insert Test Prompt Here>"
```
