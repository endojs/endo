---
'@endo/claude-sandbox': minor
---

Add `@endo/claude-sandbox`: run Claude Code inside an `@endo/sandbox` rootless
podman slice and expose it as a `ClaudeClient` Endo capability. The workspace is
projected by mounting an `@endo/platform/fs/extended` `Filesystem` capability
into the host kernel over 9P (via `@endo/9p-server`'s mount caplet) and
bind-mounting that host mountpoint into the container at `/workspace`. Includes a
form-driven factory caplet, a peer-callable mailbox session-request path, a
ported `ClaudeCredentials` capability (0600 sidecar + single-shot
`IssuedCredential`), and `setup-host.js` / `setup-peer.js` provisioning split by
machine role.
