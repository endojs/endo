import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';

import { E, Far } from '@endo/far';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';


/*

Design Notes

Destroy:

  The "destroy" method is used to cancel subscriptions and prevent reads and writes.
  It has confused the design more than any other element.

  I originally added it as a way of canceling subscriptions on the grain.
  Then I found it useful for "makeSyncGrainFromFollow" so that when its
  "follow" has ended, it should destroy itself so others dont read its stale value.

  but what about readonly iterfaces? should they expose a destroy bc you can subscribe to them
  but should they affect their original writable grain's ubscriptions? we dont track them seperately

  i am confuse

Derived Grains:

  Derived grains are grains that derive their value from another grain.
  They include "makeDerivedSyncGrain", "makeAsyncDerivedSyncGrain", and "makeSyncGrainMap".
  All of them can and should be made "lazy" where they only derive their value when they are read.
  Additionally, they should only be subscribed to their source grain when they are read.
  This allows a chain of derived grains to remain lazy throughout.

*/

const never = makePromiseKit().promise

// a helper for tracking grain lifecycle
const makeDestroyController = () => {
  const destroyed = makePromiseKit()
  let isDestroyed = false
  return {
    destroy: () => {
      if (isDestroyed) return
      isDestroyed = true
      destroyed.resolve()
    },
    destroyed: destroyed.promise,
    isDestroyed: () => isDestroyed,
  }
}

// a helper for making the follow method
const makeFollowFromSubscribe = (subscribe, lifecycle, get) => {
  return (canceled = never) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    const topic = makeChangeTopic();
    const unsubscribe = subscribe(value => {
      topic.publisher.next(value);
    })
    const isDestroyed = false
    const destroy = () => {
      if (isDestroyed) return
      unsubscribe()
      topic.publisher.return()
    }
    canceled.then(() => destroy())
    lifecycle.destroyed.then(() => destroy())
    return (async function* currentAndSubsequentEntries() {
      const changes = topic.subscribe();
      yield get();
      yield* changes;
    })();
  }
}

// the base grain, stores a single value
export const makeSyncGrain = initValue => {
  const lifecycle = makeDestroyController()
  let value = initValue
  const subscriptionHandlers = []
  
  // get the current value
  const _get = () => {
    return value
  }
  const get = () => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    return _get()
  }
  // set a new value and notify subscribers
  const set = (newValue) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    value = newValue
    for (const handler of subscriptionHandlers) {
      handler(value)
    }
  }
  const update = (update) => {
    set(update(value))
  }
  // get changes by providing a handler
  const subscribe = (handler) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    subscriptionHandlers.push(handler)
    // send current value immediately
    handler(value)
    // return unsubscribe function
    return () => {
      const index = subscriptionHandlers.indexOf(handler)
      if (index === -1) {
        return
      }
      subscriptionHandlers.splice(index, 1)
    }
  }
  // get changes via an async iterator
  const follow = makeFollowFromSubscribe(subscribe, lifecycle, _get)
  // cancel all subscriptions and prevent reads and writes
  const destroy = () => {
    if (lifecycle.isDestroyed()) {
      return
    }
    lifecycle.destroy()
    subscriptionHandlers.splice(0, subscriptionHandlers.length)
  }
  // get a read only interface
  const readonly = () => {
    return {
      get,
      readonly,
      subscribe,
      follow,
    }
  }

  return {
    ...readonly(),
    set,
    update,
    destroy,
  }
}

// a helper, adds array specific methods to a sync grain
// it also validates that the value is an array
// TODO: could also allow the value to be undefined,
// to imply an unsynced value from a remote grain
// see "makeReadonlyArrayGrainFromRemote"
export const makeArrayGrainFromSyncGrain = (syncGrain) => {
  if (!Array.isArray(syncGrain.get())) {
    throw new Error('grain value must be an array')
  }
  const {
    get,
    set: _set,
  } = syncGrain
  // override set to ensure an array
  const set = (newValue) => {
    if (!Array.isArray(newValue)) {
      throw new Error('newValue must be an array')
    }
    _set(newValue)
  }
  const getAtIndex = (index) => {
    return get()[index]
  }
  const setAtIndex = (index, item) => {
    const array = get().slice()
    array[index] = item
    _set(array)
  }
  const updateAtIndex = (index, update) => {
    const array = get().slice()
    array[index] = update(array[index])
    _set(array)
  }
  // add array specific methods
  const push = (item) => {
    _set([...get(), item])
  }
  const pop = () => {
    const array = get().slice()
    const removed = array.pop();
    _set(array)
    return removed
  }
  const shift = () => {
    const array = get().slice()
    const removed = array.shift();
    _set(array)
    return removed
  }
  const unshift = (item) => {
    _set([item, ...get()])
  }
  const splice = (index, length) => {
    const array = get().slice()
    const removed = array.splice(index, length);
    _set(array)
    return removed
  }
  const getLength = () => {
    return get().length
  }
  const setLength = (length) => {
    _set(get().slice(0, length))
  }
  const readonly = () => {
    return {
      ...syncGrain.readonly(),
      // sync grain override methods
      readonly,
      // array grain methods
      getAtIndex,
      getLength,
    }
  }

  return {
    ...syncGrain,
    // sync grain override methods
    set,
    // array grain methods
    ...readonly(),
    setAtIndex,
    updateAtIndex,
    push,
    pop,
    shift,
    unshift,
    splice,
    setLength,
  }
}

