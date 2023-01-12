import { makePromiseKit, makeQueue, ResolveThen } from './async-tools.js';

export const makeCallAsyncInCurrentContext = () => {
  const { resolve, promise } = makePromiseKit();
  const result = ResolveThen(promise, cb => cb());
  return harden(cb => {
    resolve(cb);
    return result;
  });
};
harden(makeCallAsyncInCurrentContext);

export const makeStickyContextCaller = () => {
  const invocationQueue = makeQueue();
  invocationQueue.put(makeCallAsyncInCurrentContext());

  return cb =>
    ResolveThen(invocationQueue.get(), call =>
      call(() => {
        // This is running in the sticky initial context
        invocationQueue.put(makeCallAsyncInCurrentContext());
        return cb();
      }),
    );
};
harden(makeStickyContextCaller);
