---
'ses': patch
---

- On XS, compartments constructed after `lockdown()` now receive their global
  intrinsics from lockdown, as on other engines, instead of the global bindings
  sampled when SES was imported. Previously, every new compartment received the
  untamed `Date`, `Math`, and other shared globals, and a universal global such
  as `TextEncoder` that was deleted or replaced between importing SES and
  calling `lockdown()` leaked its original, unhardened value.
