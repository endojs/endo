---
'@endo/harden': minor
---

- Introduces `@endo/harden`, providing a `harden` implementation that works
  both inside and outside HardenedJS.
- Supports the `hardened` and `harden:unsafe` build conditions to select
  hardened-environment and no-op behaviors.
- Detects pre-lockdown use of `harden` so `lockdown()` fails with a helpful
  error instead of leaving modules incorrectly hardened.
