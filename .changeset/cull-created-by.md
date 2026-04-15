---
'@endo/compartment-mapper': patch
'@endo/check-bundle': patch
---

Cull underscore-prefixed internal properties (like `__createdBy`) from
serialized compartment maps in archives. The compartment map validator
now also ignores underscore-prefixed properties when checking for
extraneous fields.
