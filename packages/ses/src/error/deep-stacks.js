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
let trackedTurnCount = 0;

const trackTurn = func => {
  const causingContext = hiddenCurrentContext;
  const nextContext = new Error(`_turn#${trackedTurnCount}_`);
  trackedTurnCount += 1;
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

/**
 * `when(p, onSuccess, onFailure)` is like
 * `Promise.resolve(p).then(onSuccess, onFailure)` but also accumulates
 * the deep stacks as one turn causes another. These deep stacks can be seen
 * in the console output, but are otherwise invisible.
 */
const when = (eref, onSuccess = v => v, onFailure = r => Promise.reject(r)) => {
  return innerWhen(
    Promise.resolve(eref),
    trackTurn(onSuccess),
    trackTurn(onFailure),
  );
};
freeze(when);
export { when };
