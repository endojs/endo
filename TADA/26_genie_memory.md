# Work on @endo/genie tools

Okay so working on `packages/genie/src/tools/`:

- [x] unify the `bash.js` and `git.js` modules
  - Created `command.js` with `makeCommandTool` factory
  - `bash` is now `makeCommandTool({ name: 'bash', policies: [rejectPatterns(...)] })`
  - `git` is now `makeCommandTool({ name: 'git', program: 'git', allowPath: true })`
  - When `program` is set, the caller supplies `args` (appended to the
    compulsory program prefix); otherwise they supply `command`
  - Removed standalone `bash.js` and `git.js`
  - Updated `dev-repl.js` to import from `command.js`
  - To add new targeted-command tools (grep, sed, etc.), just call
    `makeCommandTool({ name: 'grep', program: 'grep', policies: [...] })`

- [x] plan to allow such attenuated "only this command" tools to be able to
  apply arbitrary policy restriction functions:
  - `makeCommandTool` accepts a `policies` array of `(command: string) => void`
    functions that run before execution and throw to reject
  - Three built-in policy factories are exported:
    - `rejectPatterns(regexps)` — reject commands matching any regex
    - `rejectFlags(flags)` — reject commands containing specific flag tokens
      (e.g. `rejectFlags(['-i', '--in-place'])` for sed)
    - `enforcePath(root)` — audit all path-like tokens to stay under root
  - Custom policies are just functions; no special interface needed

- [x] unify the `memory-get.js`, `memory-search-core.js`, and `memory-search.js` modules
  - These were already superseded by `memory.js` which provides
    `makeMemoryTools({ root })` → `{ memoryGet, memorySet, memorySearch }`
  - The standalone files were not exported from `index.js`
  - Removed all three legacy files
  - `memory.js` already includes `memorySet` (answering "why no memory-set tool?")

## Current tool layout

```
packages/genie/src/tools/
  index.js          — re-exports everything
  command.js        — makeCommandTool factory + bash, git pre-built tools
  filesystem.js     — makeFileTools factory (readFile, writeFile, editFile)
  memory.js         — makeMemoryTools factory (memoryGet, memorySet, memorySearch)
  web-fetch.js      — webFetch tool
  web-search.js     — webSearch tool
```
