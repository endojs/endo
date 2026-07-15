---
'@endo/git': minor
'@endo/daemon': minor
---

Add a formula-owned, guest-immutable commit-identity boundary to the Git capability.
`provideGit` and `provideGitClone` accept an optional `{ identity: { authorName, authorEmail, committerName?, committerEmail? } }` construction option, captured at construction and threaded into the native backend's author/committer environment per invocation.
The optional `committerName` / `committerEmail` default to the author fields when unset, so a bare `{ authorName, authorEmail }` attributes both roles to one identity.
Omitted, commits retain the backend default `Endo <endo@invalid.local>`, so the option is strictly additive.
`reword`'s author-preservation behavior is unchanged; only the committer is re-attributed to the identity.
