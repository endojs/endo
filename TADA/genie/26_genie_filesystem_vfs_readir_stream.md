# Work on @endo/genie tools

Work on `packages/genie/src/tools/vfs.js`:

- [x] the TODO in `packages/genie/src/tools/vfs.js` circa line 104
  - Changed `readdir` return type from `Promise<VFSDirEntry[]>` to
    `AsyncIterable<VFSDirEntry>` for streaming directory enumeration.
  - [x] will need to update implementation in `packages/genie/src/tools/memory-vfs.js`
    - Converted to async generator using `yield*` for recursive traversal.
  - [x] will need to update implementation in `packages/genie/src/tools/node-vfs.js`
    - Converted to async generator that yields entries one at a time.
  - [x] Updated consumers in `filesystem.js` and `memory.js` to use
    `for await...of` instead of `await` + `for...of`.
