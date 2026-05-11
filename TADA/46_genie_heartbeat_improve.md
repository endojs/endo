
- [x] add a `/heartbeat` command to `packages/genie/dev-repl.js`
  - like the `/observe` command, should trigger the heartbeat
  - implemented by reusing `buildHeartbeatPrompt` and `isHeartbeatOk` from
    `packages/genie/src/heartbeat/index.js` (already exported from `@endo/genie`)
  - the dev-repl heartbeat runs the prompt through `runPrompt` directly,
    which is simpler than main.js's daemon-coupled `processHeartbeat`
  - no need to extract further into `src/heartbeat/` — the existing exports
    (`buildHeartbeatPrompt`, `isHeartbeatOk`) are sufficient for the dev-repl
  - added `isGitRepo` utility, `workspaceDir` plumbing to `runAgent`, and
    the `/heartbeat` slash-command handler

- [x] create a follow-up `TODO/` task to naturalize dev-repl special commands
  - created `TODO/47_devrepl_naturalize_commands.md`
  - should be `.special` not `/special` to rhyme with all the other dev-repl builtins
