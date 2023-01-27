# A Taxonomy of Exo-making Functions

An Exo is a Far object protected by an interface guard. We chose the term "exo" because
* It means "outside". An exo object is reachable from outside the vat. Other vats can hold a reference (a capability) to an exo, and anyone with a reference to an exo can send it messages.
* It alludes to "ExoSkeleton", a protective outside layer that is an effective first defense against many threats. Likewise, an exo's interface guard is a great first layer of type-like ([pattern](https://github.com/endojs/endo/tree/HEAD/packages/patterns)-based) input validation protecting against many kinds of bad messages. The programmer's remaining burden to make the exo objects fully defensive thus becomes easier.

"Exo" also forms a nice pairing with [Endo](https://github.com/endojs/endo) itself.

## Make instance vs Define class vs Define class kit

### make*Exo
Each call to `makeExo` makes and returns a new fresh Exo instance. Note that there is no `makeVirtualExo` or `makeDurableExo`, although the latter is largely covered by `prepareExo`.

### define*ExoClass
Each call to `defineExoClass`, `defineVirtualExoClass`, or `defineDurableExoClass` defines a class-like category of Exo instances, and makes and returns a "make" function that makes new instances of that category. The arguments to the "define" function describe what all instances of the category have in common, and the arguments to the returned "make" function describe what is specific to the instance being created.

### define*ExoClassKit
We often call a record of named entangled Xs an "XKit", by analogy to a "toolkit" being a collection of closely related tools. Each call to `defineExoClassKit`, `defineVirtualExoClassKit`, or `defineDurableExoClassKit` defines a kit of entangled Exo classes, and makes and returns a "makeKit" function that makes new instances of that kit. Each instance of the kit is a collection of "facets" that share common encapsulated state.

## Heap vs Virtual vs Durable

### Exo*
As with stores, the default is that exo objects created by `makeExo` or the functions returned by `defineExoClass` or `defineExoClassKit` live in JavaScript's heap. Therefore, the total number of such Exo objects in a given vat must be able to fit into the JavaScript heap of that vat, and will occupy room in that vat's snapshot. We say the total number of instances is *low cardinality* when we expect the total number to remain low enough that this heap representation is not a problem.

### VirtualExo*
Like the big stores, the virtual exo objects created by the functions returned by `defineVirtualExoClass` or `defineVirtualExoClassKit` are written to external storage outside the JavaScript heap. But these are ephemeral -- they do not survive upgrade. Their only purpose is for high cardinality, so we do not provide a convenience for directly making exo instances. IOW, there is no `makeVirtualExo`.

### DurableExo*
The durable exo objects created by the functions returned by `defineDurableExoClass` or `defineDurableExoClassKit` are also written to external storage. These can also survive upgrade, and so can be passed in baggage to a successor vat-incarnation. Note that there is no `makeDurableExo`, although the need is largely covered by `prepareExo`.

### Class Cardinality
The total number of exo classes must be low cardinality, regardless of virtual/durable status. Being virtual or durable only enables class *instances* to be high cardinality.

## Make/Define vs Prepare

"prepare" is like "provide" in that it defines something that should be in the baggage, using the one that is there if found, but otherwise making a new one and registering it, so that the successor vat-invocation will find it at the same place in the baggage. Unlike "provide", for each exo behavior already in the baggage, one must call "prepare" immediately --- during the first crank of the vat incarnation. What is passed in baggage is only the state of the durable objects. Only the `prepare*` calls associate that state with code, giving it behavior. All these objects must be prepared early, so they know how to react when they receive messages.

- `prepareExo`:
  Each call returns a durable exo in baggage, creating it first if necessary.
- `prepareExoClass`:
  Each call returns a "make" function for the durable exo class in baggage, creating it first if necessary.
- `prepareExoClassKit`:
  Each call returns a "makeKit" function for the durable exo class kit in baggage, creating it first if necessary.

## Package Organization

This `@endo/exo` package itself exports only the heap variants:

- `makeExo`
- `defineExoClass`
- `defineExoClassKit`

The virtual and durable variants are contributed by higher layer packages that build upon it, such as `@agoric/vat-data`.
