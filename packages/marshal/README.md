# @endo/marshal

"Marshalling" refers to the conversion of structured data (a tree or graph of
objects) into a string, and back again.

The `marshal` module helps with conversion of "capability-bearing data", in
which some portion of the structured input represents "pass-by-proxy" or
"pass-by-presence" objects that should be serialized into values referencing
special "slot identifiers". The `toCapData()` function returns a "CapData"
structure: an object with a `body` containing a serialization of the input data,
and a `slots` array holding the slot identifiers. `fromCapData()` takes this
CapData structure and returns the object graph. There is no generic way to
convert between pass-by-presence objects and slot identifiers, so the marshaller
is parameterized with a pair of functions to create the slot identifiers and turn
them back into proxies/presences.

`marshal` uses JSON to serialize the object graph, but knows how to serialize
values that cannot be expressed directly in JSON, such as bigints, `NaN`, and
`undefined`.

## Usage

This module exports a `makeMarshal()` function, which can be called with two
optional callbacks (`convertValToSlot` and `convertSlotToVal`), and returns
an object with `toCapData` and `fromCapData` properties. Each callback defaults
to the identity function.

```js
import '@endo/init';
import { makeMarshal } from '@endo/marshal';

const m = makeMarshal();
const o = harden({a: 1});
const s = m.toCapData(o);
console.log(s);
// { body: '{"a":1}', slots: [] }
const o2 = m.fromCapData(s);
console.log(o2);
// { a: 1 }
console.log(o1 === o2);
// false
```

