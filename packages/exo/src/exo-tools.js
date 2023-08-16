import { E, Far } from '@endo/far';
import { hasOwnPropertyOf } from '@endo/pass-style';
import {
  listDifference,
  objectMap,
  mustMatch,
  M,
  isAwaitArgGuard,
  getAwaitArgGuardPayload,
  getMethodGuardPayload,
  getInterfaceGuardPayload,
  getCopyMapEntries,
  // isRawValueGuard,
} from '@endo/patterns';

/** @typedef {import('@endo/patterns').Method} Method */
/** @typedef {import('@endo/patterns').MethodGuard} MethodGuard */
/** @typedef {import('@endo/patterns').MethodGuardPayload} MethodGuardPayload */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {import('@endo/patterns').InterfaceGuard<T>} InterfaceGuard
 */
/** @typedef {import('@endo/patterns').InterfaceGuardKit} InterfaceGuardKit */

const { quote: q, Fail } = assert;
const { apply, ownKeys } = Reflect;
const { defineProperties, fromEntries } = Object;

/**
 * A method guard, for inclusion in an interface guard, that does not
 * enforce any constraints of incoming arguments or return results.
 */
// const RawMethodGuard = M.call().rest(M.rawValue()).returns(M.rawValue());

/**
 * A method guard, for inclusion in an interface guard, that enforces only that
 * all arguments are passable and that the result is passable. (In far classes,
 * "any" means any *passable*.) This is the least possible non-raw
 * enforcement for a method guard, and is implied by all other
 * non-raw method guards.
 */
const MinMethodGuard = M.call().rest(M.any()).returns(M.any());

/**
 * @param {Passable[]} syncArgs
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} [label]
 * @returns {Passable[]} Returns the args that should be passed to the
 * raw method
 */
const defendSyncArgs = (syncArgs, methodGuardPayload, label = undefined) => {
  const { argGuards, optionalArgGuards, restArgGuard } = methodGuardPayload;
  const paramsPattern = M.splitArray(
    argGuards,
    optionalArgGuards,
    restArgGuard,
  );
  mustMatch(harden(syncArgs), paramsPattern, label);
  if (restArgGuard !== undefined) {
    return syncArgs;
  }
  const declaredLen =
    argGuards.length + (optionalArgGuards ? optionalArgGuards.length : 0);
  if (syncArgs.length <= declaredLen) {
    return syncArgs;
  }
  // Ignore extraneous arguments, as a JS function call would do.
  return syncArgs.slice(0, declaredLen);
};

/**
 * @param {Method} method
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 * @returns {Method}
 */
const defendSyncMethod = (method, methodGuardPayload, label) => {
  const { returnGuard } = methodGuardPayload;
  const { syncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    syncMethod(...syncArgs) {
      const realArgs = defendSyncArgs(
        harden(syncArgs),
        methodGuardPayload,
        label,
      );
      const result = apply(method, this, realArgs);
      mustMatch(harden(result), returnGuard, `${label}: result`);
      return result;
    },
  };
  return syncMethod;
};

const desync = methodGuardPayload => {
  const {
    argGuards,
    optionalArgGuards = [],
    restArgGuard,
  } = methodGuardPayload;
  !isAwaitArgGuard(restArgGuard) ||
    Fail`Rest args may not be awaited: ${restArgGuard}`;
  const rawArgGuards = [...argGuards, ...optionalArgGuards];

  const awaitIndexes = [];
  for (let i = 0; i < rawArgGuards.length; i += 1) {
    const argGuard = rawArgGuards[i];
    if (isAwaitArgGuard(argGuard)) {
      rawArgGuards[i] = getAwaitArgGuardPayload(argGuard).argGuard;
      awaitIndexes.push(i);
    }
  }
  return {
    awaitIndexes,
    rawMethodGuardPayload: {
      ...methodGuardPayload,
      argGuards: rawArgGuards.slice(0, argGuards.length),
      optionalArgGuards: rawArgGuards.slice(argGuards.length),
    },
  };
};

const defendAsyncMethod = (method, methodGuardPayload, label) => {
  const { returnGuard } = methodGuardPayload;
  const { awaitIndexes, rawMethodGuardPayload } = desync(methodGuardPayload);
  const { asyncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    asyncMethod(...args) {
      const awaitList = awaitIndexes.map(i => args[i]);
      const p = Promise.all(awaitList);
      const syncArgs = [...args];
      const resultP = E.when(p, awaitedArgs => {
        for (let j = 0; j < awaitIndexes.length; j += 1) {
          syncArgs[awaitIndexes[j]] = awaitedArgs[j];
        }
        const realArgs = defendSyncArgs(syncArgs, rawMethodGuardPayload, label);
        return apply(method, this, realArgs);
      });
      return E.when(resultP, result => {
        mustMatch(harden(result), returnGuard, `${label}: result`);
        return result;
      });
    },
  };
  return asyncMethod;
};

