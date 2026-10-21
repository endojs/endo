# @endo/pola-io

A least-authority I/O library for JavaScript.

## Getting Started

```
npm install @endo/pola-io
```

### Example: `agoric run` as `npx` subcommand

```js
import { makeCmdRunner } from '@endo/pola-io';
import { execFile as execFileNode } from 'node:child_process';
import { promisify } from 'node:util';

const miscTask = async npx => {
  const agoric = npx.subCommand('agoric');
  const { stdout } = await agoric.subCommand('run').exec(['builder.js']);
  return stdout.split('\n');
};

export const main = async ({ execFile = promisify(execFileNode) }) => {
  const npx = makeCmdRunner('npx', { execFile }); // TODO --no-install
  return miscTask(npx);
};
```

### Example: Read-Only File Attenuation

```js
import { makeFileRW } from '@endo/pola-io';
import * as fsp from 'node:fs/promises';

const file = makeFileRW('/', { fsp });
const readonly = file.readOnly();
await readonly.readText(); // Allowed
// @ts-expect-error static error
await readonly.writeText();
```

## What This Package Offers

The `@endo/pola-io` package facilitates using the [Principle of Least Authority (POLA)](https://capnproto.org/capabilities.html#least-authority) for I/O, applying object-capability (ocap) principles to common file, network, and shell operations:

- **Scoped Authority**: Interfaces are built to represent the smallest usable unit of authority—e.g., read-only file handles, command runners with fixed executable paths, or network dialers scoped to specific hosts.
- **Composable Wrappers**: revocable forwarders, logging wrappers, and facets are encouraged as default patterns.
- **Minimize Ambient Authority**: Core interfaces require explicit authority objects. Convenience layers (e.g., `ambient/cmd.js`) exist, but are clearly labeled and should be used with care.

## Background: Why Minimal Trust Enables Maximal Cooperation

Traditional I/O libraries often assume broad access: open any file, connect to any host, run any command. But this creates fragile systems—where one misused reference or library can do serious harm.

`@endo/pola-io` takes a different approach. Every I/O action starts from a **scoped authority**—an object that grants only a narrow, intended power. For example, a command runner that can execute *only* a given binary, or a file handle that supports *only* reading.

By making these boundaries explicit, we reduce how much code needs to be trusted—while still making it easy to delegate, revoke, and wrap access. This is what lets us cooperate safely: code can use what it’s been given, but nothing more.

## Related Work

This package builds on a long tradition of work in object-capability security and least-authority design:

- 2023: [**cap-std**](https://crates.io/crates/cap-std) — A Rust library for capability-based I/O that eliminates ambient authority from `std`, providing a least-authority alternative to conventional file and network APIs.
- 2021: [**Genode's VFS**](https://genodians.org/m-stein/2021-06-21-vfs-1) — Constructs a process's file namespace from explicitly delegated capabilities: "a component can’t just open an arbitrary file. It can only use what the system integrator explicitly handed to it."
- 2013: [**Distributed Electronic Rights in JavaScript**](https://papers.agoric.com/papers/distributed-electronic-rights-in-javascript/abstract/) — Shows how object-capability techniques in JavaScript support POLA not just for local I/O, but also across distributed systems. Introduces SES (Secure EcmaScript), eventual messaging (!), and authority-constraining wrappers as practical tools for secure cooperation.
- 2006: [**Emily**](http://www.hpl.hp.com/techreports/2006/HPL-2006-116.html) — A POLA-enforcing subset of OCaml, which uses a verifier to constrain authority and introduces `readable` and `editable` file interfaces that map closely to our approach:
  ```ocaml
  type readable = {
    isDir : unit -> bool;
    exists : unit -> bool;
    subRdFiles : unit -> readable list;
    subRdFile : string -> readable;
    inChannel : unit -> in_channel;
    getBytes : unit -> string;
    fullPath : unit -> string;
  }
  type editable = {
    ro : readable;
    subEdFiles : unit -> editable list;
    subEdFile : string -> editable;
    outChannel : unit -> out_channel;
    setBytes : string -> unit;
    mkDir : unit -> unit;
    createNewFile : unit -> unit;
    delete : unit -> unit;
  }
  ```
- 2004: [**A PictureBook of Secure Cooperation**](http://erights.org/talks/efun/SecurityPictureBook.pdf) — A visual introduction to object-capability patterns like revocable forwarders, facets, and sealers, showing how authority can be safely delegated and composed.
- 2002: [**DarpaBrowser Report**](http://www.combex.com/papers/darpa-report/html/index.html) — Critiques the ambient authority embedded in interfaces like Java's `java.io.File`.

These systems share the goal of enabling secure cooperation through modular, delegatable authority. `@endo/pola-io` brings these patterns to JavaScript I/O.



## Philosophy: Secure Cooperation

Just like the PictureBook describes, this package is about **delegating only what is necessary**, and composing secure patterns like revocation, logging, and least authority by default. Think:

- Giving a friend temporary read access to a file.
- Running a single binary with a fixed command.
- Logging access without breaking encapsulation.

Applying these techniques uniformly leads to systems where cooperation is safer, authority is easier to reason about, and trust boundaries are clear.

## Contributing

Please do! See [CONTRIBUTING](./CONTRIBUTING.md).
