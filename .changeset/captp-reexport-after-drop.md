---
'@endo/captp': patch
---

CapTP now forgets a local object's export slot when the peer drops the last reference to it. Previously the export-table entry was deleted but the object's reverse mapping kept the dead slot, so exporting the same still-live object again reused that slot and the peer's calls on the new presence failed with `Unknown export`.
