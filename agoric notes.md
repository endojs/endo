### TODO
- [ ] endowments
  - [ ] system
  - [ ] inventory
- [ ] tool iteration
  - [ ] mission must go in system prompt
  - [ ] thread like?
- [ ] write incubations to disk
  - [ ] could then ask a bot to rewrite
- [ ] merge with dan
  - [x] try
  - [ ] i need a tour
  - [ ] what do about captp fork?

- [ ] multiple child vats --> reanimate needs to understand which vat


### ExtRef Controller
- provides durability to remote presences
- fixed ExtRef controller hackiness (by modifying captp)
  - previously required communicating with remote ExtRef controller
  - period where persistence was broken immediately after import during that remote communication
  - reanimating a presence provided a promise for the presence
- extended ExtRef controller to handle lazy captp (re)connections
  - this in part unlocks lazy, sleepy vats

### Captp
- https://github.com/endojs/endo/pull/2562
- new hooks:
  - gcHook: called when remote says they dont need your export
  - onBeforeImportHook: allows you to specify a presence for a slot (similar to importHook)
  - onBeforeExportHook: allows you to specify a slot for a value (similar to exportHook)
  - missingExportHook: allows you to fill in an export missing from the table
- new methods:
  - importSlot: you provide a new presence for a slot and registers it
  - exportValue: you specify a value and slot and it is added to the export table
- newly exposed method:
  - makeRemoteKit: sets up the HandledPromie for communicating with a remote slot, does not register the presence in the table
    - used by delegated-presence

### experimenting with devex
- makeCustomDurableKindWithContext
- makeCustomDurableKindWithStoreObj
- makeDefineDurableFactory

### VomKit/GC
- layers
  - cleanup ("was deleted")
  - willSleep? ("being taken out of memory")

### unexplored
- allow non-durable values over gems captp?
  - iterators, etc

rep vs inner-self
  vrm.registerKind
  fakeStuff.registerEntry

agoric/async-flow + vow


convertValToSlot
  if !valToSlot.has
    makeSlotForValue
    exportHook
    sideEffects (setup promise behavior)
    commit
    valToSlot.set
    slotToExported.set


### demo
- what
  - experiment with durable dist ocap system based on:
    - "vat always restart" (no replay)
    - "chip's vomkit-based automatic persistence"
  - based on durable zones + captp
- status: "cross-vat durable refs"
- structure
  - durable zone exos
  - class registry
    - requires serialization of class definition
  - incubation registry
    - serialization of a program that can define classes, gets a firstTime flag
  - External Reference Controller (not a good solution)

q's
- durable exos
  - exo constructors not durable (makeXyz)
  - durability requires (remotable)
    - i think durable means we know how to recreate it
- prior work in class registry?
  - lazy rebuild?
- durable captp?
  - based on durable zones?
  - whats in

- captpProxy/delegate
  - see HandledPromise

- "a ref being exported is another kind of ref"
  - export manager tracks the export, GC

TODO:
- [ ] durable extRef
  - [x] quick hack with swap and delayed durability
  - [ ] fix promise/presence swap
    - [ ] create a delegate presence for a value we dont have
      - [ ] use specified ids and tell captp that we have eagerly imported something
      - [ ] you can make a presence outside of captp, via HandledPromise hooks
  - [ ] allow laziness through proxy on exporting side
    - [ ] "exoFunction" or "exoProxy" (?)
- [ ] explore lazy vats
  - [ ] when can we put vats to sleep?
  - [ ] need CaptpProxies to point at the live value
- [ ] figure out endowments
- [ ] devex testing (foo)
  - [ ] constructors not being durable is quite annoying
    - [ ] cant return a class from a class definition
    - [ ] makes it hard it sure does

GC: https://github.com/Agoric/agoric-sdk/blob/mfig-async-flow-early-completion/packages/SwingSet/docs/garbage-collection.md#L1


### durable zone on endo pet daemon
- easy persistence
  - (except for remotes, until i figure out vat boundaries)
- what about exposing objects?
  - still needs eval formulas for sub objects

