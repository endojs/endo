# Compartment Wrapper

Impose inescapable options on a `Compartment`.

[compartment][Compartments] provide a way to evaluate ECMAScript code against a specific global object, which can be used to limit that code's authority by simply removing access to host-provided IO properties like `Request`.

Compartments can also apply a transform to all the code they evaluate, and provide additional global lexicals to its environment, which can futher control its behavior. For example, the transform might inject a "metering check" into the beginning of each block, which decrements a counter and throws an exception if it underflows. This can be used to prevent the confined code from consuming excessive CPU.

The Compartment's configured transform will be applied to any code evaluated through external calls to `c.evaluate(code)` and `c.import(module)`. It will also be applied to internal evaluations via `eval(code)` and `new Function(code)`. However, the transforms and other options are not automatically propagated to new child Compartments.

To prevent code from escaping a transform by evaluating its code in a new child `Compartment`, the creator of the confined compartment must replace its `Compartment` constructor with a wrapped version. The wrapper will modify the arguments to include the transforms (and other options). It must merge the provided options with the imposed ones in the right order, to ensure they cannot be overridden (i.e. the imposed transforms must appear at the *end* of the list). Finally, it must also propogate the wrapper itself to the new child Compartment, by modifying `c.thisGlobal.Compartment` on each newly created compartment.

This module provides a function to create a `Compartment` constructor that enforces a set of "inescapable options".


## Usage

```js
import { wrapInescapableCompartment } from '.../compartment-wrapper';

// Allow oldSrc to increment the odometer, but not read it. SES offers much
// easier ways to do this, of course.

function milageTransform(oldSrc) {
  if (oldSrc.indexOf('getOdometer') !== -1) {
    throw Error(`forbidden access to 'getOdometer' in oldSrc`);
  }
  return oldSrc.replace(/addMilage\(\)/g, 'getOdometer().add(1)');
}

// add a lexical that the original code cannot reach
function makeOdometer() {
  let counter = 0;
  function add(count) {
    counter += count;
  }
  function read() {
    return counter;
  }
  return { add, read };
}
const odometer = makeOdometer();
function getOdometer() {
  return odometer;
}

const inescapableTransforms = [milageTransform];
const inescapableGlobalLexicals = { getOdometer };
const WrappedCompartment = wrapInescapableCompartment(Compartment,
                                                      inescapableTransforms,
                                                      inescapableGlobalLexicals);
const endowments = {};
const modules = {};
const options = {};
const c = new WrappedCompartment(endowments, modules, options);
c.evaluate(confinedCode);
// c.import(confinedModule);
```

If `confinedCode` creates its own Compartment with something like:

```js
const c2 = new Compartment(endowments, modules, { transforms, globalLexicals });
```

then its Compartment constructor will actually be invoked like this:

```js
new Compartment(endowments, modules,
                {
                  transforms: [...transforms, milageTransform],
                  globalLexicals: { ...globalLexicals, getOdometer },
                });
```

except that it could not make such an invocation itself, because it won't have access to `milageTransform` (which doesn't appear in the globals or global lexicals), or `getOdometer` (which *does* appear in the global lexicals, but the transform ensures that it cannot be reached by the pre-transformed `confinedCode`).



  [Compartments]: ../../ses/README.md#compartment
  [SES]: ../../ses/README.md
