# Work on @endo/genie command tool

- [x] `packages/genie/src/tools/command.js` circa line 303:
  Replaced `exec(fullCommand)` with `spawn(prog, spawnArgs)` to avoid
  shell interpretation of arguments. Timeout is now handled via
  `setTimeout` + `child.kill()`. Non-zero exit codes reject with an
  error carrying a `.code` property. Removed unused `exec` import.
