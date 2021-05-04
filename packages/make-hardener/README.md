# MakeHardener

[![Build Status][circleci-svg]][circleci-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![License][license-image]][license-url]

Build a defensible API surface around a SES object by freezing all reachable
properties. Exports a `makeHarden` function that is designed to be used *only*
by [SES](https://github.com/Agoric/SES) to make a `harden` function.

Please see
[harden](https://github.com/endojs/endo/blob/master/packages/ses/README.md#harden)
documentation on the `harden` function.

# The negative branding technique and its invariants

See https://github.com/endojs/endo/issues/705

The *crucial invariant* is that the `onlyNonExtensible` weak set within the
implementation must contain *all reachable objects* that
   - are non-extensible
   - might become frozen
   - might need to be hardened.

If it is possible for a reachable object to be frozen but not effectively
hardened but still absent from this set, then this scheme is
insecure. To do this, we must
   - patch all the builtin methods that can make a reachable object
     non-extensible.
   - reason about all reachable objects that the implementation
     might make non-extensible, and ensure that somehow we are safe
     anyway.

The builtin methods that could make a reachable object non-extensible
   - `Object.freeze`
   - `Object.seal`
   - `Object.preventExtensions`
   - `Reflect.preventExtensions`

The reachable objects that might be made non-extensible by the platform, i.e.,
by means that evade patching the methods above.
   - The ***template object*** of template strings. This consists only of two
     frozen arrays and strings. It is already transitively immutable,
     and so harmless to consider already hardened.
   - ***Module namespace*** objects. These are non-extensible, but each exported
     name is represented by a writable-configurable property that *cannot*
     be made non-writable. (Need to check this.) Thus, they can only
     be frozen when they're empty, in which case they are transitively
     immutable and can harmessly be considered hardened. Otherwise, they
     fail the "might become frozen" criteria above.
   - The ***`ThrowTypeError`*** function, which is anonymous primordial that is
     already safely hardened along with the other primordials.
   - Objects that might be hardened by the host and made reachable by SES
     objects, such as host objects placed in the start compartment's
     global object. This is
     [open ended and unpluggable](https://github.com/endojs/endo/issues/705#issuecomment-836111816)
     in general, preventing this technique from being securable in a
     host-independent manner. The known example is `console._times.constructor`
     in a pristine Node system.

Given these invariants, we can consider an object hardened iff it is
frozen and does *not* appear in the `onlyNonExtensible` weak set.

# When to use negative branding

The negative
branding technique is inherently more fragile than the normal positive branding
techique, so we should only use it where we must, and where we can tolerate the
extra risk. Currently, we are forced to use this technique by the scaling
properties of `WeakMaps` on XS. They use a hash table with a fixed number of
buckets that do not grow over time, and so slow down linearly with the size of
the map. We expect the negative branding weakmap to be substantially smaller
than the positive branding weakmap, though we have yet to measure the impact
of the difference. We can tolerate the risk for XS-on-SwingSet because we
completely control which host objects are made available on the start
compartment's global.

Once the scalability of XS WeakMaps have been fixed, we should permanently
retire the negative branding technique.

# How to turn on negative branding

[circleci-svg]: https://circleci.com/gh/Agoric/make-hardener.svg?style=svg
[circleci-url]: https://circleci.com/gh/Agoric/make-hardener
[deps-svg]: https://david-dm.org/Agoric/make-hardener.svg
[deps-url]: https://david-dm.org/Agoric/make-hardener
[dev-deps-svg]: https://david-dm.org/Agoric/make-hardener/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/make-hardener?type=dev
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
[license-url]: LICENSE
