# Genie Agent Cancellation

- [x] review and improve `packages/genie/main.js`
  - the TODO about generalizing cancellation over both run loops in
    `spawnAgent` around lines 759-763
  - Replaced circular `cancelledP = agentLoopP.catch(...)` with an
    explicit `makePromiseKit()` cancellation mechanism.
  - `runAgentLoop` now accepts `cancelledP` and races
    `messageIterator.next()` against a cancellation sentinel, exiting
    cleanly when cancelled.
  - If the agent loop crashes, `cancel()` is called to propagate
    teardown to dependent sub-systems (heartbeat, etc.).
