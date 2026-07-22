---
'@endo/exo-git': major
'@endo/daemon': major
'@endo/agent-tools': patch
---

Represent read-only, ordinary read-write, and history-rewrite Git authority as
distinct public TypeScript surfaces.
Ordinary Git capabilities no longer advertise amend, reword, cherry-pick, or
rebase operations that their runtime authority rejects.
The deprecated `WritableEndoGit` alias for `ReadWriteEndoGit` is removed;
callers still importing it must switch to `ReadWriteEndoGit` or
`HistoryRewriteEndoGit`.
