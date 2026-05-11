# xsnap — Rust bindings for the XS JavaScript engine

Rust wrapper around Moddable's XS engine, providing:

- Hardened JavaScript execution in SES-locked Compartments
- Host function bridge (Rust ↔ JS) for filesystem, crypto,
  process, and streaming I/O
- Compartment-map ZIP archive loading and execution
- Handle-based open directory and streaming file APIs

## Building

`xsnap` links against the XS engine compiled from the Moddable SDK
(pinned via the `c/moddable` git submodule).  Initialise it before
the first build:

```sh
git submodule update --init c/moddable
cargo build -p xsnap
```

The submodule is a shallow checkout (~180 MB).  The `build.rs`
script will compile the XS C sources from `c/moddable/xs/sources/`.
If you need to build without the submodule, drop a prebuilt
static library at `rust/endo/xsnap/prebuilt/libxs.a` instead — the
build script falls back to copying it.

`xsnap` is a pure library crate. The XS engine host modes (worker,
manager child, standalone archive runner) are exposed as library
entry points and invoked from the unified `endor` binary in the
`endo` crate:

```sh
# Standalone: load a compartment-map zip, execute, exit
endor run bundle.zip

# Supervised worker (CapTP over fd 3/4)
endor worker

# Supervised manager child (multiplexed CapTP over fd 3/4,
# hosts the pet-name store and formula graph)
endor manager
```

`-e xs` is accepted but optional — XS is the default engine. The
corresponding library entry points are `xsnap::run_xs_archive`,
`xsnap::run_xs_worker`, and `xsnap::run_xs_manager`.

## Tests

```sh
cargo test -p xsnap
```

## Directory handle demo

The `examples/` directory contains a demo that exercises
open directory handles, symlinks, and hard links from
inside a zipped compartment-map archive.

### Quick start

From the workspace root:

```sh
# 1. Build the archive creator and the unified `endor` binary
cargo build -p xsnap --example make-demo-archive
cargo build -p endo --bin endor

# 2. Create the demo zip
cargo run -p xsnap --example make-demo-archive
# -> Wrote target/dir-handle-demo.zip

# 3. Run it
target/debug/endor run target/dir-handle-demo.zip
```

### Expected output

```
=== Directory Handle Demo ===

[token API] Wrote hello.txt and sub/nested.txt
[dir handle] Opened handle 1 for tmp/dir-handle-demo
[dir handle] Read hello.txt -> "Hello, Endo!"
[dir handle] Entries: ["hello.txt","sub"]
[dir handle] exists("hello.txt"): true
[dir handle] isDir("sub"):        true
[nested handle] Opened handle 2 for sub/
[nested handle] Read nested.txt -> "I am nested."
[nested handle] Wrote created.txt
[nested handle] Entries: ["nested.txt","created.txt"]
[symlink] link-to-hello -> hello.txt
[symlink] Read through symlink -> "Hello, Endo!"
[hardlink] Read through hard link -> "Hello, Endo!"
[cleanup] Closed nested handle 2
[cleanup] Closed handle 1

=== Demo complete ===
```

Each line is prefixed with `endor: [trace]` on stderr.

### What the demo shows

1. **Classic string-token API** — `writeFileText('root', path, data)`
   uses the static `"root"` directory token, the same API that
   existed before directory handles.

2. **Open directory handle** — `openDir('root', 'tmp/dir-handle-demo')`
   returns a numeric handle (e.g. `1`).
   Subsequent calls like `readFileText(1, 'hello.txt')` resolve
   paths relative to the open directory, not the filesystem root.

3. **Nested handles** — `openDir(1, 'sub')` opens a
   subdirectory relative to handle `1`, returning handle `2`.
   Reads and writes through handle `2` are scoped to `sub/`.

4. **Symlinks** — `symlink(handle, target, name)` creates a
   symbolic link.
   `readLink(handle, name)` reads the link target back.
   Reading the file through the symlink returns the original
   content.

5. **Hard links** — `link(handle, src, dst)` creates a hard
   link. Reading through the hard link returns the same content.

6. **Handle cleanup** — `closeDir(handle)` releases the
   kernel file descriptor. After closing, the handle is invalid.

### How the archive works

The demo zip contains two files:

```
dir-handle-demo.zip
├── compartment-map.json    # entry: demo-v1.0.0 / "."
└── demo-v1.0.0/
    └── index.js            # the demo script
```

`endor run` loads the zip, creates an XS Compartment for
each entry in the compartment map, and imports the entry module.
Host functions (`readFileText`, `openDir`, etc.) are passed
into the Compartment as `globals` endowments, so the sandboxed
module can call them directly.

The `make-demo-archive` example
(`examples/make-demo-archive.rs`) uses the `zip` crate to build
this archive programmatically from `examples/dir-handle-demo.js`.

### Unified dir resolution

All 15 filesystem host functions accept either a string token
(`'root'`) or a numeric handle as their first argument.
The Rust `resolve_dir()` helper checks the XS argument type at
runtime:

- **String** — looked up in the static `HostPowers.dirs` map
- **Number** — looked up in the `DIR_MAP` handle registry

Both paths return an owned `cap_std::fs::Dir` via `try_clone()`
(one `dup()` syscall), releasing all locks before the operation
proceeds.
This means existing code that passes `'root'` continues to work
unchanged, while new code can open a directory handle and pass
the numeric handle for scoped operations.

## Host function reference

### Filesystem (string token or numeric handle)

| Function | Signature | Returns |
|----------|-----------|---------|
| `readFileText(dir, path)` | Read file as UTF-8 string | `string` |
| `writeFileText(dir, path, data)` | Write UTF-8 string to file | `undefined` |
| `readDir(dir, path)` | List directory entries | `string` (JSON array) |
| `mkdir(dir, path)` | Create directory tree | `undefined` |
| `remove(dir, path)` | Remove a file | `undefined` |
| `rename(dir, from, to)` | Rename within dir scope | `undefined` |
| `exists(dir, path)` | Check existence | `boolean` |
| `isDir(dir, path)` | Check if directory | `boolean` |
| `readLink(dir, path)` | Read symlink target | `string \| undefined` |
| `openReader(dir, path)` | Open streaming reader | `number` (handle) |
| `openWriter(dir, path)` | Open streaming writer | `number` (handle) |

### Directory handles

| Function | Signature | Returns |
|----------|-----------|---------|
| `openDir(dir, path)` | Open subdirectory | `number` (handle) |
| `closeDir(handle)` | Close directory handle | `undefined` |

### Link operations

| Function | Signature | Returns |
|----------|-----------|---------|
| `symlink(dir, target, name)` | Create symbolic link | `undefined` |
| `link(dir, src, dst)` | Create hard link | `undefined` |

### Streaming I/O (handle-only)

| Function | Signature | Returns |
|----------|-----------|---------|
| `read(handle, maxBytes)` | Read chunk | `ArrayBuffer \| null` |
| `write(handle, uint8Array)` | Write chunk | `undefined` |
| `closeReader(handle)` | Close reader | `undefined` |
| `closeWriter(handle)` | Close writer | `undefined` |

All functions that can fail return an `"Error: ..."` string on
failure (except boolean-returning functions which return `false`).
