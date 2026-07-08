---
'@endo/daemon': minor
---

Add the `EndoHost.provideShell` method and `DaemonCore.formulateShell` formula, minting an `EndoShell` capability bound to a writable physical mount. Refuses a read-only mount both at provide time and at reincarnation, bakes a sanitized child environment (`PATH` + `LC_ALL` only, plus the policy's explicit passlist), and never inherits the host process environment.
