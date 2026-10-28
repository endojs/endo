---
'ses': minor
---

`lockdown()` now succeeds in Chromium versions whose `TextEncoder` and `TextDecoder` constructors previously made it fail.
In those browsers, the codec globals after `lockdown()` are SES-owned constructors that share the host prototypes.
Read `globalThis.TextEncoder` and `globalThis.TextDecoder` after `lockdown()` rather than caching them beforehand: a reference captured before `lockdown()` is not identical to the new constructor, although `instanceof` against either reference accepts instances made by either.
Other hosts keep their original codec constructors, and hosts without the codecs remain without them.
