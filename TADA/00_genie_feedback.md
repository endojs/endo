
- [x] research and try to address the `TODO` comments left in address `packages/genie/dev-repl.js`
  - `// TODO lol version whence?` — the banner now reads the version
    from `package.json` via `createRequire` (avoiding the
    experimental JSON-import syntax that `@endo/init`'s SES shim
    doesn't love).
  - `// TODO share these too` — the hard-coded help listing now
    composes through a new shared helper.  Added
    `BUILTIN_HELP_DESCRIPTIONS` + `formatHelpLines({ prefix, commands, extras })`
    in `packages/genie/src/loop/builtin-specials.js` (exported
    from the package index) and routed both `dev-repl.js` and
    `main.js` through it so the two deployments stay on one source
    of truth.  `.background on|off|status` is supplied as an
    `extras` entry so dev-repl retains its extra command.
  - `// TODO load messages` — expanded into a descriptive block
    comment explaining the persistence story (load from
    `<workspaceDir>/.genie/dev-repl/messages.json`, seed
    `piAgent.state.messages`, persist on exit).  Left unimplemented
    because the dev-repl's local `messages` array is currently
    vestigial; the observer/reflector memory subsystems already
    cover long-term recall, so this is genuinely follow-up work
    rather than a quick fix.

- [x] fix the type errors in `packages/genie/main.js` marked by `// XXX bigint` comments within
  - `InboundPromptId` is deliberately widened to
    `string | number | bigint` in `src/loop/io.js` for other
    deployments (the dev-repl uses a monotonic counter), but the
    daemon adapter always threads `message.number` (a `bigint`)
    through `id`.  Narrowed at each of the three daemon-side call
    sites with inline `/** @type {bigint} */` casts:
    `io.reply`, `io.dismiss`, and the `onError` reply at
    `handlers.onError`.  A comment at `io.reply` explains the
    invariant; the other two sites point back to it.
  - `tsc -p packages/genie/tsconfig.json --noEmit` confirms the
    three `InboundPromptId → bigint` errors are gone.  The one
    remaining error in `main.js` is unrelated (a missing
    `genieTools` property in the `runAgentLoop` options call).

