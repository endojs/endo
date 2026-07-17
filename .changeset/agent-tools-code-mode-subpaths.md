---
'@endo/agent-tools': major
---

Relocate the JSON tool and code-mode APIs under explicit `json-tools`, `code-mode`, `code-mode-globals`, `adapters`, and `generated` subpaths.
Migrate imports from the removed top-level and `src` tool paths to their corresponding new subpaths, and use the `evaluate` code-mode tool surface.
