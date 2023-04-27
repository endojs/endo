// eslint-disable-next-line import/no-extraneous-dependencies
import { test } from './prepare-test-env-ava.js';

import { HandledPromise } from './get-hp.js';

test('resolveWithPresence with proxy options', async t => {
  const l = t.log; // decomment this line for debug aid
  l('proxy support now being tested');
  const log = [];
  const presenceEventualHandler = {
    applyMethod(target, verb, args) {
      log.push(['eventualSend', target, verb, args]);
      return undefined;
    },
    apply(target, args) {
      log.push(['eventualApply', target, args]);
      return undefined;
    },
    get(target, property) {
      log.push(['eventualGet', target, property]);
      return undefined;
    },
    set(target, property, value, receiver) {
      // this trap should never run, but it does the default hardcoded behaviour
      presenceEventualHandler.setOnly(target, property, value, receiver);
      return value;
    },
    setOnly(target, property, value, receiver) {
      log.push(['eventualSetOnly', target, property, value, receiver]);
      return undefined; // traps return value is always ignored
    },
  };
  const proxyTarget = {};
  let thenFetched = false;
  const presenceImmediateHandler = {
    apply(target, thisArg, args) {
      log.push(['apply', target, thisArg, args]);
      return undefined;
    },
    construct(target, args, newTarget) {
      log.push(['construct', target, args, newTarget]);
      return {};
    },
    defineProperty(target, property, descriptor) {
      log.push(['defineProperty', target, property, descriptor]);
      return false;
    },
    deleteProperty(target, property) {
      log.push(['deleteProperty', target, property]);
      return false;
    },
    get(target, property, receiver) {
      log.push(['get', target, property, receiver]);
      if (property === 'then') {
        l('step: .then fetched');
        if (thenFetched) {
          thenFetched = false;
          return undefined;
        }
        thenFetched = true;
        return (callback, errback) => {
          l('step: .then handles invocation');
          log.push(['then', callback, errback]);
          try {
            l('step: callback which was given to .then, invoked');
            return Promise.resolve(callback(receiver));
          } catch (problem) {
            return Promise.reject(problem);
          }
        };
      }
      if (property === 'catch') {
        return _ => Promise.resolve(target);
      }
      if (property === 'finally') {
        return callback => {
          try {
            callback();
          } catch (problem) {
            // es-lint ignore-empty-block
          }
        };
      }
      if (property === 'there') {
        l('step: .there fetched');
        return nomad => {
          l('step: .there handles invocation');
          log.push(['thereInvocation', nomad]);
          if (typeof nomad === 'function') {
            try {
              l('step: nomad given to .there invoked');
              return Promise.resolve(nomad());
            } catch (problem) {
              return Promise.reject(problem);
            }
          } else {
            return Promise.reject(Error('tbi, until then, unhelpfull'));
          }
        };
      }
      return undefined;
    },
    getOwnPropertyDescriptor(target, property) {
      log.push(['getOwnPropertyDescriptor', target, property]);
      return undefined;
    },
    getPrototypeOf(target) {
      log.push(['getPrototypeOf', target]);
      return null;
    },
    has(target, property) {
      log.push(['has', target, property]);
      return false;
    },
    isExtensible(target) {
      log.push(['isExtensible', target]);
      return false;
    },
    ownKeys(target) {
      log.push(['ownKeys', target]);
      return [];
    },
    preventExtensions(target) {
      log.push(['preventExtensions', target]);
      return false;
    },
    set(target, property, value, receiver) {
      log.push(['set', target, property, value, receiver]);
      return false;
    },
    setPrototypeOf(target, prototype) {
      log.push(['setPrototypeOf', target, prototype]);
      return false;
    },
  };
  const pr = {};
  pr.promise = new HandledPromise((resolve, reject, resolveWithPresence) => {
    pr.resolve = resolve;
    pr.reject = reject;
    pr.resolveWithPresence = resolveWithPresence;
  });
  await Promise.resolve();
  pr.resolveWithPresence(presenceEventualHandler, {
    proxy: {
      handler: presenceImmediateHandler,
      target: proxyTarget,
    },
  });
  await pr.promise
    .then(presence => {
      l('step: .then invoked');
      log.push(['thenCallbackInvoked']);
      presence.there(() => {
        l('step: nomad invoked');
        log.push(['doing stuff there']);
      });
      return 42;
    })
    .catch(problem => t.log('.then callback got problem:', problem));
  const presence = await pr.promise;
  l('log: ', log);
  t.is(log[0][0], 'get');
  t.is(log[0][1], proxyTarget);
  t.is(log[0][2], 'then');
  t.is(log[0][3], presence);
  //
  t.is(log[1][0], 'then');
  t.not(log[1][1], undefined);
  t.not(log[1][2], undefined);
  //
  t.is(log[2][0], 'get');
  t.is(log[2][1], proxyTarget);
  t.is(log[2][2], 'then');
  t.is(log[2][3], presence);
  //
  t.is(log[3][0], 'thenCallbackInvoked');
  //
  t.is(log[4][0], 'get');
  t.is(log[4][1], proxyTarget);
  t.is(log[4][2], 'there');
  t.is(log[4][3], presence);
  //
  t.is(log[5][0], 'thereInvocation');
  t.not(log[5][1], undefined);
  //
  t.is(log[6][0], 'doing stuff there');
});

