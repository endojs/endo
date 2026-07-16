// @ts-check
/// <reference types="ses"/>

/** @import { CodeModeExecute } from './evaluate-tool.js' */

/**
 * A no-argument observer for a rejected eventual-send result.
 * The rejection reason is deliberately not exposed across this seam: it may contain a
 * capability or unsanitized guest data.
 *
 * @typedef {() => Promise<void> | void} ContainedEventualSendRejectionReporter
 * @typedef {((...args: unknown[]) => unknown) & object} ETarget
 */

const { getOwnPropertyDescriptors } = Object;
const {
  apply: reflectApply,
  defineProperty: reflectDefineProperty,
  get: reflectGet,
  ownKeys: reflectOwnKeys,
} = Reflect;
const { resolve: promiseResolve } = Promise;
const { then: promiseThen } = Promise.prototype;

const ignore = () => {};

/**
 * Copy `name` and `length` from an original function onto a wrapper so guest
 * code introspecting a tracked E operation (e.g. `E(x).method.name`) does not
 * observe the wrapper's own metadata instead of the wrapped operation's.
 *
 * @param {(...args: unknown[]) => unknown} wrapper
 * @param {(...args: unknown[]) => unknown} original
 * @returns {(...args: unknown[]) => unknown}
 */
const mimicFunctionMetadata = (wrapper, original) => {
  reflectDefineProperty(wrapper, 'name', {
    value: original.name,
    configurable: true,
  });
  reflectDefineProperty(wrapper, 'length', {
    value: original.length,
    configurable: true,
  });
  return wrapper;
};

/**
 * Observe a promise rejection without making the observer's child promise
 * visible to the guest or allowing it to become an unhandled rejection.
 *
 * This only ever sees values that pass through the tracked E wrapper: an
 * eventual-send result, `E.get` property, `E.resolve`/`E.when` promise, or
 * (for the reporter itself) the reporter's own return value.
 * A promise the
 * guest constructs directly, e.g. with a bare `Promise.reject(...)` that
 * never crosses the wrapper, is out of scope by design and can still surface
 * as an unhandled rejection in the host process; only eventual-send results
 * are contained here.
 *
 * @param {unknown} value
 * @param {() => void} onRejected
 * @returns {void}
 */
const observeRejection = (value, onRejected) => {
  try {
    const promise = reflectApply(promiseResolve, Promise, [value]);
    const observed = reflectApply(promiseThen, promise, [
      undefined,
      onRejected,
    ]);
    // `onRejected` is defensive, but keep a second containment boundary around
    // the observer in case a primordial changes independently.
    reflectApply(promiseThen, observed, [undefined, ignore]);
  } catch {
    // Observation must never change the guest-visible result or throw into the
    // host's eventual-send machinery.
  }
};

/**
 * Attach a rejection observer to an eventual-send result without changing the
 * promise returned to the code-mode program.
 *
 * @param {unknown} value
 * @param {ContainedEventualSendRejectionReporter | undefined} reporter
 * @returns {unknown}
 */
const observeEventualSendResult = (value, reporter) => {
  observeRejection(value, () => {
    if (typeof reporter !== 'function') {
      return;
    }
    try {
      observeRejection(reporter(), ignore);
    } catch {
      // A reporter is diagnostic-only and must not affect the guest result.
    }
  });
  return value;
};

/**
 * @param {unknown} baseE
 * @param {ContainedEventualSendRejectionReporter | undefined} reporter
 * @returns {unknown}
 */
