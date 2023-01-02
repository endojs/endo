export const makeSyncContext = () => {
  let state;

  return harden({
    run: (val, cb, args = []) => {
      const prev = state;
      try {
        state = val;
        return cb(...args);
      } finally {
        state = prev;
      }
    },

    get: () => state,
  });
};
harden(makeSyncContext);
