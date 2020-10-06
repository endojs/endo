import { freeze, uncurryThis } from '../commons.js';

const { details: d } = assert;
const innerWhen = uncurryThis(Promise.prototype.then);

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.
let hiddenCurrentContext;
let whenCount = 0;

const trackTurn = (func, nextContext = undefined) => {
  if (nextContext === undefined) {
    nextContext = new Error(`_turn#${whenCount}_`);
    whenCount += 1;
  }
  const causingContext = hiddenCurrentContext;
  return (...args) => {
    if (causingContext !== undefined) {
      assert.note(nextContext, d`_caused by_ ${causingContext}`);
    }
    hiddenCurrentContext = nextContext;
    try {
      return func(...args);
    } catch (err) {
      assert.note(err, d`_turn caused by_ ${nextContext}`);
      throw err;
    } finally {
      hiddenCurrentContext = undefined;
    }
  };
};
freeze(trackTurn);
export { trackTurn };

/**
 * `when(p, onSuccess, onFailure)` is like
 * `Promise.resolve(p).then(onSuccess, onFailure)` but also accumulates
 * the deep stacks as one turn causes another. These deep stacks can be seen
 * in the console output, but are otherwise invisible.
 */
const when = (eref, onSuccess = v => v, onFailure = r => Promise.reject(r)) => {
  const nextContext = new Error(`_turn#${whenCount}_`);
  whenCount += 1;
  return innerWhen(
    Promise.resolve(eref),
    trackTurn(onSuccess, nextContext),
    trackTurn(onFailure, nextContext),
  );
};
freeze(when);
export { when };

const send = (eref, verb, ...args) =>
  when(eref, receiver => receiver[verb](...args));
freeze(send);
export { send };

const E = eref => {
  const handler = harden({
    get: (_target, prop, _receiver) => (...args) => send(eref, prop, ...args),
  });
  return new Proxy(() => {}, handler);
};
freeze(E);
export { E };
