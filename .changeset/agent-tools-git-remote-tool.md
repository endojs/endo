---
'@endo/agent-tools': minor
---

Add `makeGitRemoteTool(remoteCap)`, the push-tier half of the git tool surface
(daemon-agent-tools Phase 3). It builds LLM-facing tool records over a granted
`@endo/exo-git` `GitRemote` capability, exposing `fetch`, `pull`, and `push` (the
network and credential layer) plus a credential-free `inspect` that reports the
remote's policy bounds: the endpoint URL, the allowed directions, the fetch and
push refspecs, and the force/tags/delete flags. Every option is forwarded
untouched to the granted `GitRemote`, which fails closed on anything outside its
policy, so the tool states no policy of its own. Also adds the
`./json-tools/git-remote.js` subpath export and the `GitRemoteToolCapability`
type.
