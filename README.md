# MakeHardener

[![Build Status][travis-svg]][travis-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Build a defensible API surface around an object by freezing all reachable properties.

A "Hardened" object is one which is safe to pass to untrusted code: it offers that code an API which can be invoked, but does not allow that code to modify the internals of the object or anything it depends upon. For example, a simple-but-insecure way to offer an increment-only counter API to some users might be as follows:

```js
function makeCounterSet() {
  let counters = new Map();
  const API = {
    increment(name): {
      if (!counters.has(name)) {
        counters.set(name, 0);
      }
      const newValue = counters.get(name) + 1;
      counters.set(name, newValue);
      return newValue;
    }
  return API;
}

const newAPI = makeCounterSet();
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

Now, what could our `untrustedUser` do that could violate the increment-only property of these counters?

### Break Functionality For Other Users

```js
function untrustedUser1(newAPI) {
  delete newAPI.increment;
}
```

That would prevent anyone from using the counter at all.

### Snoop on Usage By Other Users

```js
function untrustedUser1(newAPI) {
  const origIncrement = newAPI.increment;
  const otherNames = new Set();
  newAPI.increment = function(name) {
    otherNames.add(name);
    return origIncrement(name);
  };
}
```

This lets one user learn the names being used by other user.

### Violate the API Contract

```js
function untrustedUser1(newAPI) {
  Map.set = function(name, value) {};
}
```

This changes the `Map` which our counter API relies upon: when it tries to update the value, the update is ignored, so the counter will stay at 0 forever.

As a side-effect, it breaks `Map` for everyone in that Realm (which generally means everyone in the same process). This is pretty drastic, but you can imagine a situation where the target object was the only user of some shared utility, and the attacker could selectively modify the utility to affect some users without affecting others. For example, `Map.set` might look at the name and only ignore updates for specific ones.

### Modify Prototypes to Violate the API Contract

Our example object inherits directly from `Object.prototype`, but a more complex program might create intermediate objects and use them as prototypes to share behavior between multiple instances. These intermediate objects are vulnerable too:

```js
function untrustedUser1(newAPI) {
  Object.getPrototypeOf(newAPI).something = function(arg) {};
}
```

We need to protect against this too.

## Preventing API Misuse by Freezing

`Object.freeze()` was created to prevent exactly this sort of misbehavior. Once an object is frozen, its properties cannot be changed (new ones cannot be added, and existing ones cannot be modified or removed). This prevents the most basic attacks:

```js
const newAPI = makeCounterSet();
Object.freeze(newAPI);
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

However the API object might expose properties that point to other API objects, and Object.freeze() only protects its single argument. We want to traverse all exposed properties of our API object and freeze them too, recursively. We want to make sure the prototype chain is protected too, as well as any utilities that our API depends upon (like `Map`).

`harden()` is a function which performs this recursive freezing of an API surface, preventing all of the attacks described above:

```js
const newAPI = harden(makeCounterSet());
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

[SES](https://github.com/Agoric/SES) is a programming environment in which all the "primordials" (the built-in Javascript objects like `Map`, `Number`, `Array`, and so on) are frozen. In a SES environment, simply `harden()` the objects that you give to other code to interact with them safely, according to the API that you've constructed.

## Creating a harden() Function

This package (`@agoric/make-hardener`) provides a `makeHardener()` which can be used to build your own `harden()` function. `makeHardener` is "pure", meaning that it does not know about any specific primordials. When you call `makeHardener()`, you give it a set of stopping points, and the recursive property walk will stop its search when it runs into one of these points. The resulting `harden()` will throw an exception if anything it freezes has a prototype that is not already in the set of stopping points (or was frozen during the same call).

There is a related package named `@agoric/harden` that uses `makeHardener` to provide a `harden()` that is a "resource module": it has some authority baked in. `@agoric/harden` could be used as a communication channel between two unrelated pieces of code, by testing whether a prearranged object is already frozen or not (TODO: how exactly?). It is also tied to a specific list of primordials, making it less useful for an environment like SES that needs to specify its own list.






[travis-svg]: https://travis-ci.com/Agoric/MakeHardener.svg?branch=master
[travis-url]: https://travis-ci.com/Agoric/MakeHardener
[deps-svg]: https://david-dm.org/Agoric/MakeHardener.svg
[deps-url]: https://david-dm.org/Agoric/MakeHardener
[dev-deps-svg]: https://david-dm.org/Agoric/MakeHardener/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/MakeHardener?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