const makeTrackedE = (baseE, reporter) => {
  if (typeof baseE !== 'function') {
    return baseE;
  }

  const callableE = /** @type {(recipient: unknown) => unknown} */ (baseE);

  const makeTrackedTarget = recipient => {
    const targetE = /** @type {ETarget} */ (
      reflectApply(callableE, undefined, [recipient])
    );
    return harden(
      new Proxy(targetE, {
        get(_target, propertyKey, receiver) {
          // E(x)'s own get trap (see `makeEProxyHandler` in
          // `@endo/eventual-send`) always returns a function for any
          // property key, so `operation` here is never anything else.
          const operation = /** @type {(...args: unknown[]) => unknown} */ (
            reflectGet(targetE, propertyKey, targetE)
          );
          /**
           * @this {unknown}
           * @param {...unknown} args
           */
          const trackedOperation = function trackedOperation(...args) {
            const operationReceiver = this === receiver ? targetE : this;
            return observeEventualSendResult(
              reflectApply(operation, operationReceiver, args),
              reporter,
            );
          };
          return harden(mimicFunctionMetadata(trackedOperation, operation));
        },
        apply(_target, thisArg, args) {
          return observeEventualSendResult(
            reflectApply(targetE, thisArg, args),
            reporter,
          );
        },
      }),
    );
  };

  const makeTrackedGet = recipient => {
    const get = /** @type {(recipient: unknown) => unknown} */ (
      reflectGet(baseE, 'get', baseE)
    );
    const targetGet = /** @type {object} */ (
      reflectApply(get, baseE, [recipient])
    );
    return harden(
      new Proxy(targetGet, {
        get(_target, propertyKey) {
          return observeEventualSendResult(
            reflectGet(targetGet, propertyKey, targetGet),
            reporter,
          );
        },
      }),
    );
  };

  const makeTrackedStatic = (propertyKey, operation) => {
    if (propertyKey === 'get') {
      return mimicFunctionMetadata(makeTrackedGet, operation);
    }
    if (propertyKey === 'sendOnly') {
      // E.sendOnly() intentionally has no result promise to observe.
      return mimicFunctionMetadata(
        (...args) => reflectApply(operation, baseE, args),
        operation,
      );
    }
    return mimicFunctionMetadata(
      (...args) =>
        observeEventualSendResult(
          reflectApply(operation, baseE, args),
          reporter,
        ),
      operation,
    );
  };

  const trackedE = recipient => makeTrackedTarget(recipient);
  const descriptors = getOwnPropertyDescriptors(baseE);
  for (const propertyKey of reflectOwnKeys(descriptors)) {
    const descriptor = /** @type {PropertyDescriptor} */ (
      reflectGet(descriptors, propertyKey)
    );
    if ('value' in descriptor && typeof descriptor.value === 'function') {
      descriptor.value = makeTrackedStatic(propertyKey, descriptor.value);
    }
    reflectDefineProperty(trackedE, propertyKey, descriptor);
  }
  return harden(trackedE);
};

/**
 * Build a Compartment-backed execute function. Callers supply every endowment
 * they want in lexical scope (typically `{ E, workspace, git }` plus stream
 * helpers). The completion value is returned; when `resultName` is supplied it
 * is also handed to `storeResult` for out-of-band capability storage.
 *
 * @param {object} options
 * @param {Record<string, unknown>} options.endowments
 * @param {(value: unknown, resultName: string | string[]) => Promise<void> | void} [options.storeResult]
 * @param {ContainedEventualSendRejectionReporter} [options.onContainedEventualSendRejection]
 * @returns {CodeModeExecute}
 */
export const makeCompartmentExecute = ({
  endowments,
  storeResult,
  onContainedEventualSendRejection,
}) => {
  const hardenedEndowments = harden({ ...endowments });
  // The tracked E wrapper only depends on the fixed `endowments.E` and
  // `onContainedEventualSendRejection` supplied here, so it is built once per
  // `makeCompartmentExecute` call rather than once per `execute` call.
  const baseE = hardenedEndowments.E;
  const scopedEndowments =
    typeof baseE === 'function'
      ? harden({
          ...hardenedEndowments,
          E: makeTrackedE(baseE, onContainedEventualSendRejection),
        })
      : hardenedEndowments;
  return async ({ source, resultName }) => {
    const compartment = new Compartment(scopedEndowments);
    const result = await compartment.evaluate(source);
    if (resultName !== undefined) {
      if (storeResult === undefined) {
        throw new Error(
          'execute.resultName was supplied but no storeResult callback is configured',
        );
      }
      await storeResult(result, resultName);
    }
    return result;
  };
};
harden(makeCompartmentExecute);