// makes a grain whose value is an array, with convenience methods
// TODO: could provide an optimized "followArray" method that sends mutations,
// instead of the whole array
export const makeSyncArrayGrain = (initValue = []) => {
  if (!Array.isArray(initValue)) {
    throw new Error('initValue must be an array')
  }
  const syncGrain = makeSyncGrain(initValue)
  return makeArrayGrainFromSyncGrain(syncGrain)
}

// makes a readonly grain whose value is updated from a "follow" async iterator
export const makeSyncGrainFromFollow = (iterator, initValue) => {
  const grain = makeSyncGrain(initValue);
  (async () => {
    for await (const value of iterator) {
      grain.set(value);
    }
    grain.destroy();
  })();
  return grain.readonly()
}

// makes a grain whose value is mapped from another grain
// with a sync map function
// TODO: make lazy
export const makeDerivedSyncGrain = (grain, deriveFn) => {
  const derivedGrain = makeSyncGrain(deriveFn(grain.get()))
  grain.subscribe(value => {
    derivedGrain.set(deriveFn(value))
  })
  return derivedGrain.readonly()
}

// makes a grain whose value is mapped from another grain
// with an async map function
// The map function is async, so you may want to provide an initial value
// TODO: make lazy
export const makeAsyncDerivedSyncGrain = (grain, derive, initValue) => {
  const derivedGrain = makeSyncGrain(initValue)
  grain.subscribe(async value => {
    derivedGrain.set(await derive(value))
  })
  return derivedGrain.readonly()
}

// this is an attempt to rewrite "makeDerivedSyncGrain" to be lazy
// TODO: propagate destruction of the grain to the derived grain
export const makeLazyDerivedSyncGrain = (grain, deriveFn) => {
  const lifecycle = makeDestroyController()
  let subscriberCount = 0
  let cachedValue
  let cacheStale = true

  let _unsubscribe
  const _addSubscriber = () => {
    subscriberCount++
    // start subscribing to grain if this is the first subscriber
    if (subscriberCount === 1) {
      _unsubscribe = grain.subscribe(() => {
        cacheStale = true
      })
    }
  }
  const _removeSubscriber = () => {
    subscriberCount--
    // stop subscribing to grain if this is the last subscriber
    if (subscriberCount === 0) {
      _unsubscribe()
      _unsubscribe = undefined
      cacheStale = true
      cachedValue = undefined
    }
  }
  
  const _get = () => {
    if (cacheStale) {
      cachedValue = deriveFn(grain.get())
      cacheStale = false
    }
    return cachedValue
  }
  const get = () => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    return _get()
  }
  const subscribe = (handler) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    let unsubscribed = false
    _addSubscriber()
    const unsubscribe = grain.subscribe(() => {
      handler(_get())
    })
    return () => {
      if (unsubscribed) return
      unsubscribed = true
      _removeSubscriber()
      unsubscribe()
    }
  }
  const follow = makeFollowFromSubscribe(subscribe, lifecycle, _get)
  const readonly = () => {
    return {
      get,
      readonly,
      subscribe,
      follow,
    }
  }

  return readonly()
}

// makes a grain whose value is an object, with keys and values that
// match the keys and values of the provided grains
// TODO: make lazy
// TODO: allow overwriting grain keys, unsubscribing from old grain
// TODO: propagate destroy
export const makeSyncGrainMap = (grains = {}) => {
  const lifecycle = makeDestroyController()
  // map of child grains
  const map = new Map()
  // composed grain
  const grainMap = makeSyncGrain({})

  const hasGrain = (key) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    return map.has(key)
  }
  const getGrain = (key) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    if (!map.has(key)) {
      throw new Error(`no grain for key ${key}`)
    }
    return map.get(key)
  }
  const setGrain = (key, grain) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    // TODO: can remove this limitation but need to unsubscribe from old grain
    if (map.has(key)) {
      throw new Error(`grain already exists for key ${key}`)
    }
    grain.subscribe(value => {
      grainMap.set({ ...grainMap.get(), [key]: value })
    })
    map.set(key, grain)
  }
  const destroy = () => {
    if (lifecycle.isDestroyed()) {
      return
    }
    grainMap.destroy()
    lifecycle.destroy()
    map.clear()
  }

  // initialize with grains
  for (const [key, grain] of Object.entries(grains)) {
    setGrain(key, grain)
  }

  const readonly = () => {
    return {
      ...grainMap.readonly(),
      hasGrain,
      getGrain,
      readonly,
    }
  }

  return {
    // grainMap methods
    ...grainMap,
    // overrides and additions
    ...readonly(),
    destroy,
    setGrain,
  }
}

