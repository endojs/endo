---
'@endo/daemon': minor
---

Add `grep(pattern, paths?, options?)` to `EndoMount`, delegating to the
`@endo/platform/fs/search` engine, with glob and grep **decoupled** so they
compose.

`grep(pattern, paths?, options?) -> Promise<Array<{ file, line, text }>>`
searches file contents for an ECMAScript RegExp source (no flags), returning
`{ file, line, text }` records with 1-based line numbers and CRLF-normalized
text. `paths` is the set of files to search — a `string[]`, or (via CapTP) a
`Promise<string[]>` the exo awaits under an `M.await` guard — so `glob` is an
independent producer of paths that pipes into grep:
`E(mount).grep('TODO', E(mount).glob('src/**/*.js'))`. There is no `glob` option
on grep; glob is not owned by grep. Omitting `paths` searches every file under
the face's root. Each supplied path that is denied, escapes confinement, is a
directory, or is unreadable is skipped silently — the uniform envelope that
makes glob-produced and hand-supplied paths behave identically. `options` keeps
`maxResults` (default 1000). The walk, deny filtering, confinement, and CRLF
normalization live in the platform engine, so a Rust/XS platform can substitute
a native grep behind the same seam; the method is the eager flatten-and-cap
collector over the engine's batch generator, a `subView`'s grep is scoped to its
sub-root, and the revocation gate wraps the call.
