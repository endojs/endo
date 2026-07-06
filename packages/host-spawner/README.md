# @endo/host-spawner

The host-side `Spawner` seam, extracted from `@endo/genie` so daemon-side
capabilities (notably the Shell formula in `@endo/daemon`) can reach the same
process-execution engine without depending on the agent framework. `@endo/genie`
depends on `@endo/daemon`, so the daemon cannot depend back on genie.

A `Spawner` is a single-method contract:

```ts
type Spawner = (argv: string[], opts?: SpawnerOpts) => Promise<ProcessLike>;
```

`ProcessLike` mirrors `DriverProcess` from `@endo/sandbox`, so a slice's process
handle can drop in behind the same seam. `makeHostSpawner` is the default engine,
wrapping `child_process.spawn` and exposing stdout/stderr as async-iterable byte
streams plus an awaitable `{ code, signal }`. Callers layer their own
timeout / kill / output-accumulation logic on top of the returned handle so that
logic stays uniform across engines.

```js
import { makeHostSpawner } from '@endo/host-spawner';

const spawn = makeHostSpawner({ searchPath: '/usr/bin:/bin', defaultEnv: {} });
const proc = await spawn(['echo', 'hello'], { cwd: '/tmp', env: { CI: 'true' } });
```

`@endo/genie` re-exports `makeHostSpawner` from here (its `src/tools/spawner.js`
is now a thin re-export shim), so existing genie code is unchanged.
