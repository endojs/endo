---
'@endo/daemon': patch
'@endo/cli': patch
---

Adopts `@endo/cancel`'s `makeCancelKit` at the daemon and CLI call sites where the previous pattern composed `makePromiseKit` with a one-shot sink-rejection. The new kit expresses the same cancellation graph without the `makePromiseKit` boilerplate; no observable behavior change.
