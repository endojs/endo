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
import { getEnvironmentOption } from '@endo/env-options';
const FooBarOption = getEnvironmentOption('FOO_BAR', 'absent');
```

The first argument to `getEnvironmentOption` is the name of the option.
The value of `FooBarOption` would then be the value of
`globalThis.process.env.FOO_BAR`, if present.
If value is either absent or `undefined`, the second argument,
such as `'absent'`, would be used instead.

In either case, reflecting Unix environment variable expectations,
the resulting setting must be a string.
This restriction also helps ensure that this channel is used only to pass data,
not authority beyond the ability to read this global state.

```js
const ENABLED =
  getEnvironmentOption('TRACK_TURNS', 'disabled', ['enabled']) === 'enabled';
```

`getEnvironmentOption` also takes an optional third argument, which if present
is an exhaustive list of allowed strings other than the default. If present
and the actual environment option is neither the default nor one of these
allowed strings, then an error is thrown explaining the problem.

```js
const DEBUG_VALUES = getEnvironmentOptionsList('DEBUG');
const DEBUG_AGORIC = environmentOptionsListHas('DEBUG', 'agoric');
```

Another common convention is for the value of an option to be a
comma (`','`) separated list of strings. `getEnvironmentOptionsList` will
return this list, or an empty list if the option is absent.
`environmentOptionsListHas` will test if this list contains a specific
value, or return false if the option is absent.

(Compat note: https://github.com/Agoric/agoric-sdk/issues/8096 explains that
for `DEBUG` specifically, some existing uses split on colon (`':'`) rather
than comma. Once these are fixed, then these uses can be switched to use
`getEnvironmentOptionsList` or `environmentOptionsListHas`.)

## Tracking used option names

The `'@endo/env-options'` module also exports a lower-level
`makeEnvironmentCaptor` that you can apply to whatever object you wish to treat
as a global(having a "process" property with its own "env" record),
such as the global of another compartment. It returns an entagled
pair of a `getEnvironmentOption` function as above, and a
`getCapturedEnvironmentOptionNames` function that returns an array of
the option names used by that `getEnvironmentOption` function. This is
useful to give feedback about
which environment variables were actually read, for diagnostic purposes.
For example, the
ses-shim `lockdown` once contained code such as the following, to explain which
environment variables were read to provide `lockdown` settings.

```js
import { makeEnvironmentCaptor } from '@endo/env-options';
const {
  getEnvironmentOption,
  getEnvironmentOptionsList,
  environmentOptionsListHas,
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

# Note of test migration

To reduce cyclic dependencies, the tests of this module have been moved to
@endo/ses-ava. Doing `yarn test` here currently does nothing.