Additionally, this module exports a `makePassableKit` function for encoding into
and decoding from a directly-serialized format in which string comparison
corresponds with arbitrary value comparison (cf.
[Patterns: Rank order and key order](https://github.com/endojs/endo/blob/master/packages/patterns/README.md#rank-order-and-key-order).
Rather than accepting `convertValToSlot` and `convertSlotToVal` functions and
keeping a "slots" side table, `makePassableKit` expects
{encode,decode}{Remotable,Promise,Error} functions that directly convert between
instances of the respective pass styles and properly-formatted encodings
(in which Remotable encodings start with "r", Promise encodings start with "?",
Error encodings start with "!", and all other details are left to the provided
functions).
`makePassableKit` supports two variations of this format: "legacyOrdered" and
"compactOrdered". The former is the default for historical reasons (see
https://github.com/endojs/endo/pull/1594 for background) but the latter is
preferred for its better handling of deep structure. The ordering guarantees are
upheld within each format variation, but not across them (i.e., it is not
correct to treat a string comparison of legacyOrdered vs. compactOrdered as a
corresponding value comparison).

## Frozen Objects Only

The entire object graph must be "hardened" (recursively frozen), such as done
by the `harden` function installed when importing `@endo/init`. `toCapData` will
refuse to marshal any object graph that contains a non-frozen object.

## Beyond JSON

`marshal` uses special values to represent both Presences and data which cannot
be expressed directly in JSON. These special values are usually strings with
reserved prefixes in the preferred "smallcaps" encoding, but in the original
encoding were objects with a property named `@qclass`. For example:

```js
import '@endo/init';
import { makeMarshal } from '@endo/marshal';

// Smallcaps encoding.
const m1 = makeMarshal(undefined, undefined, { serializeBodyFormat: 'smallcaps' });
console.log(m1.toCapData(NaN));
// { body: '#"#NaN"', slots: [] }

// Original encoding.
const m2 = makeMarshal();
console.log(m2.toCapData(NaN));
// { body: '{"@qclass":"NaN"}', slots: [] }
```

## Pass-by-Presence vs Pass-by-Copy

`marshal` relies upon `@endo/pass-style` to distinguish between objects that are
pass-by-presence and those that are pass-by-copy.

To qualify as pass-by-presence, all properties of an object (and of all objects
in its inheritance hierarchy) must be methods, not data. Pass-by-presence objects
are usually treated as having identity (assuming the `convertValToSlot` and
`convertSlotToVal` callbacks behave well), so passing the same object through
multiple calls will result in multiple references to the same output object.

To qualify as pass-by-copy, all properties of an object must be string-named and
enumerable and not accessors and not methods: their values can be primitives such
as bigints, booleans, `null`, numbers, and strings, and they can be arrays and
pass-by-copy objects, but they cannot be functions. In addition, the object must
inherit directly from `Object.prototype`. Pass-by-copy objects are not treated as
having identity: `fromCapData` does not produce the same output object for
multiple appearances of the same pass-by-copy serialization.

Mixed objects having both methods and data properties are rejected.

Empty objects (which vacuously satisfy requirements for both pass-by-presence and
pass-by-copy) are treated as pass-by-copy, although it is also possible to use
`Far` (from `@endo/far`) for creating empty marker objects which _can_ be
compared for identity and are especially useful as WeakMap keys in the "rights
amplification" pattern.

## `convertValToSlot` / `convertSlotToVal`

When `m.toCapData()` encounters a pass-by-presence object, it will call the
`convertValToSlot` callback with the value to be serialized. The return value
will be used as the slot identifier to be placed into the slots array, and the
serialized `body`, in place of the object, will contain a special value
referencing that slot identifier by its index in the slots array. For example:

```js
import '@endo/init';
import { makeMarshal } from '@endo/marshal';

const slotAssignments = new Map();
const convertValToSlot = obj => {
  let slot = slotAssignments.get(obj);
  if (slot === undefined) {
    slot = `id1:${(slotAssignments.size + 10).toString(36)}`;
    slotAssignments.set(obj, slot);
  }
  return slot;
};

const p = harden(Promise.resolve());

// Smallcaps encoding.
const m1 = makeMarshal(convertValToSlot, undefined, { serializeBodyFormat: 'smallcaps' });
m1.toCapData(p);
// { body: '#"&0"', slots: [ 'id1:a' ] }

// Original encoding.
const m2 = makeMarshal(convertValToSlot);
m2.toCapData(p);
// { body: '{"@qclass":"slot","index":0}', slots: [ 'id1:a' ] }
```

Each time `m.fromCapData()` encounters a slot reference, it calls
`convertSlotToVal` with the value from the slots array. `convertSlotToVal`
should create and return a proxy (or other representative) of the
pass-by-presence object.

# As a direct alternative to JSON

This marshal package also exports `stringify` and `parse` functions that are
built on the marshal encoding of passable data. They can serve as direct
substitutes for `JSON.stringify` and `JSON.parse`, respectively, with the
following differences:

* Compared to JSON, marshal's `stringify` is both more tolerant and less tolerant
  of what data it accepts. It is more tolerant in that it will encode `NaN`,
  `Infinity`, `-Infinity`, bigints, and `undefined`. It is less tolerant in that
  it accepts only pass-by-copy data according to the semantics of our distributed
  object model, as enforced by marshal---the `Passable` type exported by the
  marshal package. For example, all objects-as-records must be frozen, inherit
  from `Object.prototype`, and have only enumerable string-named data properties.
  `JSON.stringify` handles unserializable data by skipping it, but marshal's
  `stringify` rejects it by throwing an error.
* The JSON functions have parameters for customizing serialization and
  deserialization, for example with a *replacer* or *reviver*. The marshal-based
  alternatives do not.

The full marshal package will serialize `Passable` objects containing
presences and promises, because it serializes to a `CapData` structure
containing both a `body` string and a `slots` array. Marshal's `stringify`
function serializes only to a string, and so will not
accept any remotables or promises. If any are found in the input, this
`stringify` will throw an error.

Any encoding into JSON of data that cannot be represented directly, such as
`NaN`, relies on some kind of escape for the decoding side to detect and use.
For `stringify` and `parse`, this is signaled by an object with a property named
`@qclass` per the original encoding described [above](#beyond-json).
