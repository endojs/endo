---
'@endo/platform': patch
'@endo/daemon-cas': patch
'@endo/exo-git': patch
'@endo/agentry': patch
---

Correct the shared ReadableBlob declarations to describe the public Exo
methods while keeping the host-side CAS `readRange` helper out of generated Git
code-mode types.
Git blob declarations now expose their actual `getInfo` and streaming `fetch`
surface, while `rangeRead` and `rangeReadText` remain on the richer platform
LocalBlob contract.
