# Genie Main Agent

- improve `runAgentLoop` in `packages/genie/main.js`
  - [x] refactor to `params` object rather than 5+ positional arguments ( wrt TODO line 575 )
  - [x] implement message pattern matching ( wrt TODO line 628 )
  - [x] push more heartbeat run logic down into `processHeartbeat` ( wrt TODO line 645 )
