# Work on @endo/genie unconfined plugin hookup

Okay so now we have a mostly working core agent harness in `packages/genie/src/agent/index.js`:

- [x] revamp `packages/genie/setup.js` to be more like `packages/lal/setup.js`:
  - use a form which submits to our unconfined `packages/genie/main.js`
  - setup.js now reads GENIE_MODEL and GENIE_WORKSPACE env vars
  - watches inbox for forms from setup-genie and auto-submits config
  - guest name changed from 'genie' to 'setup-genie' to match lal pattern
  - uses `@agent` introduced name (matching lal) instead of `@host`

- [x] revamp `packages/genie/main.js` which implements our unconfined worklet
  - should basically do what `packages/genie/dev-repl.js` does...
  - ...except sending and receiving endo host mail instead of reading stdin and writing stdout
  - for reference this is similar in scope to `packages/lal/agent.js`
  - now sends a configuration form on startup (model + workspace fields)
  - waits for form submission before creating the agent (2-phase startup)
  - wires up full tool suite: bash, readFile, writeFile, editFile, git, webFetch, webSearch
  - registers built-in API providers for model resolution
  - creates PiAgent with listTools/execTool callbacks (like dev-repl.js)
  - then enters message-processing loop forwarding mail to agent rounds
