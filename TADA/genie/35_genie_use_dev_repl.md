Okay actually try to use `packages/genie/dev-repl.js`:
- there is a local Ollama server running already at `http://127.0.0.1/11434` ; you can inspect it with the `ollama` command in the normal way
- there are already plenty of models downloaded, just use one that's already present like `glm-4.7-flash`, `qwen3.5:9b`, or `nemotron-3-nano`
  - **DO NOT** run `ollama pull` or `ollama run` or anything else that would need to download a new model
- but remember: the dev repl is an interactive prompt loop that expect stdin and produces stdout, so you for testing you may need to:
  - [x] modify it to accept a `--command <text>` option (short form `-c <text>` similar to `bash -c`)
  - [x] also modify the other option parsers to have short forms:
    - `--verbose` — `-v`
    - `--model` — `-m`
    - `--workspace` — `-w`
- [x] after sorting out how to pass input, you should be able to just get going using `--model ollama/glm-4.7-flash`

Your goal is to verify basic dev repl functionality, don't go too deeply and report back here with plans for further improvement.

---

## Results

### Changes made

1. **`dev-repl.js`** — Added `-c`/`--command`, `-m`, `-v`, `-w` short
   flags.  Extracted `runPrompt()` so both the REPL loop and one-shot
   mode share the same code path.  Added `buildOllamaModel()` which
   constructs a pi-ai–compatible Model object pointing at ollama's
   OpenAI-compatible endpoint (`http://127.0.0.1:11434/v1`) with
   `provider: 'openai'` so pi-agent-core accepts it.

2. **`dev-harden-polyfill.js`** — Replaced the inline `harden = x => x`
   stub (which ran too late due to ES module hoisting) with a proper
   `import 'ses'` + `lockdown()` + `@endo/eventual-send/shim.js` setup
   so all SES globals (`harden`, `assert`, `HandledPromise`) are
   available before @endo modules evaluate.

3. **`src/agent/index.js`** — Added `modelObject` option to `makeAgent`
   so callers can pass a pre-constructed model object, bypassing the
   `getModel()` registry lookup (needed for ollama and other unlisted
   providers).

### Verified working

```
node dev-repl.js -m ollama/llama3.2:latest -c "Say hello" --no-tools     ✓
node dev-repl.js -m ollama/llama3.2:latest -c "Run 'ls -la'" -v          ✓ (bash tool called)
node dev-repl.js -m ollama/glm-4.7-flash:latest -c "Say hello" --no-tools ✓
node dev-repl.js -m ollama/qwen3.5:9b -c "What is 2+2?" --no-tools       ✓
node dev-repl.js -m ollama/nemotron-3-nano:latest -c "Capital of France?" ✓
```

### Issues discovered / plans for further improvement

1. **Reasoning models return empty `content`** — Models like
   `glm-4.7-flash` and `qwen3.5` put output in a `reasoning` field
   in the OpenAI response instead of `content`.  pi-agent-core's
   openai-completions streamer apparently handles this (the final text
   is delivered), but with low `max_tokens` the model may never finish
   reasoning and produce empty output.  Consider exposing a
   `--max-tokens` flag.

2. **Small models choose wrong tools** — `llama3.2:latest` (3B) tried
   `readFile` on a directory instead of `bash ls`.  Tool descriptions
   and/or few-shot examples in the system prompt would help.

3. **No error surfacing from pi-agent-core** — When the model call
   fails (e.g. missing API key), the `stopReason: "error"` and
   `errorMessage` fields on the message event are silently ignored.
   The agent's event loop should detect `stopReason === 'error'` and
   yield a Genie `Error` event.

4. **Conversation history in `-c` mode** — The one-shot mode discards
   history.  For multi-turn testing, consider a `--script` flag that
   reads newline-delimited prompts from a file.

5. **No OLLAMA_API_KEY env var** — The workaround sets
   `OPENAI_API_KEY=ollama` if unset, which could clobber a real key.
   A cleaner fix would be to register a custom API key resolver in
   pi-ai for the ollama provider, or add `OLLAMA_API_KEY` support
   upstream.
