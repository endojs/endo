User-visible changes in `@endo/marshal`:

# v0.5.1 (2021-01-22)

Moved from https://github.com/Agoric/agoric-sdk to
https://github.com/endojs/endo, still in a `packages/marshal` directory.


---

# v0.1.2 (2019-12-17)

- depend on @agoric/eventual-send (#6)

Moved from https://github.com/Agoric/marshal into the `packages/marshal/`
directory in the monorepo at https://github.com/Agoric/agoric-sdk .


# v0.1.1 (2019-10-02)

Remove unneeded SES dependency.


# v0.1.0 (2019-19-11)

Breaking API change: applications must change how they use m.serialize()
and m.serialize().

- change API to use 'CapData' format: `{body, slots}`
  - `m.serialize()` now returns `{body, slots}` instead of `{argsString, slots}`
  - `m.unserialize()` now takes `(capdata, cyclePolicy)` instead of
    `(body, slots, cyclePolicy)`. The `cyclePolicy` argument remains optional.
- the return value of `m.serialize()` is now hardened
- improve error messages


# v0.0.1 (2019-06-06)

First release.
