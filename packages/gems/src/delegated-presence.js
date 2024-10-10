// immediately makes a presence for a promise
export const makeEventualFactoryLookupDelegate = getTarget => {
  let presence;
  const promise = new HandledPromise(
    (_resolve, _reject, resolveWithPresence) => {
      presence = resolveWithPresence({
        applyMethod(_o, _prop, _args, _res) {
          return HandledPromise.applyMethod(getTarget(), _prop, _args);
        },
        get(_o, _prop, _res) {
          return HandledPromise.get(getTarget(), _prop);
        },
        // Coming soon...
        // set(_o, _prop, _value, _res) {
        //   return HandledPromise.set(targetP, _prop, _value);
        // },
        // deleteProperty(_o, _prop, _res) {
        //   return HandledPromise.deleteProperty(targetP, _prop);
        // },
      });
    },
  );
  return { promise, presence };
};
