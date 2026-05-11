# Genie Heartbeat

- [x] left feedback in `packages/genie/main.js` using `TODO` comments
  - around line 517, `runHeartbeat` now accepts a generic `cancelledP`
    promise instead of `agentLoopP`
  - around line 754, `spawnAgent` creates `cancelledP` from
    `agentLoopP.catch` and passes it to `runHeartbeat`
