'use strict';

const makeJobQueue = () => {
  let tail = Promise.resolve();

  const enqueue = thunk => {
    const result = tail.then(thunk);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  };

  return harden({ enqueue });
};

harden(makeJobQueue);
