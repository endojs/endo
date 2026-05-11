# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

1. [x] design a VFS abstraction interface
  - that can encapsulate things like Node.JS's platform specific `fs` module
  - but primarily oriented around modern async streams of strings or byte buffers ( `ArrayBuffer` or `Uint8Array` )
  - **done**: `packages/genie/src/tools/vfs.js` — defines `VFS`,
    `VFSStat`, `VFSDirEntry`, and option typedefs via JSDoc.
    Read streams are `AsyncIterable<Uint8Array>`.

2. [x] implement a first node-vfs implementation to limit scope of genie's exposure to node filesystem
  - **done**: `packages/genie/src/tools/node-vfs.js` — `makeNodeVFS()`
    wraps Node `fs`/`fs/promises` behind the VFS interface.

3. [x] update `makeFileTools` to use this new VFS abstraction
  - **done**: `filesystem.js` now accepts an optional `vfs` option
    (defaults to `makeNodeVFS()`).  All direct `fs` / `createReadStream`
    calls replaced with VFS method calls.  `Buffer.byteLength` replaced
    with `TextEncoder` for platform independence.