/**
 *
 * @param {Method} method
 * @param {MethodGuard} methodGuard
 * @param {string} label
 */
const defendMethod = (method, methodGuard, label) => {
  const methodGuardPayload = getMethodGuardPayload(methodGuard);
  const { callKind } = methodGuardPayload;
  if (callKind === 'sync') {
    return defendSyncMethod(method, methodGuardPayload, label);
  } else {
    assert(callKind === 'async');
    return defendAsyncMethod(method, methodGuardPayload, label);
  }
};

/**
 * @typedef {string} FacetName
 */

/**
 * @typedef {Record<PropertyKey, CallableFunction>} Methods
 */

/**
 * @template [S = any]
 * @template {Methods} [M = any]
 * @typedef {{ state: S, self: M }} ClassContext
 */

/**
 * @template [S = any]
 * @template {Record<FacetName, Methods>} [F = any]
 * @typedef {{ state: S, facets: F }} KitContext
 */

/**
 * @typedef {(facet: any) => KitContext} KitContextProvider
 * @typedef {((representative: any) => ClassContext) | KitContextProvider} ContextProvider
 */

/**
 * @param {string} methodTag
 * @param {ContextProvider} contextProvider
 * @param {CallableFunction} behaviorMethod
 * @param {boolean} [thisfulMethods]
 * @param {MethodGuard} [methodGuard]
 */
const bindMethod = (
  methodTag,
  contextProvider,
  behaviorMethod,
  thisfulMethods = false,
  methodGuard = undefined,
) => {
  assert.typeof(behaviorMethod, 'function');

  const getContext = self => {
    const context = contextProvider(self);
    context ||
      Fail`${q(methodTag)} may only be applied to a valid instance: ${self}`;
    return context;
  };

  // Violating all Jessie rules to create representatives that inherit
  // methods from a shared prototype. The bound method therefore needs
  // to mention `this`. We define it using concise method syntax
  // so that it will be `this` sensitive but not constructable.
  //
  // We normally consider `this` unsafe because of the hazard of a
  // method of one abstraction being applied to an instance of
  // another abstraction. To prevent that attack, the bound method
  // checks that its `this` is in the map in which its representatives
  // are registered.
  let { method } = thisfulMethods
    ? {
        method(...args) {
          this ||
            Fail`thisful method ${methodTag} called without 'this' object`;
          const context = getContext(this);
          return apply(behaviorMethod, context, args);
        },
      }
    : {
        method(...args) {
          const context = getContext(this);
          return apply(behaviorMethod, null, [context, ...args]);
        },
      };
  if (methodGuard) {
    method = defendMethod(method, methodGuard, methodTag);
  } else if (thisfulMethods) {
    // For far classes ensure that inputs and outputs are passable.
    method = defendMethod(method, MinMethodGuard, methodTag);
  }
  defineProperties(method, {
    name: { value: methodTag },
    length: {
      value: thisfulMethods ? behaviorMethod.length : behaviorMethod.length - 1,
    },
  });
  return method;
};

/**
 * The name of the automatically added default meta-method for
 * obtaining an exo's interface, if it has one.
 *
 * TODO Name to be bikeshed. Perhaps even whether it is a
 * string or symbol to be bikeshed.
 *
 * TODO Beware that an exo's interface can change across an upgrade,
 * so remotes that cache it can become stale.
 */
export const GET_INTERFACE_GUARD = Symbol.for('getInterfaceGuard');

/**
 *
 * @template {Record<PropertyKey, CallableFunction>} T
 * @param {T} behaviorMethods
 * @param {InterfaceGuard<{ [M in keyof T]: MethodGuard }>} interfaceGuard
 * @returns {T}
 */
const withGetInterfaceGuardMethod = (behaviorMethods, interfaceGuard) =>
  harden({
    [GET_INTERFACE_GUARD]() {
      return interfaceGuard;
    },
    ...behaviorMethods,
  });

