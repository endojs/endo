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
import { q, Fail } from '@endo/errors';
import { GET_INTERFACE_GUARD } from './get-interface.js';

/**
 * @import {InterfaceGuard, Method, MethodGuard, MethodGuardPayload} from '@endo/patterns'
 * @import {ClassContext, ContextProvider, FacetName, KitContext, KitContextProvider, MatchConfig, Methods} from './types.js'
 */

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
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 * @returns {Method}
 */
const defendSyncMethod = (
  getContext,
  behaviorMethod,
  methodGuardPayload,
  label,
) => {
  const { returnGuard } = methodGuardPayload;
  const isRawReturn = isRawGuard(returnGuard);
  const matchConfig = buildMatchConfig(methodGuardPayload);
  const { syncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    syncMethod(...syncArgs) {
      const context = getContext(this);
      // Only harden args and return value if not dealing with a raw value guard.
      const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
      const result = apply(behaviorMethod, context, realArgs);
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
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuardPayload} methodGuardPayload
 * @param {string} label
 */
const defendAsyncMethod = (
  getContext,
  behaviorMethod,
  methodGuardPayload,
  label,
) => {
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
          // Get the context after all waiting in case we ever do revocation
          // by removing the context entry. Avoid TOCTTOU!
          const context = getContext(this);
          const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
          return apply(behaviorMethod, context, realArgs);
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
 * @param {(representative: any) => ClassContext | KitContext} getContext
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuard} methodGuard
 * @param {string} label
 */
const defendMethod = (getContext, behaviorMethod, methodGuard, label) => {
  const methodGuardPayload = getMethodGuardPayload(methodGuard);
  const { callKind } = methodGuardPayload;
  if (callKind === 'sync') {
    return defendSyncMethod(
      getContext,
      behaviorMethod,
      methodGuardPayload,
      label,
    );
  } else {
    assert(callKind === 'async');
    return defendAsyncMethod(
      getContext,
      behaviorMethod,
      methodGuardPayload,
      label,
    );
  }
};

/**
 * @param {string} methodTag
 * @param {ContextProvider} contextProvider
 * @param {CallableFunction} behaviorMethod
 * @param {MethodGuard} methodGuard
 */
const bindMethod = (
  methodTag,
  contextProvider,
  behaviorMethod,
  methodGuard,
) => {
  assert.typeof(behaviorMethod, 'function');

  /**
   * @param {any} representative
   * @returns {ClassContext | KitContext}
   */
  const getContext = representative => {
    representative ||
      // separate line to ease breakpointing
      Fail`Method ${methodTag} called without 'this' object`;
    const context = contextProvider(representative);
    if (context === undefined) {
      throw Fail`${q(
        methodTag,
      )} may only be applied to a valid instance: ${representative}`;
    }
    return context;
  };

  const method = defendMethod(
    getContext,
    behaviorMethod,
    methodGuard,
    methodTag,
  );

  defineProperties(method, {
    name: { value: methodTag },
    length: { value: behaviorMethod.length },
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
    const originalMethod = behaviorMethods[prop];
    const { shiftedMethod } = {
      shiftedMethod(...args) {
        return originalMethod([this, ...args]);
      },
    };
    const behaviorMethod = thisfulMethods ? originalMethod : shiftedMethod;
    // TODO some tool does not yet understand the `?.[` syntax
    let methodGuard = methodGuards && methodGuards[prop];
    if (!methodGuard) {
      switch (defaultGuards) {
        case undefined: {
          if (thisfulMethods) {
            methodGuard = PassableMethodGuard;
          } else {
            methodGuard = RawMethodGuard;
          }
          break;
        }
        case 'passable': {
          methodGuard = PassableMethodGuard;
          break;
        }
        case 'raw': {
          methodGuard = RawMethodGuard;
          break;
        }
        default: {
          throw Fail`Unrecognized defaultGuards ${q(defaultGuards)}`;
        }
      }
    }
    prototype[prop] = bindMethod(
      `In ${q(prop)} method of (${tag})`,
      contextProvider,
      behaviorMethod,
      methodGuard,
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
      PassableMethodGuard,
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
