# `@endo/init`

Importing `@endo/init` sets up an Endo JavaScript realm.
This includes setting up HardenedJS, including locking it down,
sets the realm up for [Eventual Send](../eventual-send),
ensures that `atob` and `btoa` are present, and ensures that promises can be
hardened regardless of the platform.

By default, the environment is fully locked down and as safe as we can make it
for cotenant host and guest programs.

```js
import '@endo/init';
```

---

The `@endo/init/debug.js` makes a less safe environment which is more conducive
to debugging.

The default `"safe"` `errorTaming` option for SES's `lockdown`, if possible,
redacts the stack trace from error instances, so that it is not available
merely by expressing `errorInstance.stack`.
However, some tools like the Ava testing library, will look for the stack there
and become less useful if it is missing.
The `@endo/ses-ava` package compensates for the case of Ava specifically,
but `@endo/init/debug.js` may be necessary for other tools.

The default `"concise"` mode of the `stackFiltering` option to SES's `lockdown`
usually makes a better debugging experience, by severely reducing the noisy
distractions of the normal verbose stack traces.

The default `"moderate"` mode for `overrideTaming` option to SES's `lockdown`
does not hurt the debugging experience much.
But, it will introduce noise into, for example, the VSCode debugger's object
inspector.
During debugging and testing, if you can avoid legacy code that needs the
`'moderate'` setting, then the `'min'` setting reduces noise yet further, by
turning fwer inherited properties into accessors.

```js
import '@endo/init/debug.js';
```

---

Avoid using `@endo/init/unsafe-fast.js`.
It is an extreme measure we hope to obviate.

```js
import '@endo/init/unsafe-fast.js';
```
