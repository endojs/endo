---
'@endo/daemon': patch
---

Fix three filesystem bugs in `EndoMount`.

- `EndoMount.write()` (and therefore `copy()`) opened the destination
  writer directly on the target, truncating it before the source was
  read. When the source resolved to the same file as the target — a
  `copy(name, name)` or `write(name, lookup(name))` — the file was
  emptied and the now-empty content streamed back, destroying the
  source. The write now streams into a sibling scratch file and renames
  it onto the target only after the full source has been read.
- `EndoMount.copy()` into a destination strictly below the source (e.g.
  `copy(['dir'], ['dir', 'copy'])`) recursed unboundedly because the
  destination was created before the live source listing was read. Such
  a copy is now rejected up front with a descendant-path guard.
- The XS-backed `makeXsFilePowers()` omitted `appendFileText`,
  `statPath`, `pathIdentity`, and `readFileBytes`, so
  `EndoMountFile.append()` and the `stat()` methods threw under the XS
  supervisor. The methods are now implemented across all three layers
  (the JS factory, the XS host aliases, and the Rust host functions).
