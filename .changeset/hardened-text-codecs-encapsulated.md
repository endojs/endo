---
'ses': major
---

Breaking: after `lockdown()`, the `TextEncoder` and `TextDecoder` globals and their prototypes' `constructor` properties are SES-owned constructors, not the host constructors captured before `lockdown()`; compare against the post-lockdown globals instead.
Instances, prototypes, methods, and `instanceof` checks keep their host behavior, and hosts without the codecs are unchanged.
`lockdown()` now succeeds on hosts whose codec constructors carry restricted `caller` and `arguments` properties, such as Chromium before version 138.
On XS, compartments created after `lockdown()` now see the tamed intrinsics, including these codecs, instead of the globals present when SES was imported.
