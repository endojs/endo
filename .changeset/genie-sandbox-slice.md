---
'@endo/daemon': minor
---

Add new `EndoHost.provideHostPath(cap)` method which resolves a `Mount` cap to
its host filesystem. Rejects sub-Mounts and read-only attenuations rather than
silently unwrapping them. Needed by system sandbox drivers, when assembling a
set of bind-mounts to from a guest's root filesystem as an attenuation of the
host's.
