# Work on @endo/genie tools

Work on `packages/genie/src/tools/filesystem.js`:

- [x] implement the TODO inside `readFile` circa line 101
  - stop doing a sync full buffer read into memory, especially in the offset&limit case
  - now uses `createReadStream` with `start`/`end` options to stream only the requested byte range

- [x] build in a platform limit for `readFile`, configurable via an option passed to `makeFileTools`
  - let it default to 100MiB, aka `100 * 1024 * 1024` bytes
  - added `maxReadBytes` option to `FileToolsOptions` typedef and `makeFileTools`
  - `effectiveLimit` is `Math.min(limit, maxReadBytes)` so the platform cap always applies
