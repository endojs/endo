# Why validate that an object is a CopyArray?

The input validation check `assertCopyArray(arr)` asserts that `passStyleOf(arr) === 'copyArray'`. Done early enough, it protects against many dangers. After this test passes, we are guaranteed that `arr` is
   * an object for which `Array.isArray(arr) === true`, and therefore considered to be a JavaScript array. (Note though that, currently, it may be a proxy for an array. See below.)
   * an object that inherits directly from `Array.prototype`,
      * Since SES has already hardened `Array.prototype`, this guarantees that `arr` inherits nothing enumerable or otherwise surprising.
   * frozen, and therefore
      * all its own properties are non-configurable, and if data properties, non-writable.
      * it will never have more or fewer own properties than it has now.
   * has a `length` property which is a *non-enumerable* own data property whose value is a number representing a non-negative integer. This invariant probably follows from `Array.isArray(arr)` anyway.
   * aside from `length`, has only own-properties which are
      * number-named (rather than symbol named) for the non-negative integers between `0` and `length - 1`. It has all of these, i.e., it has no holes. It has no own properties besides these and `length`.
      * enumerable,
      * data properties, rather than accessor properties, whose values are therefore stable

# How do I enumerate thee, let me list the ways

Why these properties restrictions? JavaScript has a tremendous number of different constructs for enumerating the properties of an object, with different semantics of what subset they choose to enumerate.

| API                         | inherited?  | non-enumerable? | strings? | symbols? | output    |
| --------------------------- | ----------- | --------------- | -------- | -------- | --------- |
| for..in                     | yes         | no              | yes      | no       | k*        |
| O.keys                      | no          | no              | yes      | no       | [k,*]     |
| O.values                    | no          | no              | yes      | no       | [v,*]     |
| O.entries                   | no          | no              | yes      | no       | [[k,v],*] |
| {...obj}                    | no          | no              | yes      | yes      | {k:v,*}   |
| O.assign after 1st arg      | no          | no              | yes      | yes      | {k:v,*}   |
| Reflect.ownKeys             | no          | yes             | yes      | yes      | [k,*]     |
| O.getOwnPropertyNames       | no          | yes             | yes      | no       | [k,*]     |
| O.getOwnPropertySymbols     | no          | yes             | no       | yes      | [k,*]     |
| O.getOwnPropertyDescriptors | no          | yes             | yes      | yes      | {k:d,*}   |


Once an object passes `assertCopyArray(arr)`, all of these are guaranteed to agree except for `length`.
Since an array's `length` property is a non-enumerable string-named property, `Reflect.ownKeys`, `Object.getOwnPropertyNames`, `Object.getOwnPropertyDescriptors` will see the `length` property. The others will not.

# Like Tuples from Records & Tuples.

Taken together, the security, robustness, and simplicity guarantees of `assertCopyArray(arr)` are similar to that provided by the "tuples" of the TC39 "Arrays and Tuples" proposal. (TODO need link) These are close enough that, for many purposes, we can take CopyArray as a shim for that portion of the Arrays and Tuples proposal. We can equally well take CopyRecord as a shim for the "records" of the "Records and Tuples" proposal.

# Like CopyRecord

In all other ways, the explanation at [CopyRecord](./copyRecord-guarantees.md) applies equally well for CopyArray.
