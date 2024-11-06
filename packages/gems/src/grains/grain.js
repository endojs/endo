import { makePromiseKit } from '@endo/promise-kit';
import { E, Far } from '@endo/captp';

const makeGrainFromStore = (label, store) => {
  let subscribers = [];
  return Far(`Grain:${label}`, {
    getValue() {
      return store.get('value');
    },
    subscribeEphemeral(callbackObj) {
      subscribers.push(callbackObj);
      E(callbackObj)(store.get('value'));
      return Far('Unsubscribe', () => {
        subscribers = subscribers.filter(subscriber => subscriber !== callbackObj);
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
      this.subscribeEphemeral(value => {
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
      subscribers = [];
    },
    readonly() {
      return Far(`Grain:${label}:readonly`, {
        getValue: () => this.getValue(),
        subscribeEphemeral: callbackObj => this.subscribeEphemeral(callbackObj),
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