test('resolveWithPresence proxy with revoker', async t => {
  const l = t.log; // decomment this line for debug aid
  l('proxy support now being tested');
  const log = [];
  const presenceEventualHandler = {
    applyMethod(target, verb, args) {
      log.push(['eventualSend', target, verb, args]);
      return undefined;
    },
    apply(target, args) {
      log.push(['eventualApply', target, args]);
      return undefined;
    },
    get(target, property) {
      log.push(['eventualGet', target, property]);
      return undefined;
    },
    set(target, property, value, receiver) {
      // this trap should never run, but it does the default hardcoded behaviour
      presenceEventualHandler.setOnly(target, property, value, receiver);
      return value;
    },
    setOnly(target, property, value, receiver) {
      log.push(['eventualSetOnly', target, property, value, receiver]);
      return undefined; // traps return value is always ignored
    },
  };
  const proxyTarget = {};
  let thenFetched = false;
  const presenceImmediateHandler = {
    apply(target, thisArg, args) {
      log.push(['apply', target, thisArg, args]);
      return undefined;
    },
    construct(target, args, newTarget) {
      log.push(['construct', target, args, newTarget]);
      return {};
    },
    defineProperty(target, property, descriptor) {
      log.push(['defineProperty', target, property, descriptor]);
      return false;
    },
    deleteProperty(target, property) {
      log.push(['deleteProperty', target, property]);
      return false;
    },
    get(target, property, receiver) {
      log.push(['get', target, property, receiver]);
      if (property === 'then') {
        l('step: .then fetched');
        if (thenFetched) {
          thenFetched = false;
          return undefined;
        }
        thenFetched = true;
        return (callback, errback) => {
          l('step: .then handles invocation');
          log.push(['then', callback, errback]);
          try {
            l('step: callback which was given to .then, invoked');
            return Promise.resolve(callback(receiver));
          } catch (problem) {
            return Promise.reject(problem);
          }
        };
      }
      if (property === 'catch') {
        return _ => Promise.resolve(target);
      }
      if (property === 'finally') {
        return callback => {
          try {
            callback();
          } catch (problem) {
            // es-lint ignore-empty-block
          }
        };
      }
      if (property === 'there') {
        l('step: .there fetched');
        return nomad => {
          l('step: .there handles invocation');
          log.push(['thereInvocation', nomad]);
          if (typeof nomad === 'function') {
            try {
              l('step: nomad given to .there invoked');
              return Promise.resolve(nomad());
            } catch (problem) {
              return Promise.reject(problem);
            }
          } else {
            return Promise.reject(Error('tbi, until then, unhelpfull'));
          }
        };
      }
      return undefined;
    },
    getOwnPropertyDescriptor(target, property) {
      log.push(['getOwnPropertyDescriptor', target, property]);
      return undefined;
    },
    getPrototypeOf(target) {
      log.push(['getPrototypeOf', target]);
      return null;
    },
    has(target, property) {
      log.push(['has', target, property]);
      return false;
    },
    isExtensible(target) {
      log.push(['isExtensible', target]);
      return false;
    },
    ownKeys(target) {
      log.push(['ownKeys', target]);
      return [];
    },
    preventExtensions(target) {
      log.push(['preventExtensions', target]);
      return false;
    },
    set(target, property, value, receiver) {
      log.push(['set', target, property, value, receiver]);
      return false;
    },
    setPrototypeOf(target, prototype) {
      log.push(['setPrototypeOf', target, prototype]);
      return false;
    },
  };
  const pr = {};
  pr.promise = new HandledPromise((resolve, reject, resolveWithPresence) => {
    pr.resolve = resolve;
    pr.reject = reject;
    pr.resolveWithPresence = resolveWithPresence;
  });
  await Promise.resolve();
  /** @type {() => void} */
  let revoker;
  pr.resolveWithPresence(presenceEventualHandler, {
    proxy: {
      handler: presenceImmediateHandler,
      target: proxyTarget,
      revokerCallback: r => {
        revoker = r;
      },
    },
  });
  await pr.promise
    .then(presence => {
      l('step: .then invoked');
      log.push(['thenCallbackInvoked']);
      presence.there(() => {
        l('step: nomad invoked');
        log.push(['doing stuff there']);
      });
      return 42;
    })
    .catch(problem => t.log('.then callback got problem:', problem));
  const presence = await pr.promise;
  l('log: ', log);
  t.is(log[0][0], 'get');
  t.is(log[0][1], proxyTarget);
  t.is(log[0][2], 'then');
  t.is(log[0][3], presence);
  //
  t.is(log[1][0], 'then');
  t.not(log[1][1], undefined);
  t.not(log[1][2], undefined);
  //
  t.is(log[2][0], 'get');
  t.is(log[2][1], proxyTarget);
  t.is(log[2][2], 'then');
  t.is(log[2][3], presence);
  //
  t.is(log[3][0], 'thenCallbackInvoked');
  //
  t.is(log[4][0], 'get');
  t.is(log[4][1], proxyTarget);
  t.is(log[4][2], 'there');
  t.is(log[4][3], presence);
  //
  t.is(log[5][0], 'thereInvocation');
  t.not(log[5][1], undefined);
  //
  t.is(log[6][0], 'doing stuff there');

  revoker();
  t.throws(
    () =>
      presence.there(() => {
        t.fail('unexpected after revoke!');
      }),
    { instanceOf: Error, message: /been revoked/ },
  );
});

