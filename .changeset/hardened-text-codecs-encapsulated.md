---
'ses': major
---

`lockdown()` now exposes hardened SES-owned `TextEncoder` and `TextDecoder` constructors when the host provides those codecs, including on Chromium before version 138.
Code that compares codec constructors captured before and after `lockdown()` must instead use the post-lockdown globals; codec instances and methods retain their host behavior.
On XS, compartments created after `lockdown()` now receive lockdown's tamed shared intrinsics instead of globals sampled when SES was imported.
