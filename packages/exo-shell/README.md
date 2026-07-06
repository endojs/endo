# @endo/exo-shell

Remotable exo glue and interface guard for an `EndoShell` capability: a
writable-mount-scoped, allowlisted, argv-only command executor. Portable across
SES realms; pair it with `@endo/host-spawner` (or a sandbox spawner) for the
process-execution engine.

This is the portable half of the Shell capability, mirroring how `@endo/exo-git`
is the portable half of the Git capability (`makeGit`) and `@endo/git` supplies
the Node-side backend. `makeShell` takes a working directory, a formula-owned
policy, and an injected `Spawner`; the daemon (`@endo/daemon`) constructs the
host spawner and mints the exo through its `provideShell` formula.

```js
import { makeShell } from '@endo/exo-shell';
import { makeHostSpawner } from '@endo/host-spawner';

const shell = makeShell({
  cwd: '/repo',
  policy: {
    allowedCommands: ['grep', 'ls', 'cat'],
    timeoutMs: 60_000,
    maxOutputBytes: 1_048_576,
    env: { CI: 'true' }, // explicit passlist; nothing inherited
  },
  spawner: makeHostSpawner({ searchPath: process.env.PATH, defaultEnv: {} }),
});

const { stdout, exitCode, truncated } = await shell.exec('grep', ['-r', 'TODO']);
```

The exo enforces the guest-facing bounds: allowlist-before-spawn, argv arrays
only (no shell string / interpolation), the policy's sanitized environment, a
per-stream output cap with a `truncated` flag, and a timeout that a per-call
value may only *narrow*. `inspect()` reveals the policy bounds but never the host
working directory, env passlist, or search path.

## The honest boundary

Under the host spawner, a `Shell` bounds *which* commands start and *with what*
env, cwd, timeout, and output budget. A started child is still an ordinary host
process (an allowlisted `grep` can read `~/.ssh` if the OS user can). Kernel-level
confinement comes from running the same capability over a sandbox spawner; the
engine is chosen host-side and is invisible on this surface.

Command-name attenuation is void if a delegating command is allowlisted. An
interpreter (`node -e`, `python -c`, `bash -c`, `sh`), an exec-forwarder (`env`,
`find ... -exec`, `xargs`), or `git` (`-c core.sshCommand=...`) collapses the
allowlist to arbitrary code execution with the host user's authority. Allowlist
only non-delegating commands, or rely on the sandbox spawner.
