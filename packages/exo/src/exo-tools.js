import { getMethodNames } from '@endo/eventual-send/utils.js';
import { hasOwnPropertyOf } from '@endo/pass-style';
import { E, Far } from '@endo/far';
import {
  mustMatch,
  M,
  isAwaitArgGuard,
  isRawGuard,
  getAwaitArgGuardPayload,
  getMethodGuardPayload,
  getInterfaceGuardPayload,
  getCopyMapEntries,
} from '@endo/patterns';
import { listDifference } from '@endo/common/list-difference.js';
import { objectMap } from '@endo/common/object-map.js';
import { GET_INTERFACE_GUARD } from './get-interface.js';

/** @typedef {import('@endo/patterns').Method} Method */
/** @typedef {import('@endo/patterns').MethodGuard} MethodGuard */
/** @typedef {import('@endo/patterns').MethodGuardPayload} MethodGuardPayload */
/**
 * @template {Record<PropertyKey, MethodGuard>} [T=Record<PropertyKey, MethodGuard>]
 * @typedef {import('@endo/patterns').InterfaceGuard<T>} InterfaceGuard
 */

const { quote: q, Fail } = assert;
const { apply, ownKeys } = Reflect;
const { defineProperties, fromEntries } = Object;

/**
 * A method guard, for inclusion in an interface guard, that does not
 * enforce any constraints of incoming arguments or return results.
 */
const RawMethodGuard = M.call().rest(M.raw()).returns(M.raw());

const REDACTED_RAW_ARG = '<redacted raw arg>';

/**
 * A method guard, for inclusion in an interface guard, that enforces only that
 * all arguments are passable and that the result is passable. (In far classes,
 * "any" means any *passable*.) This is the least possible non-raw
 * enforcement for a method guard, and is implied by all other
 * non-raw method guards.
 */
const PassableMethodGuard = M.call().rest(M.any()).returns(M.any());

/**
 * @typedef {object} MatchConfig
 * @property {number} declaredLen
 * @property {boolean} hasRestArgGuard
 * @property {boolean} restArgGuardIsRaw
 * @property {import('@endo/patterns').Pattern} paramsPattern
 * @property {number[]} redactedIndices
 */

/**
 * @param {import('@endo/pass-style').Passable[]} syncArgs
 * @param {MatchConfig} matchConfig
 * @param {string} [label]
 * @returns {import('@endo/pass-style').Passable[]} Returns the args that should be passed to the raw method.
 */
const defendSyncArgs = (syncArgs, matchConfig, label = undefined) => {
  const {
    declaredLen,
    hasRestArgGuard,
    restArgGuardIsRaw,
    paramsPattern,
    redactedIndices,
  } = matchConfig;

  // Use syncArgs if possible, but copy it when necessary to implement
  // redactions.
  let matchableArgs = syncArgs;
  if (restArgGuardIsRaw && syncArgs.length > declaredLen) {
    const restLen = syncArgs.length - declaredLen;
    const redactedRest = Array(restLen).fill(REDACTED_RAW_ARG);
    matchableArgs = [...syncArgs.slice(0, declaredLen), ...redactedRest];
  } else if (
    redactedIndices.length > 0 &&
    redactedIndices[0] < syncArgs.length
  ) {
    // Copy the arguments array, avoiding hardening the redacted ones (which are
    // trivially matched using REDACTED_RAW_ARG as a sentinel value).
    matchableArgs = [...syncArgs];
  }

  for (const i of redactedIndices) {
    if (i >= matchableArgs.length) {
      break;
    }
    matchableArgs[i] = REDACTED_RAW_ARG;
  }

  mustMatch(harden(matchableArgs), paramsPattern, label);

  if (hasRestArgGuard) {
    return syncArgs;
  }
  syncArgs.length <= declaredLen ||
    Fail`${q(label)} accepts at most ${q(declaredLen)} arguments, not ${q(
      syncArgs.length,
    )}: ${syncArgs}`;
  return syncArgs;
};

