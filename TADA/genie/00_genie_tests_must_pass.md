
The @endo/genie tests do not pass yet. Run them with:
```bash
$ yarn workspace @endo/genie run test
```

The module must also continue to pass lint, check by running:
```bash
$ yarn workspace @endo/genie run lint
```

- [x] fix all the failures you find, committing one module and test at a time as you go

## Resolution

All 326 tests pass under all three ses-ava configurations (lockdown,
unsafe, endo); lint is clean.

The failures were `ReferenceError: harden is not defined` raised at
module top level by source files that used `harden(...)` as a global
without ever importing it.
The previously-installed `@endo/harden` import in the test files only
exposes a default export — it does not install `harden` on
`globalThis`.
The fix mirrors the existing pattern in `tools/fts5-backend.js` and
`interval/scheduler.js`: each affected source module now does
`import harden from '@endo/harden'` so it stops depending on a
HardenedJS-provided global.

Files updated (one commit per file):

- `src/agent/index.js`, `src/agent/tool-gate.js`
- `src/dom-parser/{document,index,selector,tokenizer}.js`
- `src/heartbeat/index.js`
- `src/loop/{agents,builtin-specials,run,specials}.js`
- `src/observer/index.js`
- `src/reflector/index.js`
- `src/system/index.js`
- `src/tools/{command,common,filesystem,memory,registry,vfs-memory,vfs-node,web-fetch,web-search}.js`
- `src/utils/tokens.js`
- `src/workspace/init.js`

