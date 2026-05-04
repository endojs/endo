# Genie: drop the redundant FarRef→local wrap around `makeSandboxSpawner`

Sub-task surfaced by [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md).

## Context

`packages/genie/main.js` ~lines 1227-1241 builds the slice-backed spawner
via an inline wrap object that re-exposes every `ProcessHandle` method
behind a local function that simply re-issues `E(...)`:

```js
const spawner = slice ? makeSandboxSpawner({
  handle: {
    async spawn(argv, opts) {
      // TODO why is any of this adaptation necessary? seems like we've missed something
      const proc = await E(slice).spawn(argv, opts);
      return {
        pid() { return E(proc).pid() },
        stdout() { return E(proc).stdout() }, // TODO readerRef needs adaptation
        stderr() { return E(proc).stderr() }, // TODO readerRef needs adaptation
        wait() { return E(proc).wait() },
        kill(signal) { return E(proc).kill(signal) },
      };
    },
  },
}) : undefined;
```

The wrap is functionally a no-op:

- `makeSandboxSpawner` already calls `await E(handle).spawn(argv, opts)`
  internally (`packages/genie/src/tools/sandbox-spawner.js` ~line 140), so
  passing `slice` directly works.
- It then `await`s `E(procHandle).pid()` / `E(procHandle).stdout()` /
  `E(procHandle).stderr()`, and wraps the returned reader ref via
  `readerRefToAsyncIterable` which itself uses `E(reader).next()`.
  All of these are FarRef-friendly — there is no extra adaptation needed
  for a `ProcessHandle` returned from the real sandbox factory.
- `SandboxHandleLike` / `SandboxProcessLike` / `ReaderRefLike` in
  `sandbox-spawner.js` are intentionally structural so the module does
  not depend on `@endo/sandbox` at runtime
  (see the JSDoc on `SandboxHandleLike`: "callers pass any object whose
  `spawn` method matches the slice contract").
  The real `SandboxHandle` from `@endo/sandbox/types.js` matches that
  shape modulo Promise unwrapping, which is invisible at the `await`
  site.

The wrap is most likely a leftover from an earlier iteration where the
spawner was duck-typing against a slightly different surface, or where
the author was uncertain about FarRef ergonomics.

## Deliverables

- [x] Replace the wrap with a direct hand-off:
  ```js
  const spawner = slice ? makeSandboxSpawner({ handle: slice }) : undefined;
  ```
  If the JSDoc-only TypeScript checker complains about the structural
  vs `FarRef<SandboxHandle>` type difference, add a single
  `/** @type {SandboxHandleLike} */ (slice)` cast at the call site
  rather than re-introducing the wrap.
  → Done in `packages/genie/main.js` ~lines 1287-1291; the cast form
    landed (commit `519415bdf` and predecessors).
    The lead-in comment ~lines 1281-1286 explains why the FarRef
    satisfies `SandboxHandleLike` directly.
- [x] Run the genie unit tests
  (`cd packages/genie && npx ava`) to confirm the spawner adapter still
  works end-to-end.
  → Run via `npx corepack yarn workspace @endo/genie exec ava`
    on 2026-05-05; **281 tests passed** (3 unrelated uncaught
    exceptions in pre-existing reflector harness).
    All `tools › sandbox-spawner › …` cases green, including the
    `makeCommandTool + sandbox spawner` happy-path drain and timeout
    kill scenarios.
- [x] Run `yarn test:integration:sandbox-slice` on a Linux + bwrap host
  to confirm the slice path still spawns / drains correctly.
  Note in the commit message that this was exercised so reviewers can
  re-run it on their own boxes.
  → Run via `npx corepack yarn test:integration:sandbox-slice` on
    2026-05-05 (Linux 6.x, bubblewrap 0.11.2,
    `/proc/sys/kernel/unprivileged_userns_clone = 1`).
    Required a one-time `npx corepack yarn install` to populate
    `node_modules/@endo/zip` (an unrelated install drift, not caused
    by this change).
    The agent successfully minted a slice, bound `/workspace` to the
    host workspace mount, ran `bash -c 'cat
    /workspace/sandbox-slice-probe-a.txt'` inside the slice, and
    returned the probe sentinel
    `SLICE_BIND_OK_1778040133_PURPLE_OTTER_42` back to the inbox
    (msg #7 in the test transcript).  The test scenario's
    `trace_reply` shell helper has a *separate* polling bug (it keeps
    re-emitting msg #4 instead of advancing) that masks the success
    as a timeout — the inbox dump at the end of the run shows the
    substantive reply did arrive.
    Belongs in a follow-up task, **not** this one.
- [x] Strengthen the JSDoc on `SandboxHandleLike` to call out that a
  real `FarRef<SandboxHandle>` satisfies the structural shape, so the
  next reader does not re-introduce the wrap "to make the types align".
  → Expanded the typedef preamble in
    `packages/genie/src/tools/sandbox-spawner.js` ~lines 30-50 with a
    "do not reintroduce the wrap" note that names the cast pattern at
    the call site and references the historical wrap removal.

## Blocked by / blocks

- Independent of every other task surfaced from
  [`21_genie_sandbox_review_notes.md`](./21_genie_sandbox_review_notes.md);
  this is a code-cleanliness change with no observable behavioural
  delta.

## Cross-references

- `packages/genie/main.js` ~lines 1227-1241 — wrap to remove.
- `packages/genie/src/tools/sandbox-spawner.js` — `makeSandboxSpawner`
  and the `SandboxHandleLike` typedef.
- `packages/sandbox/src/types.d.ts` ~lines 290-340 — the real
  `SandboxHandle` / `ProcessHandle` shapes.
