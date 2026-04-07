---
'ses': major
'@endo/marshal': patch
---

# Plug NaN Side-channel

The JavaScript language can leak the bit encoding of a NaN via shared TypedArray views of an common ArrayBuffer. Although the JavaScript language has only one NaN value, the underlying IEEE 754 double-precision floating-point representation has many different bit patterns that represent NaN. This can be exploited as a side-channel to leak information. This actually happens on some platforms such as v8.

@ChALkeR explains at https://github.com/tc39/ecma262/pull/758#issuecomment-3919093669 that the behavior of this side-channel on v8. At https://junk.rray.org/poc/nani.html he demonstrates it, and it indeed even worse than I expected.

To plug this side-channel, we make two coordinated changes.
  * We stop listing the `Float*Array` constructors as universal globals. This prevents them from being implicitly endowed to created compartments, because they are not harmless. However, we still keep them on the start compartment (the original global), consider them intrinsics, and still repair and harden them on `lockdown()`. Thus, they can be explicitly endowed to child compartments at the price of enabling code in that compartment to read the side-channel.
  * On `lockdown()`, we repair the `DataView.prototype.setFloat*` methods so that they only write canonical NaNs into the underlying ArrayBuffer.

  The `@endo.marshal` package's `encodePassable` encodings need to obtain the bit representation of floating point values. It had used `Float64Array` for that. However, sometimes the `@endo/marshal` package is evaluated in a created compartment that would now lack that constructor. (This reevaluation typically occurs when bundling bundles in that package.) So instead, `encodePassable` now uses the `DataView` methods which are now safe.