### multivat gems
- start with make gem in vat and get back the ref
- will quickly run into "how to reify"
  --> dig into vomkit use of marshall
    - convertValToSlot / convertSlotToVal
      - needs to be marked "durable", will be isDurable(vref) if any of: 
        - type is device
        - not allocated by vat ("imports are durable")
        - (virtual || durable) && isDurableKind(id)
      - exoClass instance slot is
        type: 'object',
        allocatedByVat: true,
        virtual: false,
        durable: true,
        id: 10n,
        subid: 1n,
        baseRef: 'o+d10/1',
        facet: undefined
      - exoClass instance marked durable in id
        - bc it was registered before converted to slot via registerEntry
        - registerEntry exported from makeFakeLiveSlotsStuff
          - given to VOM as registerValue
          - used in makeNewInstance
            - makeBaseRef(kindID, id, isDurable)
            - registerValue(baseRef, val, multifaceted)
        - need to also define the Kind
          makeKindHandle(tag)
      - defining a kind?
        - kh = vom.makeKindHandle(tag)
        - vom.defineDurableKind(kh, init, methods)
        - maybe too restrictive... YES: need to specify interface
          - const kindID = `${allocateExportID()}`;
            - vrm.allocateNextID('exportID');
          - vrm.registerKind(kindID, reanimator, deleter, durable)
          - const makeNewInstance = (...args) => {
            - const id = getNextInstanceID(kindID, isDurable);
            - const baseRef = makeBaseRef(kindID, id, isDurable);
            - // eg: dataCache.set(baseRef, { capdatas, valueMap });
            - val = ...
            - registerValue(baseRef, val, multifaceted);

      - vrm.reanimate
        - kindInfo = kindInfoTable.get(kindID)
        - kindInfo.reanimator(baseRef)
      - vrm.getRetentionStats() - might be neat

### durable Captp!
- seems like captp can "easily" be made from a durable zone
- state seems to be stored in a few places
```js
/** @type {Map<string, Promise<IteratorResult<void, void>>>} */
const trapIteratorResultP = new Map();
/** @type {Map<string, AsyncIterator<void, void, any>>} */
const trapIterator = new Map();
/** @type {Map<import('./types.js').CapTPSlot, number>} */
const slotToNumRefs = new Map();
recvSlot, sendSlot (ref counters)
/** @type {WeakMap<any, import('./types.js').CapTPSlot>} */
const valToSlot = new WeakMap(); // exports looked up by val
/** @type {Map<import('./types.js').CapTPSlot, any>} */
const slotToExported = new Map();
const slotToImported = makeFinalizingMap(...)
const exportedTrapHandlers = new WeakSet();
let lastPromiseID = 0;
let lastExportID = 0;
/** @type {Map<import('./types.js').CapTPSlot, Settler<unknown>>} */
const settlers = new Map();
/** @type {Map<string, any>} */
const answers = new Map(); // chosen by our peer
```

use importHook/exportHook for overwriting values (ignored for promises)
  slot = exportHook(val, slot);
  val = importHook(val, slot);

### design contention
- durable refs must deserialize synchronously but captp refs will always be promises
  - we can prolly cheat and have both the promise and its result point at the promise

### TODO
- [x] de-monkey patch
  - import swingset-liveslots into endo
  - [x] or recreate the unexposed parts
- [x] make kernel and separate vat process
  - [x] makeWorker
    - [x] expose vat supervisor
- [x] persist captp objects
  - [x] translate vat and kernel refs
  - [x] runtime: use hooks to add / remove things from the captp store map
  - [x] restart:
    - [x] captp ids are ephemeral
      - [ ] make captp session durable
      - [ ] conjoin captp / durable zone marshalling
      - [ ] use random ids + expose methods for populating table with set ids
      - [x] one side on import picks id and requests the ref be saved
        - [x] lame but works i think
- [x] should prolly go micro on marshall/unmarshall
- [x] cross vat refs

- [] concrete: get dan up and running
  - [ ] give the ai a way to eval and store things it makes


- [ ] cleanup
  - [x] get tests working
  - [x] move nextTick to ExtRefController (?)
  - [x] cleanup unused vendor code
  - [x] cleanup vat facet
  - [x] kick out startVatSupervisorProcess -> worker
  - [x] lint
  - [ ] use js classes for exos

- [ ] dan project
  - [ ] working in browser?
- [ ] demo
  - [ ] side by side facet impl comparison

### ocap kernel review 1 w chip

- ExoClass formula registry, especially GC:
  - GC: should happen when there are no instances or references to the ExoClass
  - is there a durable reference to an ExoClass?

- crossing the vat boundary:
  - hooking "ref -> how to recreate" in vomkit
  - best to look at liveslots + swingset kernel.js
    - vat/worker (3 flavors: nodejs, xs, in-kernel-vat)
    - vat side: supervisor, kernel side: manager (bad names but consistent)
    - look at usage of marshall/unmarshall
    - liveslots maintains a mapping of ids->refs/remote presences
      - "slots" / arrays of identifiers that appear in messages
      - run queue
        - kernel obj ids -> destination vat ids
          - with remote connections, happens in a special comms vat

- fakeVomKit vs "realVomKit":
  - testing things being dropped from memory?
    - virtual object cache / virtual collections
    - 3 layers:
      - disk
      - memory (representitive), thing you can have a js pointer to
      - thing actually holding the state in mem
  - [ ] verify fakeStore is string to string Map
  - SwingStore has the db backend (sqlite) <--- start here for realVomKit
    - transactionality
    - table for heap snapshots
    - record event transcript
    - if targeting web, wasm sqlite based on OPFS is proven

- our system vs swingset:
  - we dont care (as much) about deterministic execution
  - what packages will we build on?
    - captp, marshall
    - exoClass, automatic persistence
  - path dependant design mistakes
    - the development history lead to its current shape, which is suboptimal
    - see comments with XXX or TODO
  - we will likely persue the crank model
    - HandledPromise is wrapped up in crank

- barriers to "timely cancelation":
  - crank model
    - something sends vat message
    - vat has run queue
    - vat empties run queue
    - during this, vat will queue messages
    - you have a defined point to stop processing messages
    - you dont have weird concurrency issues
    - good lifecycle for backing state transactionality
  - at Midori at microsoft
    - messages are delivered in buckets/"flow"
    - messages are batched by some group of activity
    - 

- swingset-liveslots:
  - you have vats, and untrusted code runs there
  - liveslots the piece of the TCB that runs in the vat
  - api to the untrusted code
  - built on the vat store
  - mapping object refs in messages into actual references

- vat upgrade:
  - KeyKOS had explicit memory for upgrade, white made this easier





### old mfig/chip notes

- petStore is just one way
- working at the formula-object level was uncomfortable

- durable:
  - referrant is reachable after restart

- Gems / Facet



sacraficed timely cancelation
  -> how?

do we want to use vat-data durability?
  - lets look at the 4 stores, backed by collectionManager
    - wants syscall
      - for schema cache
      - for vatstore/set/get on storeKindIDTable
      - GC? deleteCollectionEntry
      - ...and more
  - VatData is built off of 4 components
    vrm: virtual reference manager
      vref counting
      reanimate from storage
    vom: virtual object manager -> gems/(facets + sleepController)
      persistent objects that can be dropped from memory (!)
    cm: collection manager -> kumavisStore
      store implementations
    wpm: watched promise manager
      something about persistent promises? but not a vow?
  - if we want vat-data durability, do we want it via a zone?
    try make a durable zone? even if pseudo durable
      zone/test/exos.test.js

gems on exo:
  - [x] use exo and interface guards for gem definition
  - [x] use interface guards for methodNames
  - investigate persisting with exo stores
    - defineDurableExoClass
    - globalThis.VatData interface
      - agoric-sdk/packages/swingset-liveslots/tools/setup-vat-data.js
      - agoric-sdk/packages/swingset-liveslots/src/liveslots.js
      - agoric-sdk/packages/swingset-liveslots/tools/fakeVirtualSupport.js
        - swingset syscall defined in packages/SwingSet/src/supervisors/supervisor-helper.js
  --> try zone/test/exos.test.js

*INQUIRY*
@agoric/swingset-liveslots
  - no readme

@endo/patterns:
  - 
@endo/exo:
  - durable/virt/heap?
    (@agoric/vat-data)
      prepareExo
      defineVirtualExoClass
      defineDurableExoClass

  - under defineExoClass how is "self" different from "this"
    - interface guards are invoked

>>>>>>>>>>

my research / our model:
  - distributed ocap kernel
  - no snapshots, no replay -- only explicit (automatic?) persistence
  - best devex possible under these constraints

@endo/captp:
  - its a membrane:
    - limit useable passStyles
      - A: not written
        wallet configures vat marshalling to preventing promise unmarshalling
      - A: can refuse to marshall
    - make a custom passStyle
      A: "tag" records
        eg: Vow
    - overwrite a mapping
  - what is finalization
    A: aborted attempt at GC
  - how does revocation work
    - A: disconnect, or attempt at HandledPromise layer
    - is there an "arena" model where i can create a revocation space
  - how can i best implement the gem's facet-proxy model

@endo/exo | @agoric/vat-data | @agoric/swingset-liveslots:
  - * what does the VatData vrm/vom/cm/wpm give you *without* heap snapshots/replay
  - kind?
  - durable/heap/virtual - whats virtual?
    a: virtual is ephemeral, moves things out of memory to disk when it can.
  - what is amplification
    - from doc:
      "called during definition of the exo class kit
      takes a facet instance of this class kit as an argument
      in which case it will return the facets record,
      giving access to all the facet instances of the same cohort."

@agoric/base-zone:
@agoric/zone:


(?) durable storage you get back from the baggage
virtual v durable collection: (impl same, but enforces durability parameter)
vat upgrade prepare
"attach behavior"
"vat restart" (NOT "vat upgrade")

all for sale!:
  asking for documentation
  for migration to endo

how to play with zones:
  vat starts up with buildRootObject
    which gets passed with "baggage"
    which is the root of the durable state

"javascript packages are the deliniation we use"

../packages/orchestration/test/supports.ts (facade-durability.test.ts)
how to live slots as a test:

if i want to persist:
  swing-store
  swingset kernel manages keys for prefixing vat data
    this allows vats to be more independant and reduce syscall traffic

maps and stores have slightly different APIs

ok using fake-vomkit we can provide a store that actually triggers persistence

"careful transaction semantics"
setImmediate to ensure vat is done.

