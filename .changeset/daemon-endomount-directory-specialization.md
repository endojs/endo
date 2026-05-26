---
'@endo/daemon': major
---

Specialize `EndoMount` as a directory, separate the file kind, and reshape mount entries as pure values.

- `EndoMountEntry` is now a pure value with no observational or handle-minting authority. Its surface is `segments()`, `displayPath()`, and `child(name)`; the prior entry methods `openDirectory`, `openFile`, `createDirectory`, and `createFile` are removed. Consumers that want a live handle on a child go through the parent mount: `mount.lookup(name)` returns the child `EndoMount` (for directories) or `EndoMountFile` (for files). `has`, `stat`, and `lookup` accept either a path string or an entry value.
- `EndoMount.makeDirectory(path)` returns `Promise<EndoMount>` instead of `Promise<void>`; the new directory is the resolved value. `EndoMount.makeFile(path, content?)` is added and returns `Promise<EndoMountFile>`. Callers that relied on `makeDirectory` resolving to `undefined` and then re-looked-up the child should now use the resolved mount directly.
- `EndoMount.readOnly()` returns a structural `ReadableTree` view rather than another `EndoMount`; `EndoMountFile.readOnly()` returns a structural `ReadableBlob` view.
