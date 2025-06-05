# `@endo/immutable-arraybuffer`

This `@endo/immutable-arraybuffer` package provides both a ponyfill and a shim for a proposed new JavaScript feature: *Immutable ArrayBuffers*.
- A ponyfill just defines and exports new things without modifying old things. The `index.js` file implements the ponyfill, providing the exports of the unqualified `@endo/immutable-arraybuffer` package.
- A shim modifies the existing JavaScript primordials as needed to most closely emulate the feature as proposed. The `shim.js` file uses the exports from `index.js` to modify `ArrayBuffer.prototype` to resemble the API being proposed. Importing `@endo/immutable-arraybuffer/shim.js` will cause these changes.

Below, we use the term "buffer" to refer informally to an instance of an `ArrayBuffer`, whether immutable or not.

## Background

Prior proposals [In-Place Resizable and Growable `ArrayBuffer`s](https://github.com/tc39/proposal-resizablearraybuffer) and [ArrayBuffer.prototype.transfer and friends](https://github.com/tc39/proposal-arraybuffer-transfer) have both reached stage 4, and so are now an official part of JavaScript. Altogether, `ArrayBuffer.prototype` now has the following methods:
- `transfer(newByteLength?: number) :ArrayBuffer` -- move the contents of the original buffer to a new buffer, detach the original buffer, and return the new buffer. The new buffer will be as resizable as the original was.
- `transferToFixedLength(newByteLength?: number) :ArrayBuffer` -- like `transfer` but the new buffer is not resizable.
- `resize(newByteLength: number) :void` -- change the size of this buffer if possible, or throw otherwise.
- `slice(start?: number, end?: number) :ArrayBuffer` -- Return a new buffer whose initial contents are a copy of that region of the original buffer. The original buffer is unmodified.

and the following read-only accessor properties
- `detached: boolean` -- is this buffer detached, or are its contents still available from this buffer object?
- `resizable: boolean` -- can this buffer be resized, or is it fixed-length?
- `byteLength: number` -- how big are the current contents of this buffer?
- `maxByteLength: number` -- how big could this buffer be resized to be?

None of the operations above enable the creation of an immutable buffer, i.e., a non-detached buffer whose contents cannot be changed, resized, or detached.

Both a `DataView` object and a `TypedArray` object are views into a buffer backing store. For a `TypedArray` object, the contents of the backing store appear as indexed data properties of the `TypeArray` object that reflect the current contents of this backing store. Currently, because there is no way to prevent the contents of the backing store from being changed, `TypedArray`s cannot be frozen.

Some JavaScript implementations, like Moddable XS, bring JavaScript to embedded systems, like device controllers, where ROM is much more plentiful and cheaper than RAM. These systems need to place voluminous fixed data into ROM, and currently do so using semantics outside the official JavaScript standard.

The [OCapN](https://ocapn.org/) network protocol treats strings and byte-arrays as distinct forms of bulk data to be transmitted by copy. At JavaScript endpoints speaking OCapN such as `@endo/pass-style` + `@endo/marshal`, JavaScript strings represent OCapN strings. The immutability of strings in the JavaScript language reflects their by-copy nature in the protocol. Likewise, to reflect an OCapN byte-array well into the JavaScript language, we need an immutable container of bulk binary data. There currently are none. An Immutable `ArrayBuffer` would provide exactly the low-level machinery we need.

## Overview of the *Immutable ArrayBuffer* Proposal

The *Immutable ArrayBuffer* proposal introduces additional methods and read-only accessor properties to `ArrayBuffer.prototype` that fit naturally into those explained above. Just as a buffer can be resizable or not, or detached or not, this proposal enables buffers to be immutable or not. Just as `transferToFixedSize` moves the contents of a original buffer into a newly created non-resizable buffer, this proposal provides a transfer operation that moves the contents of an original original buffer into a newly created immutable buffer. Altogether, this proposal only adds to `ArrayBuffer.prototype` one method
- `transferToImmutable() :ArrayBuffer` -- move the contents of the original buffer into a new immutable buffer, detach the original buffer, and return the new buffer.

and one read-only accessor
- `immutable: boolean` -- is this buffer immutable, or can its contents be changed?

An immutable buffer cannot be detached or resized. Its `maxByteLength` is the same as its `byteLength`. A `DataView` or `TypedArray` using an immutable buffer as its backing store can be frozen and immutable. `ArrayBuffer`s, `DataView`s, and `TypedArray`s that are frozen and immutable could be placed in ROM without going beyond JavaScript's official semantics.

## The Ponyfill

The proposal would add methods to `ArrayBuffer.prototype`. But a ponyfill, by definition, cannot do so. Instead, it defines and exports two functions corresponding to the two additions above
- `transferBufferToImmutable(buffer: ArrayBuffer) :ArrayBuffer`
- `isBufferImmutable(buffer: ArrayBuffer) :boolean`

In order for `transferBufferToImmutable` to be able to return something of type `ArrayBuffer` that is actually immutable, that object cannot be an actual `ArrayBuffer` exotic object. Instead, an emulated immutable buffer implements the full proposed `ArrayBuffer` API and ultimately inherits from `ArrayBuffer.prototype`. Thus, `x instanceof ArrayBuffer` will act as proposed.

The emulated immutable buffers inherit directly from an intermediate prototype we refer to as `immutableArrayBufferPrototype`. This intermediate prototype contains all the methods and read-only accessor properties proposed here, as well as overrides of those inherited from `ArrayBuffer.prototype` as needed to emulate the behavior of an immutable instance. For each emulated immutable buffer, the implementation encapsulates a genuine `ArrayBuffer` that it has exclusive access to, so it can enforce immutability simply by never modifying it.

## The Shim

The immutable-arraybuffer shim additionally adds to `ArrayBuffer.prototype` a
- `transferToImmutable` method trivially derived from the ponyfill's `transferBufferToImmutable`.
- `sliceToImmutable` method trivially derived from the ponyfill's `sliceBufferToImmutable`.
- `immutable` read-only accessor property trivially derived from the ponyfill's `isBufferImmutable`.

## Caveats

The *Immutable ArrayBuffer* shim falls short of the proposal in the following ways
- The ponyfill and shim rely on the underlying platform having either `structuredClone` or `ArrayBuffer.prototype.transfer`. However, Node <= 16 has neither. Node 17 introduces `structuredClone` and Node 21 introduces `ArrayBuffer.prototype.transfer`. Without either, the ponyfill and shim fail to initialize.
- The proposal does not introduce an intermediate prototype, but rather modifies the behavior of the built-in methods on `ArrayBuffer.prototype` itself, to act appropriately on immutable `ArrayBuffer`s. By contrast, the ponyfill's and shim's emulated immutable buffers inherit directly from an intermediate prototype we refer to as `immutableArrayBufferPrototype`. That intermediate prototype directly inherits from `ArrayBuffer.prototype`. All the differential behavior for immutable buffers are provided by overrides found on `immutableArrayBufferPrototype`.
- The `immutableArrayBufferPrototype` intermediate prototype is an artifact of the emulation, but it is not encapsulated. It is trivially discoverable as the object that emulated immutable buffers directly inherit from.
- The shim's emulated immutable buffers are not real `ArrayBuffer` exotic objects. If they were, the shim would not be able to protect them from being written. Even though they implement the full proposed `ArrayBuffer` API, they cannot be plug-compatible -- they cannot be used as the backing stores of `DataView`s or `TypedArray`s. Perhaps follow-on shims might modify `DataView` and `TypedArray` to emulate that as well, but that is hard and beyond the ambition of this ponyfill + shim.
- Unlike genuine `ArrayBuffer` or `SharedArrayBuffer` exotic objects, the shim's emulated immutable buffers cannot be cloned or transfered between JS threads.
- Even after the *Immutable ArrayBuffer* proposal is implemented by the platform, the current code will still replace it with the shim implementation, in accord with shim best practices. See https://github.com/endojs/endo/pull/2311#discussion_r1632607527 . It will require a later manual step to delete the shim, after manual analysis of the compat implications.
- This is a plain *JavaScript* ponyfill/shim, not by itself a *Hardened JavaScript* polyfill/shim. Thus, the objects and function it creates are not hardened by this ponyfill/shim itself. Rather, the ses-shim is expected to import these, and then treat the resulting objects as if they were additional primordials, to be hardened during `lockdown`'s harden phase.

## Purposeful Violation

Since the `ImmutableArrayBufferInternal` class is only an artifact of the ponyfill and shim (i.e., is absent both from the real proposal and from native implementations), `ImmutableArrayBufferInternal` should not need its own `Symbol.toStringTag` property. Especially not one that differs from `ArrayBuffer.prototype`. Adding one reduces the fidelity of the ponyfill and shim. Nevertheless, we set `ImmutableArrayBufferInternal.prototype[Symbol.toStringTag]` to `'ImmutableArrayBuffer'`. Why?

At https://github.com/concordancejs/concordance/blob/791d2a89b40eb13f2c889ac270dd8be190cf8073/lib/describe.js#L36 Node's concordance, in order to render diagnostic output for an object, sniffs the result of `toString()`. If the result seems to indicate that the object is an ArrayBuffer, then concordance assumes it can do things with the object (`Buffer.from`) that can only be done on genuine ArrayBuffers. To avoid this, the ponyfill and shim ensures that the sniff will not match `'ArrayBuffer'`.

Ava also uses Node's concordance for its diagnostic output, which is how we discovered the problem.
