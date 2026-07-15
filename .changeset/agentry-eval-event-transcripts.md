---
'@endo/agentry': minor
---

Make the git code-mode live-eval event artifacts transcript-grade and
self-describing.
Every `events.jsonl` record now carries the `scenario` and `model` it came
from, so concurrently run eval rows no longer interleave into an
unattributable stream, and captures bounded, redacted transcript content
(assistant message text, the source submitted to the `execute` tool, and
tool results) through the existing credential-redacting `safeText` helper.
Each scenario now also declares `referenceSourcePath` and
`referenceSourceExport`, pointing at a `reference.js` module holding its
reference solution, and every `results.jsonl` row carries the same pair so a
downstream reporter can link a run's transcript to the solution it was
scored against.
