---
'ses': major
---

Breaking on XS: compartments created after `lockdown()` now see the tamed intrinsics, including these codecs, instead of the globals present when SES was imported.
`lockdown()` now succeeds on hosts whose `TextEncoder` or `TextDecoder` constructor carries restricted `caller` and `arguments` properties, such as Chromium before version 138.
On those hosts, the affected global and its prototype's `constructor` property are a SES-owned constructor, not the host constructor captured before `lockdown()`; instances, prototypes, methods, and `instanceof` checks keep their host behavior.
Other hosts, and hosts without the codecs, keep their original codec constructors.
