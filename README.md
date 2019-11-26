# @agoric/marshal

"Marshalling" refers to the conversion of structured data (a tree or graph of
objects) into a string, and back again.

The `marshal` module helps with conversion of "capability-bearing data", in
which some portion of the structured input represents "pass-by-proxy" or
"pass-by-presence" objects. These should be serialized into markers that
refer to special "reference identifiers". These identifiers are collected in
an array, and the `serialize()` function returns a two-element structure
known as "CapData": a `body` that contains the usual string, and a new
`slots` array that holds the reference identifiers. `unserialize()` takes
this CapData structure and returns the object graph. The marshaller must be
taught (with a pair of callbacks) how to create the presence markers, and how
to turn these markers back into proxies/presences.

`marshal` uses JSON to serialize the object graph, but knows how to serialize
Javascript objects that cannot be expressed directly as JSON, such as
`BigInt` objects, `undefined`, `NaN`, and others.

## Usage

This module exports a `makeMarshal()` function, which must be called with two
callbacks (`serializeSlot` and `unserializeSlot`), and returns an object with
`serialize` and `unserialize` properties. For ordinary (non-capability)
serialization, you can omit the callbacks:

```js
import harden from '@agoric/harden';
import { makeMarshal } from '@agoric/marshal';

const m = makeMarshal();
const o = harden({a: 1});
const s = m.serialize(o);
console.log(s); // { body: '{"a":1}', slots: [] }
const o2 = m.unserialize(s);
console.log(o2); // { a: 1 }
```

## Frozen Objects Only

The entire object graph must be "hardened" (recursively frozen), such as done
by the `@agoric/harden` module. The serialization function will refuse to
marshal any graph that contains a non-frozen object.

## Beyond JSON

`marshal` uses a special marker object to represent both Presences and data
which cannot be expressed directly in JSON. This marker uses a property named
`@qclass` that identifies the type of the object. For example, a Javascript
`NaN` is serialized into:

```
m.serialize(NaN);
// { body: '{"@qclass":"NaN"}', slots: [] }
```

Cyclic data structures are handled by tracking the objects we've serialized
before in a WeakMap, and replacing them with an index number if they appear a
second time. This results in an "ibid" structure. When unserializing, a
matching table is maintained, and "ibid" markers caues additional references
to previously-unpacked to be added to the reconstructed object graph:

```
const o = harden({a: 1});
const oo = harden([o, o]);
const soo = m.serialize(oo);
// { body: '[{"a":1},{"@qclass":"ibid","index":1}]', slots: [] }
const oo2 = m.unserialize(soo);
// [ { a: 1 }, { a: 1 } ]
console.log(oo2[0] === oo2[1]); // true

const cycle = [];
cycle.push(cycle);
m.serialize(cycle);
// { body: '[{"@qclass":"ibid","index":0}]', slots: [] }
```

This "ibid table" is new for each invocation of `m.serialize()` or
`m.unserialize()`, so each serialized CapData is independent.

(TODO) To tolerate a `@qclass` property appearing in the data being
serialized, the library uses a structure known as a "Hilbert Hotel", which
wraps the troublesome object in a new layer of serialization.


## Pass-by-Presence vs Pass-by-Copy

`marshal` makes a distinction between objects that are pass-by-presence, and
those which are pass-by-copy.

To qualify as pass-by-presence, all enumerable properties of the object (and
of all objects in the inheritance hierarchy) must be methods, not data.
Pass-by-presence objects usually have identity (assuming the
serializeSlot/unserializeSlot callbacks behave well), so passing the same
object through multiple calls will result in multiple references to the same
output object.

To qualify as pass-by-copy, the enumerable string-named properties of the
object must data, not methods: they can be Arrays, strings, numbers, and
other pass-by-copy objects, but not functions. In addition, the object must
either inherit from `Object.prototype` or `null`. Pass-by-copy objects do not
generally have identity: the unserializer is not obligated to produce the
same output object for multiple appearances of the input object.

Mixed objects (some data properties, some functions) are rejected.

Empty objects (which qualify as both types) are treated as pass-by-presence,
so they can be used as marker objects which can be compared for identity.
These are especially useful as keys WeakMaps for the "rights amplification"
pattern.

## serializeSlot / unserializeSlot

When `m.serialize()` encounters a pass-by-presence object, it will invoke the
`serializeSlot` callback. This will be given the value to be serialized, a
mutable array of slot identifiers, and a mutable Map from values to slot
indices. If the value has not been seen before, the callback should allocate
a new slot identifier, append it to the array, and add the new index into the
Map. If it *has* been seen before, it should re-use the old index, and just
update the Map. In both cases, it should return the "marker", a
JSON-serializable data structure that tells the unserializer how to handle
the slot. This should be something like `{ "@qclass": "slot", "index": NNN
}`, where the `index` points into the array of slot identifiers.

The array of slot identifiers is returned as the `slots` portion of the
CapData structure.

`m.unserialize()` invokes the `unserializeSlot` callback each time it
encounters a `@qclass: "slot"` in the serialized body. This should create and
return a proxy (or other representative) of the pass-by-presence object.
