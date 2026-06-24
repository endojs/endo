# @endo/bash

An unconfined Endo formula that runs a shell command with `bash -c` and
exposes its standard streams as [exo-stream](../exo-stream/README.md) byte
streams.

The command's `stdin` is a `PassableBytesWriter`, its `stdout` and
`stderr` are `PassableBytesReader`s, and its terminal status
(`{ code, signal }`) is an awaitable promise.
Each stream is buffered 64 — sixty-four byte chunks are pre-synchronized
across CapTP to trade round-trips for throughput on a high-latency link.

Because it shells out to a real subprocess, this package is
platform-specific (it requires a POSIX `bash` on `PATH`) and **unconfined**:
the daemon loads it through Node's module loader in a worker, outside the
SES sandbox, where it can reach `node:child_process`.

## Usage as a formula

The daemon's `make-unconfined` formula loads this module by file URL and
invokes its `make(powers, context, { env })` entry point. The shell
command is read from the formula `env`:

| `env` key    | required | meaning                                                                 |
| ------------ | -------- | ----------------------------------------------------------------------- |
| `command`    | yes      | the script, run as `bash -c <command>`                                  |
| `cwd`        | no       | the child's working directory                                           |
| `shell`      | no       | the shell executable (default `bash`)                                   |
| `processEnv` | no       | a JSON object of extra environment variables, merged onto the worker's |

```js
import { E } from '@endo/far';

// Load this package as an unconfined formula in the host's @node worker.
const greeter = await E(host).makeUnconfined('@node', bashModuleHref, {
  powersName: '@none',
  env: { command: 'echo hello' },
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

const proc = await E(host).makeUnconfined('@node', bashModuleHref, {
  powersName: '@none',
  env: { command: 'cat' },
});
const writer = iterateBytesWriter(E(proc).stdin(), { buffer: 64 });
await writer.next(new TextEncoder().encode('hello'));
await writer.return(); // EOF on the child's stdin
```

## The `BashProcess` interface

| method            | returns                       | notes                                                  |
| ----------------- | ----------------------------- | ------------------------------------------------------ |
| `stdin()`         | `PassableBytesWriter`         | `return()` closes (EOFs) the child's stdin             |
| `stdout()`        | `PassableBytesReader`         | memoized — one consumer per pipe                       |
| `stderr()`        | `PassableBytesReader`         | memoized                                               |
| `exit()`          | `Promise<{ code, signal }>`   | resolves once the process and its stdio have closed    |
| `kill(signal?)`   | `boolean`                     | default `SIGTERM`; reports whether the signal was sent |
| `pid()`           | `number \| undefined`         | the OS process id                                      |
| `help()`          | `string`                      |                                                        |

On a normal exit `code` is the numeric exit status and `signal` is `null`;
on a signalled termination `code` is `null` and `signal` is the signal
name (e.g. `'SIGKILL'`).

The formula's context cancellation tears the child process down with
`SIGTERM`, so revoking the capability does not orphan a subprocess.

## Direct use

The Node-side core is also exported for use outside the daemon:

```js
import { makeBashProcess } from '@endo/bash';

const proc = makeBashProcess({ command: 'ls -la', cwd: '/tmp' });
```

`makeBashProcess` additionally accepts an `args` array; when present the
`command` is executed directly with those arguments, bypassing shell
interpretation.
