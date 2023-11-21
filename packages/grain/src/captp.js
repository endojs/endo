import { E, Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { makeArrayGrainFromSyncGrain, makeSubscribedSyncGrainFromAsyncGrain } from './index.js';

// given a grain, returns a remote grain for sending over captp
export const makeRemoteGrain = (localSyncGrain, name = 'grain') => {
  return Far(name, {
    ...localSyncGrain,
    follow: async (canceled) => {
      return makeIteratorRef(localSyncGrain.follow(canceled))
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

  // late bound reference to this grain
  let asyncGrain
  // this is convenient but unless you provide an initial value, it will be uninitialized
  const makeSubscribedSyncGrain = (initialValue) => {
   return makeSubscribedSyncGrainFromAsyncGrain(asyncGrain, initialValue).readonly()
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

  asyncGrain = {
    ...readonly(),
    set,
    update,
    destroy,
  }

  return asyncGrain
}

export const makeReadonlyGrainFromRemote = (remoteGrain, initValue) => {
  const localAsyncGrain = makeLocalAsyncGrainFromRemote(remoteGrain)
  const localSyncGrain = localAsyncGrain.makeSubscribedSyncGrain(initValue)
  return localSyncGrain
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
