# The newly added `writeLocator` method is causing a bug

When trying to start the daemon, it throws and hangs:

```
$ endo start
(Error#1)
Error#1: methods ["writeLocator"] not guarded by "EndoHost"

  at runEndo (packages/daemon/index.js:381:13)
  at async start (packages/daemon/index.js:488:17)
  at async Command.<anonymous> (packages/cli/src/endo.js:860:7)
  at async main (packages/cli/src/endo.js:1034:5)
  at async packages/cli/bin/endo.cjs:4:3
```

## Fix

Added `writeLocator` method guard to both `HostInterface` and
`GuestInterface` in `packages/daemon/src/interfaces.js`.

The method was implemented in `directory.js` and exposed on both
host and guest objects, but the corresponding `M.interface()` guards
were missing the method declaration, causing `makeExo` to reject it
at startup.
