---
'@endo/daemon': minor
---

Add a revocation caretaker and an overridable deny-pattern set to `EndoMount`.

`makeRevocableMount(options)` returns `{ mount, control }`, where `control`
is an `EndoMountControl` caretaker exo whose `revoke()` trips a shared
liveness flag on the mount and every face derived from it — sub-views,
entries, opened files, `readOnly()` views, `makeDirectory` results, and any
open `followNameChanges` stream all begin throwing `Mount has been revoked`.
The daemon's `mount` and `scratch-mount` formulas now mint their mounts
through `makeRevocableMount` and wire `context.onCancel(() =>
control.revoke())`, so a mount is revoked when its formula is cancelled; the
control facet stays captive in the daemon.

A defense-in-depth deny set restricts well-known credential and configuration
names (`.ssh`, `.aws`, `.azure`, `.gcloud`, `.config`, `.gnupg`,
`.password-store`, `.docker`, `.npmrc`, `.env`, `.env.local`,
`.env.production`, `.kube`, `.terraform`) case-insensitively: naming one in a
path throws `Access denied`, and `list()` and `followNameChanges()` omit them
from their enumerations. Ordinary dotfiles such as `.gitignore` stay
accessible. The exported `defaultDeniedSegments` list is the canonical set; a
`deniedSegments` creation option on `makeMount` / `makeRevocableMount`
(plumbed through the `mount` / `scratch-mount` formulas and
`provideMount` / `provideScratchMount`) **replaces** it — callers extend the
default by spreading `defaultDeniedSegments`, and an empty iterable disables
denial. CLI plumbing for the option is a follow-up.

Behavior change: the deny set is **on by default**. An existing
`provideMount(<a-host-home-directory>)` that previously listed or resolved
names like `.ssh`, `.env`, `.npmrc`, or `.config` now throws `Access denied`
and omits them from `list()` / `followNameChanges()`, with no caller change —
and, because a default mount formula carries no `deniedSegments` field, this
applies retroactively to already-formulated mounts after upgrade. Pass
`deniedSegments: []` to restore the prior exposure, or spread
`defaultDeniedSegments` to extend rather than replace it. Scratch mounts (a
fresh empty root under the daemon state path) are unaffected in practice.
