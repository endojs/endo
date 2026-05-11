# Genie Heartbeat

So `TADA/40_genie_heartbeat_fin.md` was insufficient.

- [x] left feedback in `packages/genie/main.js` using `TODO` comments
  - complete and factor out the heartbeat runner section ( circa lines 644-720 )
  - needs to import and use the `pacakges/genie/src/heartbeat` module

## Changes Made

1. **Factored out `runHeartbeat()`**: Extracted the inline heartbeat
   scheduler setup from `spawnAgent()` (lines 644-720) into a
   standalone `runHeartbeat()` function with a clear JSDoc contract.
   `spawnAgent()` now calls `await runHeartbeat({...})` with
   explicit parameters.

2. **Switched heartbeat imports to local module**: Changed
   `HeartbeatStatus`, `makeHeartbeatEvent`, `buildHeartbeatPrompt`,
   and `isHeartbeatOk` from `@endo/genie` (self-referential) to
   `./src/heartbeat/index.js` (direct local import).

3. **Removed TODO comments**: All four TODO markers in the old inline
   heartbeat section have been addressed and removed.
