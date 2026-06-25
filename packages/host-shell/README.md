# @endo/host-shell

An unconfined Endo formula that runs a single host command and exposes its
standard streams as [exo-stream](../exo-stream/README.md) byte streams.

The command's `stdin` is a `PassableBytesWriter`, its `stdout` and
`stderr` are `PassableBytesReader`s, and its terminal status
(`{ code, signal }`) is an awaitable promise.
Each stream is buffered 64 — sixty-four byte chunks are pre-synchronized
across CapTP to trade round-trips for throughput on a high-latency link.

Each formula instance is bound to **one specific command**, captured in
its `env`, and re-runs that command whenever the formula is incarnated.

By default the command runs with a **structured argv and no shell**: the
`command` is the executable and `args` are passed verbatim, so argument
values can never inject a second command. Shell features (pipelines,
redirection, `&&` chaining) are available, but only when you opt in by
setting `shell` — which re-introduces the injection surface and is
therefore off by default.

Because it shells out to a real subprocess, this package is
platform-specific (it spawns a host process) and **unconfined**: the
daemon loads it through Node's module loader in a worker, outside the SES
sandbox, where it can reach `node:child_process`.

## Usage as a formula

The daemon's `make-unconfined` formula loads this module by file URL and
invokes its `make(powers, context, { env })` entry point. The command is
read from the formula `env`:

| `env` key        | required | meaning                                                                          |
| ---------------- | -------- | -------------------------------------------------------------------------------- |
| `command`        | yes      | the executable to run (or, with `shell`, the shell script)                       |
| `args`           | no       | a JSON array of string arguments                                                 |
| `shell`          | no       | `'true'` to run through the default shell, or a shell path; default no shell     |
| `cwd`            | no       | the child's working directory                                                    |
| `processEnv`     | no       | a JSON object of extra environment variables, layered on the child's base env    |
| `extraEnvKeys`   | no       | a JSON array of worker env var names to pass through (without full inherit)       |
| `inheritEnv`     | no       | `'true'` to inherit the worker's full environment; default is a safe allowlist   |
| `timeoutMs`      | no       | a positive integer; terminate the child if it has not exited within this many ms |
| `maxOutputBytes` | no       | a positive integer; terminate the child once combined stdout + stderr exceeds it |
| `killGraceMs`    | no       | a positive integer; ms after SIGTERM before escalating to SIGKILL (default 5000) |

### Environment

By default the child inherits only a small allowlist of environment
variables from the worker — `PATH`, `HOME`, locale, and scratch-directory
variables — so daemon secrets (credential-helper tokens, `ENDO_*`, cloud
keys) are **not** exposed to an arbitrary command. `processEnv` adds or
overrides variables on top of that base. To pass through a specific worker
variable (e.g. `SSH_AUTH_SOCK`) without opening the whole environment, name
it in `extraEnvKeys`. Set `inheritEnv: 'true'` only for trusted commands
that genuinely need the worker's full environment.

### Termination

`timeoutMs` and `maxOutputBytes` terminate the child with `SIGTERM`, then
escalate to `SIGKILL` after `killGraceMs` (default 5 s) if it has not
exited — so a command that ignores or traps `SIGTERM` is still reaped.
Context cancellation tears the child down the same way.

```js
import { E } from '@endo/far';

// Load this package as an unconfined formula in the host's @node worker.
const greeter = await E(host).makeUnconfined('@node', shellModuleHref, {
  powersName: '@none',
  env: { command: 'echo', args: JSON.stringify(['hello']) },
  resultName: 'greeter',
});

// Drain stdout across CapTP with @endo/exo-stream.
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
for await (const chunk of iterateBytesReader(E(greeter).stdout(), {
  buffer: 64,
})) {
  process.stdout.write(chunk);
}

const { code, signal } = await E(greeter).exit();
```

Writing to the process is symmetric, via `iterateBytesWriter`:

```js
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';

const proc = await E(host).makeUnconfined('@node', shellModuleHref, {
  powersName: '@none',
  env: { command: 'cat' },
});
const writer = iterateBytesWriter(E(proc).stdin(), { buffer: 64 });
await writer.next(new TextEncoder().encode('hello'));
await writer.return(); // EOF on the child's stdin
```

To use a pipeline or chain, opt into a shell:

```js
await E(host).makeUnconfined('@node', shellModuleHref, {
  powersName: '@none',
  env: { command: 'grep foo log.txt | wc -l', shell: 'true' },
});
```

## The `ShellProcess` interface

| method            | returns                       | notes                                                  |
| ----------------- | ----------------------------- | ------------------------------------------------------ |
| `stdin()`         | `PassableBytesWriter`         | `return()` closes (EOFs) the child's stdin             |
| `stdout()`        | `PassableBytesReader`         | memoized — one consumer per pipe                       |
| `stderr()`        | `PassableBytesReader`         | memoized                                               |
| `exit()`          | `Promise<{ code, signal }>`   | resolves once the process terminates (see note below)  |
| `kill(signal?)`   | `boolean`                     | default `SIGTERM`; reports whether the signal was sent |
| `pid()`           | `number \| undefined`         | the OS process id                                      |
| `help()`          | `string`                      |                                                        |

On a normal exit `code` is the numeric exit status and `signal` is `null`;
on a signalled termination `code` is `null` and `signal` is the signal
name (e.g. `'SIGKILL'`). `exit()` rejects if the process could not be
spawned (e.g. the command was not found).

`exit()` resolves when the **process** terminates, not when its stdio has
fully drained, so an unread stream cannot wedge it. Captured output stays
readable from the in-memory queue after `exit()` resolves. Note the
converse: a stream you open but never drain applies backpressure and can
block a chatty child from making progress (and so from exiting) — drain or
`return()` every stream you open, or set `maxOutputBytes` as a hard cap.

`stdin()` is the mirror image: once the child has exited, its stdin pipe is
closed, so writing to the writer rejects (EPIPE) rather than blocking.
Treat a write rejection after `exit()` as "the child is already gone".

The formula's context cancellation tears the child process down with
`SIGTERM` (then `SIGKILL` after `killGraceMs`), so revoking the capability
does not orphan a subprocess.

## Direct use

The Node-side core is also exported, both for use outside the daemon and
as a building block for a "shell spawner" capability that mints a fresh
`ShellProcess` per call:

```js
import { makeShellProcess } from '@endo/host-shell';

const proc = makeShellProcess({ command: 'ls', args: ['-la'], cwd: '/tmp' });
const { code } = await proc.exit();
```