/**
 * Convert a method guard to a match config for more efficient per-call
 * execution.  This is a one-time conversion, so it's OK to be slow.
 *
 * Most of the work is done to detect `M.raw()` so that we build a match pattern
 * and metadata instead of doing this in the hot path.
 * @param {MethodGuardPayload} methodGuardPayload
 * @returns {MatchConfig}
 */
const buildMatchConfig = methodGuardPayload => {
  const {
    argGuards,
    optionalArgGuards = [],
    restArgGuard,
  } = methodGuardPayload;

  const matchableArgGuards = [...argGuards, ...optionalArgGuards];

  const redactedIndices = [];
  for (let i = 0; i < matchableArgGuards.length; i += 1) {
    if (isRawGuard(matchableArgGuards[i])) {
      matchableArgGuards[i] = REDACTED_RAW_ARG;
      redactedIndices.push(i);
    }
  }

  // Pass through raw rest arguments without matching.
  let matchableRestArgGuard = restArgGuard;
  if (isRawGuard(matchableRestArgGuard)) {
    matchableRestArgGuard = M.arrayOf(REDACTED_RAW_ARG);
  }
  const matchableMethodGuardPayload = harden({
    ...methodGuardPayload,
    argGuards: matchableArgGuards.slice(0, argGuards.length),
    optionalArgGuards: matchableArgGuards.slice(argGuards.length),
    restArgGuard: matchableRestArgGuard,
  });

  const paramsPattern = M.splitArray(
    matchableMethodGuardPayload.argGuards,
    matchableMethodGuardPayload.optionalArgGuards,
    matchableMethodGuardPayload.restArgGuard,
  );

  return harden({
    declaredLen: matchableArgGuards.length,
    hasRestArgGuard: restArgGuard !== undefined,
    restArgGuardIsRaw: restArgGuard !== matchableRestArgGuard,
    paramsPattern,
    redactedIndices,
    matchableMethodGuardPayload,
  });
};

/**
 * @param {Method} method
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 * @returns {Method}
 */
const defendSyncMethod = (method, methodGuardPayload, label) => {
  const { returnGuard } = methodGuardPayload;
  const isRawReturn = isRawGuard(returnGuard);
  const matchConfig = buildMatchConfig(methodGuardPayload);
  const { syncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    syncMethod(...syncArgs) {
      // Only harden args and return value if not dealing with a raw value guard.
      const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
      const result = apply(method, this, realArgs);
      if (!isRawReturn) {
        mustMatch(harden(result), returnGuard, `${label}: result`);
      }
      return result;
    },
  };
  return syncMethod;
};

/**
 * @param {MethodGuardPayload} methodGuardPayload
 */
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

