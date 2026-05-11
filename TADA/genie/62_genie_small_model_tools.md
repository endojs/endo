# Work on @endo/genie — small model tool call guidance dev repl

Okay continuing to work on `packages/genie/dev-repl.js`.

Use this command to run the repl for testing:
```bash
OPENAI_API_KEY=ollama yarn workspace @endo/genie run repl -c "<Insert Test Prompt Here>"
```

This runs with a small llama model by default.

As you previously found:
> **Small models choose wrong tools** —
> `llama3.2:latest` (3B) tried `readFile` on a directory instead of `bash ls`.
> Tool descriptions and/or few-shot examples in the system prompt would help.

So follow up on that:
- [x] review all of the tool help strings under `packages/genie/src/tools/`
- [x] revise them all to improve small model performance
- [x] may need to update the `packages/genie/src/system/index.js`
  - in particular the `tools` section builder that describes available tools

## Changes Made

### Tool help string improvements (`packages/genie/src/tools/`)

All tool descriptions were revised with three principles for small model guidance:

1. **Disambiguation cues** — Each tool now says what it does AND what it doesn't do,
   pointing to the correct alternative (e.g., readFile says "Cannot read directories.
   To see what is inside a directory, use listDirectory instead.")
2. **Action-oriented first lines** — The first line (used as `desc()`) now describes
   the action clearly (e.g., "Reads the text content of a single FILE" instead of
   just "Reads file contents")
3. **Cross-references** — Related tools reference each other (readFile↔listDirectory,
   writeFile↔editFile, webSearch↔webFetch, removeFile↔removeDirectory, etc.)

Files changed:
- `filesystem.js` — readFile, writeFile, editFile, removeFile, stat, listDirectory,
  makeDirectory, removeDirectory
- `command.js` — bash description now lists example commands (ls, grep, find, etc.)
- `web-fetch.js` — webFetch cross-references webSearch
- `web-search.js` — webSearch cross-references webFetch
- `memory.js` — memoryGet, memorySet, memorySearch all cross-reference their
  non-memory counterparts (readFile, writeFile, bash grep)

### System prompt tool selection guide (`packages/genie/src/system/index.js`)

Added a new **"Tool Selection Guide"** section to the system prompt, rendered
between the tool list and the tool call style section. It presents a concise
lookup table mapping common tasks to the correct tool:

```
## Tool Selection Guide
Choose the right tool for the task:

**See what is in a directory** → listDirectory (NOT readFile)
**Read a file's content** → readFile (only works on files, not directories)
**Check if a path is a file or directory** → stat
**Create a new file or fully rewrite** → writeFile
**Change part of an existing file** → editFile
**Run a shell command (ls, grep, find, curl, etc.)** → bash
**Search the internet** → webSearch
**Download a specific URL** → webFetch
```

The guide is generated dynamically based on which tools are actually registered,
so it only includes entries for available tools.

### Dev REPL (`dev-repl.js`)

Updated the `git` tool description from generic "Executes git commands" to
the more descriptive "Runs git version control commands (status, log, diff,
commit, etc.)".
