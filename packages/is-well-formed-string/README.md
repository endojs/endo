# @endo/is-well-formed-string

A shared ponyfill for
[`String.prototype.isWellFormed`](https://github.com/tc39/proposal-is-usv-string):
a single-function leaf package that reports whether a value is a well-formed
Unicode string (no unpaired surrogates).

```js
import { isWellFormedString } from '@endo/is-well-formed-string';

isWellFormedString('hi'); // true
isWellFormedString('\ud800'); // false — lone high surrogate
isWellFormedString(42); // false — only strings are well-formed strings
```

## Why a ponyfill, and why its own package

The standard built-in `String.prototype.isWellFormed` is not universally
available — XS, which runs the slot-machine bus worker, may lack it — so code
that needs the check cannot rely on the native method directly. It is also
subtly unsafe: the native method does a ToString on its input, so it judges a
non-string that coerces to a well-formed string to be well-formed. This function
prefers the native method when present and falls back to a manual surrogate scan
otherwise, and returns `false` for every non-string.

The check previously lived inside `@endo/pass-style`. It is factored out here so
primitive codecs such as [`@endo/cbor`](../cbor/README.md) can depend on the
well-formedness check without entraining the whole pass-style protocol package,
and so there is a single canonical implementation rather than a copy per
consumer. `@endo/pass-style` re-exports `isWellFormedString` from this package.