/**
 * @param {(...args: unknown[]) => any} method
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 */
const defendAsyncMethod = (method, methodGuardPayload, label) => {
  const { returnGuard } = methodGuardPayload;
  const isRawReturn = isRawGuard(returnGuard);

  const { awaitIndexes, rawMethodGuardPayload } = desync(methodGuardPayload);
  const matchConfig = buildMatchConfig(rawMethodGuardPayload);

  const { asyncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    asyncMethod(...args) {
      const awaitList = [];
      for (const i of awaitIndexes) {
        if (i >= args.length) {
          break;
        }
        awaitList.push(args[i]);
      }
      const p = Promise.all(awaitList);
      const syncArgs = [...args];
      const resultP = E.when(
        p,
        /** @param {any[]} awaitedArgs */ awaitedArgs => {
          for (let j = 0; j < awaitedArgs.length; j += 1) {
            syncArgs[awaitIndexes[j]] = awaitedArgs[j];
          }
          const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
          return apply(method, this, realArgs);
        },
      );
      if (isRawReturn) {
        return resultP;
      }
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
 * @param {import('@endo/patterns').DefaultGuardType} [defaultGuards]
 */
const bindMethod = (
  methodTag,
  contextProvider,
  behaviorMethod,
  thisfulMethods = false,
  methodGuard = undefined,
  defaultGuards = undefined,
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
  if (!methodGuard && thisfulMethods) {
    switch (defaultGuards) {
      case undefined:
      case 'passable':
        methodGuard = PassableMethodGuard;
        break;
      case 'raw':
        methodGuard = RawMethodGuard;
        break;
      default:
        throw Fail`Unrecognized defaultGuards ${q(defaultGuards)}`;
    }
  }
  if (methodGuard) {
    method = defendMethod(method, methodGuard, methodTag);
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
 * @template {Record<PropertyKey, CallableFunction>} T
 * @param {string} tag
 * @param {ContextProvider} contextProvider
 * @param {T} behaviorMethods
 * @param {boolean} [thisfulMethods]
 * @param {InterfaceGuard<{ [M in keyof T]: MethodGuard }>} [interfaceGuard]
 */
export const defendPrototype = (
  tag,
  contextProvider,
  behaviorMethods,
  thisfulMethods = false,
  interfaceGuard = undefined,
) => {
  const prototype = {};
  const methodNames = getMethodNames(behaviorMethods).filter(
    // By ignoring any method that seems to be a constructor, we can use a
    // class.prototype as a behaviorMethods.
    key => {
      if (key !== 'constructor') {
        return true;
      }
      const constructor = behaviorMethods.constructor;
      return !(
        constructor.prototype &&
        constructor.prototype.constructor === constructor
      );
    },
  );
  /** @type {Record<PropertyKey, MethodGuard> | undefined} */
  let methodGuards;
  /** @type {import('@endo/patterns').DefaultGuardType} */
  let defaultGuards;
  if (interfaceGuard) {
    const {
      interfaceName,
      methodGuards: mg,
      symbolMethodGuards,
      sloppy,
      defaultGuards: dg = sloppy ? 'passable' : defaultGuards,
    } = getInterfaceGuardPayload(interfaceGuard);
    methodGuards = harden({
      ...mg,
      ...(symbolMethodGuards &&
        fromEntries(getCopyMapEntries(symbolMethodGuards))),
    });
    defaultGuards = dg;
    {
      const methodGuardNames = ownKeys(methodGuards);
      const unimplemented = listDifference(methodGuardNames, methodNames);
      unimplemented.length === 0 ||
        Fail`methods ${q(unimplemented)} not implemented by ${q(tag)}`;
      if (defaultGuards === undefined) {
        const unguarded = listDifference(methodNames, methodGuardNames);
        unguarded.length === 0 ||
          Fail`methods ${q(unguarded)} not guarded by ${q(interfaceName)}`;
      }
    }
  }

  for (const prop of methodNames) {
    prototype[prop] = bindMethod(
      `In ${q(prop)} method of (${tag})`,
      contextProvider,
      behaviorMethods[prop],
      thisfulMethods,
      // TODO some tool does not yet understand the `?.[` syntax
      methodGuards && methodGuards[prop],
      defaultGuards,
    );
  }

  if (!hasOwnPropertyOf(prototype, GET_INTERFACE_GUARD)) {
    const getInterfaceGuardMethod = {
      [GET_INTERFACE_GUARD]() {
        // Note: May be `undefined`
        return interfaceGuard;
      },
    }[GET_INTERFACE_GUARD];
    prototype[GET_INTERFACE_GUARD] = bindMethod(
      `In ${q(GET_INTERFACE_GUARD)} method of (${tag})`,
      contextProvider,
      getInterfaceGuardMethod,
      thisfulMethods,
      undefined,
    );
  }

  return Far(
    tag,
    /** @type {T & import('./get-interface.js').GetInterfaceGuard<T>} */ (
      prototype
    ),
  );
};
harden(defendPrototype);

/**
 * @template {Record<FacetName, Methods>} F
 * @param {string} tag
 * @param {{ [K in keyof F]: KitContextProvider }} contextProviderKit
 * @param {F} behaviorMethodsKit
 * @param {boolean} [thisfulMethods]
 * @param {{ [K in keyof F]: InterfaceGuard<Record<keyof F[K], MethodGuard>> }} [interfaceGuardKit]
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
  const protoKit = objectMap(behaviorMethodsKit, (behaviorMethods, facetName) =>
    defendPrototype(
      `${tag} ${String(facetName)}`,
      contextProviderKit[facetName],
      behaviorMethods,
      thisfulMethods,
      interfaceGuardKit && interfaceGuardKit[facetName],
    ),
  );
  return protoKit;
};
