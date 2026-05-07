# Sandbox bin path mounts


- read `packages/sandbox/src/drivers/bwrap.js` circa lines 297-313
- read `packages/sandbox/src/drivers/path.js` circa lines 45-61 wrt `CANONICAL_BIN_PATHS`

- [x] we need to convert survivor bin paths into functional mount prefixes as describe inline
  - and those mounts need to be deduplicated ; in general, all mounts passed as
    flags like `--ro-bind-try` need to be dedeuplicated in that entire section
    of argv assembling
  - Done: added `elevateSurvivorToMountRoot` in
    `packages/sandbox/src/drivers/path.js`.
    Strips a trailing `/bin` or `/sbin` segment to get the package
    root (`/opt/rocm/bin` → `/opt/rocm`, `/snap/bin` → `/snap`),
    then strips a further trailing `/exports` so flatpak-shaped
    paths reach the right level
    (`/var/lib/flatpak/exports/bin` → `/var/lib/flatpak`).
  - Done: dedup is applied in `assembleSliceArgv` via a local
    `tryAddRoBindTry` helper that tracks seen host paths and drops
    a request when an earlier entry already covers it (identical or
    strict ancestor).  The host-bind branch now routes both
    `HOST_BIND_ROOTFS_PATHS` and the elevated survivors through this
    helper, so e.g. `/usr/bin/site_perl` survivors never emit a
    second `--ro-bind-try` under `/usr`.
  - Note: PATH entries still record the original survivor path so
    commands resolve at the directory the operator placed on
    `$PATH`; only the *mount* widens to the package root.

- [x] this also brings up that our canonical mounts are insufficient
  - `/bin` needs `/lib` (maybe also `/lib64` or `/lib32`) to function,
    classically these binaries are not statically linked
  - similarly `/usr/bin` needs all of `/usr` to function, not just dynamic
    libraries, but also data in places like `/usr/share`
  - Done: `HOST_BIND_ROOTFS_PATHS` already covered `/usr`, `/lib`,
    `/lib64`, `/etc`; added `/lib32` for multilib hosts.  `/usr/share`
    and friends are reachable through the existing `/usr` bind, and
    the comment on `HOST_BIND_ROOTFS_PATHS` now spells out why we
    bind the parent roots wholesale.

- Tests:
  - Updated `PATH synthesis: host-bind appends ambient survivors after canonical bins`
    to assert `/snap/bin` lands as a `/snap` bind (elevated) and the
    raw `/opt/local/bin` is no longer bound separately.
  - Added `mount dedup: survivors under canonical roots do not emit redundant binds`
    pinning that `/usr/*` survivors never produce a second `/usr`
    bind, while their PATH entries still appear.
  - Added `mount dedup: flatpak survivor elevates past /exports`
    pinning the two-level strip for `/var/lib/flatpak/exports/bin`.
  - Added `mount dedup: HOST_BIND_ROOTFS_PATHS entries deduplicate against /usr`
    pinning that the legitimate top-level siblings (`/lib`, `/lib32`,
    `/lib64`, `/bin`, `/sbin`, `/etc`) still each emit their own
    bind alongside `/usr` (guard against an over-eager dedup).

