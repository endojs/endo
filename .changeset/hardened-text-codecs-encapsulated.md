---
'ses': major
---

Breaking on XS: compartments created after `lockdown()` now see the tamed intrinsics, including `TextEncoder` and `TextDecoder`, instead of the globals present when SES was imported.
Code that deletes or replaces a global between importing SES and calling `lockdown()` now sees that change in new compartments.

`lockdown()` now succeeds in Chromium versions whose `TextEncoder` and `TextDecoder` constructors previously made it fail.
In those browsers, the codec globals after `lockdown()` are SES-owned constructors, so they differ from references captured before `lockdown()`; instances, methods, and `instanceof` checks behave as before.
Other hosts keep their original codec constructors, and hosts without the codecs remain without them.
