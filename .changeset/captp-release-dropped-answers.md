---
'@endo/captp': patch
---

CapTP now releases a question's answer when the peer drops the question. The answer table is keyed by the peer's question ID, but the `CTP_DROP` handler deleted the reversed export slot instead, so a settled answer promise and its fulfilled payload stayed reachable for the lifetime of the connection even with `gcImports: true`.
