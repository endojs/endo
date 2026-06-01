---
'@endo/ses-ava': patch
---

Widen the declared `ava` dependency range to `^6 || ^7 || ^8` so
consumers can stay on ava 6 or 7 rather than being forced onto ava 8.
It remains a direct dependency (not a peer) so the `ses-ava` bin
materializes correctly under the pnpm linker.
