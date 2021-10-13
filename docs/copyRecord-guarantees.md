# Why validate that an object is a CopyRecord?

The input validation check `assert(passStyleOf(amount) === 'copyRecord')`, done early enough, protects against many dangers. After this test passes, we are guaranteed that `amount` is
   * an object that inherits from either `Object.prototype` or `null`,
      * Since SES has already hardened `Object.prototype`, this guarantees that `amount` inherits nothing enumerable or otherwise surprising.
   * frozen, and therefore
      * all its own properties are non-configurable, and if data properties, non-writable.
      * it will never have more or fewer own properties than it has now.
   * has only own-properties which are
      * string-named (rather than symbol named)
      * enumerable,
      * data properties, rather than accessor properties, whose values are therefore stable

That last check prevents property getters from sneaking in. After this check succeeds, even if `amount` is a proxy, these checks guarantee that any value successfully read from any of its property names is stable --- it will be identical to the result of again successfully reading a value from that property name.

The *successfully* is the critical qualifier though. A proxy handler would still be able to interleave attacker code execution during the reading of a property, or almost any other operation on the object. That interleaved code might throw an exception, preventing the property read from reporting any value, and potentially aborting a should-be-atomic block of code in the middle, leaving behind partially mutated and therefore corrupted state. Worse, the proxy handler might engage in a reentrancy attack against the code that examined the amount object.

This is a reentrancy attack against code that is simply looking at a simple data object obtained from untrusted callers that has also gone through the input validation above. For "normal" code, catching all these post-validation reentrancy vulnerabilities by review is too hard, so the plan is *not* to review such "normal" code against that, if that code makes adequate use of `passStyleOf` input validation.

This plan is to have `assert(passStyleOf(amount) === 'copyRecord')` guarantee that `amount` is not a proxy. Then, once this check is passed, the above code interleaving dangers are gone. Once validated, `amount` is guaranteed to be not just stable but passive, as we intuitively expect data to be.

If `amount` is a proxy, then, if this plan goes as we expect, this test will throw without even giving the proxy an opportunity to interleave during the test.

# How do I enumerate thee, let me list the ways

Why only string-named own enumerable data properties? JavaScript has a tremendous number of different constructs for enumerating the properties of an object, with different semantics of what subset they choose to enumerate:
   * Object.keys, Object.values, Object.entries, { ... }, Object.assign on the non-first arguments
      * Only string-named enumerable own. But does a GET on accessor properties.
   * Reflect.ownKeys
      * all own property names. Nothing inherited
   * Object.getOwnPropertyNames
      * own, string-named, whether or not enumerable
   * Object.getOwnPropertyDescriptors
      * own, whether named by string or symbol, whether or not enumerable
   * `for/in` loop (thankfully banned by eslint)
      * all enumerable string named, whether own or inherited.

Once an object passes `assert(passStyleOf(amount) === 'copyRecord')`, we are guaranteed that all of these agree.

# Like Records from Records & Tuples.

(TODO: Explain relationship to Records and Tuples proposal)

# Where CopyRecord fits in the Passable taxonomy

Passable values are those for which `passStyleOf(obj)` returns normally rather than throwing. If it returns normally, it returns a string classifying the kind of Passable that `obj` is. CopyRecord and CopyArray are PassByCopy containers, which are a kind of Passable. More kinds of PassByCopy containers are expected shortly. (TODO document the guarantees provided by the other Passable styles.)
* PassByCopy containers only contain Passables. For a CopyRecord, all its properties only have Passable values.

Thus, we can consider a PassByCopy container to be the root of a tree of PassByCopy containers, whose leaves are any of the other kinds of Passable, such as JavaScript primitive values, promises, and remotables (far objects and their remotes). At the JavaScript level, this tree may actually be a dag (directed acyclic graph), but in the semantics of the distributed object system, it is equivalent to the tree that the dag unfolds into. Our distributed object system compares and serializes them only according to their contents as trees.
* `passStyleOf(root)` validates that the pass-by-copy graph starting from a pass-by-copy `root` has no cycles, and therefore is equivalent to a finite tree.
* The future proxy-safety plan explained above will ensure that all PassByCopy objects in the tree are non-proxies. Put together, once a root has been validated as any PassByCopy, the entire PassByCopy tree will be guaranteed to act as simple stable passive data. Be aware that this plan, by design, would still allow proxies at the leaves of the PassByCopy tree.

# Hazards

We have not yet implemented the proxy test explained above, so our "normal" coding style is currently vulnerable against proxy-based reentrancy attacks from malicious local callers. But this attack is not possible for malicious messages received across a vat boundary. Our plan is to enforce this proxy prohibition well before we allow arbitrary malicious code on-chain.

Because `passStyleOf` deeply enforces that everything is Passable only to the leaves of the PassByCopy container tree, it does *not* guarantee that these other Passable objects lead only to further Passables. For example, a promise may eventually be fulfilled by a non-Passable. A method of a far object may return a non-Passable. When this occurs at a vat boundary (or other marshal-based serialization boundary), the attempt to pass that non-Passable will cause an error. But locally it *will not*. Input validation using `passStyleOf` must be aware of this limit.
