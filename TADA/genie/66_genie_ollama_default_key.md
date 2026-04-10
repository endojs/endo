# Work on @endo/genie — ollama default key

Okay continuing to work on `packages/genie/dev-repl.js`.

As you previously found:

> **No OLLAMA_API_KEY env var** —
> The workaround sets `OPENAI_API_KEY=ollama` if unset, which could clobber a
> real key.
> A cleaner fix would be to register a custom API key resolver in pi-ai for the
> ollama provider, or add `OLLAMA_API_KEY` support upstream.

Right you are, so let's fix that:
- [x] why does setting `OLLAMA_API_KEY` not work? can it?
- [x] can we also just provide a `ollama-local` default for it so that the user need not set it?

## Findings

**Why `OLLAMA_API_KEY` didn't work:**
pi-ai's `getEnvApiKey()` maps provider names to env var names
(e.g. `openai` → `OPENAI_API_KEY`).  Ollama is not a built-in
provider; `buildOllamaModel` masquerades as `provider: 'openai'`
with a custom `baseUrl`, so the library only looks at
`OPENAI_API_KEY`.

**Fix applied** (in `packages/genie/src/agent/index.js`):

1. Added `getOllamaApiKey()` — reads `OLLAMA_API_KEY` from the
   environment, falling back to the string `'ollama'` (a harmless
   placeholder that satisfies pi-ai's non-empty-key check).

2. Removed the `process.env.OPENAI_API_KEY = 'ollama'` mutation
   from `buildOllamaModel`.

3. When the resolved model is an ollama model, `PiAgent` is
   constructed with a `getApiKey` callback that returns the
   ollama-specific key.  This avoids clobbering `OPENAI_API_KEY`,
   so users with a real OpenAI key can use both providers in the
   same process.

The user can now optionally set `OLLAMA_API_KEY` for remote Ollama
instances, or just leave it unset for local usage.
