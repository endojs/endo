# Familiar Development Guide

## Architecture Constraints

- The Electron main process must never import `@endo/init` or `ses`.
  SES lockdown freezes Electron internals.
- Unconfined plugins run inside an already-locked-down worker and must not
  import `ses` or `@endo/init` themselves; doing so causes double-lockdown
  errors.
- Electron Forge requires `electron` in `devDependencies` to detect the version.
  If it is only in `dependencies`, packaging fails with "Could not find any
  Electron packages in devDependencies".
- Port 0, meaning OS-assigned, is falsy in JavaScript.
  Use `port !== '' ? Number(port) : default` instead of
  `Number(port) || default`.
