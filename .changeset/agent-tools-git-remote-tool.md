---
'@endo/agent-tools': minor
'@endo/exo-git': minor
'@endo/git': minor
---

New: `makeGitRemoteTool(remoteCap)` builds LLM-facing tool records over a granted `@endo/exo-git` `GitRemote`, exposing `fetch`, `pull`, and `push` — the network and credential layer — plus a credential-free `inspect` that reports the remote's policy bounds: the endpoint URL, the allowed directions, the fetch and push refspecs, and the force/tags/delete flags.
It is available at the new `@endo/agent-tools/json-tools/git-remote.js` subpath, alongside the `GitRemoteToolCapability` type.

`GitRemote.push` gains `forceWithLease`, the capability form of `git push --force-with-lease=<destination>:<oid>`: the update lands only while the destination still names the 40-character object ID the caller observed, which is what makes a git branch usable as a transactional ledger.
It requires a remote whose policy sets `allowForcePush` and an explicit `source`, rejects a wildcard destination and the null object ID, and cannot be combined with `force`.
`@endo/git`'s `remotePush` accepts the corresponding `forceWithLease: { ref, expectedOid }` input and refuses to pair it with a force refspec, which would silently void the lease.

`GitRemote.push` now also reads its `force` and `setUpstream` flags coerce-free, rejecting a non-boolean rather than taking it for its truthiness, so a caller spelling `force: 'false'` gets an error instead of a force push.
This matches how the policy-side flags have always been read.