// makes a grain whose value is an "ArrayMap",
// a map whose values are always initialized arrays
export const makeSyncGrainArrayMap = (grains = {}) => {
  const grainMap = makeSyncGrainMap(grains)

  const getGrain = (key) => {
    if (!grainMap.hasGrain(key)) {
      grainMap.setGrain(key, makeSyncArrayGrain())
    }
    return grainMap.getGrain(key)
  }
  const push = (key, item) => {
    getGrain(key).push(item)
  }

  const readonly = () => {
    const getGrainReadOnly = (key) => {
      return getGrain(key).readonly()
    }
    return {
      ...grainMap.readonly(),
      getGrain: getGrainReadOnly,
    }
  }

  return {
    ...grainMap,
    // grainMap override methods
    getGrain,
    push,
    readonly,
  }
}

// makes a grain whose value is mapped from many grains
// with a sync map function. under the hood, it uses a GrainMap
export const composeGrains = (grains, deriveFn) => {
  const grainMap = makeSyncGrainMap(grains)
  const grain = makeDerivedSyncGrain(grainMap, deriveFn)
  return grain
}

// makes a grain whose value is mapped from many grains
// with a sync map function. under the hood, it uses a GrainMap
// The map function is async, so you may want to provide an initial value
export const composeGrainsAsync = (grains, deriveFn, initValue) => {
  const grainMap = makeSyncGrainMap(grains)
  const grain = makeAsyncDerivedSyncGrain(grainMap, deriveFn, initValue)
  return grain
}

// given an AsyncGrain, returns a readonly SyncGrain that is subscribed to the remote grain
export const makeSubscribedSyncGrainFromAsyncGrain = (asyncGrain, initialValue) => {
  const { promise: canceled, resolve: cancel } = makePromiseKit()
  const syncGrain = makeSyncGrainFromFollow(
    asyncGrain.follow(canceled),
    initialValue,
  )
  const destroy = () => {
    cancel()
    syncGrain.destroy?.()
  }
  // TODO: weird. is readonly but has a destroy method
  return {
    ...syncGrain.readonly(),
    destroy,
  }
}

//
// captp
//

// given a grain, returns a remote grain for sending over captp
export const makeRemoteGrain = (grain, name = 'grain') => {
  return Far(name, {
    ...grain,
    follow: async (canceled) => {
      return makeIteratorRef(E(grain).follow(canceled))
    },
  })
}

// an async grain is like a normal grain with an async interface
// its mostly useful for wrapping a remote grain, as we do here
export const makeLocalAsyncGrainFromRemote = (remoteGrain) => {
  const get = async () => {
    return E(remoteGrain).get()
  }
  const set = async (value) => {
    return E(remoteGrain).set(value)
  }
  const update = async (update) => {
    return E(remoteGrain).update(update)
  }
  const destroy = async () => {
    return E(remoteGrain).destroy()
  }
  // TODO: the handler likely needs a Far wrapper to placate captp
  const subscribe = async (handler) => {
    return E(remoteGrain).subscribe(handler)
  }
  const follow = (canceled) => {
    return makeRefIterator(E(remoteGrain).follow(canceled))
  }
  // this is convenient but unless you provide an initial value, it will be uninitialized
  const makeSubscribedSyncGrain = (initialValue) => {
   return makeSubscribedSyncGrainFromAsyncGrain(remoteGrain, initialValue).readonly()
  }
  // this waits for the first value, at the cost of being async
  const makeSubscribedSyncGrainAndInitialize = async () => {
    const { promise: canceled, resolve: cancel } = makePromiseKit()
    const grain = makeSubscribedSyncGrain()
    // wait for first value, then unsubscribe
    await grain.follow(canceled).next()
    cancel()
    // return initialized readonly grain
    return grain
  }

  const readonly = () => {
    return {
      get,
      readonly,
      subscribe,
      follow,
      makeSubscribedSyncGrain,
      makeSubscribedSyncGrainAndInitialize,
    }
  }

  return {
    ...readonly(),
    set,
    update,
    destroy,
  }
}

// given a remote grain, returns a readonly array grain that is subscribed to the remote grain
// it is initialized with an empty array
// TODO: we could allow it to be initialized undefined to convey that the value is not synced yet
export const makeReadonlyArrayGrainFromRemote = (remoteGrain, initValue = []) => {
  const localAsyncGrain = makeLocalAsyncGrainFromRemote(remoteGrain)
  const localSyncGrain = localAsyncGrain.makeSubscribedSyncGrain(initValue)
  const localArrayGrain = makeArrayGrainFromSyncGrain(localSyncGrain).readonly()
  return localArrayGrain
}