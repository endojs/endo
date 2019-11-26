User-visible changes in marshal:

## Release 0.1.1 (02-Oct-2019)

Remove unneeded SES dependency.


## Release 0.1.0 (11-Sep-2019)

Breaking API change: applications must change how they use m.serialize()
and m.serialize().

* change API to use 'CapData' format: `{body, slots}` (#8)
  * `m.serialize()` now returns `{body, slots}` instead of `{argsString, slots}`
  * `m.unserialize()` now takes `(capdata, cyclePolicy)` instead of
    `(body, slots, cyclePolicy)`. The `cyclePolicy` argument remains optional.
* the return value of `m.serialize()` is now hardened (#11)
* improve error messages (#3)


## Release 0.0.1 (06-Jun-2019)

First release.
