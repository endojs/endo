# Working on `packages/genie/dev-repl.js`

While testing a moderate session length, we saw:
```
you> (node:928257) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 close listeners added to [Interface]. MaxListeners is 10.
 Use emitter.setMaxListeners() to increase limit
(Use `node --trace-warnings ...` to show where the warning was created)
```

1. [x] investigate the `packages/genie/src/agent/` agent code, try to find the leak
   - No leak found in agent code.

2. [x] investigate the `packages/genie/src/tools/` tool code, try to find the leak
   - `command.js` has `child.on('close', ...)` but it's one listener per
     spawn — not a leak.

3. [x] fix the leak(s) if you're confident, otherwise report back here
   - **Root cause:** `dev-repl.js` `nextPrompt()` added a new
     `rl.on('close', ...)` listener on every call (once per user input).
     Listeners were never removed, so they accumulated past the default
     limit of 10.
   - **Fix:** Moved the close listener out of the per-prompt loop.
     A single `rl.once('close', ...)` is registered once at startup to
     set a `closed` flag.  Inside `nextPrompt()`, paired `once('line')`
     and `once('close')` listeners clean each other up via
     `removeListener` so at most one of each is active at any time.
