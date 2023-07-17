# @endo/marshal

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

This module exports a `makeMarshal()` function, which can be called with two
optional callbacks (`convertValToSlot` and `convertSlotToVal`), and returns
an object with `serialize` and `unserialize` properties. If the callback
arguments are omitted, they default to the identity function.

```js
import '@endo/init';
import { makeMarshal } from '@endo/marshal';

const m = makeMarshal();
const o = harden({a: 1});
const s = m.serialize(o);
console.log(s); // { body: '{"a":1}', slots: [] }
const o2 = m.unserialize(s);
console.log(o2); // { a: 1 }
```

## Frozen Objects Only

The entire object graph must be "hardened" (recursively frozen), such as done
by the `ses` module (installed with `@endo/init`). The serialization
function will refuse to marshal any graph that contains a non-frozen object.

## Beyond JSON

`marshal` uses a special marker object to represent both Presences and data
which cannot be expressed directly in JSON. This marker uses a property named
`@qclass` that identifies the type of the object. For example, a Javascript
`NaN` is serialized into:

```
m.serialize(NaN);
// { body: '{"@qclass":"NaN"}', slots: [] }
```

(TODO) To tolerate a `@qclass` property appearing in the data being
serialized, the library uses a structure known as a "Hilbert Hotel", which
wraps the troublesome object in a new layer of serialization.


## Pass-by-Presence vs Pass-by-Copy

`marshal` makes a distinction between objects that are pass-by-presence, and
those which are pass-by-copy.

To qualify as pass-by-presence, all enumerable properties of the object (and
of all objects in the inheritance hierarchy) must be methods, not data.
Pass-by-presence objects usually have identity (assuming the
`convertValToSlot` and `convertSlotToVal` callbacks behave well), so passing
the same object through multiple calls will result in multiple references to
the same output object.

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

## `convertValToSlot` / `convertSlotToVal`

When `m.serialize()` encounters a pass-by-presence object, it will call the
`convertValToSlot` callback with the value to be serialized. Its return value
will be used at the slot identifier to be placed into the slots array. In the
serialized body, this will be represented by the record
```js
{ "@qclass": "slot", "index": index }
```
where `index` is the index in the slots array of that slot.

The array of slot identifiers is returned as the `slots` portion of the
CapData structure.

Each time `m.unserialize()` encounters such a record, it calls
`convertSlotToVal` with that slot from the slots array. `convertSlotToVal`
should create and return a proxy (or other representative) of the
pass-by-presence object.

# As a direct alternative to JSON

This marshal package also exports `stringify` and `parse` functions that
can serve as a direct substitute for `JSON.stringify` and `JSON.parse`,
with the following differences. These alternate functions are built on
the marshal encoding of passable data explained above.

Compared to JSON, marshal's `stringify` and `parse` is both more tolerant and
less tolerant of what data it accepts. Marshal is more tolerant in that it will
encode `NaN`, `Infinity`, `-Infinity`, BigInts, and
`undefined`. Marshal is less tolerant in that accepts only pass-by-copy data
according to the semantics of our distributed object model, as enforced
by marshal---the `Passable` type exported by the marshal package. For example,
all objects-as-records must be frozen, inherit from `Object.prototype` and have
only enumerable string-named own properties. When JSON encounters something it
does not like, JSON rejects it by skipping it. Marshal rejects it by throwing
an error terminating the whole serialization.

The JSON methods have more than one parameter, enabling customization
of the operation, for example with *replacers* or *revivers*. These
marshal-based alternative do not.

The full marshal package will serialize `Passable` objects containing
presences and promises, because it serializes to a `CapData` structure
containing both a `body` string and a `slots` array. Marshal's `stringify`
function serializes only to a string, and so will not
accept any remotables or promises. If any are found in the input, this
`stringify` will throw an error.

Any encoding into JSON of data JSON does not directly represent, such as `NaN`
relies on some kind of escape which signals the decoding side to decode that
encoding rather than passing it through literally. For marshal this is signaled
by the presence or absence of a property named `"@qclass"` as explained above.
