import { makePromiseKit } from '@endo/promise-kit';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';

const never = makePromiseKit().promise

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

const makeFollowFromSubscribe = (subscribe, lifecycle, get) => {
  return (canceled = never) => {
    if (lifecycle.isDestroyed()) {
      throw new Error('grain is destroyed')
    }
    const topic = makeChangeTopic();
    const unsubscribe = subscribe(value => {
      topic.publisher.next(value);
    })
    let isDestroyed = false
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
    get,
    set,
    update,
    destroy,
    readonly,
    subscribe,
    follow,
  }
}

export const makeSyncArrayGrain = (initValue = []) => {
  if (!Array.isArray(initValue)) {
    throw new Error('initValue must be an array')
  }
  const {
    get,
    set: _set,
    subscribe,
    follow,
    destroy,
  } = makeSyncGrain(initValue)
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
      get,
      getAtIndex,
      get length() {
        return getLength()
      },
      readonly,
      subscribe,
      follow,
    }
  }

  return {
    get,
    set,
    getAtIndex,
    setAtIndex,
    updateAtIndex,
    push,
    pop,
    splice,
    get length() {
      return getLength()
    },
    set length(length) {
      setLength(length)
    },
    destroy,
    readonly,
    subscribe,
    follow,
  }

}

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

export const makeDerivedSyncGrain = (grain, deriveFn) => {
  const derivedGrain = makeSyncGrain(deriveFn(grain.get()))
  grain.subscribe(value => {
    derivedGrain.set(deriveFn(value))
  })
  return derivedGrain.readonly()
}

export const makeAsyncDerivedSyncGrain = (grain, derive, initValue) => {
  const derivedGrain = makeSyncGrain(initValue)
  grain.subscribe(async value => {
    derivedGrain.set(await derive(value))
  })
  return derivedGrain.readonly()
}

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

// TODO: can be made lazy
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

  const { get, subscribe, follow } = grainMap;

  const readonly = () => {
    return {
      get,
      hasGrain,
      getGrain,
      readonly,
      subscribe,
      follow,
    }
  }

  return {
    get,
    hasGrain,
    getGrain,
    setGrain,
    destroy,
    readonly,
    subscribe,
    follow,
  }
}

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

  const {
    get,
    hasGrain,
    setGrain,
    destroy,
    readonly,
    subscribe,
    follow,
  } = grainMap;

  return {
    get,
    hasGrain,
    getGrain,
    setGrain,
    destroy,
    readonly,
    subscribe,
    follow,
    push,
  }
}

export const composeGrains = (grains, deriveFn) => {
  const grainMap = makeSyncGrainMap(grains)
  const grain = makeDerivedSyncGrain(grainMap, deriveFn)
  return grain
}

export const composeGrainsAsync = (grains, deriveFn, initValue) => {
  const grainMap = makeSyncGrainMap(grains)
  const grain = makeAsyncDerivedSyncGrain(grainMap, deriveFn, initValue)
  return grain
}