test('resolveWithPresence test nr 6', async t => {
  const l = t.log; // decomment this line for debug aid
  l('proxy support now being tested');
  const log = [];
  const presenceEventualHandler = {
    applyMethod(target, verb, args) {
      log.push(['eventualSend', target, verb, args]);
      return undefined;
    },
    apply(target, args) {
      log.push(['eventualApply', target, args]);
      return undefined;
    },
    get(target, property) {
      log.push(['eventualGet', target, property]);
      return undefined;
    },
    set(target, property, value, receiver) {
      // this trap should never run, but it does the default hardcoded behaviour
      presenceEventualHandler.setOnly(target, property, value, receiver);
      return value;
    },
    setOnly(target, property, value, receiver) {
      log.push(['eventualSetOnly', target, property, value, receiver]);
      return undefined; // traps return value is always ignored
    },
  };
  const proxyTarget = {};
  let thenFetched = false;
  const presenceImmediateHandler = {
    apply(target, thisArg, args) {
      log.push(['apply', target, thisArg, args]);
      return undefined;
    },
    construct(target, args, newTarget) {
      log.push(['construct', target, args, newTarget]);
      return {};
    },
    defineProperty(target, property, descriptor) {
      log.push(['defineProperty', target, property, descriptor]);
      return false;
    },
    deleteProperty(target, property) {
      log.push(['deleteProperty', target, property]);
      return false;
    },
    get(target, property, receiver) {
      log.push(['get', target, property, receiver]);
      if (property === 'then') {
        l('step: .then fetched');
        if (thenFetched) {
          thenFetched = false;
          return undefined;
        }
        thenFetched = true;
        return (callback, errback) => {
          l('step: .then handles invocation');
          log.push(['then', callback, errback]);
          try {
            l('step: callback which was given to .then, invoked');
            return Promise.resolve(callback(receiver));
          } catch (problem) {
            return Promise.reject(problem);
          }
        };
      }
      if (property === 'catch') {
        return _ => Promise.resolve(target);
      }
      if (property === 'finally') {
        return callback => {
          try {
            callback();
          } catch (problem) {
            // es-lint ignore-empty-block
          }
        };
      }
      if (property === 'there') {
        l('step: .there fetched');
        return nomad => {
          l('step: .there handles invocation');
          log.push(['thereInvocation', nomad]);
          if (typeof nomad === 'function') {
            try {
              l('step: nomad given to .there invoked');
              return Promise.resolve(nomad());
            } catch (problem) {
              return Promise.reject(problem);
            }
          } else {
            return Promise.reject(Error('tbi, until then, unhelpfull'));
          }
        };
      }
      return undefined;
    },
    getOwnPropertyDescriptor(target, property) {
      log.push(['getOwnPropertyDescriptor', target, property]);
      return undefined;
    },
    getPrototypeOf(target) {
      log.push(['getPrototypeOf', target]);
      return null;
    },
    has(target, property) {
      log.push(['has', target, property]);
      return false;
    },
    isExtensible(target) {
      log.push(['isExtensible', target]);
      return false;
    },
    ownKeys(target) {
      log.push(['ownKeys', target]);
      return [];
    },
    preventExtensions(target) {
      log.push(['preventExtensions', target]);
      return false;
    },
    set(target, property, value, receiver) {
      log.push(['set', target, property, value, receiver]);
      return false;
    },
    setPrototypeOf(target, prototype) {
      log.push(['setPrototypeOf', target, prototype]);
      return false;
    },
  };
  const pr = {};
  pr.promise = new HandledPromise((resolve, reject, resolveWithPresence) => {
    pr.resolve = resolve;
    pr.reject = reject;
    pr.resolveWithPresence = resolveWithPresence;
  });
  await Promise.resolve();
  pr.resolveWithPresence(presenceEventualHandler, {
    proxy: {
      handler: presenceImmediateHandler,
      target: proxyTarget,
    },
  });
  await pr.promise
    .then(presence => {
      l('step: .then invoked');
      log.push(['thenCallbackInvoked']);
      presence.there(() => {
        l('step: nomad invoked');
        log.push(['doing stuff there']);
      });
      return 42;
    })
    .catch(problem => t.log('.then callback got problem:', problem));
  const presence = await pr.promise;
  await Promise.resolve();
  // l('log: ', log); // smá tilraun, nú á réttum stað
  t.is(log[0][0], 'get');
  t.is(log[0][1], proxyTarget);
  t.is(log[0][2], 'then');
  t.is(log[0][3], presence);
  //
  t.is(log[1][0], 'then');
  t.not(log[1][1], undefined);
  t.not(log[1][2], undefined);
  //
  t.is(log[2][0], 'get');
  t.is(log[2][1], proxyTarget);
  t.is(log[2][2], 'then');
  t.is(log[2][3], presence);
  //
  t.is(log[3][0], 'thenCallbackInvoked');
  //
  t.is(log[4][0], 'get');
  t.is(log[4][1], proxyTarget);
  t.is(log[4][2], 'there');
  t.is(log[4][3], presence);
  //
  t.is(log[5][0], 'thereInvocation');
  t.not(log[5][1], undefined);
  //
  t.is(log[6][0], 'doing stuff there');
});
