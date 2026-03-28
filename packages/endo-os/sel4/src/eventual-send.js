"use strict";
(() => {
  // ../harden/make-hardener.js
  var {
    Array: Array2,
    JSON: JSON2,
    Number: Number2,
    Object: Object2,
    Reflect: Reflect2,
    Set: Set2,
    String: String2,
    Symbol: Symbol2,
    Uint8Array,
    WeakSet
  } = globalThis;
  var {
    // The feral Error constructor is safe for internal use, but must not be
    // revealed to post-lockdown code in any compartment including the start
    // compartment since in V8 at least it bears stack inspection capabilities.
    Error: FERAL_ERROR,
    TypeError: TypeError2
  } = globalThis;
  var {
    freeze,
    getOwnPropertyDescriptor,
    getOwnPropertyDescriptors,
    getPrototypeOf,
    prototype: objectPrototype,
    preventExtensions
  } = Object2;
  var { toStringTag: toStringTagSymbol } = Symbol2;
  var { isInteger } = Number2;
  var { stringify: stringifyJson } = JSON2;
  var { defineProperty: originalDefineProperty } = Object2;
  var defineProperty = (object, prop, descriptor) => {
    const result = originalDefineProperty(object, prop, descriptor);
    if (result !== object) {
      throw TypeError2(
        `Please report that the original defineProperty silently failed to set ${stringifyJson(
          String2(prop)
        )}. (SES_DEFINE_PROPERTY_FAILED_SILENTLY)`
      );
    }
    return result;
  };
  var { apply, ownKeys } = Reflect2;
  var { prototype: arrayPrototype } = Array2;
  var { prototype: setPrototype } = Set2;
  var { prototype: weaksetPrototype } = WeakSet;
  var { prototype: functionPrototype } = Function;
  var typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
  var { bind } = functionPrototype;
  var uncurryThis = bind.bind(bind.call);
  if (!("hasOwn" in Object2)) {
    const ObjectPrototypeHasOwnProperty = objectPrototype.hasOwnProperty;
    const hasOwnShim = (obj, key) => {
      if (obj === void 0 || obj === null) {
        throw TypeError2("Cannot convert undefined or null to object");
      }
      return apply(ObjectPrototypeHasOwnProperty, obj, [key]);
    };
    defineProperty(Object2, "hasOwn", {
      value: hasOwnShim,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }
  var { hasOwn } = Object2;
  var arrayForEach = uncurryThis(arrayPrototype.forEach);
  var setAdd = uncurryThis(setPrototype.add);
  var setForEach = uncurryThis(setPrototype.forEach);
  var setHas = uncurryThis(setPrototype.has);
  var weaksetAdd = uncurryThis(weaksetPrototype.add);
  var weaksetHas = uncurryThis(weaksetPrototype.has);
  var isPrimitive = (val) => !val || typeof val !== "object" && typeof val !== "function";
  var isError = (value) => value instanceof FERAL_ERROR;
  var makeTypeError = () => {
    try {
      null.null;
      throw TypeError2("obligatory");
    } catch (error) {
      return error;
    }
  };
  var typeErrorStackDesc = getOwnPropertyDescriptor(makeTypeError(), "stack");
  var errorStackDesc = getOwnPropertyDescriptor(Error("obligatory"), "stack");
  var feralStackGetter;
  var feralStackSetter;
  if (typeErrorStackDesc !== void 0 && typeErrorStackDesc.get !== void 0) {
    if (
      // In the v8 case as we understand it, all errors have an own stack
      // accessor property, but within the same realm, all these accessor
      // properties have the same getter and have the same setter.
      // This is therefore the case that we repair.
      errorStackDesc !== void 0 && typeof typeErrorStackDesc.get === "function" && typeErrorStackDesc.get === errorStackDesc.get && typeof typeErrorStackDesc.set === "function" && typeErrorStackDesc.set === errorStackDesc.set
    ) {
      feralStackGetter = freeze(typeErrorStackDesc.get);
      feralStackSetter = freeze(typeErrorStackDesc.set);
    } else {
      throw TypeError2(
        "Unexpected Error own stack accessor functions (SES_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)"
      );
    }
  }
  var FERAL_STACK_GETTER = feralStackGetter;
  var FERAL_STACK_SETTER = feralStackSetter;
  var assert2 = (condition) => {
    if (!condition) {
      throw new TypeError2("assertion failed");
    }
  };
  var typedArrayToStringTag = getOwnPropertyDescriptor(
    typedArrayPrototype,
    toStringTagSymbol
  );
  assert2(typedArrayToStringTag);
  var getTypedArrayToStringTag = typedArrayToStringTag.get;
  assert2(getTypedArrayToStringTag);
  var isTypedArray = (object) => {
    const tag = apply(getTypedArrayToStringTag, object, []);
    return tag !== void 0;
  };
  var isCanonicalIntegerIndexString = (propertyKey) => {
    const n = +String2(propertyKey);
    return isInteger(n) && String2(n) === propertyKey;
  };
  var freezeTypedArray = (array) => {
    preventExtensions(array);
    arrayForEach(ownKeys(array), (name) => {
      const desc = getOwnPropertyDescriptor(array, name);
      assert2(desc);
      if (!isCanonicalIntegerIndexString(name)) {
        defineProperty(array, name, {
          ...desc,
          writable: false,
          configurable: false
        });
      }
    });
  };
  var makeHardener = ({ traversePrototypes = false } = {}) => {
    const hardened = new WeakSet();
    const { harden: harden2 } = {
      /**
       * @template T
       * @param {T} root
       * @returns {T}
       */
      harden(root) {
        const toFreeze = new Set2();
        function enqueue(val) {
          if (isPrimitive(val)) {
            return;
          }
          const type = typeof val;
          if (type !== "object" && type !== "function") {
            throw TypeError2(`Unexpected typeof: ${type}`);
          }
          if (weaksetHas(hardened, val) || setHas(toFreeze, val)) {
            return;
          }
          setAdd(toFreeze, val);
        }
        const baseFreezeAndTraverse = (obj) => {
          if (isTypedArray(obj)) {
            freezeTypedArray(obj);
          } else {
            freeze(obj);
          }
          const descs = getOwnPropertyDescriptors(obj);
          if (traversePrototypes) {
            const proto = getPrototypeOf(obj);
            enqueue(proto);
          }
          arrayForEach(ownKeys(descs), (name) => {
            const desc = descs[
              /** @type {string} */
              name
            ];
            if (hasOwn(desc, "value")) {
              enqueue(desc.value);
            } else {
              enqueue(desc.get);
              enqueue(desc.set);
            }
          });
        };
        const freezeAndTraverse = FERAL_STACK_GETTER === void 0 && FERAL_STACK_SETTER === void 0 ? (
          // On platforms without v8's error own stack accessor problem,
          // don't pay for any extra overhead.
          baseFreezeAndTraverse
        ) : (obj) => {
          if (isError(obj)) {
            const stackDesc = getOwnPropertyDescriptor(obj, "stack");
            if (stackDesc && stackDesc.get === FERAL_STACK_GETTER && stackDesc.configurable) {
              defineProperty(obj, "stack", {
                // NOTE: Calls getter during harden, which seems dangerous.
                // But we're only calling the problematic getter whose
                // hazards we think we understand.
                // @ts-expect-error TS should know FERAL_STACK_GETTER
                // cannot be `undefined` here.
                // See https://github.com/endojs/endo/pull/2232#discussion_r1575179471
                value: apply(FERAL_STACK_GETTER, obj, [])
              });
            }
          }
          return baseFreezeAndTraverse(obj);
        };
        const dequeue = () => {
          setForEach(toFreeze, freezeAndTraverse);
        };
        const markHardened = (value) => {
          weaksetAdd(hardened, value);
        };
        const commit = () => {
          setForEach(toFreeze, markHardened);
        };
        enqueue(root);
        dequeue();
        commit();
        return root;
      }
    };
    return harden2;
  };

  // ../harden/make-selector.js
  var symbolForHarden = /* @__PURE__ */ Symbol.for("harden");
  var makeHardenerSelector = (makeHardener2) => {
    const selectHarden = () => {
      const { [symbolForHarden]: objectHarden } = Object;
      if (objectHarden) {
        if (typeof objectHarden !== "function") {
          throw new Error("@endo/harden expected callable Object[@harden]");
        }
        return objectHarden;
      }
      const { harden: globalHarden } = globalThis;
      if (globalHarden) {
        if (typeof globalHarden !== "function") {
          throw new Error("@endo/harden expected callable globalThis.harden");
        }
        return globalHarden;
      }
      const harden3 = makeHardener2();
      Object.defineProperty(Object, symbolForHarden, {
        value: harden3,
        configurable: false,
        writable: false
      });
      return harden3;
    };
    let selectedHarden;
    const harden2 = (object) => {
      if (!selectedHarden) {
        selectedHarden = selectHarden();
      }
      return selectedHarden(object);
    };
    Object.freeze(harden2);
    return harden2;
  };

  // ../harden/index.js
  var harden = makeHardenerSelector(
    () => makeHardener({ traversePrototypes: false })
  );
  var harden_default = harden;

  // ../env-options/src/env-options.js
  var localThis = globalThis;
  var { Object: Object3, Reflect: Reflect3, Array: Array3, String: String3, JSON: JSON3, Error: Error2 } = localThis;
  var { freeze: freeze2 } = Object3;
  var { apply: apply2 } = Reflect3;
  var uncurryThis2 = (fn) => (receiver, ...args) => apply2(fn, receiver, args);
  var arrayPush = uncurryThis2(Array3.prototype.push);
  var arrayIncludes = uncurryThis2(Array3.prototype.includes);
  var stringSplit = uncurryThis2(String3.prototype.split);
  var q = JSON3.stringify;
  var Fail = (literals, ...args) => {
    let msg = literals[0];
    for (let i = 0; i < args.length; i += 1) {
      msg = `${msg}${args[i]}${literals[i + 1]}`;
    }
    throw Error2(msg);
  };
  var makeEnvironmentCaptor = (aGlobal, dropNames = false) => {
    const capturedEnvironmentOptionNames = [];
    const getEnvironmentOption2 = (optionName, defaultSetting, optOtherValues = void 0) => {
      typeof optionName === "string" || Fail`Environment option name ${q(optionName)} must be a string.`;
      typeof defaultSetting === "string" || Fail`Environment option default setting ${q(
        defaultSetting
      )} must be a string.`;
      let setting = defaultSetting;
      const globalProcess = aGlobal.process || void 0;
      const globalEnv = typeof globalProcess === "object" && globalProcess.env || void 0;
      if (typeof globalEnv === "object") {
        if (optionName in globalEnv) {
          if (!dropNames) {
            arrayPush(capturedEnvironmentOptionNames, optionName);
          }
          const optionValue = globalEnv[optionName];
          typeof optionValue === "string" || Fail`Environment option named ${q(
            optionName
          )}, if present, must have a corresponding string value, got ${q(
            optionValue
          )}`;
          setting = optionValue;
        }
      }
      optOtherValues === void 0 || setting === defaultSetting || arrayIncludes(optOtherValues, setting) || Fail`Unrecognized ${q(optionName)} value ${q(
        setting
      )}. Expected one of ${q([defaultSetting, ...optOtherValues])}`;
      return setting;
    };
    freeze2(getEnvironmentOption2);
    const getEnvironmentOptionsList2 = (optionName) => {
      const option = getEnvironmentOption2(optionName, "");
      return freeze2(option === "" ? [] : stringSplit(option, ","));
    };
    freeze2(getEnvironmentOptionsList2);
    const environmentOptionsListHas2 = (optionName, element) => arrayIncludes(getEnvironmentOptionsList2(optionName), element);
    const getCapturedEnvironmentOptionNames = () => {
      return freeze2([...capturedEnvironmentOptionNames]);
    };
    freeze2(getCapturedEnvironmentOptionNames);
    return freeze2({
      getEnvironmentOption: getEnvironmentOption2,
      getEnvironmentOptionsList: getEnvironmentOptionsList2,
      environmentOptionsListHas: environmentOptionsListHas2,
      getCapturedEnvironmentOptionNames
    });
  };
  freeze2(makeEnvironmentCaptor);
  var {
    getEnvironmentOption,
    getEnvironmentOptionsList,
    environmentOptionsListHas
  } = makeEnvironmentCaptor(localThis, true);

  // ../eventual-send/src/track-turns.js
  var hiddenPriorError;
  var hiddenCurrentTurn = 0;
  var hiddenCurrentEvent = 0;
  var VERBOSE = environmentOptionsListHas("DEBUG", "track-turns");
  var ENABLED = (
    /** @type {'disabled' | 'enabled'} */
    getEnvironmentOption("TRACK_TURNS", "disabled", ["enabled"]) === "enabled"
  );
  var addRejectionNote = (detailsNote) => (reason) => {
    if (reason instanceof Error) {
      globalThis.assert.note(reason, detailsNote);
    }
    if (VERBOSE) {
      console.log("REJECTED at top of event loop", reason);
    }
  };
  var wrapFunction = (func, sendingError, X3) => (...args) => {
    hiddenPriorError = sendingError;
    hiddenCurrentTurn += 1;
    hiddenCurrentEvent = 0;
    try {
      let result;
      try {
        result = func(...args);
      } catch (err) {
        if (err instanceof Error) {
          globalThis.assert.note(
            err,
            X3`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`
          );
        }
        if (VERBOSE) {
          console.log("THROWN to top of event loop", err);
        }
        throw err;
      }
      const detailsNote = X3`Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
      Promise.resolve(result).catch(addRejectionNote(detailsNote));
      return result;
    } finally {
      hiddenPriorError = void 0;
    }
  };
  var trackTurns = (funcs) => {
    if (!ENABLED || typeof globalThis === "undefined" || !globalThis.assert) {
      return funcs;
    }
    const { details: X3, note: annotateError2 } = globalThis.assert;
    hiddenCurrentEvent += 1;
    const sendingError = Error(
      `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`
    );
    if (hiddenPriorError !== void 0) {
      annotateError2(sendingError, X3`Caused by: ${hiddenPriorError}`);
    }
    return (
      /** @type {T} */
      funcs.map((func) => func && wrapFunction(func, sendingError, X3))
    );
  };

  // ../eventual-send/src/message-breakpoints.js
  var { quote: q2, Fail: Fail2 } = assert;
  var { hasOwn: hasOwn2, freeze: freeze3, entries } = Object;
  var isJSONRecord = (val) => typeof val === "object" && val !== null && !Array.isArray(val);
  var simplifyTag = (tag) => {
    for (const prefix of ["Alleged: ", "DebugName: "]) {
      if (tag.startsWith(prefix)) {
        return tag.slice(prefix.length);
      }
    }
    return tag;
  };
  var makeMessageBreakpointTester = (optionName) => {
    let breakpoints = JSON.parse(getEnvironmentOption(optionName, "null"));
    if (breakpoints === null) {
      return void 0;
    }
    let breakpointsTable;
    const getBreakpoints = () => breakpoints;
    freeze3(getBreakpoints);
    const setBreakpoints = (newBreakpoints = breakpoints) => {
      isJSONRecord(newBreakpoints) || Fail2`Expected ${q2(optionName)} option to be a JSON breakpoints record`;
      const newBreakpointsTable = { __proto__: null };
      for (const [tag, methodBPs] of entries(newBreakpoints)) {
        tag === simplifyTag(tag) || Fail2`Just use simple tag ${q2(simplifyTag(tag))} rather than ${q2(tag)}`;
        isJSONRecord(methodBPs) || Fail2`Expected ${q2(optionName)} option's ${q2(
          tag
        )} to be a JSON methods breakpoints record`;
        for (const [methodName, count] of entries(methodBPs)) {
          count === "*" || typeof count === "number" && Number.isSafeInteger(count) && count >= 0 || Fail2`Expected ${q2(optionName)} option's ${q2(tag)}.${q2(
            methodName
          )} to be "*" or a non-negative integer`;
          const classBPs = hasOwn2(newBreakpointsTable, methodName) ? newBreakpointsTable[methodName] : newBreakpointsTable[methodName] = {
            // @ts-expect-error confused by __proto__
            __proto__: null
          };
          classBPs[tag] = count;
        }
      }
      breakpoints = newBreakpoints;
      breakpointsTable = newBreakpointsTable;
    };
    freeze3(setBreakpoints);
    const shouldBreakpoint = (recipient, methodName) => {
      if (methodName === void 0 || methodName === null) {
        return false;
      }
      const classBPs = breakpointsTable[methodName] || breakpointsTable["*"];
      if (classBPs === void 0) {
        return false;
      }
      let tag = simplifyTag(recipient[Symbol.toStringTag]);
      let count = classBPs[tag];
      if (count === void 0) {
        tag = "*";
        count = classBPs[tag];
        if (count === void 0) {
          return false;
        }
      }
      if (count === "*") {
        return true;
      }
      if (count === 0) {
        return true;
      }
      assert(typeof count === "number" && count >= 1);
      classBPs[tag] = count - 1;
      return false;
    };
    freeze3(shouldBreakpoint);
    const breakpointTester = freeze3({
      getBreakpoints,
      setBreakpoints,
      shouldBreakpoint
    });
    breakpointTester.setBreakpoints();
    return breakpointTester;
  };
  freeze3(makeMessageBreakpointTester);

  // ../eventual-send/src/local.js
  var { details: X, quote: q3, Fail: Fail3 } = assert;
  var { getOwnPropertyDescriptors: getOwnPropertyDescriptors2, getPrototypeOf: getPrototypeOf2, freeze: freeze4 } = Object;
  var { apply: apply3, ownKeys: ownKeys2 } = Reflect;
  var ntypeof = (specimen) => specimen === null ? "null" : typeof specimen;
  var onDelivery = makeMessageBreakpointTester("ENDO_DELIVERY_BREAKPOINTS");
  var isPrimitive2 = (val) => !val || typeof val !== "object" && typeof val !== "function";
  var compareStringified = (a, b) => {
    if (typeof a === typeof b) {
      const left = String(a);
      const right = String(b);
      return left < right ? -1 : left > right ? 1 : 0;
    }
    if (typeof a === "symbol") {
      assert(typeof b === "string");
      return -1;
    }
    assert(typeof a === "string");
    assert(typeof b === "symbol");
    return 1;
  };
  var getMethodNames = (val) => {
    let layer = val;
    const names = /* @__PURE__ */ new Set();
    while (layer !== null && layer !== Object.prototype) {
      const descs = getOwnPropertyDescriptors2(layer);
      for (const name of ownKeys2(descs)) {
        if (typeof val[name] === "function") {
          names.add(name);
        }
      }
      if (isPrimitive2(val)) {
        break;
      }
      layer = getPrototypeOf2(layer);
    }
    return harden_default([...names].sort(compareStringified));
  };
  freeze4(getMethodNames);
  var localApplyFunction = (recipient, args) => {
    typeof recipient === "function" || assert.fail(
      X`Cannot invoke target as a function; typeof target is ${q3(
        ntypeof(recipient)
      )}`,
      TypeError
    );
    if (onDelivery && onDelivery.shouldBreakpoint(recipient, void 0)) {
      debugger;
    }
    const result = apply3(recipient, void 0, args);
    return result;
  };
  var localApplyMethod = (recipient, methodName, args) => {
    if (methodName === void 0 || methodName === null) {
      return localApplyFunction(recipient, args);
    }
    if (recipient === void 0 || recipient === null) {
      assert.fail(
        X`Cannot deliver ${q3(methodName)} to target; typeof target is ${q3(
          ntypeof(recipient)
        )}`,
        TypeError
      );
    }
    const fn = recipient[methodName];
    if (fn === void 0) {
      assert.fail(
        X`target has no method ${q3(methodName)}, has ${q3(
          getMethodNames(recipient)
        )}`,
        TypeError
      );
    }
    const ftype = ntypeof(fn);
    typeof fn === "function" || Fail3`invoked method ${q3(methodName)} is not a function; it is a ${q3(
      ftype
    )}`;
    if (onDelivery && onDelivery.shouldBreakpoint(recipient, methodName)) {
      debugger;
    }
    const result = apply3(fn, recipient, args);
    return result;
  };
  var localGet = (t, key) => t[key];

  // ../eventual-send/src/postponed.js
  var makePostponedHandler = (HandledPromise) => {
    let donePostponing;
    const interlockP = new Promise((resolve) => {
      donePostponing = () => resolve(void 0);
    });
    const makePostponedOperation = (postponedOperation) => {
      return function postpone(x, ...args) {
        return new HandledPromise((resolve, reject) => {
          interlockP.then((_) => {
            resolve(HandledPromise[postponedOperation](x, ...args));
          }).catch(reject);
        });
      };
    };
    const postponedHandler = {
      get: makePostponedOperation("get"),
      getSendOnly: makePostponedOperation("getSendOnly"),
      applyFunction: makePostponedOperation("applyFunction"),
      applyFunctionSendOnly: makePostponedOperation("applyFunctionSendOnly"),
      applyMethod: makePostponedOperation("applyMethod"),
      applyMethodSendOnly: makePostponedOperation("applyMethodSendOnly")
    };
    assert(donePostponing);
    return [postponedHandler, donePostponing];
  };

  // ../eventual-send/src/handled-promise.js
  var { Fail: Fail4, details: X2, quote: q4, note: annotateError } = assert;
  var {
    create,
    freeze: freeze5,
    getOwnPropertyDescriptor: getOwnPropertyDescriptor2,
    getOwnPropertyDescriptors: getOwnPropertyDescriptors3,
    defineProperties,
    getPrototypeOf: getPrototypeOf3,
    setPrototypeOf,
    isFrozen,
    is: objectIs
  } = Object;
  var { apply: apply4, construct, ownKeys: ownKeys3 } = Reflect;
  var SEND_ONLY_RE = /^(.*)SendOnly$/;
  var coerceToObjectProperty = (specimen) => {
    if (typeof specimen === "symbol") {
      return specimen;
    }
    return String(specimen);
  };
  var makeHandledPromise = () => {
    const presenceToHandler = /* @__PURE__ */ new WeakMap();
    const presenceToPromise = /* @__PURE__ */ new WeakMap();
    const promiseToPendingHandler = /* @__PURE__ */ new WeakMap();
    const promiseToPresence = /* @__PURE__ */ new WeakMap();
    const forwardedPromiseToPromise = /* @__PURE__ */ new WeakMap();
    const shorten = (target) => {
      let p = target;
      while (forwardedPromiseToPromise.has(p)) {
        p = forwardedPromiseToPromise.get(p);
      }
      const presence = promiseToPresence.get(p);
      if (presence) {
        while (!objectIs(target, p)) {
          const parent = forwardedPromiseToPromise.get(target);
          forwardedPromiseToPromise.delete(target);
          promiseToPendingHandler.delete(target);
          promiseToPresence.set(target, presence);
          target = parent;
        }
      } else {
        while (!objectIs(target, p)) {
          const parent = forwardedPromiseToPromise.get(target);
          forwardedPromiseToPromise.set(target, p);
          promiseToPendingHandler.delete(target);
          target = parent;
        }
      }
      return target;
    };
    let forwardingHandler;
    let handle;
    const dispatchToHandler = (handlerName, handler, operation, o, opArgs, returnedP) => {
      let actualOp = operation;
      const matchSendOnly = SEND_ONLY_RE.exec(actualOp);
      const makeResult = (result) => matchSendOnly ? void 0 : result;
      if (matchSendOnly) {
        returnedP = void 0;
      }
      if (matchSendOnly && typeof handler[actualOp] !== "function") {
        actualOp = /** @type {'get' | 'applyMethod' | 'applyFunction'} */
        matchSendOnly[1];
      }
      const hfn = handler[actualOp];
      if (typeof hfn === "function") {
        const result = apply4(hfn, handler, [o, ...opArgs, returnedP]);
        return makeResult(result);
      }
      if (actualOp === "applyMethod") {
        const [prop, args] = opArgs;
        const getResultP = handle(
          o,
          "get",
          // The argument to 'get' is a string or symbol.
          [coerceToObjectProperty(prop)],
          void 0
        );
        return makeResult(handle(getResultP, "applyFunction", [args], returnedP));
      }
      if (actualOp === "applyFunction") {
        const amfn = handler.applyMethod;
        if (typeof amfn === "function") {
          const [args] = opArgs;
          const result = apply4(amfn, handler, [o, void 0, [args], returnedP]);
          return makeResult(result);
        }
      }
      throw assert.fail(
        X2`${q4(handlerName)} is defined but has no methods needed for ${q4(
          operation
        )} (has ${q4(getMethodNames(handler))})`,
        TypeError
      );
    };
    let HandledPromise;
    function baseHandledPromise(executor, pendingHandler = void 0) {
      new.target || Fail4`must be invoked with "new"`;
      let handledResolve;
      let handledReject;
      let resolved = false;
      let resolvedTarget = null;
      let handledP;
      let continueForwarding = () => {
      };
      const assertNotYetForwarded = () => {
        !forwardedPromiseToPromise.has(handledP) || assert.fail(X2`internal: already forwarded`, TypeError);
      };
      const superExecutor = (superResolve, superReject) => {
        handledResolve = (value) => {
          if (resolved) {
            return;
          }
          assertNotYetForwarded();
          value = shorten(value);
          let targetP;
          if (promiseToPendingHandler.has(value) || promiseToPresence.has(value)) {
            targetP = value;
          } else {
            promiseToPendingHandler.delete(handledP);
            targetP = presenceToPromise.get(value);
          }
          if (targetP && !objectIs(targetP, handledP)) {
            forwardedPromiseToPromise.set(handledP, targetP);
          } else {
            forwardedPromiseToPromise.delete(handledP);
          }
          shorten(handledP);
          superResolve(value);
          resolved = true;
          resolvedTarget = value;
          continueForwarding();
        };
        handledReject = (reason) => {
          if (resolved) {
            return;
          }
          harden_default(reason);
          assertNotYetForwarded();
          promiseToPendingHandler.delete(handledP);
          resolved = true;
          superReject(reason);
          continueForwarding();
        };
      };
      handledP = harden_default(construct(Promise, [superExecutor], new.target));
      if (!pendingHandler) {
        [pendingHandler, continueForwarding] = makePostponedHandler(HandledPromise);
      }
      const validateHandler = (h) => {
        Object(h) === h || assert.fail(X2`Handler ${h} cannot be a primitive`, TypeError);
      };
      validateHandler(pendingHandler);
      promiseToPendingHandler.set(handledP, pendingHandler);
      const rejectHandled = (reason) => {
        if (resolved) {
          return;
        }
        assertNotYetForwarded();
        handledReject(reason);
      };
      const resolveWithPresence = (presenceHandler = pendingHandler, options = {}) => {
        if (resolved) {
          return resolvedTarget;
        }
        assertNotYetForwarded();
        try {
          validateHandler(presenceHandler);
          const { proxy: proxyOpts } = options;
          let presence;
          if (proxyOpts) {
            const {
              handler: proxyHandler,
              // The proxy target can be frozen but should not be hardened
              // so it remains trapping.
              // See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
              target: proxyTarget,
              revokerCallback
            } = proxyOpts;
            if (revokerCallback) {
              const { proxy, revoke } = Proxy.revocable(
                proxyTarget,
                proxyHandler
              );
              presence = proxy;
              revokerCallback(revoke);
            } else {
              presence = new Proxy(proxyTarget, proxyHandler);
            }
          } else {
            presence = create(null);
          }
          resolvedTarget = presence;
          presenceToPromise.set(resolvedTarget, handledP);
          promiseToPresence.set(handledP, resolvedTarget);
          presenceToHandler.set(resolvedTarget, presenceHandler);
          handledResolve(resolvedTarget);
          return resolvedTarget;
        } catch (e) {
          annotateError(e, X2`during resolveWithPresence`);
          handledReject(e);
          throw e;
        }
      };
      const resolveHandled = (target) => {
        if (resolved) {
          return;
        }
        assertNotYetForwarded();
        try {
          handledResolve(target);
        } catch (e) {
          handledReject(e);
        }
      };
      executor(resolveHandled, rejectHandled, resolveWithPresence);
      return handledP;
    }
    const isSafePromise = (p) => {
      return isFrozen(p) && getPrototypeOf3(p) === Promise.prototype && Promise.resolve(p) === p && getOwnPropertyDescriptor2(p, "then") === void 0 && getOwnPropertyDescriptor2(p, "constructor") === void 0;
    };
    const staticMethods = {
      get(target, prop) {
        prop = coerceToObjectProperty(prop);
        return handle(target, "get", [prop]);
      },
      getSendOnly(target, prop) {
        prop = coerceToObjectProperty(prop);
        handle(target, "getSendOnly", [prop]).catch(() => {
        });
      },
      applyFunction(target, args) {
        args = [...args];
        return handle(target, "applyFunction", [args]);
      },
      applyFunctionSendOnly(target, args) {
        args = [...args];
        handle(target, "applyFunctionSendOnly", [args]).catch(() => {
        });
      },
      applyMethod(target, prop, args) {
        prop = coerceToObjectProperty(prop);
        args = [...args];
        return handle(target, "applyMethod", [prop, args]);
      },
      applyMethodSendOnly(target, prop, args) {
        prop = coerceToObjectProperty(prop);
        args = [...args];
        handle(target, "applyMethodSendOnly", [prop, args]).catch(() => {
        });
      },
      resolve(value) {
        let resolvedPromise = presenceToPromise.get(
          /** @type {any} */
          value
        );
        if (!resolvedPromise) {
          resolvedPromise = Promise.resolve(value);
        }
        harden_default(resolvedPromise);
        if (isSafePromise(resolvedPromise)) {
          return resolvedPromise;
        }
        const executeThen = (resolve, reject) => resolvedPromise.then(resolve, reject);
        return harden_default(
          Promise.resolve().then(() => new HandledPromise(executeThen))
        );
      }
    };
    const makeForwarder = (operation, localImpl) => {
      return (o, ...args) => {
        const presenceHandler = presenceToHandler.get(o);
        if (!presenceHandler) {
          return localImpl(o, ...args);
        }
        return dispatchToHandler(
          "presenceHandler",
          presenceHandler,
          operation,
          o,
          args
        );
      };
    };
    forwardingHandler = {
      get: makeForwarder("get", localGet),
      getSendOnly: makeForwarder("getSendOnly", localGet),
      applyFunction: makeForwarder("applyFunction", localApplyFunction),
      applyFunctionSendOnly: makeForwarder(
        "applyFunctionSendOnly",
        localApplyFunction
      ),
      applyMethod: makeForwarder("applyMethod", localApplyMethod),
      applyMethodSendOnly: makeForwarder("applyMethodSendOnly", localApplyMethod)
    };
    handle = (...handleArgs) => {
      harden_default(handleArgs);
      const [_p, operation, opArgs, ...dispatchArgs] = handleArgs;
      let [p] = handleArgs;
      const doDispatch = (handlerName, handler, o) => dispatchToHandler(
        handlerName,
        handler,
        operation,
        o,
        opArgs,
        ...dispatchArgs.length === 0 ? [returnedP] : dispatchArgs
      );
      const [trackedDoDispatch] = trackTurns([doDispatch]);
      const returnedP = new HandledPromise((resolve, reject) => {
        let raceIsOver = false;
        const win = (handlerName, handler, o) => {
          if (raceIsOver) {
            return;
          }
          try {
            resolve(harden_default(trackedDoDispatch(handlerName, handler, o)));
          } catch (reason) {
            reject(harden_default(reason));
          }
          raceIsOver = true;
        };
        const lose = (reason) => {
          if (raceIsOver) {
            return;
          }
          reject(harden_default(reason));
          raceIsOver = true;
        };
        staticMethods.resolve(p).then((o) => win("forwardingHandler", forwardingHandler, o)).catch(lose);
        staticMethods.resolve().then(() => {
          p = shorten(p);
          const pendingHandler = promiseToPendingHandler.get(p);
          if (pendingHandler) {
            win("pendingHandler", pendingHandler, p);
          } else if (!p || typeof p.then !== "function") {
            win("forwardingHandler", forwardingHandler, p);
          } else if (promiseToPresence.has(p)) {
            const o = promiseToPresence.get(p);
            win("forwardingHandler", forwardingHandler, o);
          }
        }).catch(lose);
      });
      return harden_default(returnedP);
    };
    baseHandledPromise.prototype = Promise.prototype;
    setPrototypeOf(baseHandledPromise, Promise);
    defineProperties(
      baseHandledPromise,
      getOwnPropertyDescriptors3(staticMethods)
    );
    HandledPromise = baseHandledPromise;
    freeze5(HandledPromise);
    for (const key of ownKeys3(HandledPromise)) {
      if (key !== "prototype") {
        freeze5(HandledPromise[key]);
      }
    }
    return HandledPromise;
  };

  // ../eventual-send/shim.js
  if (typeof globalThis.HandledPromise === "undefined") {
    globalThis.HandledPromise = makeHandledPromise();
  }
})();
