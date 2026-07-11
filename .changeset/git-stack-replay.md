---
'@endo/git': minor
'@endo/exo-git': major
'@endo/agent-tools': minor
'@endo/agentry': major
---

Add cherry-pick and structured autosquash rebase operations to the Git APIs.
`@endo/agent-tools` exposes these history-rewrite operations through the
explicitly elevated `makeGitHistoryTool` maker.
Code-mode agents that need the history-rewrite surface must select
`gitMode: 'historyRewrite'` with a Git capability that has history-rewrite
authority.
