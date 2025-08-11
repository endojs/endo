import { makePromiseKit } from '@endo/promise-kit';
import { E, Far } from '@endo/captp';

// should these be exo classes?
// read-only may be trickier to implement
// maybe just a loss of method optimizations

const makeWeakRefArray = (store) => {
  if (!store.has('refs')) {
    store.init('refs', []);
  }

  const push = value => {
    const ref = new WeakRef(value);
    const refs = [
      ...store.get('refs'),
      ref,
    ];
    store.set('refs', refs);
  }

  const removeRef = ref => {
    const refs = [...store.get('refs')];
    const index = refs.indexOf(ref);
    if (index !== -1) {
      refs.splice(index, 1);
      store.set('refs', refs);
    }
  }
  
  function * entries () {
    const refs = store.get('refs');
    for (const ref of refs) {
      const value = ref.deref();
      if (value !== undefined) {
        yield value;
      } else {
        removeRef(ref);
      }
    }
  }

  const remove = value => {
    const refs = store.get('refs');
    const ref = refs.find(ref => ref.deref() === value);
    if (ref) {
      removeRef(ref);
    }
  }

  const empty = () => {
    store.set('refs', []);
  }

  return {
    push,
    remove,
    entries,
    empty,
    [Symbol.iterator]() {
      return entries();
    },
  };
}

const makeGrainFromStore = (label, store) => {
  const subscribers = makeWeakRefArray(store);
  return Far(`Grain:${label}`, {
    getValue() {
      return store.get('value');
    },
    subscribeWeakly(callbackObj) {
      subscribers.push(callbackObj);
      E(callbackObj)(store.get('value'));
      // TODO: should be durable?
      return Far('Unsubscribe', () => {
        subscribers.remove(callbackObj);
      })
    },
    setValue(newValue) {
      store.set('value', newValue);
      subscribers.forEach(subscriber => E(subscriber)(newValue));
    },
    update(updateFn) {
      const newValue = updateFn(store.get('value'));
      this.setValue(newValue);
    },
    follow() {
      const { promise, resolve } = makePromiseKit();
      let latestValue = store.get('value');
      // TODO: this wont work bc handlers must be durable
      this.subscribeWeakly(value => {
          latestValue = value;
          resolve(value);
        },
      );
      return {
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              await promise;
              return { value: latestValue, done: false };
            },
          };
        },
      };
    },
    destroy() {
      subscribers.empty();
    },
    readonly() {
      return Far(`Grain:${label}:readonly`, {
        getValue: () => this.getValue(),
        subscribeWeakly: callbackObj => this.subscribeWeakly(callbackObj),
        follow: () => this.follow(),
      });
    },
  });
};

export function defineGrainClass(vatSupervisor) {
  const { defineCustomDurableKindWithMapStore } = vatSupervisor;

  return defineCustomDurableKindWithMapStore('Grain', {
    make (store, label = 'Grain', initialValue) {
      if (typeof label !== 'string') {
        throw new Error('label must be a string');
      }
      store.init('label', label);
      store.init('value', harden(initialValue));
      return makeGrainFromStore(label, store);
    },
    reanimate (store) {
      const label = store.get('label');
      return makeGrainFromStore(label, store);
    },
  });
}
