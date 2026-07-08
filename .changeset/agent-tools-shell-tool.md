---
'@endo/agent-tools': minor
---

Add `makeShellTool`, which builds LLM-facing agent-tool records (`exec`, `inspect`) over a live `EndoShell` capability. Includes an advisory command-string veto (reject patterns/flags) that runs tool-side before the call reaches the exo; the veto is hardening advice, not the boundary — the formula-owned allowlist inside the `Shell` exo is.
