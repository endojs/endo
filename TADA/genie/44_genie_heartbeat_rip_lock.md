- [x] remove the workspace lock from `packages/genie/src/heartbeat/index.js`
  1. stop using it entirely in `makeHeartbeatRunner`
  2. no more `makeWorkspaceLock`
- context: endo message serialization should be good enough, no need for a lock
