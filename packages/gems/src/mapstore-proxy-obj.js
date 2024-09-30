export const makeMapStoreProxyObj = store => {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        return store.get(prop);
      },
      set: (_target, prop, value) => {
        if (store.has(prop)) {
          store.set(prop, value);
        } else {
          store.init(prop, value);
        }
        return true;
      },
      deleteProperty: (_target, prop) => {
        store.delete(prop);
        return true;
      },
      has: (_target, prop) => {
        return store.has(prop);
      },
      ownKeys: _target => {
        return store.keys();
      },
      getOwnPropertyDescriptor: (_target, prop) => {
        if (!store.has(prop)) {
          return undefined;
        }
        return {
          value: store.get(prop),
          writable: true,
          enumerable: true,
          configurable: true,
        };
      },
    },
  );
};
