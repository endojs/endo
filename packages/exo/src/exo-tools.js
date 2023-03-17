import { E, Far } from '@endo/far';
import { listDifference, objectMap, mustMatch, M } from '@endo/patterns';

const { quote: q, Fail } = assert;
const { apply, ownKeys } = Reflect;
const { defineProperties } = Object;

/**
 * A method guard, for inclusion in an interface guard, that enforces only that
 * all arguments are passable and that the result is passable. (In far classes,
 * "any" means any *passable*.) This is the least possible enforcement for a
 * method guard, and is implied by all other method guards.
 */
const MinMethodGuard = M.call().rest(M.any()).returns(M.any());

const defendSyncArgs = (args, methodGuard, label) => {
  const { argGuards, optionalArgGuards, restArgGuard } = methodGuard;
  const paramsPattern = M.splitArray(
    argGuards,
    optionalArgGuards,
    restArgGuard,
  );
  mustMatch(harden(args), paramsPattern, label);
};

/**
 * @param {Method} method
 * @param {MethodGuard} methodGuard
 * @param {string} label
 * @returns {Method}
 */
const defendSyncMethod = (method, methodGuard, label) => {
  const { returnGuard } = methodGuard;
  const { syncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    syncMethod(...args) {
      defendSyncArgs(harden(args), methodGuard, label);
      const result = apply(method, this, args);
      mustMatch(harden(result), returnGuard, `${label}: result`);
      return result;
    },
  };
  return syncMethod;
};

const isAwaitArgGuard = argGuard =>
  argGuard && typeof argGuard === 'object' && argGuard.klass === 'awaitArg';

const desync = methodGuard => {
  const { argGuards, optionalArgGuards = [], restArgGuard } = methodGuard;
  !isAwaitArgGuard(restArgGuard) ||
    Fail`Rest args may not be awaited: ${restArgGuard}`;
  const rawArgGuards = [...argGuards, ...optionalArgGuards];

  const awaitIndexes = [];
  for (let i = 0; i < rawArgGuards.length; i += 1) {
    const argGuard = rawArgGuards[i];
    if (isAwaitArgGuard(argGuard)) {
      rawArgGuards[i] = argGuard.argGuard;
      awaitIndexes.push(i);
    }
  }
  return {
    awaitIndexes,
    rawMethodGuard: {
      argGuards: rawArgGuards.slice(0, argGuards.length),
      optionalArgGuards: rawArgGuards.slice(argGuards.length),
      restArgGuard,
    },
  };
};

const defendAsyncMethod = (method, methodGuard, label) => {
  const { returnGuard } = methodGuard;
  const { awaitIndexes, rawMethodGuard } = desync(methodGuard);
  const { asyncMethod } = {
    // Note purposeful use of `this` and concise method syntax
    asyncMethod(...args) {
      const awaitList = awaitIndexes.map(i => args[i]);
      const p = Promise.all(awaitList);
      const rawArgs = [...args];
      const resultP = E.when(p, awaitedArgs => {
        for (let j = 0; j < awaitIndexes.length; j += 1) {
          rawArgs[awaitIndexes[j]] = awaitedArgs[j];
        }
        defendSyncArgs(rawArgs, rawMethodGuard, label);
        return apply(method, this, rawArgs);
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
  const { klass, callKind } = methodGuard;
  assert(klass === 'methodGuard');
  if (callKind === 'sync') {
    return defendSyncMethod(method, methodGuard, label);
  } else {
    assert(callKind === 'async');
    return defendAsyncMethod(method, methodGuard, label);
  }
};

/**
 *
 * @param {string} methodTag
 * @param {WeakMap} contextMap
 * @param {CallableFunction} behaviorMethod
 * @param {boolean} [thisfulMethods]
 * @param {MethodGuard} [methodGuard]
 */
const bindMethod = (
  methodTag,
  contextMap,
  behaviorMethod,
  thisfulMethods = false,
  methodGuard = undefined,
) => {
  assert.typeof(behaviorMethod, 'function');

  const getContext = self => {
    const context = contextMap.get(self);
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
 * @template {Record<string | symbol, CallableFunction>} T
 * @param {string} tag
 * @param {WeakMap} contextMap
 * @param {T} behaviorMethods
 * @param {boolean} [thisfulMethods]
 * @param {InterfaceGuard} [interfaceGuard]
 * @returns {T & import('@endo/eventual-send').RemotableBrand<{}, T>}
 */
export const defendPrototype = (
  tag,
  contextMap,
  behaviorMethods,
  thisfulMethods = false,
  interfaceGuard = undefined,
) => {
  const prototype = {};
  const methodNames = ownKeys(behaviorMethods).filter(
    // By ignoring any method named "constructor", we can use a
    // class.prototype as a behaviorMethods.
    name => name !== 'constructor',
  );
  let methodGuards;
  if (interfaceGuard) {
    const {
      klass,
      interfaceName,
      methodGuards: mg,
      sloppy = false,
    } = interfaceGuard;
    methodGuards = mg;
    assert.equal(klass, 'Interface');
    assert.typeof(interfaceName, 'string');
    {
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
  }
  for (const prop of methodNames) {
    prototype[prop] = bindMethod(
      `In ${q(prop)} method of (${tag})`,
      contextMap,
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
 * @param {Record<string, WeakMap>} contextMapKit
 * @param {Record<string, Record<string | symbol, CallableFunction>>} behaviorMethodsKit
 * @param {boolean} [thisfulMethods]
 * @param {Record<string, InterfaceGuard>} [interfaceGuardKit]
 */
export const defendPrototypeKit = (
  tag,
  contextMapKit,
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
  const contextMapNames = ownKeys(contextMapKit);
  const extraContextNames = listDifference(facetNames, contextMapNames);
  extraContextNames.length === 0 ||
    Fail`Contexts ${q(extraContextNames)} not implemented by ${q(tag)}`;
  const extraFacetNames = listDifference(contextMapNames, facetNames);
  extraFacetNames.length === 0 ||
    Fail`Facets ${q(extraFacetNames)} of ${q(tag)} missing contexts`;
  return objectMap(behaviorMethodsKit, (behaviorMethods, facetName) =>
    defendPrototype(
      `${tag} ${facetName}`,
      contextMapKit[facetName],
      behaviorMethods,
      thisfulMethods,
      interfaceGuardKit && interfaceGuardKit[facetName],
    ),
  );
};
