# Parameterizing Modules with Environment Options

JavaScript module semantics resist attempts to parameterize a module's
initialization behavior. A module initializes in order according to
the path by which it is first imported, and then the initialized module
is reused by all the other times it is imported. Compartments give us
the opportunity to bind the same import name to different imported
modules, depending on the package/compartment doing the import. Compartments
also address the difficulty of parameterizing a module's initialization
logic, but not in a pleasant manner.

A pleasant parameterization would be for a static module to be function-like
with explicit parameters, and for the parameterization to be like
calling the static module with parameters in order to derive from it a
module instance. Compartments instead lets us parameterize the meaning
of a module instance derived from a static module according to the
three namespaces provided by the JavaScript semantics, affecting the
meaning of a module instance.
   * The global variable namespaces.
      * The global scope, aliased to properties of the global object.
        This is necessarily compartment-wide. In our
        recommened usage pattern of one compartment per package,
        each global would be package-wide. (See LavaMoat)
      * The global lexical scope. The SES-shim compartments support
        these both compartment-wide as well as per-module. But it is
        not yet clear what we will propose in the Compartment proposal.
   * The import namespace.
   * The host hooks.

This `@endo/env-options` package follows the Node precedent for
finding Unix environment variable settings: looking for a
global `process` object holding an `env` object,
optionally holding a property with the same name as the option,
whose value is the configuration setting of that option.

```js
import { makeEnvironmentCaptor } from '@endo/env-options';
const { getEnvironmentOption } = makeEnvironmentCaptor(globalThis);
const FooBarOption = getEnvironmentOption('FOO_BAR', 'absent');
```

The first argument to `getEnvironmentOption` is the name of the option.
The value of `FooBarOption` would then be the value of
`globalThis.process.env.FOO_BAR`, if present.
If setting is either absent or `undefined`, the default `'absent'`
would be used instead.

In either case, reflecting Unix environment variable expectations,
the resulting setting must be a string.
This restriction also helps ensure that this channel is used only to pass data,
not authority beyond the ability to read this global state.

The `makeEnvironmentCaptor` function also returns a
`getCapturedEnvironmentOptionNames` function for use to give feedback about
which environment variables were actually read, for diagnostic purposes.
For example, the
ses-shim `lockdown` once contained code such as the following, to explain which
environment variables were read to provide `lockdown` settings.

```js
import { makeEnvironmentCaptor } from '@endo/env-options';
const {
  getEnvironmentOption,
  getCapturedEnvironmentOptionNames,
} = makeEnvironmentCaptor(globalThis);
...
const capturedEnvironmentOptionNames = getCapturedEnvironmentOptionNames();
if (capturedEnvironmentOptionNames.length > 0) {
  console.warn(
    `SES Lockdown using options from environment variables ${enJoin(
      arrayMap(capturedEnvironmentOptionNames, q),
      'and',
    )}`,
  );
}
```
