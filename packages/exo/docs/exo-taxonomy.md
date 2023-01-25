# A Taxonomy of Exo-making Functions

An Exo is a Far object protected by an interface guard. We chose the term "exo" both because
* "exo" means "outside". An exo object is reachable from outside the vat. Other vats can hold a reference (a capability) to an exo, and anyone with a reference to an exo can send it messages. Put another way, the exo objects are the objects in a vat that are outward facing, and so must be fully defensive against receiving bad messages.
* Alludes to "ExoSkeleton", a protective outside layer that is an effective first defense against many threats. Likewise, an exo's interface guard is a great first layer of type-like (pattern-based) input validation. The programmers remaining burden to make the outward facing exo objects fully defensive thus becomes easier.

"Exo" forms a nice pairing with Endo, our distributed Hardened JavaScript platform.

## Make instance vs Define class vs Define class kit

* ***`make*Exo`*** <br>
Makes a new fresh Exo instance.
* ***`define*ExoClass`*** <br>
Each call defines a class-like category of Exo instances, where the arguments of the `define*ExoClass` call describe what all instances of that category have in common. Each call makes and returns a new fresh `make*` function that makes new instances of that category. The arguments of that returned `make*` function describe what is specific to the instance it makes.
* ***`define*ExoClassKit`*** <br>
We often call a record of named entangled Xs an "XKit", as it a "toolkit" is a collection of closely related tools. Each call to `define*ExoClassKit` defines a kit of entangled Exo classes. Each call makes and return a single new fresh `make*Kit` function for making a corresponding kit of Exo instances. Each of these instances is considered to be a "facet" of that kit. All facets of the same kit share a common encapsulated state.

## Heap vs Virtual vs Durable

* ***`*Exo*`*** <br>
As with stores, the default is that exo objects live in JavaScript's heap. Therefore, the total number of such Exo objects in a given vat must be able to fit into the JavaScript heap of that vat, and will occupy room in that vat's snapshot. We say the total number of instances is *low cardinality* when we expect the total number to remain low enough that this heap representation is not a problem.
* ***`*VirtualExo*`*** <br>
Like the big stores, the virtual exo objects are written to external storage outside the JavaScript heap. But these are ephemeral -- they do not survive upgrade. Their only purpose is for high cardinality, so we do not provide a convenience for directly making exo instances. IOW, there is no `makeVirtualExo`, only `defineVirtualExoClass` and `defineVirtualExoClassKit`.
* ***`*DurableExo*`*** <br>
The durable exo objects are also written to external storage. These can also survive upgrade, and so can be passed in baggage to a successor vat-incarnation.

Note that the total number of exo classes must still low cardinality, even if they are virtual or durable. Being virtual or durable only enables the instances to be high cardinality.

This `@endo/exo` package itself exports only the heap variants, and so only exports the names

- `makeExo`
- `defineExoClass`
- `defineExoClassKit`

The virtual and durable variants are contributed by higher layer packages that build on this one, such as `@agoric/vat-data`.

## Make/Define vs Prepare (Durable only)

"prepare" is like "provide" in that it defines something that should be in the baggage, using the one that is there if found, but otherwise making a new one and registering it, so that the successor vat-invocation will find it at the same place in the baggage. Unlike "provide", for each exo behavior already in the baggage, one must call "prepare" immediately --- during the first crank of the vat incarnation. What is passed in baggage is only the state of the durable objects. Only the `prepare*` calls associate that state with code, giving it behavior. All these objects must be prepared early, so they know how to react when they receive messages.

- **_`prepareExo`_** <br>
  Like `makeExo` but for a durable exo in baggage.
- **_`prepareExoClass`_** <br>
  Like `defineExoClass` but for a durable exo in baggage.
- **_`prepareExoClassKit`_** <br>
  Like `defineExoClassKit` but for a durable exo in baggage.