/**
 * @template {Record<PropertyKey, CallableFunction>} T
 * @param {string} tag
 * @param {ContextProvider} contextProvider
 * @param {T} behaviorMethods
 * @param {boolean} [thisfulMethods]
 * @param {InterfaceGuard<{ [M in keyof T]: MethodGuard }>} [interfaceGuard]
 * @returns {T & import('@endo/eventual-send').RemotableBrand<{}, T>}
 */
export const defendPrototype = (
  tag,
  contextProvider,
  behaviorMethods,
  thisfulMethods = false,
  interfaceGuard = undefined,
) => {
  const prototype = {};
  if (hasOwnPropertyOf(behaviorMethods, 'constructor')) {
    // By ignoring any method named "constructor", we can use a
    // class.prototype as a behaviorMethods.
    const { constructor: _, ...methods } = behaviorMethods;
    // @ts-expect-error TS misses that hasOwn check makes this safe
    behaviorMethods = harden(methods);
  }
  /** @type {Record<PropertyKey, MethodGuard> | undefined} */
  let methodGuards;
  if (interfaceGuard) {
    const {
      interfaceName,
      methodGuards: mg,
      symbolMethodGuards,
      sloppy = false,
    } = getInterfaceGuardPayload(interfaceGuard);
    methodGuards = harden({
      ...mg,
      ...(symbolMethodGuards &&
        fromEntries(getCopyMapEntries(symbolMethodGuards))),
    });
    {
      const methodNames = ownKeys(behaviorMethods);
      assert(methodGuards);
      const methodGuardNames = ownKeys(methodGuards);
      const unimplemented = listDifference(methodGuardNames, methodNames);
      unimplemented.length === 0 ||
        Fail`methods ${q(unimplemented)} not implemented by ${q(tag)}`;
      if (!sloppy) {
        const unguarded = listDifference(methodNames, methodGuardNames);
        unguarded.length === 0 ||
          Fail`methods ${q(unguarded)} not guarded by ${q(interfaceName)}`;
      }
    }
    behaviorMethods = withGetInterfaceGuardMethod(
      behaviorMethods,
      interfaceGuard,
    );
  }

  for (const prop of ownKeys(behaviorMethods)) {
    prototype[prop] = bindMethod(
      `In ${q(prop)} method of (${tag})`,
      contextProvider,
      behaviorMethods[prop],
      thisfulMethods,
      // TODO some tool does not yet understand the `?.[` syntax
      methodGuards && methodGuards[prop],
    );
  }

  return Far(tag, /** @type {T} */ (prototype));
};
harden(defendPrototype);

/**
 * @param {string} tag
 * @param {Record<FacetName, KitContextProvider>} contextProviderKit
 * @param {Record<FacetName, Record<PropertyKey, CallableFunction>>} behaviorMethodsKit
 * @param {boolean} [thisfulMethods]
 * @param {InterfaceGuardKit} [interfaceGuardKit]
 */
export const defendPrototypeKit = (
  tag,
  contextProviderKit,
  behaviorMethodsKit,
  thisfulMethods = false,
  interfaceGuardKit = undefined,
) => {
  const facetNames = ownKeys(behaviorMethodsKit).sort();
  facetNames.length > 1 || Fail`A multi-facet object must have multiple facets`;
  if (interfaceGuardKit) {
    const interfaceNames = ownKeys(interfaceGuardKit);
    const extraInterfaceNames = listDifference(facetNames, interfaceNames);
    extraInterfaceNames.length === 0 ||
      Fail`Interfaces ${q(extraInterfaceNames)} not implemented by ${q(tag)}`;
    const extraFacetNames = listDifference(interfaceNames, facetNames);
    extraFacetNames.length === 0 ||
      Fail`Facets ${q(extraFacetNames)} of ${q(tag)} not guarded by interfaces`;
  }
  const contextMapNames = ownKeys(contextProviderKit);
  const extraContextNames = listDifference(facetNames, contextMapNames);
  extraContextNames.length === 0 ||
    Fail`Contexts ${q(extraContextNames)} not implemented by ${q(tag)}`;
  const extraFacetNames = listDifference(contextMapNames, facetNames);
  extraFacetNames.length === 0 ||
    Fail`Facets ${q(extraFacetNames)} of ${q(tag)} missing contexts`;
  return objectMap(behaviorMethodsKit, (behaviorMethods, facetName) =>
    defendPrototype(
      `${tag} ${facetName}`,
      contextProviderKit[facetName],
      behaviorMethods,
      thisfulMethods,
      interfaceGuardKit && interfaceGuardKit[facetName],
    ),
  );
};
