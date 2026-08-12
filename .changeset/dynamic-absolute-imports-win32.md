---
'@endo/compartment-mapper': minor
---

Added support for dynamic `import()` of absolute paths (POSIX/Win32). Added support for absolute Win32 paths to dynamic `require()`.

Dynamic `import()` of absolute paths in a POSIX environment requires a `ReadPowers` object containing an `isAbsolute` function (`IsAbsoluteFn`). A `pathToFileURL` function (`PathToFileURLFn`) is strongly recommended.

For absolute path support in a Windows environment (for both dynamic `import()` and `require()`), a `ReadPowers` object _must_ supply `isAbsolute` and `pathToFileURL`.

Dynamic `require()` support for absolute paths retains the current baseline `ReadPowers` object requirements; see [`README.md`](https://github.com/endojs/endo/blob/master/packages/compartment-mapper/README.md) for details.
