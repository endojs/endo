# Compartment Wrapper

Impose inescapable options on a `Compartment`.

[compartment][Compartments] provide a way to evaluate ECMAScript code against a specific global object, which can be used to limit that code's authority by simply removing access to host-provided IO properties like `Request`.

Compartments can also apply a transform or add globals to all the code they evaluate which can futher control its behavior. Some of those transforms or globals may need to be inescapable, such that any child compartment (transitively) will have these transforms and globals. Particularly, to ensure that a Compartment and its transitive child Compartments all have a `WeakMap` or `WeakSet` that tracks the content of all guest `Weak*` collections, these endowments must be "inescapable".

To prevent code from escaping a transform by evaluating its code in a new child `Compartment`, the creator of the confined compartment must replace its `Compartment` constructor with a wrapped version. The wrapper will modify the arguments to include the transforms (and other options). It must merge the provided options with the imposed ones in the right order, to ensure they cannot be overridden (i.e. the imposed transforms must appear at the *end* of the list). Finally, it must also propogate the wrapper itself to the new child Compartment, by modifying `c.thisGlobal.Compartment` on each newly created compartment.

This module provides a function to create a `Compartment` constructor that enforces a set of "inescapable options".


## Usage

```js
import { wrapInescapableCompartment } from '.../compartment-wrapper';

const { WrappedWeakMap, WrappedWeakSet } = wrapWeakCollections();

const inescapableGlobalProperties = {
  WeakMap: WrappedWeakMap,
  WeakSet: WrappedWeakSet,
};
const WrappedCompartment = wrapInescapableCompartment(
  Compartment,
  inescapableGlobalProperties,
);

const endowments = {};
const modules = {};
const options = {};
const c = new WrappedCompartment(endowments, modules, options);
c.evaluate(confinedCode);
```

If `confinedCode` creates its own `Compartment`, in which `WeakMap` will
still produced wrapped `WeakMap` instances.

```js
const c2 = new Compartment();
c2.evaluate(`new WeakMap()`);
```

  [Compartments]: ../../ses/README.md#compartment
  [SES]: ../../ses/README.md

## Note expected semantic changes

This `inescapableGlobalProperties` currently copies the value of all
own properties, whether string-named or symbol-named, and whether enumerable
or not. This
differs from the longer term agreement discussed at
https://www.youtube.com/watch?v=xlR21uDigGE in these ways:
- The option in question should be named `inescapableGlobals` since
  we want to reserve `*Properties` for descriptor copying rather
  than value copying.
- We don't plan to support such `*Properties` options at this time.
  Rather, we should deprecate (and eventually remove) this one
  once we introduce`inescapableGlobals`.
- We plan to move these options to the `Compartment` constructor itself,
  in which case their support in import-bundle will just forward
  to `Compartment`.
- Following the `assign`-like semantics agree on in that meeting,
  this should only copy enumerable own properties, whereas the loop
  below copies all own properties.
The loop here does follow this agreement by differing from `assign` in
making all the target properties non-enumerable. The agreement would
further align the normal `Compartment` endowments argument to also
make the target properties non-enumerable.
