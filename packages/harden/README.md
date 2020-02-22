# Harden

[![Build Status][circleci-svg]][circleci-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Build a defensible API surface around an object by freezing all reachable properties.

## How to use

> Note: To fully freeze all reachable proporties, `harden()` must be run in a [SES](https://github.com/Agoric/SES) environment. This package, used by itself, is insecure and should only be used for more easily testing code that will be run in SES.

## Background: Why do we need to "harden" objects?

A "hardened" object is one which is safe to pass to untrusted code: it offers an API which can be invoked, but does not allow the untrusted code to modify the internals of the object or anything it depends upon.

To better explain this, let's look at what happens if you don't harden your objects. For example, let's say we want to offer an increment-only counter API to some users:

```js
function makeCounterSet() {
  let counters = new Map();
  const API = {
    increment(name) {
      if (!counters.has(name)) {
        counters.set(name, 0);
      }
      const newValue = counters.get(name) + 1;
      counters.set(name, newValue);
      return newValue;
    },
  };
  return API;
}

const newAPI = makeCounterSet();
```

Now we hand off the counterSet API to two users:

```js
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

Because we haven't hardened anything at this point, `untrustedUser1` can do a lot of damage. `untrustedUser1` can:

**Break Functionality For Other Users**

```js
function untrustedUser1(newAPI) {
  delete newAPI.increment;
}
```

That would prevent anyone from using the counter at all.

**Snoop on Usage By Other Users**

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

## But what about Object.freeze()?

`Object.freeze()` was created to prevent exactly this sort of misbehavior. Once an object is frozen, its properties cannot be changed (new ones cannot be added, and existing ones cannot be modified or removed). This prevents the most basic attacks:

```js
const newAPI = makeCounterSet();
Object.freeze(newAPI);
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

However the API object might expose properties that point to other API objects, and Object.freeze() only protects its single argument. We want to traverse all exposed properties of our API object and freeze them too, recursively. We want to make sure the prototype chain is protected too, as well as any utilities that our API depends upon (like `Map`). If we don't the attacker, `untrustedUser1` can still violate the API Contract as in this example of prototype poisoning:

```js
function untrustedUser1(newAPI) {
  Map.prototype.set = () => {};
  Map.prototype.get = () => 0;
  Map.prototype.has = () => true;
}
```

This changes the `Map` which our counter API relies upon: when it tries to update the value, the update is ignored, so the counter will stay at 1 forever.

As a side-effect, it breaks `Map` for everyone in that Realm (which generally means everyone in the same process). This is pretty drastic, but you can imagine a situation where the target object was the only user of some shared utility, and the attacker could selectively modify the utility to affect some users without affecting others. For example, `Map.prototype.set` might look at the name and only ignore updates for specific ones.

## The Solution: Recursive freezing with `harden()`

`harden()` is a function which performs recursive freezing of an API surface, preventing all of the attacks described above:

```js
const newAPI = harden(makeCounterSet());
untrustedUser1(newAPI);
untrustedUser2(newAPI);
```

If `harden()` runs in a [SES](https://github.com/Agoric/SES) environment, all of the intrinsics (the built-in Javascript objects like `Map`, `Number`, `Array`, and so on) are already frozen. In a SES environment, to interact with untrusted code safely according to the API that you've constructed, you just need to `harden()` the objects that you give to other code (and any custom prototypes you might be using). Outside of SES, `harden()` is insecure and should be used for testing only.


## MakeHardener and creating a custom harden() function

The package [`@agoric/make-hardener`](https://www.npmjs.com/package/@agoric/make-hardener) provides a `makeHardener()` which can be used to build your own `harden()` function. `makeHardener` does not know about any specific intrinsics, and must be passed that information. When you call `makeHardener()`, you give it a set of stopping points, and the recursive property walk will stop its search when it runs into one of these points. The resulting `harden()` will throw an exception if anything it freezes has a prototype that is not already in the set of stopping points (or was frozen during the same call).

The provided harden() function is created by calling makeHardener() on a specific set of stopping points. Thus, makeHardener is bundled (see package-lock.json for the actual version) in this package for ease of use. 

For everyday usage, you probably want to use the `harden()` provided in [SES](https://github.com/Agoric/SES) instead of creating your own. If you want to test your code before using it in SES, you can use this package [@agoric/harden package](https://github.com/Agoric/Harden). (Note that without SES freezing the intrinsics, `harden()` is insecure, and should be used for testing purposes only.)

[circleci-svg]: https://circleci.com/gh/Agoric/harden.svg?style=svg
[circleci-url]: https://circleci.com/gh/Agoric/harden
[deps-svg]: https://david-dm.org/Agoric/Harden.svg
[deps-url]: https://david-dm.org/Agoric/Harden
[dev-deps-svg]: https://david-dm.org/Agoric/Harden/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/Harden?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
