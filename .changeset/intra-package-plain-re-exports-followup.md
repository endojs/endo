---
---

refactor: repoint intra-package importers off plain re-exports onto their
defining modules (mechanical follow-up to the intra-package plain re-exports
design, #544). Within a package, each name is now imported from the module that
defines it rather than through a sibling that plainly re-exports it. No declared
export is removed and no module is deleted: only intra-package import edges move,
so there is no published-behavior change and no version bump.
