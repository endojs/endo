var EndoDaemon = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b2) => (typeof require !== "undefined" ? require : a)[b2]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // sel4-entry.js
  var sel4_entry_exports = {};
  __export(sel4_entry_exports, {
    makeDaemon: () => makeDaemon
  });

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
    Uint8Array: Uint8Array2,
    WeakSet: WeakSet2
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
  var { prototype: weaksetPrototype } = WeakSet2;
  var { prototype: functionPrototype } = Function;
  var typedArrayPrototype = getPrototypeOf(Uint8Array2.prototype);
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
    const hardened = new WeakSet2();
    const { harden: harden3 } = {
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
    return harden3;
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
      const harden4 = makeHardener2();
      Object.defineProperty(Object, symbolForHarden, {
        value: harden4,
        configurable: false,
        writable: false
      });
      return harden4;
    };
    let selectedHarden;
    const harden3 = (object) => {
      if (!selectedHarden) {
        selectedHarden = selectHarden();
      }
      return selectedHarden(object);
    };
    Object.freeze(harden3);
    return harden3;
  };

  // ../harden/index.js
  var harden2 = makeHardenerSelector(
    () => makeHardener({ traversePrototypes: false })
  );
  var harden_default = harden2;

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
  var wrapFunction = (func, sendingError, X5) => (...args) => {
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
            X5`Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`
          );
        }
        if (VERBOSE) {
          console.log("THROWN to top of event loop", err);
        }
        throw err;
      }
      const detailsNote = X5`Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
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
    const { details: X5, note: annotateError3 } = globalThis.assert;
    hiddenCurrentEvent += 1;
    const sendingError = Error(
      `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`
    );
    if (hiddenPriorError !== void 0) {
      annotateError3(sendingError, X5`Caused by: ${hiddenPriorError}`);
    }
    return (
      /** @type {T} */
      funcs.map((func) => func && wrapFunction(func, sendingError, X5))
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
  var compareStringified = (a, b2) => {
    if (typeof a === typeof b2) {
      const left = String(a);
      const right = String(b2);
      return left < right ? -1 : left > right ? 1 : 0;
    }
    if (typeof a === "symbol") {
      assert(typeof b2 === "string");
      return -1;
    }
    assert(typeof a === "string");
    assert(typeof b2 === "symbol");
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
  var makePostponedHandler = (HandledPromise2) => {
    let donePostponing;
    const interlockP = new Promise((resolve) => {
      donePostponing = () => resolve(void 0);
    });
    const makePostponedOperation = (postponedOperation) => {
      return function postpone(x, ...args) {
        return new HandledPromise2((resolve, reject) => {
          interlockP.then((_) => {
            resolve(HandledPromise2[postponedOperation](x, ...args));
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
    let HandledPromise2;
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
        [pendingHandler, continueForwarding] = makePostponedHandler(HandledPromise2);
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
    const isSafePromise2 = (p) => {
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
        if (isSafePromise2(resolvedPromise)) {
          return resolvedPromise;
        }
        const executeThen = (resolve, reject) => resolvedPromise.then(resolve, reject);
        return harden_default(
          Promise.resolve().then(() => new HandledPromise2(executeThen))
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
      const returnedP = new HandledPromise2((resolve, reject) => {
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
    HandledPromise2 = baseHandledPromise;
    freeze5(HandledPromise2);
    for (const key of ownKeys3(HandledPromise2)) {
      if (key !== "prototype") {
        freeze5(HandledPromise2[key]);
      }
    }
    return HandledPromise2;
  };

  // ../eventual-send/shim.js
  if (typeof globalThis.HandledPromise === "undefined") {
    globalThis.HandledPromise = makeHandledPromise();
  }

  // ../common/object-map.js
  var typedEntries = (
    /** @type {TypedEntries} */
    Object.entries
  );
  var fromTypedEntries = (
    /** @type {FromTypedEntries} */
    Object.fromEntries
  );
  var typedMap = (
    /** @type {TypedMap} */
    Function.prototype.call.bind(Array.prototype.map)
  );
  var objectMap = (original, mapFn) => {
    const oldEntries = typedEntries(original);
    const mapEntry = ([k, v]) => [k, mapFn(v, k)];
    const newEntries = typedMap(oldEntries, mapEntry);
    const newObj = fromTypedEntries(newEntries);
    return (
      /** @type {any} */
      harden_default(newObj)
    );
  };
  harden_default(objectMap);

  // ../errors/index.js
  var { defineProperty: defineProperty2 } = Object;
  var globalAssert = globalThis.assert;
  if (globalAssert === void 0) {
    throw Error(
      `Cannot initialize @endo/errors, missing globalThis.assert, import 'ses' before '@endo/errors'`
    );
  }
  var missing = [
    "typeof",
    "fail",
    "equal",
    "string",
    "note",
    "details",
    "Fail",
    "quote",
    // As of 2025-07, the Agoric chain's bootstrap vat runs with a version of SES
    // that predates addition of the 'bare' and 'makeError' methods, so we must
    // tolerate their absence and fall back to other behavior in that environment
    // (see below).
    // 'bare',
    // 'makeError',
    "makeAssert"
  ].filter((name) => globalAssert[name] === void 0);
  if (globalAssert.makeError === void 0 && globalAssert.error === void 0) {
    missing.push("makeError");
  }
  if (missing.length > 0) {
    throw Error(
      `Cannot initialize @endo/errors, missing globalThis.assert methods ${missing.join(
        ", "
      )}`
    );
  }
  var {
    bare: globalBare,
    details,
    error: globalError,
    Fail: Fail5,
    makeAssert: _omittedMakeAssert,
    makeError: globalMakeError,
    note,
    quote,
    ...assertions
  } = globalAssert;
  var assert3 = (value, optDetails, errContructor, options) => globalAssert(value, optDetails, errContructor, options);
  Object.assign(assert3, assertions);
  var bare = globalBare || quote;
  var makeError = globalMakeError || globalError;
  var b = bare;
  var X3 = details;
  var q5 = quote;
  var annotateError2 = note;
  var hideAndHardenFunction = (func) => {
    typeof func === "function" || Fail5`${func} must be a function`;
    const { name } = func;
    defineProperty2(func, "name", {
      // Use `String` in case `name` is a symbol.
      value: `__HIDE_${String(name)}`
    });
    return harden_default(func);
  };

  // ../eventual-send/src/E.js
  var { details: X4, quote: q6, Fail: Fail6, error: makeError2 } = assert;
  var { assign, freeze: freeze6 } = Object;
  var onSend = makeMessageBreakpointTester("ENDO_SEND_BREAKPOINTS");
  var baseFreezableProxyHandler = {
    set(_target, _prop, _value) {
      return false;
    },
    isExtensible(_target) {
      return false;
    },
    setPrototypeOf(_target, _value) {
      return false;
    },
    deleteProperty(_target, _prop) {
      return false;
    }
  };
  var makeEProxyHandler = (recipient, HandledPromise2) => harden_default({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden_default(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => Promise<unknown>} */
          [propertyKey](...args) {
            if (this !== receiver) {
              return HandledPromise2.reject(
                makeError2(
                  X4`Unexpected receiver for "${q6(propertyKey)}" method of E(${q6(
                    recipient
                  )})`
                )
              );
            }
            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              debugger;
            }
            return HandledPromise2.applyMethod(recipient, propertyKey, args);
          }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey]
      );
    },
    apply: (_target, _thisArg, argArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, void 0)) {
        debugger;
      }
      return HandledPromise2.applyFunction(recipient, argArray);
    },
    has: (_target, _p) => {
      return true;
    }
  });
  var makeESendOnlyProxyHandler = (recipient, HandledPromise2) => harden_default({
    ...baseFreezableProxyHandler,
    get: (_target, propertyKey, receiver) => {
      return harden_default(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          /** @type {(...args: any[]) => undefined} */
          [propertyKey](...args) {
            this === receiver || Fail6`Unexpected receiver for "${q6(
              propertyKey
            )}" method of E.sendOnly(${q6(recipient)})`;
            if (onSend && onSend.shouldBreakpoint(recipient, propertyKey)) {
              debugger;
            }
            HandledPromise2.applyMethodSendOnly(recipient, propertyKey, args);
            return void 0;
          }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
        }[propertyKey]
      );
    },
    apply: (_target, _thisArg, argsArray = []) => {
      if (onSend && onSend.shouldBreakpoint(recipient, void 0)) {
        debugger;
      }
      HandledPromise2.applyFunctionSendOnly(recipient, argsArray);
      return void 0;
    },
    has: (_target, _p) => {
      return true;
    }
  });
  var makeEGetProxyHandler = (x, HandledPromise2) => harden_default({
    ...baseFreezableProxyHandler,
    has: (_target, _prop) => true,
    get: (_target, prop) => HandledPromise2.get(x, prop)
  });
  var funcTarget = freeze6(() => {
  });
  var objTarget = freeze6({ __proto__: null });
  var makeE = (HandledPromise2) => {
    return harden_default(
      assign(
        /**
         * E(x) returns a proxy on which you can call arbitrary methods. Each of these
         * method calls returns a promise. The method will be invoked on whatever
         * 'x' designates (or resolves to) in a future turn, not this one.
         *
         * An example call would be
         *
         * E(zoe).install(bundle)
         *   .then(installationHandle => { ... })
         *   .catch(err => { ... });
         *
         *  See https://endojs.github.io/endo/functions/_endo_far.E.html for details.
         *
         * @template T
         * @param {T} x target for method/function call
         * @returns {ECallableOrMethods<RemoteFunctions<T>>} method/function call proxy
         */
        // @ts-expect-error XXX typedef
        (x) => new Proxy(funcTarget, makeEProxyHandler(x, HandledPromise2)),
        {
          /**
           * E.get(x) returns a proxy on which you can get arbitrary properties.
           * Each of these properties returns a promise for the property.  The promise
           * value will be the property fetched from whatever 'x' designates (or
           * resolves to) in a future turn, not this one.
           *
           * @template T
           * @param {T} x target for property get
           * @returns {EGetters<LocalRecord<T>>} property get proxy
           * @readonly
           */
          // @ts-expect-error XXX typedef
          get: (x) => new Proxy(objTarget, makeEGetProxyHandler(x, HandledPromise2)),
          /**
           * E.resolve(x) converts x to a handled promise. It is
           * shorthand for HandledPromise.resolve(x)
           *
           * @template T
           * @param {T} x value to convert to a handled promise
           * @returns {Promise<Awaited<T>>} handled promise for x
           * @readonly
           */
          resolve: HandledPromise2.resolve,
          /**
           * E.sendOnly returns a proxy similar to E, but for which the results
           * are ignored (undefined is returned).
           *
           * @template T
           * @param {T} x target for method/function call
           * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
           * @readonly
           */
          sendOnly: (x) => (
            // @ts-expect-error XXX typedef
            new Proxy(funcTarget, makeESendOnlyProxyHandler(x, HandledPromise2))
          ),
          /**
           * E.when(x, res, rej) is equivalent to
           * HandledPromise.resolve(x).then(res, rej)
           *
           * @template T
           * @template [U = T]
           * @param {T|PromiseLike<T>} x value to convert to a handled promise
           * @param {(value: T) => ERef<U>} [onfulfilled]
           * @param {(reason: any) => ERef<U>} [onrejected]
           * @returns {Promise<U>}
           * @readonly
           */
          when: (x, onfulfilled, onrejected) => HandledPromise2.resolve(x).then(
            ...trackTurns([onfulfilled, onrejected])
          )
        }
      )
    );
  };
  var E_default = makeE;

  // ../eventual-send/src/no-shim.js
  var hp = HandledPromise;
  var E = E_default(hp);

  // ../pass-style/src/passStyle-helpers.js
  var { isArray } = Array;
  var { prototype: functionPrototype2 } = Function;
  var {
    getOwnPropertyDescriptor: getOwnPropertyDescriptor3,
    getPrototypeOf: getPrototypeOf4,
    hasOwn: hasOwn3,
    isFrozen: isFrozen2,
    prototype: objectPrototype2
  } = Object;
  var { apply: apply5 } = Reflect;
  var { toStringTag: toStringTagSymbol2 } = Symbol;
  var typedArrayPrototype2 = getPrototypeOf4(Uint8Array.prototype);
  var typedArrayToStringTagDesc = getOwnPropertyDescriptor3(
    typedArrayPrototype2,
    toStringTagSymbol2
  );
  assert(typedArrayToStringTagDesc);
  var getTypedArrayToStringTag2 = typedArrayToStringTagDesc.get;
  assert(typeof getTypedArrayToStringTag2 === "function");
  var isPrimitive3 = (val) => (
    // Safer would be `Object(val) !== val` but is too expensive on XS.
    // So instead we use this adhoc set of type tests. But this is not safe in
    // the face of possible evolution of the language. Beware!
    !val || typeof val !== "object" && typeof val !== "function"
  );
  hideAndHardenFunction(isPrimitive3);
  var isObject = (val) => (
    // Safer would be `Object(val) -== val` but is too expensive on XS.
    // So instead we use this adhoc set of type tests. But this is not safe in
    // the face of possible evolution of the language. Beware!
    !!val && (typeof val === "object" || typeof val === "function")
  );
  hideAndHardenFunction(isObject);
  var isTypedArray2 = (object) => {
    const tag = apply5(getTypedArrayToStringTag2, object, []);
    return tag !== void 0;
  };
  hideAndHardenFunction(isTypedArray2);
  var PASS_STYLE = /* @__PURE__ */ Symbol.for("passStyle");
  var assertChecker = (cond, details2) => {
    assert(cond, details2);
    return true;
  };
  hideAndHardenFunction(assertChecker);
  var confirmOwnDataDescriptor = (candidate, propName, shouldBeEnumerable, reject) => {
    const desc = (
      /** @type {PropertyDescriptor} */
      getOwnPropertyDescriptor3(candidate, propName)
    );
    return (desc !== void 0 || reject && reject`${q5(propName)} property expected: ${candidate}`) && (hasOwn3(desc, "value") || reject && reject`${q5(propName)} must not be an accessor property: ${candidate}`) && (shouldBeEnumerable ? desc.enumerable || reject && reject`${q5(propName)} must be an enumerable property: ${candidate}` : !desc.enumerable || reject && reject`${q5(propName)} must not be an enumerable property: ${candidate}`) ? desc : (
      /** @type {PropertyDescriptor} */
      /** @type {unknown} */
      void 0
    );
  };
  harden_default(confirmOwnDataDescriptor);
  var getTag = (tagRecord) => tagRecord[Symbol.toStringTag];
  harden_default(getTag);
  var confirmPassStyle = (obj, passStyle, expectedPassStyle, reject) => {
    return passStyle === expectedPassStyle || reject && reject`Expected ${q5(expectedPassStyle)}, not ${q5(passStyle)}: ${obj}`;
  };
  harden_default(confirmPassStyle);
  var makeConfirmTagRecord = (confirmProto) => {
    const confirmTagRecord2 = (tagRecord, expectedPassStyle, reject) => {
      return (!isPrimitive3(tagRecord) || reject && reject`A non-object cannot be a tagRecord: ${tagRecord}`) && (isFrozen2(tagRecord) || reject && reject`A tagRecord must be frozen: ${tagRecord}`) && (!isArray(tagRecord) || reject && reject`An array cannot be a tagRecord: ${tagRecord}`) && confirmPassStyle(
        tagRecord,
        confirmOwnDataDescriptor(tagRecord, PASS_STYLE, false, reject)?.value,
        expectedPassStyle,
        reject
      ) && (typeof confirmOwnDataDescriptor(
        tagRecord,
        Symbol.toStringTag,
        false,
        reject
      )?.value === "string" || reject && reject`A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`) && confirmProto(tagRecord, getPrototypeOf4(tagRecord), reject);
    };
    return harden_default(confirmTagRecord2);
  };
  var confirmTagRecord = makeConfirmTagRecord(
    (val, proto, reject) => proto === objectPrototype2 || reject && reject`A tagRecord must inherit from Object.prototype: ${val}`
  );
  harden_default(confirmTagRecord);
  var confirmFunctionTagRecord = makeConfirmTagRecord(
    (val, proto, reject) => proto === functionPrototype2 || proto !== null && getPrototypeOf4(proto) === functionPrototype2 || reject && reject`For functions, a tagRecord must inherit from Function.prototype: ${val}`
  );
  harden_default(confirmFunctionTagRecord);

  // ../pass-style/src/remotable.js
  var canBeMethod = (func) => typeof func === "function" && !(PASS_STYLE in func);
  harden_default(canBeMethod);
  var canBeMethodName = (key) => (
    // typeof key === 'string' || typeof key === 'symbol';
    typeof key === "string" || typeof key === "symbol" || typeof key === "number"
  );
  harden_default(canBeMethodName);
  var getRemotableMethodNames = (behaviorMethods) => getMethodNames(behaviorMethods);
  harden_default(getRemotableMethodNames);
  var { ownKeys: ownKeys4 } = Reflect;
  var { isArray: isArray2 } = Array;
  var {
    getPrototypeOf: getPrototypeOf5,
    isFrozen: isFrozen3,
    prototype: objectPrototype3,
    getOwnPropertyDescriptors: getOwnPropertyDescriptors4,
    hasOwn: hasOwn4
  } = Object;
  var confirmIface = (iface, reject) => {
    return (
      // TODO other possible ifaces, once we have third party veracity
      (typeof iface === "string" || reject && reject`For now, interface ${iface} must be a string; unimplemented`) && (iface === "Remotable" || iface.startsWith("Alleged: ") || iface.startsWith("DebugName: ") || reject && reject`For now, iface ${q5(
        iface
      )} must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented`)
    );
  };
  var assertIface = (iface) => confirmIface(iface, Fail5);
  hideAndHardenFunction(assertIface);
  var confirmRemotableProtoOf = (original, reject) => {
    !isPrimitive3(original) || Fail5`Remotables must be objects or functions: ${original}`;
    const proto = getPrototypeOf5(original);
    if (proto === objectPrototype3 || proto === null || proto === Function.prototype) {
      return reject && reject`Remotables must be explicitly declared: ${q5(original)}`;
    }
    if (typeof original === "object") {
      const protoProto = getPrototypeOf5(proto);
      if (protoProto !== objectPrototype3 && protoProto !== null) {
        return confirmRemotable(proto, reject);
      }
      if (!confirmTagRecord(proto, "remotable", reject)) {
        return false;
      }
    } else if (typeof original === "function") {
      if (!confirmFunctionTagRecord(proto, "remotable", reject)) {
        return false;
      }
    }
    const passStyleKey = (
      /** @type {unknown} */
      PASS_STYLE
    );
    const tagKey = (
      /** @type {unknown} */
      Symbol.toStringTag
    );
    const {
      // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
      [
        /** @type {string} */
        passStyleKey
      ]: _passStyleDesc,
      [
        /** @type {string} */
        tagKey
      ]: { value: iface },
      ...restDescs
    } = getOwnPropertyDescriptors4(proto);
    return (ownKeys4(restDescs).length === 0 || reject && reject`Unexpected properties on Remotable Proto ${ownKeys4(restDescs)}`) && confirmIface(iface, reject);
  };
  var confirmedRemotables = /* @__PURE__ */ new WeakSet();
  var confirmRemotable = (val, reject) => {
    if (confirmedRemotables.has(val)) {
      return true;
    }
    if (!isFrozen3(val)) {
      return reject && reject`cannot serialize non-frozen objects like ${val}`;
    }
    if (!RemotableHelper.confirmCanBeValid(val, reject)) {
      return false;
    }
    const result = confirmRemotableProtoOf(val, reject);
    if (result) {
      confirmedRemotables.add(val);
    }
    return result;
  };
  var getInterfaceOf = (val) => {
    if (isPrimitive3(val) || val[PASS_STYLE] !== "remotable" || !confirmRemotable(val, false)) {
      return void 0;
    }
    return getTag(val);
  };
  harden_default(getInterfaceOf);
  var RemotableHelper = harden_default({
    styleName: "remotable",
    confirmCanBeValid: (candidate, reject) => {
      const validType = (!isPrimitive3(candidate) || reject && reject`cannot serialize non-objects as Remotable ${candidate}`) && (!isArray2(candidate) || reject && reject`cannot serialize arrays as Remotable ${candidate}`);
      if (!validType) {
        return false;
      }
      const descs = getOwnPropertyDescriptors4(candidate);
      if (typeof candidate === "object") {
        return ownKeys4(descs).every((key) => {
          return (
            // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
            (hasOwn4(descs[
              /** @type {string} */
              key
            ], "value") || reject && reject`cannot serialize Remotables with accessors like ${q5(
              String(key)
            )} in ${candidate}`) && (key === Symbol.toStringTag && confirmIface(candidate[key], reject) || (canBeMethod(candidate[key]) || reject && reject`cannot serialize Remotables with non-methods like ${q5(
              String(key)
            )} in ${candidate}`) && (key !== PASS_STYLE || reject && reject`A pass-by-remote cannot shadow ${q5(PASS_STYLE)}`))
          );
        });
      } else if (typeof candidate === "function") {
        const {
          name: nameDesc,
          length: lengthDesc,
          // @ts-ignore TS doesn't like symbols as computed indexes??
          [Symbol.toStringTag]: toStringTagDesc,
          ...restDescs
        } = descs;
        const restKeys = ownKeys4(restDescs);
        return (nameDesc && typeof nameDesc.value === "string" || reject && reject`Far function name must be a string, in ${candidate}`) && (lengthDesc && typeof lengthDesc.value === "number" || reject && reject`Far function length must be a number, in ${candidate}`) && (toStringTagDesc === void 0 || (typeof toStringTagDesc.value === "string" || reject && reject`Far function @@toStringTag must be a string, in ${candidate}`) && confirmIface(toStringTagDesc.value, reject)) && (restKeys.length === 0 || reject && reject`Far functions unexpected properties besides .name and .length ${restKeys}`);
      }
      return reject && reject`unrecognized typeof ${candidate}`;
    },
    assertRestValid: (candidate) => confirmRemotable(candidate, Fail5),
    every: (_passable, _fn) => true
  });

  // ../pass-style/src/make-far.js
  var { prototype: functionPrototype3 } = Function;
  var {
    getPrototypeOf: getPrototypeOf6,
    setPrototypeOf: setPrototypeOf2,
    create: create2,
    isFrozen: isFrozen4,
    prototype: objectPrototype4
  } = Object;
  var makeRemotableProto = (remotable, iface) => {
    let oldProto = getPrototypeOf6(remotable);
    if (typeof remotable === "object") {
      if (oldProto === null) {
        oldProto = objectPrototype4;
      }
      oldProto === objectPrototype4 || Fail5`For now, remotables cannot inherit from anything unusual, in ${remotable}`;
    } else if (typeof remotable === "function") {
      oldProto !== null || Fail5`Original function must not inherit from null: ${remotable}`;
      oldProto === functionPrototype3 || getPrototypeOf6(oldProto) === functionPrototype3 || Fail5`Far functions must originally inherit from Function.prototype, in ${remotable}`;
    } else {
      Fail5`unrecognized typeof ${remotable}`;
    }
    return harden_default(
      create2(oldProto, {
        [PASS_STYLE]: { value: "remotable" },
        [Symbol.toStringTag]: { value: iface }
      })
    );
  };
  var assertCanBeRemotable = (candidate) => RemotableHelper.confirmCanBeValid(candidate, Fail5);
  var Remotable = (iface = "Remotable", props = void 0, remotable = (
    /** @type {T} */
    {}
  )) => {
    assertIface(iface);
    assert(iface);
    props === void 0 || Fail5`Remotable props not yet implemented ${props}`;
    assertCanBeRemotable(remotable);
    !(PASS_STYLE in remotable) || Fail5`Remotable ${remotable} is already marked as a ${q5(
      remotable[PASS_STYLE]
    )}`;
    isFrozen4(remotable) === isFrozen4({}) || Fail5`Remotable ${remotable} is already frozen`;
    const remotableProto = makeRemotableProto(remotable, iface);
    const mutateHardenAndCheck = (target) => {
      setPrototypeOf2(target, remotableProto);
      harden_default(target);
      assertCanBeRemotable(target);
    };
    mutateHardenAndCheck({});
    mutateHardenAndCheck(remotable);
    assert(iface !== void 0);
    return (
      /** @type {any} */
      remotable
    );
  };
  harden_default(Remotable);
  var GET_METHOD_NAMES = "__getMethodNames__";
  var getMethodNamesMethod = harden_default({
    [GET_METHOD_NAMES]() {
      return getMethodNames(this);
    }
  })[GET_METHOD_NAMES];
  var getMethodNamesDescriptor = harden_default({
    value: getMethodNamesMethod,
    enumerable: false,
    configurable: false,
    writable: false
  });
  var Far = (farName, remotable = void 0) => {
    const r = remotable === void 0 ? (
      /** @type {T} */
      {}
    ) : remotable;
    if (typeof r === "object" && !(GET_METHOD_NAMES in r)) {
      Object.defineProperty(r, GET_METHOD_NAMES, getMethodNamesDescriptor);
    }
    return Remotable(`Alleged: ${farName}`, void 0, r);
  };
  harden_default(Far);
  var ToFarFunction = (farName, func) => {
    if (getInterfaceOf(func) !== void 0) {
      return func;
    }
    return Far(farName, (...args) => func(...args));
  };
  harden_default(ToFarFunction);

  // ../pass-style/src/iter-helpers.js
  var mapIterable = (baseIterable, func) => (
    /** @type {Iterable<U>} */
    Far("mapped iterable", {
      [Symbol.iterator]: () => {
        const baseIterator = baseIterable[Symbol.iterator]();
        return Far("mapped iterator", {
          next: () => {
            const { value: baseValue, done } = baseIterator.next();
            const value = done ? baseValue : func(baseValue);
            return harden_default({ value, done });
          }
        });
      }
    })
  );
  harden_default(mapIterable);
  var filterIterable = (baseIterable, pred) => (
    /** @type {Iterable<U>} */
    Far("filtered iterable", {
      [Symbol.iterator]: () => {
        const baseIterator = baseIterable[Symbol.iterator]();
        return Far("filtered iterator", {
          next: () => {
            for (; ; ) {
              const result = baseIterator.next();
              const { value, done } = result;
              if (done || pred(value)) {
                return result;
              }
            }
          }
        });
      }
    })
  );
  harden_default(filterIterable);

  // ../harden/is-noop.js
  var { getOwnPropertyDescriptor: getOwnPropertyDescriptor4 } = Object;
  var memo = /* @__PURE__ */ new WeakMap();
  var hardenIsNoop = (harden3) => {
    let isNoop = memo.get(harden3);
    if (isNoop !== void 0) return isNoop;
    const subject = harden3({ __proto__: null, x: 0 });
    const desc = getOwnPropertyDescriptor4(subject, "x");
    isNoop = desc?.writable === true;
    memo.set(harden3, isNoop);
    return isNoop;
  };
  var is_noop_default = hardenIsNoop;

  // ../pass-style/src/error.js
  var {
    defineProperty: defineProperty3,
    getPrototypeOf: getPrototypeOf7,
    getOwnPropertyDescriptors: getOwnPropertyDescriptors5,
    getOwnPropertyDescriptor: getOwnPropertyDescriptor5,
    hasOwn: hasOwn5,
    entries: entries2,
    freeze: freeze7
  } = Object;
  var { apply: apply6 } = Reflect;
  var makeTypeError2 = () => {
    try {
      null.null;
      throw TypeError("obligatory");
    } catch (error) {
      return error;
    }
  };
  var makeRepairError = () => {
    if (!is_noop_default(harden_default)) {
      return void 0;
    }
    const typeErrorStackDesc2 = getOwnPropertyDescriptor5(makeTypeError2(), "stack");
    const errorStackDesc2 = getOwnPropertyDescriptor5(Error("obligatory"), "stack");
    if (typeErrorStackDesc2 === void 0 || typeErrorStackDesc2.get === void 0) {
      return void 0;
    }
    if (errorStackDesc2 === void 0 || typeof typeErrorStackDesc2.get !== "function" || typeErrorStackDesc2.get !== errorStackDesc2.get || typeof typeErrorStackDesc2.set !== "function" || typeErrorStackDesc2.set !== errorStackDesc2.set) {
      throw TypeError(
        "Unexpected Error own stack accessor functions (PASS_STYLE_UNEXPECTED_ERROR_OWN_STACK_ACCESSOR)"
      );
    }
    const feralStackGetter2 = freeze7(errorStackDesc2.get);
    const repairError2 = (error) => {
      const stackDesc = getOwnPropertyDescriptor5(error, "stack");
      if (stackDesc && stackDesc.get === feralStackGetter2 && stackDesc.configurable) {
        defineProperty3(error, "stack", {
          // NOTE: Calls getter during harden, which seems dangerous.
          // But we're only calling the problematic getter whose
          // hazards we think we understand.
          value: apply6(feralStackGetter2, error, [])
        });
      }
    };
    harden_default(repairError2);
    return repairError2;
  };
  harden_default(makeRepairError);
  var repairError = makeRepairError();
  var errorConstructors = /* @__PURE__ */ new Map(
    // Cast because otherwise TS is confused by AggregateError
    // See https://github.com/endojs/endo/pull/2042#discussion_r1484933028
    /** @type {Array<[string, import('ses').GenericErrorConstructor]>} */
    [
      ["Error", Error],
      ["EvalError", EvalError],
      ["RangeError", RangeError],
      ["ReferenceError", ReferenceError],
      ["SyntaxError", SyntaxError],
      ["TypeError", TypeError],
      ["URIError", URIError]
      // https://github.com/endojs/endo/issues/550
      // To accommodate platforms prior to AggregateError, we comment out the
      // following line and instead conditionally add it to the map below.
      // ['AggregateError', AggregateError],
    ]
  );
  if (typeof AggregateError !== "undefined") {
    errorConstructors.set("AggregateError", AggregateError);
  }
  var getErrorConstructor = (name) => errorConstructors.get(name);
  harden_default(getErrorConstructor);
  var confirmErrorLike = (candidate, reject) => {
    return candidate instanceof Error || reject && reject`Error expected: ${candidate}`;
  };
  harden_default(confirmErrorLike);
  var isErrorLike = (candidate) => confirmErrorLike(candidate, false);
  hideAndHardenFunction(isErrorLike);
  var confirmRecursivelyPassableErrorPropertyDesc = (propName, desc, passStyleOfRecur, reject) => {
    if (desc.enumerable) {
      return reject && reject`Passable Error ${q5(
        propName
      )} own property must not be enumerable: ${desc}`;
    }
    if (!hasOwn5(desc, "value")) {
      return reject && reject`Passable Error ${q5(
        propName
      )} own property must be a data property: ${desc}`;
    }
    const { value } = desc;
    switch (propName) {
      case "message":
      case "stack": {
        return typeof value === "string" || reject && reject`Passable Error ${q5(
          propName
        )} own property must be a string: ${value}`;
      }
      case "cause": {
        return confirmRecursivelyPassableError(value, passStyleOfRecur, reject);
      }
      case "errors": {
        if (!Array.isArray(value) || passStyleOfRecur(value) !== "copyArray") {
          return reject && reject`Passable Error ${q5(
            propName
          )} own property must be a copyArray: ${value}`;
        }
        return value.every(
          (err) => (
            // eslint-disable-next-line no-use-before-define
            confirmRecursivelyPassableError(err, passStyleOfRecur, reject)
          )
        );
      }
      default: {
        break;
      }
    }
    return reject && reject`Passable Error has extra unpassed property ${q5(propName)}`;
  };
  harden_default(confirmRecursivelyPassableErrorPropertyDesc);
  var confirmRecursivelyPassableError = (candidate, passStyleOfRecur, reject) => {
    if (!confirmErrorLike(candidate, reject)) {
      return false;
    }
    const proto = getPrototypeOf7(candidate);
    const { name } = proto;
    const errConstructor = getErrorConstructor(name);
    if (errConstructor === void 0 || errConstructor.prototype !== proto) {
      return reject && reject`Passable Error must inherit from an error class .prototype: ${candidate}`;
    }
    if (repairError !== void 0) {
      repairError(candidate);
    }
    const descs = getOwnPropertyDescriptors5(candidate);
    if (!("message" in descs)) {
      return reject && reject`Passable Error must have an own "message" string property: ${candidate}`;
    }
    return entries2(descs).every(
      ([propName, desc]) => confirmRecursivelyPassableErrorPropertyDesc(
        propName,
        desc,
        passStyleOfRecur,
        reject
      )
    );
  };
  harden_default(confirmRecursivelyPassableError);
  var ErrorHelper = harden_default({
    styleName: "error",
    confirmCanBeValid: confirmErrorLike,
    assertRestValid: (candidate, passStyleOfRecur) => confirmRecursivelyPassableError(candidate, passStyleOfRecur, Fail5)
  });

  // ../pass-style/src/symbol.js
  var { ownKeys: ownKeys5 } = Reflect;
  var wellKnownSymbolNames = new Map(
    ownKeys5(Symbol).filter(
      (name) => typeof name === "string" && typeof Symbol[name] === "symbol"
    ).filter((name) => {
      !name.startsWith("@@") || Fail5`Did not expect Symbol to have a symbol-valued property name starting with "@@" ${q5(
        name
      )}`;
      return true;
    }).map((name) => [Symbol[name], `@@${name}`])
  );
  var isPassableSymbol = (sym) => typeof sym === "symbol" && (typeof Symbol.keyFor(sym) === "string" || wellKnownSymbolNames.has(sym));
  harden_default(isPassableSymbol);
  var assertPassableSymbol = (sym) => isPassableSymbol(sym) || Fail5`Only registered symbols or well-known symbols are passable: ${q5(sym)}`;
  hideAndHardenFunction(assertPassableSymbol);
  var nameForPassableSymbol = (sym) => {
    const name = Symbol.keyFor(sym);
    if (name === void 0) {
      return wellKnownSymbolNames.get(sym);
    }
    if (name.startsWith("@@")) {
      return `@@${name}`;
    }
    return name;
  };
  harden_default(nameForPassableSymbol);
  var AtAtPrefixPattern = /^@@(.*)$/;
  harden_default(AtAtPrefixPattern);
  var passableSymbolForName = (name) => {
    typeof name === "string" || Fail5`${q5(name)} must be a string, not ${q5(typeof name)}`;
    const match = AtAtPrefixPattern.exec(name);
    if (match) {
      const suffix = match[1];
      if (suffix.startsWith("@@")) {
        return Symbol.for(suffix);
      } else {
        const sym = Symbol[suffix];
        if (typeof sym === "symbol") {
          return sym;
        }
        Fail5`Reserved for well known symbol ${q5(suffix)}: ${q5(name)}`;
      }
    }
    return Symbol.for(name);
  };
  harden_default(passableSymbolForName);

  // ../pass-style/src/string.js
  var hasWellFormedStringMethod = !!String.prototype.isWellFormed;
  var isWellFormedString = hasWellFormedStringMethod ? (str) => typeof str === "string" && str.isWellFormed() : (str) => {
    if (typeof str !== "string") {
      return false;
    }
    for (const ch of str) {
      const cp = (
        /** @type {number} */
        ch.codePointAt(0)
      );
      if (cp >= 55296 && cp <= 57343) {
        return false;
      }
    }
    return true;
  };
  hideAndHardenFunction(isWellFormedString);
  var assertWellFormedString = (str) => {
    isWellFormedString(str) || Fail5`Expected well-formed unicode string: ${str}`;
  };
  hideAndHardenFunction(assertWellFormedString);
  var ONLY_WELL_FORMED_STRINGS_PASSABLE = getEnvironmentOption("ONLY_WELL_FORMED_STRINGS_PASSABLE", "disabled", [
    "enabled"
  ]) === "enabled";
  var assertPassableString = (str) => {
    typeof str === "string" || Fail5`Expected string ${str}`;
    !ONLY_WELL_FORMED_STRINGS_PASSABLE || assertWellFormedString(str);
  };
  hideAndHardenFunction(assertPassableString);

  // ../promise-kit/src/promise-executor-kit.js
  var makeReleasingExecutorKit = () => {
    let internalResolve;
    let internalReject;
    const resolve = (value) => {
      if (internalResolve) {
        internalResolve(value);
        internalResolve = null;
        internalReject = null;
      } else {
        assert(internalResolve === null);
      }
    };
    const reject = (reason) => {
      if (internalReject) {
        internalReject(reason);
        internalResolve = null;
        internalReject = null;
      } else {
        assert(internalReject === null);
      }
    };
    const executor = (res, rej) => {
      assert(internalResolve === void 0 && internalReject === void 0);
      internalResolve = res;
      internalReject = rej;
    };
    return harden_default({ resolve, reject, executor });
  };
  harden_default(makeReleasingExecutorKit);

  // ../promise-kit/src/memo-race.js
  var isPrimitive4 = (val) => !val || typeof val !== "object" && typeof val !== "function";
  var knownPromises = /* @__PURE__ */ new WeakMap();
  var markSettled = (record) => {
    if (!record || record.settled) {
      return /* @__PURE__ */ new Set();
    }
    const { deferreds } = record;
    Object.assign(record, {
      deferreds: void 0,
      settled: true
    });
    Object.freeze(record);
    return deferreds;
  };
  var getMemoRecord = (value) => {
    if (isPrimitive4(value)) {
      return harden_default({ settled: true });
    }
    let record = knownPromises.get(value);
    if (!record) {
      record = { deferreds: /* @__PURE__ */ new Set(), settled: false };
      knownPromises.set(value, record);
      Promise.resolve(value).then(
        (val) => {
          for (const { resolve } of markSettled(record)) {
            resolve(val);
          }
        },
        (err) => {
          for (const { reject } of markSettled(record)) {
            reject(err);
          }
        }
      );
    }
    return record;
  };
  var { race } = {
    /**
     * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
     * or rejected.
     *
     * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
     * the result promise.
     *
     * @template {readonly unknown[] | []} T
     * @template {PromiseConstructor} [P=PromiseConstructor]
     * @this {P}
     * @param {T} values An iterable of Promises.
     * @returns {Promise<Awaited<T[number]>>} A new Promise.
     */
    race(values4) {
      let deferred;
      const cachedValues = [];
      const C = this;
      const result = new C((resolve, reject) => {
        deferred = { resolve, reject };
        for (const value of values4) {
          cachedValues.push(value);
          const { settled, deferreds } = getMemoRecord(value);
          if (settled) {
            C.resolve(value).then(resolve, reject);
          } else {
            deferreds.add(deferred);
          }
        }
      });
      return result.finally(() => {
        for (const value of cachedValues) {
          const { deferreds } = getMemoRecord(value);
          if (deferreds) {
            deferreds.delete(deferred);
          }
        }
      });
    }
  };

  // ../promise-kit/src/is-promise.js
  function isPromise(maybePromise) {
    return Promise.resolve(maybePromise) === maybePromise;
  }
  harden_default(isPromise);

  // ../promise-kit/index.js
  var BestPipelinablePromise = globalThis.HandledPromise || Promise;
  function makePromiseKit() {
    const { resolve, reject, executor } = makeReleasingExecutorKit();
    const promise = new BestPipelinablePromise(executor);
    return harden_default({ promise, resolve, reject });
  }
  harden_default(makePromiseKit);
  function racePromises(values4) {
    return harden_default(race.call(BestPipelinablePromise, values4));
  }
  harden_default(racePromises);

  // ../pass-style/src/copyArray.js
  var { getPrototypeOf: getPrototypeOf8 } = Object;
  var { ownKeys: ownKeys6 } = Reflect;
  var { isArray: isArray3, prototype: arrayPrototype2 } = Array;
  var CopyArrayHelper = harden_default({
    styleName: "copyArray",
    confirmCanBeValid: (candidate, reject) => isArray3(candidate) || reject && reject`Array expected: ${candidate}`,
    assertRestValid: (candidate, passStyleOfRecur) => {
      getPrototypeOf8(candidate) === arrayPrototype2 || assert.fail(X3`Malformed array: ${candidate}`, TypeError);
      const len = (
        /** @type {number} */
        confirmOwnDataDescriptor(candidate, "length", false, Fail5).value
      );
      for (let i = 0; i < len; i += 1) {
        passStyleOfRecur(
          confirmOwnDataDescriptor(candidate, i, true, Fail5).value
        );
      }
      ownKeys6(candidate).length === len + 1 || assert.fail(X3`Arrays must not have non-indexes: ${candidate}`, TypeError);
    }
  });

  // ../pass-style/src/byteArray.js
  var { getPrototypeOf: getPrototypeOf9, getOwnPropertyDescriptor: getOwnPropertyDescriptor6 } = Object;
  var { ownKeys: ownKeys7, apply: apply7 } = Reflect;
  var adaptImmutableArrayBuffer = () => {
    const anArrayBuffer = new ArrayBuffer(0);
    if (anArrayBuffer.sliceToImmutable === void 0) {
      return {
        immutableArrayBufferPrototype: null,
        immutableGetter: () => false
      };
    }
    const anImmutableArrayBuffer = anArrayBuffer.sliceToImmutable();
    const immutableArrayBufferPrototype2 = getPrototypeOf9(anImmutableArrayBuffer);
    const immutableGetter2 = (
      /** @type {(this: ArrayBuffer) => boolean} */
      // @ts-expect-error We know the desciptor is there.
      getOwnPropertyDescriptor6(immutableArrayBufferPrototype2, "immutable").get
    );
    return { immutableArrayBufferPrototype: immutableArrayBufferPrototype2, immutableGetter: immutableGetter2 };
  };
  var { immutableArrayBufferPrototype, immutableGetter } = adaptImmutableArrayBuffer();
  var ByteArrayHelper = harden_default({
    styleName: "byteArray",
    confirmCanBeValid: (candidate, reject) => candidate instanceof ArrayBuffer && candidate.immutable || reject && reject`Immutable ArrayBuffer expected: ${candidate}`,
    assertRestValid: (candidate, _passStyleOfRecur) => {
      getPrototypeOf9(candidate) === immutableArrayBufferPrototype || assert.fail(X3`Malformed ByteArray ${candidate}`, TypeError);
      apply7(immutableGetter, candidate, []) || Fail5`Must be an immutable ArrayBuffer: ${candidate}`;
      ownKeys7(candidate).length === 0 || assert.fail(
        X3`ByteArrays must not have own properties: ${candidate}`,
        TypeError
      );
    }
  });

  // ../pass-style/src/copyRecord.js
  var { ownKeys: ownKeys8 } = Reflect;
  var { getPrototypeOf: getPrototypeOf10, prototype: objectPrototype5 } = Object;
  var confirmObjectPrototype = (candidate, reject) => {
    return getPrototypeOf10(candidate) === objectPrototype5 || reject && reject`Records must inherit from Object.prototype: ${candidate}`;
  };
  var confirmPropertyCanBeValid = (candidate, key, value, reject) => {
    return (typeof key === "string" || reject && reject`Records can only have string-named properties: ${candidate}`) && (!canBeMethod(value) || reject && // TODO: Update message now that there is no such thing as "implicit Remotable".
    reject`Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`);
  };
  var CopyRecordHelper = harden_default({
    styleName: "copyRecord",
    confirmCanBeValid: (candidate, reject) => {
      return confirmObjectPrototype(candidate, reject) && // Reject any candidate with a symbol-keyed property or method-like property
      // (such input is potentially a Remotable).
      ownKeys8(candidate).every(
        (key) => confirmPropertyCanBeValid(candidate, key, candidate[key], reject)
      );
    },
    assertRestValid: (candidate, passStyleOfRecur) => {
      for (const name of ownKeys8(candidate)) {
        const { value } = confirmOwnDataDescriptor(candidate, name, true, Fail5);
        passStyleOfRecur(value);
      }
    }
  });

  // ../pass-style/src/tagged.js
  var { ownKeys: ownKeys9 } = Reflect;
  var { getOwnPropertyDescriptors: getOwnPropertyDescriptors6 } = Object;
  var TaggedHelper = harden_default({
    styleName: "tagged",
    confirmCanBeValid: (candidate, reject) => confirmPassStyle(candidate, candidate[PASS_STYLE], "tagged", reject),
    assertRestValid: (candidate, passStyleOfRecur) => {
      confirmTagRecord(candidate, "tagged", Fail5);
      const passStyleKey = (
        /** @type {unknown} */
        PASS_STYLE
      );
      const tagKey = (
        /** @type {unknown} */
        Symbol.toStringTag
      );
      const {
        // confirmTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
        [
          /** @type {string} */
          passStyleKey
        ]: _passStyleDesc,
        [
          /** @type {string} */
          tagKey
        ]: _labelDesc,
        payload: _payloadDesc,
        // value checked by recursive walk at the end
        ...restDescs
      } = getOwnPropertyDescriptors6(candidate);
      ownKeys9(restDescs).length === 0 || Fail5`Unexpected properties on tagged record ${ownKeys9(restDescs)}`;
      passStyleOfRecur(
        confirmOwnDataDescriptor(candidate, "payload", true, Fail5).value
      );
    }
  });

  // ../pass-style/src/safe-promise.js
  var { isFrozen: isFrozen5, getPrototypeOf: getPrototypeOf11, getOwnPropertyDescriptor: getOwnPropertyDescriptor7, hasOwn: hasOwn6 } = Object;
  var { ownKeys: ownKeys10 } = Reflect;
  var { toStringTag } = Symbol;
  var confirmPromiseOwnKeys = (pr, reject) => {
    const keys = ownKeys10(pr);
    if (keys.length === 0) {
      return true;
    }
    const unknownKeys = keys.filter(
      (key) => typeof key !== "symbol" || !hasOwn6(Promise.prototype, key)
    );
    if (unknownKeys.length !== 0) {
      return reject && reject`${pr} - Must not have any own properties: ${q5(unknownKeys)}`;
    }
    const checkSafeOwnKey = (key) => {
      if (key === toStringTag) {
        const tagDesc = getOwnPropertyDescriptor7(pr, toStringTag);
        assert(tagDesc !== void 0);
        return (hasOwn6(tagDesc, "value") || reject && reject`Own @@toStringTag must be a data property, not an accessor: ${q5(tagDesc)}`) && (typeof tagDesc.value === "string" || reject && reject`Own @@toStringTag value must be a string: ${q5(tagDesc.value)}`) && (!tagDesc.enumerable || reject && reject`Own @@toStringTag must not be enumerable: ${q5(tagDesc)}`);
      }
      const val = pr[key];
      if (val === void 0 || typeof val === "number") {
        return true;
      }
      if (typeof val === "object" && val !== null && isFrozen5(val) && getPrototypeOf11(val) === Object.prototype) {
        const subKeys = ownKeys10(val);
        if (subKeys.length === 0) {
          return true;
        }
        if (subKeys.length === 1 && subKeys[0] === "destroyed" && val.destroyed === false) {
          return true;
        }
      }
      return reject && reject`Unexpected Node async_hooks additions to promise: ${pr}.${q5(
        String(key)
      )} is ${val}`;
    };
    return keys.every(checkSafeOwnKey);
  };
  var confirmSafePromise = (pr, reject) => {
    return (isFrozen5(pr) || reject && reject`${pr} - Must be frozen`) && (isPromise(pr) || reject && reject`${pr} - Must be a promise`) && (getPrototypeOf11(pr) === Promise.prototype || reject && reject`${pr} - Must inherit from Promise.prototype: ${q5(
      getPrototypeOf11(pr)
    )}`) && confirmPromiseOwnKeys(
      /** @type {Promise} */
      pr,
      reject
    );
  };
  harden_default(confirmSafePromise);
  var isSafePromise = (pr) => confirmSafePromise(pr, false);
  hideAndHardenFunction(isSafePromise);
  var assertSafePromise = (pr) => confirmSafePromise(pr, Fail5);
  hideAndHardenFunction(assertSafePromise);

  // ../pass-style/src/passStyleOf.js
  var { ownKeys: ownKeys11 } = Reflect;
  var { isFrozen: isFrozen6, getOwnPropertyDescriptors: getOwnPropertyDescriptors7, values } = Object;
  var makeHelperTable = (passStyleHelpers) => {
    const HelperTable = {
      __proto__: null,
      copyArray: void 0,
      byteArray: void 0,
      copyRecord: void 0,
      tagged: void 0,
      error: void 0,
      remotable: void 0
    };
    for (const helper of passStyleHelpers) {
      const { styleName } = helper;
      styleName in HelperTable || Fail5`Unrecognized helper: ${q5(styleName)}`;
      HelperTable[styleName] === void 0 || Fail5`conflicting helpers for ${q5(styleName)}`;
      HelperTable[styleName] = helper;
    }
    for (const styleName of ownKeys11(HelperTable)) {
      HelperTable[styleName] !== void 0 || Fail5`missing helper for ${q5(styleName)}`;
    }
    return (
      /** @type {HelpersRecord} */
      /** @type {unknown} */
      harden_default(HelperTable)
    );
  };
  var assertValid = (helper, candidate, passStyleOfRecur) => {
    helper.confirmCanBeValid(candidate, Fail5);
    helper.assertRestValid(candidate, passStyleOfRecur);
  };
  var makePassStyleOf = (passStyleHelpers) => {
    const HelperTable = makeHelperTable(passStyleHelpers);
    const remotableHelper = HelperTable.remotable;
    const passStyleMemo = /* @__PURE__ */ new WeakMap();
    const passStyleOf2 = (passable) => {
      const inProgress = /* @__PURE__ */ new Set();
      const passStyleOfRecur = (inner) => {
        const innerIsObject = !isPrimitive3(inner);
        if (innerIsObject) {
          const innerStyle = passStyleMemo.get(inner);
          if (innerStyle) {
            return innerStyle;
          }
          !inProgress.has(inner) || Fail5`Pass-by-copy data cannot be cyclic ${inner}`;
          inProgress.add(inner);
        }
        const passStyle = passStyleOfInternal(inner);
        if (innerIsObject) {
          passStyleMemo.set(inner, passStyle);
          inProgress.delete(inner);
        }
        return passStyle;
      };
      const passStyleOfInternal = (inner) => {
        const typestr = typeof inner;
        switch (typestr) {
          case "undefined":
          case "boolean":
          case "number":
          case "bigint": {
            return typestr;
          }
          case "string": {
            assertPassableString(inner);
            return "string";
          }
          case "symbol": {
            assertPassableSymbol(inner);
            return "symbol";
          }
          case "object": {
            if (inner === null) {
              return "null";
            }
            if (!isFrozen6(inner)) {
              assert.fail(
                // TypedArrays get special treatment in harden()
                // and a corresponding special error message here.
                isTypedArray2(inner) ? X3`Cannot pass mutable typed arrays like ${inner}.` : X3`Cannot pass non-frozen objects like ${inner}. Use harden()`
              );
            }
            if (isPromise(inner)) {
              assertSafePromise(inner);
              return "promise";
            }
            typeof inner.then !== "function" || Fail5`Cannot pass non-promise thenables`;
            const passStyleTag = inner[PASS_STYLE];
            if (passStyleTag !== void 0) {
              assert.typeof(passStyleTag, "string");
              const helper = HelperTable[passStyleTag];
              helper !== void 0 || Fail5`Unrecognized PassStyle: ${q5(passStyleTag)}`;
              assertValid(helper, inner, passStyleOfRecur);
              return (
                /** @type {PassStyle} */
                passStyleTag
              );
            }
            for (const helper of passStyleHelpers) {
              if (helper.confirmCanBeValid(inner, false)) {
                helper.assertRestValid(inner, passStyleOfRecur);
                return helper.styleName;
              }
            }
            assertValid(remotableHelper, inner, passStyleOfRecur);
            return "remotable";
          }
          case "function": {
            isFrozen6(inner) || Fail5`Cannot pass non-frozen objects like ${inner}. Use harden()`;
            typeof inner.then !== "function" || Fail5`Cannot pass non-promise thenables`;
            assertValid(remotableHelper, inner, passStyleOfRecur);
            return "remotable";
          }
          default: {
            throw assert.fail(X3`Unrecognized typeof ${q5(typestr)}`, TypeError);
          }
        }
      };
      return passStyleOfRecur(passable);
    };
    return harden_default(passStyleOf2);
  };
  var PassStyleOfEndowmentSymbol = /* @__PURE__ */ Symbol.for("@endo passStyleOf");
  var passStyleOf = globalThis && globalThis[PassStyleOfEndowmentSymbol] || makePassStyleOf([
    CopyArrayHelper,
    ByteArrayHelper,
    CopyRecordHelper,
    TaggedHelper,
    ErrorHelper,
    RemotableHelper
  ]);
  var assertPassable = (val) => {
    passStyleOf(val);
  };
  hideAndHardenFunction(assertPassable);
  var isPassable = (specimen) => {
    try {
      return passStyleOf(specimen) !== void 0;
    } catch (_) {
      return false;
    }
  };
  hideAndHardenFunction(isPassable);
  var isPassableErrorPropertyDesc = (name, desc) => confirmRecursivelyPassableErrorPropertyDesc(name, desc, passStyleOf, false);
  var toPassableError = (err) => {
    harden_default(err);
    if (confirmRecursivelyPassableError(err, passStyleOf, false)) {
      return err;
    }
    const { name, message } = err;
    const { cause: causeDesc, errors: errorsDesc } = getOwnPropertyDescriptors7(err);
    let cause;
    let errors;
    if (causeDesc && isPassableErrorPropertyDesc("cause", causeDesc)) {
      cause = causeDesc.value;
    }
    if (errorsDesc && isPassableErrorPropertyDesc("errors", errorsDesc)) {
      errors = errorsDesc.value;
    }
    const errConstructor = getErrorConstructor(`${name}`) || Error;
    const newError = makeError(`${message}`, errConstructor, {
      // @ts-ignore Assuming cause is Error | undefined
      cause,
      errors
    });
    harden_default(newError);
    annotateError2(newError, X3`copied from error ${err}`);
    passStyleOf(newError) === "error" || Fail5`Expected ${newError} to be a passable error`;
    return newError;
  };
  harden_default(toPassableError);
  var toThrowable = (specimen) => {
    harden_default(specimen);
    if (isErrorLike(specimen)) {
      return toPassableError(
        /** @type {Error} */
        specimen
      );
    }
    if (!isPrimitive3(specimen)) {
      const passStyle = (
        /** @type {PassStyle} */
        passStyleOf(specimen)
      );
      switch (passStyle) {
        case "copyArray": {
          const elements = (
            /** @type {CopyArray} */
            specimen
          );
          for (const element of elements) {
            element === toThrowable(element) || Fail5`nested toThrowable coercion not yet supported ${element}`;
          }
          break;
        }
        case "copyRecord": {
          const rec = (
            /** @type {CopyRecord} */
            specimen
          );
          for (const val of values(rec)) {
            val === toThrowable(val) || Fail5`nested toThrowable coercion not yet supported ${val}`;
          }
          break;
        }
        case "tagged": {
          const tg = (
            /** @type {CopyTagged} */
            specimen
          );
          const { payload } = tg;
          payload === toThrowable(payload) || Fail5`nested toThrowable coercion not yet supported ${payload}`;
          break;
        }
        case "error": {
          const er = (
            /** @type {Error} */
            specimen
          );
          er === toThrowable(er) || Fail5`nested toThrowable coercion not yet supported ${er}`;
          break;
        }
        default: {
          throw Fail5`A ${q5(passStyle)} is not throwable: ${specimen}`;
        }
      }
    }
    return (
      /** @type {Passable<never,never>} */
      specimen
    );
  };
  harden_default(toThrowable);

  // ../pass-style/src/makeTagged.js
  var { create: create3, prototype: objectPrototype6 } = Object;
  var makeTagged = (tag, payload) => {
    typeof tag === "string" || Fail5`The tag of a tagged record must be a string: ${tag}`;
    assertPassable(harden_default(payload));
    return harden_default(
      create3(objectPrototype6, {
        [PASS_STYLE]: { value: "tagged" },
        [Symbol.toStringTag]: { value: tag },
        payload: { value: payload, enumerable: true }
      })
    );
  };
  harden_default(makeTagged);

  // ../pass-style/src/typeGuards.js
  var isCopyArray = (arr) => passStyleOf(arr) === "copyArray";
  hideAndHardenFunction(isCopyArray);
  var isByteArray = (arr) => passStyleOf(arr) === "byteArray";
  hideAndHardenFunction(isByteArray);
  var isRecord = (record) => passStyleOf(record) === "copyRecord";
  hideAndHardenFunction(isRecord);
  var isRemotable = (remotable) => passStyleOf(remotable) === "remotable";
  hideAndHardenFunction(isRemotable);
  var assertCopyArray = (arr, optNameOfArray = "Alleged array") => {
    const passStyle = passStyleOf(arr);
    passStyle === "copyArray" || Fail5`${q5(optNameOfArray)} ${arr} must be a pass-by-copy array, not ${q5(
      passStyle
    )}`;
  };
  hideAndHardenFunction(assertCopyArray);
  var assertByteArray = (arr, optNameOfArray = "Alleged byteArray") => {
    const passStyle = passStyleOf(arr);
    passStyle === "byteArray" || Fail5`${q5(
      optNameOfArray
    )} ${arr} must be a pass-by-copy binary data, not ${q5(passStyle)}`;
  };
  hideAndHardenFunction(assertByteArray);
  var assertRecord = (record, optNameOfRecord = "Alleged record") => {
    const passStyle = passStyleOf(record);
    passStyle === "copyRecord" || Fail5`${q5(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q5(
      passStyle
    )}`;
  };
  hideAndHardenFunction(assertRecord);
  var assertRemotable = (remotable, optNameOfRemotable = "Alleged remotable") => {
    const passStyle = passStyleOf(remotable);
    passStyle === "remotable" || Fail5`${q5(optNameOfRemotable)} ${remotable} must be a remotable, not ${q5(
      passStyle
    )}`;
  };
  hideAndHardenFunction(assertRemotable);
  var confirmAtom = (val, reject) => {
    let passStyle;
    try {
      passStyle = passStyleOf(val);
    } catch (err) {
      return reject && reject`Not even Passable: ${q5(err)}: ${val}`;
    }
    switch (passStyle) {
      case "undefined":
      case "null":
      case "boolean":
      case "number":
      case "bigint":
      case "string":
      case "byteArray":
      case "symbol": {
        return true;
      }
      default: {
        return reject && reject`A ${q5(passStyle)} cannot be an atom: ${val}`;
      }
    }
  };
  var isAtom = (val) => confirmAtom(val, false);
  hideAndHardenFunction(isAtom);
  var assertAtom = (val) => {
    confirmAtom(val, Fail5);
  };
  hideAndHardenFunction(assertAtom);

  // ../pass-style/src/deeplyFulfilled.js
  var { ownKeys: ownKeys12 } = Reflect;
  var { fromEntries } = Object;
  var deeplyFulfilled = async (val) => {
    if (isAtom(val)) {
      return (
        /** @type {DeeplyAwaited<T>} */
        val
      );
    }
    if (isPromise(val)) {
      return E.when(val, (nonp) => deeplyFulfilled(nonp));
    }
    const passStyle = passStyleOf(val);
    switch (passStyle) {
      case "copyRecord": {
        const rec = (
          /** @type {CopyRecord} */
          val
        );
        const names = (
          /** @type {string[]} */
          ownKeys12(rec)
        );
        const valPs = names.map((name) => deeplyFulfilled(rec[name]));
        return E.when(
          Promise.all(valPs),
          (vals) => harden_default(fromEntries(vals.map((c, i) => [names[i], c])))
        );
      }
      case "copyArray": {
        const arr = (
          /** @type {CopyArray} */
          val
        );
        const valPs = arr.map((p) => deeplyFulfilled(p));
        return E.when(Promise.all(valPs), (vals) => harden_default(vals));
      }
      case "byteArray": {
        const byteArray = (
          /** @type {ByteArray} */
          /** @type {unknown} */
          val
        );
        return byteArray;
      }
      case "tagged": {
        const tgd = (
          /** @type {CopyTagged} */
          val
        );
        const tag = getTag(tgd);
        return E.when(
          deeplyFulfilled(tgd.payload),
          (payload) => makeTagged(tag, payload)
        );
      }
      case "remotable": {
        const rem = (
          /** @type {RemotableObject} */
          val
        );
        return rem;
      }
      case "error": {
        const err = (
          /** @type {Error} */
          val
        );
        return err;
      }
      case "promise": {
        const prom = (
          /** @type {Promise} */
          /** @type {unknown} */
          val
        );
        return E.when(prom, (nonp) => deeplyFulfilled(nonp));
      }
      default: {
        throw assert.fail(X3`Unexpected passStyle ${q5(passStyle)}`, TypeError);
      }
    }
  };
  harden_default(deeplyFulfilled);

  // ../marshal/src/encodeToCapData.js
  var { ownKeys: ownKeys13 } = Reflect;
  var { isArray: isArray4 } = Array;
  var {
    getOwnPropertyDescriptors: getOwnPropertyDescriptors8,
    defineProperties: defineProperties2,
    is,
    entries: entries3,
    fromEntries: fromEntries2,
    freeze: freeze8,
    hasOwn: hasOwn7
  } = Object;
  var QCLASS = "@qclass";
  var hasQClass = (encoded) => hasOwn7(encoded, QCLASS);
  var qclassMatches = (encoded, qclass) => !isPrimitive3(encoded) && !isArray4(encoded) && hasQClass(encoded) && encoded[QCLASS] === qclass;
  var dontEncodeRemotableToCapData = (rem) => Fail5`remotable unexpected: ${rem}`;
  var dontEncodePromiseToCapData = (prom) => Fail5`promise unexpected: ${prom}`;
  var dontEncodeErrorToCapData = (err) => Fail5`error object unexpected: ${err}`;
  var makeEncodeToCapData = (encodeOptions = {}) => {
    const {
      encodeRemotableToCapData = dontEncodeRemotableToCapData,
      encodePromiseToCapData = dontEncodePromiseToCapData,
      encodeErrorToCapData = dontEncodeErrorToCapData
    } = encodeOptions;
    const encodeToCapDataRecur = (passable) => {
      const passStyle = passStyleOf(passable);
      switch (passStyle) {
        case "null":
        case "boolean":
        case "string": {
          return passable;
        }
        case "undefined": {
          return { [QCLASS]: "undefined" };
        }
        case "number": {
          if (Number.isNaN(passable)) {
            return { [QCLASS]: "NaN" };
          } else if (passable === Infinity) {
            return { [QCLASS]: "Infinity" };
          } else if (passable === -Infinity) {
            return { [QCLASS]: "-Infinity" };
          }
          return is(passable, -0) ? 0 : passable;
        }
        case "bigint": {
          return {
            [QCLASS]: "bigint",
            digits: String(passable)
          };
        }
        case "symbol": {
          assertPassableSymbol(passable);
          const name = (
            /** @type {string} */
            nameForPassableSymbol(passable)
          );
          return {
            [QCLASS]: "symbol",
            name
          };
        }
        case "copyRecord": {
          if (hasOwn7(passable, QCLASS)) {
            const { [QCLASS]: qclassValue, ...rest } = passable;
            const result = {
              [QCLASS]: "hilbert",
              original: encodeToCapDataRecur(qclassValue)
            };
            if (ownKeys13(rest).length >= 1) {
              result.rest = encodeToCapDataRecur(freeze8(rest));
            }
            return result;
          }
          const names = ownKeys13(passable).sort();
          return fromEntries2(
            names.map((name) => [name, encodeToCapDataRecur(passable[name])])
          );
        }
        case "copyArray": {
          return passable.map(encodeToCapDataRecur);
        }
        case "byteArray": {
          throw Fail5`marsal of byteArray not yet implemented: ${passable}`;
        }
        case "tagged": {
          return {
            [QCLASS]: "tagged",
            tag: getTag(passable),
            payload: encodeToCapDataRecur(passable.payload)
          };
        }
        case "remotable": {
          const encoded = encodeRemotableToCapData(
            passable,
            encodeToCapDataRecur
          );
          if (qclassMatches(encoded, "slot")) {
            return encoded;
          }
          throw Fail5`internal: Remotable encoding must be an object with ${q5(
            QCLASS
          )} ${q5("slot")}: ${encoded}`;
        }
        case "promise": {
          const encoded = encodePromiseToCapData(passable, encodeToCapDataRecur);
          if (qclassMatches(encoded, "slot")) {
            return encoded;
          }
          throw Fail5`internal: Promise encoding must be an object with ${q5(
            QCLASS,
            "slot"
          )}: ${encoded}`;
        }
        case "error": {
          const encoded = encodeErrorToCapData(passable, encodeToCapDataRecur);
          if (qclassMatches(encoded, "error")) {
            return encoded;
          }
          throw Fail5`internal: Error encoding must be an object with ${q5(
            QCLASS,
            "error"
          )}: ${encoded}`;
        }
        default: {
          throw assert.fail(
            X3`internal: Unrecognized passStyle ${q5(passStyle)}`,
            TypeError
          );
        }
      }
    };
    const encodeToCapData = (passable) => {
      if (isErrorLike(passable)) {
        return harden_default(encodeErrorToCapData(passable, encodeToCapDataRecur));
      }
      return harden_default(encodeToCapDataRecur(passable));
    };
    return harden_default(encodeToCapData);
  };
  harden_default(makeEncodeToCapData);
  var dontDecodeRemotableOrPromiseFromCapData = (slotEncoding) => Fail5`remotable or promise unexpected: ${slotEncoding}`;
  var dontDecodeErrorFromCapData = (errorEncoding) => Fail5`error unexpected: ${errorEncoding}`;
  var makeDecodeFromCapData = (decodeOptions = {}) => {
    const {
      decodeRemotableFromCapData = dontDecodeRemotableOrPromiseFromCapData,
      decodePromiseFromCapData = dontDecodeRemotableOrPromiseFromCapData,
      decodeErrorFromCapData = dontDecodeErrorFromCapData
    } = decodeOptions;
    decodeRemotableFromCapData === decodePromiseFromCapData || Fail5`An implementation restriction for now: If either decodeRemotableFromCapData or decodePromiseFromCapData is provided, both must be provided and they must be the same: ${q5(
      decodeRemotableFromCapData
    )} vs ${q5(decodePromiseFromCapData)}`;
    const decodeFromCapData = (jsonEncoded) => {
      if (isPrimitive3(jsonEncoded)) {
        return jsonEncoded;
      }
      if (isArray4(jsonEncoded)) {
        return jsonEncoded.map((encodedVal) => decodeFromCapData(encodedVal));
      } else if (hasQClass(jsonEncoded)) {
        const qclass = jsonEncoded[QCLASS];
        typeof qclass === "string" || Fail5`invalid ${q5(QCLASS)} typeof ${q5(typeof qclass)}`;
        switch (qclass) {
          // Encoding of primitives not handled by JSON
          case "undefined": {
            return void 0;
          }
          case "NaN": {
            return NaN;
          }
          case "Infinity": {
            return Infinity;
          }
          case "-Infinity": {
            return -Infinity;
          }
          case "bigint": {
            const { digits } = jsonEncoded;
            typeof digits === "string" || Fail5`invalid digits typeof ${q5(typeof digits)}`;
            return BigInt(digits);
          }
          case "@@asyncIterator": {
            return Symbol.asyncIterator;
          }
          case "symbol": {
            const { name } = jsonEncoded;
            return passableSymbolForName(name);
          }
          case "tagged": {
            const { tag, payload } = jsonEncoded;
            return makeTagged(tag, decodeFromCapData(payload));
          }
          case "slot": {
            const decoded = decodeRemotableFromCapData(
              jsonEncoded,
              decodeFromCapData
            );
            return decoded;
          }
          case "error": {
            const decoded = decodeErrorFromCapData(
              jsonEncoded,
              decodeFromCapData
            );
            if (passStyleOf(decoded) === "error") {
              return decoded;
            }
            throw Fail5`internal: decodeErrorFromCapData option must return an error: ${decoded}`;
          }
          case "hilbert": {
            const { original, rest } = jsonEncoded;
            hasOwn7(jsonEncoded, "original") || Fail5`Invalid Hilbert Hotel encoding ${jsonEncoded}`;
            const result = { [QCLASS]: decodeFromCapData(original) };
            if (hasOwn7(jsonEncoded, "rest")) {
              const isNonEmptyObject = typeof rest === "object" && rest !== null && ownKeys13(rest).length >= 1;
              if (!isNonEmptyObject) {
                throw Fail5`Rest encoding must be a non-empty object: ${rest}`;
              }
              const restObj = decodeFromCapData(rest);
              !hasOwn7(restObj, QCLASS) || Fail5`Rest must not contain its own definition of ${q5(QCLASS)}`;
              defineProperties2(result, getOwnPropertyDescriptors8(restObj));
            }
            return result;
          }
          // @ts-expect-error This is the error case we're testing for
          case "ibid": {
            throw Fail5`The capData protocol no longer supports ${q5(QCLASS)} ${q5(
              qclass
            )}`;
          }
          default: {
            throw assert.fail(
              X3`unrecognized ${q5(QCLASS)} ${q5(qclass)}`,
              TypeError
            );
          }
        }
      } else {
        assert(typeof jsonEncoded === "object" && jsonEncoded !== null);
        const decodeEntry = ([name, encodedVal]) => {
          typeof name === "string" || Fail5`Property ${q5(name)} of ${jsonEncoded} must be a string`;
          return [name, decodeFromCapData(encodedVal)];
        };
        const decodedEntries = entries3(jsonEncoded).map(decodeEntry);
        return fromEntries2(decodedEntries);
      }
    };
    return harden_default(decodeFromCapData);
  };

  // ../nat/src/index.js
  var ZERO_N = BigInt(0);
  var ONE_N = BigInt(1);
  var { freeze: freeze9 } = Object;
  var isNat = (allegedNum) => {
    if (typeof allegedNum === "bigint") {
      return allegedNum >= 0;
    }
    if (typeof allegedNum !== "number") {
      return false;
    }
    return Number.isSafeInteger(allegedNum) && allegedNum >= 0;
  };
  freeze9(isNat);
  var Nat = (allegedNum) => {
    if (typeof allegedNum === "bigint") {
      if (allegedNum < ZERO_N) {
        throw RangeError(`${allegedNum} is negative`);
      }
      return allegedNum;
    }
    if (typeof allegedNum === "number") {
      if (!Number.isSafeInteger(allegedNum)) {
        throw RangeError(`${allegedNum} is not a safe integer`);
      }
      if (allegedNum < 0) {
        throw RangeError(`${allegedNum} is negative`);
      }
      return BigInt(allegedNum);
    }
    throw TypeError(
      `${allegedNum} is a ${typeof allegedNum} but must be a bigint or a number`
    );
  };
  freeze9(Nat);

  // ../marshal/src/encodeToSmallcaps.js
  var { ownKeys: ownKeys14 } = Reflect;
  var { isArray: isArray5 } = Array;
  var { is: is2, entries: entries4, fromEntries: fromEntries3, hasOwn: hasOwn8 } = Object;
  var BANG = "!".charCodeAt(0);
  var DASH = "-".charCodeAt(0);
  var startsSpecial = (encodedStr) => {
    if (encodedStr === "") {
      return false;
    }
    const code = encodedStr.charCodeAt(0);
    return BANG <= code && code <= DASH;
  };
  var dontEncodeRemotableToSmallcaps = (rem) => Fail5`remotable unexpected: ${rem}`;
  var dontEncodePromiseToSmallcaps = (prom) => Fail5`promise unexpected: ${prom}`;
  var dontEncodeErrorToSmallcaps = (err) => Fail5`error object unexpected: ${q5(err)}`;
  var makeEncodeToSmallcaps = (encodeOptions = {}) => {
    const {
      encodeRemotableToSmallcaps = dontEncodeRemotableToSmallcaps,
      encodePromiseToSmallcaps = dontEncodePromiseToSmallcaps,
      encodeErrorToSmallcaps = dontEncodeErrorToSmallcaps
    } = encodeOptions;
    const assertEncodedError = (encoding) => {
      typeof encoding === "object" && hasOwn8(encoding, "#error") || Fail5`internal: Error encoding must have "#error" property: ${q5(
        encoding
      )}`;
      const message = encoding["#error"];
      typeof message === "string" && (!startsSpecial(message) || message.charAt(0) === "!") || Fail5`internal: Error encoding must have string message: ${q5(message)}`;
    };
    const encodeToSmallcapsRecur = (passable) => {
      const passStyle = passStyleOf(passable);
      switch (passStyle) {
        case "null":
        case "boolean": {
          return passable;
        }
        case "string": {
          if (startsSpecial(passable)) {
            return `!${passable}`;
          }
          return passable;
        }
        case "undefined": {
          return "#undefined";
        }
        case "number": {
          if (Number.isNaN(passable)) {
            return "#NaN";
          } else if (passable === Infinity) {
            return "#Infinity";
          } else if (passable === -Infinity) {
            return "#-Infinity";
          }
          return is2(passable, -0) ? 0 : passable;
        }
        case "bigint": {
          const str = String(passable);
          return (
            /** @type {bigint} */
            passable < ZERO_N ? str : `+${str}`
          );
        }
        case "symbol": {
          assertPassableSymbol(passable);
          const name = (
            /** @type {string} */
            nameForPassableSymbol(passable)
          );
          return `%${name}`;
        }
        case "copyRecord": {
          const names = ownKeys14(passable).sort();
          return fromEntries3(
            names.map((name) => [
              encodeToSmallcapsRecur(name),
              encodeToSmallcapsRecur(passable[name])
            ])
          );
        }
        case "copyArray": {
          return passable.map(encodeToSmallcapsRecur);
        }
        case "byteArray": {
          throw Fail5`marsal of byteArray not yet implemented: ${passable}`;
        }
        case "tagged": {
          return {
            "#tag": encodeToSmallcapsRecur(getTag(passable)),
            payload: encodeToSmallcapsRecur(passable.payload)
          };
        }
        case "remotable": {
          const result = encodeRemotableToSmallcaps(
            passable,
            encodeToSmallcapsRecur
          );
          if (typeof result === "string" && result.charAt(0) === "$") {
            return result;
          }
          throw Fail5`internal: Remotable encoding must start with "$": ${result}`;
        }
        case "promise": {
          const result = encodePromiseToSmallcaps(
            passable,
            encodeToSmallcapsRecur
          );
          if (typeof result === "string" && result.charAt(0) === "&") {
            return result;
          }
          throw Fail5`internal: Promise encoding must start with "&": ${result}`;
        }
        case "error": {
          const result = encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur);
          assertEncodedError(result);
          return result;
        }
        default: {
          throw assert.fail(
            X3`internal: Unrecognized passStyle ${q5(passStyle)}`,
            TypeError
          );
        }
      }
    };
    const encodeToSmallcaps = (passable) => {
      if (isErrorLike(passable)) {
        const result = harden_default(
          encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur)
        );
        assertEncodedError(result);
        return result;
      }
      return harden_default(encodeToSmallcapsRecur(passable));
    };
    return harden_default(encodeToSmallcaps);
  };
  harden_default(makeEncodeToSmallcaps);
  var dontDecodeRemotableFromSmallcaps = (encoding) => Fail5`remotable unexpected: ${encoding}`;
  var dontDecodePromiseFromSmallcaps = (encoding) => Fail5`promise unexpected: ${encoding}`;
  var dontDecodeErrorFromSmallcaps = (encoding) => Fail5`error unexpected: ${q5(encoding)}`;
  var makeDecodeFromSmallcaps = (decodeOptions = {}) => {
    const {
      decodeRemotableFromSmallcaps = dontDecodeRemotableFromSmallcaps,
      decodePromiseFromSmallcaps = dontDecodePromiseFromSmallcaps,
      decodeErrorFromSmallcaps = dontDecodeErrorFromSmallcaps
    } = decodeOptions;
    const decodeFromSmallcaps = (encoding) => {
      switch (typeof encoding) {
        case "boolean":
        case "number": {
          return encoding;
        }
        case "string": {
          if (!startsSpecial(encoding)) {
            return encoding;
          }
          const c = encoding.charAt(0);
          switch (c) {
            case "!": {
              return encoding.slice(1);
            }
            case "%": {
              return passableSymbolForName(encoding.slice(1));
            }
            case "#": {
              switch (encoding) {
                case "#undefined": {
                  return void 0;
                }
                case "#NaN": {
                  return NaN;
                }
                case "#Infinity": {
                  return Infinity;
                }
                case "#-Infinity": {
                  return -Infinity;
                }
                default: {
                  throw assert.fail(
                    X3`unknown constant "${q5(encoding)}"`,
                    TypeError
                  );
                }
              }
            }
            case "+":
            case "-": {
              return BigInt(encoding);
            }
            case "$": {
              const result = decodeRemotableFromSmallcaps(
                encoding,
                decodeFromSmallcaps
              );
              if (passStyleOf(result) !== "remotable") {
                Fail5`internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`;
              }
              return result;
            }
            case "&": {
              const result = decodePromiseFromSmallcaps(
                encoding,
                decodeFromSmallcaps
              );
              if (passStyleOf(result) !== "promise") {
                Fail5`internal: decodePromiseFromSmallcaps option must return a promise: ${result}`;
              }
              return result;
            }
            default: {
              throw Fail5`Special char ${q5(
                c
              )} reserved for future use: ${encoding}`;
            }
          }
        }
        case "object": {
          if (encoding === null) {
            return encoding;
          }
          if (isArray5(encoding)) {
            return encoding.map((val) => decodeFromSmallcaps(val));
          }
          if (hasOwn8(encoding, "#tag")) {
            const { "#tag": tag, payload, ...rest } = encoding;
            typeof tag === "string" || Fail5`Value of "#tag", the tag, must be a string: ${encoding}`;
            ownKeys14(rest).length === 0 || Fail5`#tag record unexpected properties: ${q5(ownKeys14(rest))}`;
            return makeTagged(
              decodeFromSmallcaps(tag),
              decodeFromSmallcaps(payload)
            );
          }
          if (hasOwn8(encoding, "#error")) {
            const result = decodeErrorFromSmallcaps(
              encoding,
              decodeFromSmallcaps
            );
            passStyleOf(result) === "error" || Fail5`internal: decodeErrorFromSmallcaps option must return an error: ${result}`;
            return result;
          }
          const decodeEntry = ([encodedName, encodedVal]) => {
            typeof encodedName === "string" || Fail5`Property name ${q5(
              encodedName
            )} of ${encoding} must be a string`;
            encodedName.charAt(0) !== "#" || Fail5`Unrecognized record type ${q5(encodedName)}: ${encoding}`;
            const name = decodeFromSmallcaps(encodedName);
            typeof name === "string" || Fail5`Decoded property name ${name} from ${encoding} must be a string`;
            return [name, decodeFromSmallcaps(encodedVal)];
          };
          const decodedEntries = entries4(encoding).map(decodeEntry);
          return fromEntries3(decodedEntries);
        }
        default: {
          throw assert.fail(
            X3`internal: unrecognized JSON typeof ${q5(
              typeof encoding
            )}: ${encoding}`,
            TypeError
          );
        }
      }
    };
    return harden_default(decodeFromSmallcaps);
  };

  // ../marshal/src/marshal.js
  var { defineProperties: defineProperties3, hasOwn: hasOwn9 } = Object;
  var { isArray: isArray6 } = Array;
  var { ownKeys: ownKeys15 } = Reflect;
  var defaultValToSlotFn = (x) => x;
  var defaultSlotToValFn = (x, _) => x;
  var makeMarshal = (convertValToSlot = defaultValToSlotFn, convertSlotToVal = defaultSlotToValFn, {
    errorTagging = "on",
    marshalName = "anon-marshal",
    // TODO Temporary hack.
    // See https://github.com/Agoric/agoric-sdk/issues/2780
    errorIdNum = 1e4,
    // We prefer that the caller instead log to somewhere hidden
    // to be revealed when correlating with the received error.
    marshalSaveError = (err) => console.log("Temporary logging of sent error", err),
    // Default to 'capdata' because it was implemented first.
    // Sometimes, ontogeny does recapitulate phylogeny ;)
    serializeBodyFormat = "capdata"
  } = {}) => {
    assert.typeof(marshalName, "string");
    errorTagging === "on" || errorTagging === "off" || Fail5`The errorTagging option can only be "on" or "off" ${errorTagging}`;
    const nextErrorId = () => {
      errorIdNum += 1;
      return `error:${marshalName}#${errorIdNum}`;
    };
    const toCapData = (root) => {
      const slots = [];
      const slotMap = /* @__PURE__ */ new Map();
      const encodeSlotCommon = (passable) => {
        let index = slotMap.get(passable);
        if (index !== void 0) {
          assert.typeof(index, "number");
          return harden_default({ index, repeat: true });
        }
        index = slots.length;
        const slot = convertValToSlot(passable);
        slots.push(slot);
        slotMap.set(passable, index);
        return harden_default({ index, repeat: false });
      };
      const encodeErrorCommon = (err, encodeRecur) => {
        const message = encodeRecur(`${err.message}`);
        assert.typeof(message, "string");
        const name = encodeRecur(`${err.name}`);
        assert.typeof(name, "string");
        if (errorTagging === "on") {
          const errorId = encodeRecur(nextErrorId());
          assert.typeof(errorId, "string");
          annotateError2(err, X3`Sent as ${errorId}`);
          marshalSaveError(err);
          return harden_default({ errorId, message, name });
        } else {
          return harden_default({ message, name });
        }
      };
      if (serializeBodyFormat === "capdata") {
        const encodeSlotToCapData = (passable, iface = void 0) => {
          const { index, repeat } = encodeSlotCommon(passable);
          if (repeat === true || iface === void 0) {
            return harden_default({ [QCLASS]: "slot", index });
          } else {
            return harden_default({ [QCLASS]: "slot", iface, index });
          }
        };
        const encodeRemotableToCapData = (val, _encodeRecur) => encodeSlotToCapData(val, getInterfaceOf(val));
        const encodePromiseToCapData = (promise, _encodeRecur) => encodeSlotToCapData(promise);
        const encodeErrorToCapData = (err, encodeRecur) => {
          const errData = encodeErrorCommon(err, encodeRecur);
          return harden_default({ [QCLASS]: "error", ...errData });
        };
        const encodeToCapData = makeEncodeToCapData({
          encodeRemotableToCapData,
          encodePromiseToCapData,
          encodeErrorToCapData
        });
        const encoded = encodeToCapData(root);
        const body = JSON.stringify(encoded);
        return harden_default({
          body,
          slots
        });
      } else if (serializeBodyFormat === "smallcaps") {
        const encodeSlotToSmallcaps = (prefix, passable, iface = void 0) => {
          const { index, repeat } = encodeSlotCommon(passable);
          if (repeat === true || iface === void 0) {
            return `${prefix}${index}`;
          }
          return `${prefix}${index}.${iface}`;
        };
        const encodeRemotableToSmallcaps = (remotable, _encodeRecur) => encodeSlotToSmallcaps("$", remotable, getInterfaceOf(remotable));
        const encodePromiseToSmallcaps = (promise, _encodeRecur) => encodeSlotToSmallcaps("&", promise);
        const encodeErrorToSmallcaps = (err, encodeRecur) => {
          const errData = encodeErrorCommon(err, encodeRecur);
          const { message, ...rest } = errData;
          return harden_default({ "#error": message, ...rest });
        };
        const encodeToSmallcaps = makeEncodeToSmallcaps({
          encodeRemotableToSmallcaps,
          encodePromiseToSmallcaps,
          encodeErrorToSmallcaps
        });
        const encoded = encodeToSmallcaps(root);
        const smallcapsBody = JSON.stringify(encoded);
        return harden_default({
          // Valid JSON cannot begin with a '#', so this is a valid signal
          // indicating smallcaps format.
          body: `#${smallcapsBody}`,
          slots
        });
      } else {
        throw Fail5`Unrecognized serializeBodyFormat: ${q5(serializeBodyFormat)}`;
      }
    };
    const makeFullRevive = (slots) => {
      const valMap = /* @__PURE__ */ new Map();
      const decodeSlotCommon = (slotData) => {
        const { iface = void 0, index, ...rest } = slotData;
        ownKeys15(rest).length === 0 || Fail5`unexpected encoded slot properties ${q5(ownKeys15(rest))}`;
        const extant = valMap.get(index);
        if (extant) {
          return extant;
        }
        const slot = slots[Number(Nat(index))];
        const val = convertSlotToVal(slot, iface);
        valMap.set(index, val);
        return val;
      };
      const decodeErrorCommon = (errData, decodeRecur) => {
        const {
          errorId = void 0,
          message,
          name,
          cause = void 0,
          errors = void 0,
          ...rest
        } = errData;
        const dName = decodeRecur(name);
        const dMessage = decodeRecur(message);
        const dErrorId = (
          /** @type {string} */
          errorId && decodeRecur(errorId)
        );
        if (typeof dName !== "string") {
          throw Fail5`invalid error name typeof ${q5(typeof dName)}`;
        }
        if (typeof dMessage !== "string") {
          throw Fail5`invalid error message typeof ${q5(typeof dMessage)}`;
        }
        const errConstructor = getErrorConstructor(dName) || Error;
        const errorName = dErrorId === void 0 ? `Remote${errConstructor.name}` : `Remote${errConstructor.name}(${dErrorId})`;
        const options = {
          errorName,
          sanitize: false
        };
        if (cause) {
          options.cause = decodeRecur(cause);
        }
        if (errors) {
          options.errors = decodeRecur(errors);
        }
        const rawError = makeError(dMessage, errConstructor, options);
        const descs = objectMap(rest, (data) => ({
          value: decodeRecur(data),
          writable: false,
          enumerable: false,
          configurable: false
        }));
        defineProperties3(rawError, descs);
        harden_default(rawError);
        return toPassableError(rawError);
      };
      const decodeRemotableOrPromiseFromCapData = (rawTree, _decodeRecur) => {
        const { [QCLASS]: _, ...slotData } = rawTree;
        return decodeSlotCommon(slotData);
      };
      const decodeErrorFromCapData = (rawTree, decodeRecur) => {
        const { [QCLASS]: _, ...errData } = rawTree;
        return decodeErrorCommon(errData, decodeRecur);
      };
      const reviveFromCapData = makeDecodeFromCapData({
        decodeRemotableFromCapData: decodeRemotableOrPromiseFromCapData,
        decodePromiseFromCapData: decodeRemotableOrPromiseFromCapData,
        decodeErrorFromCapData
      });
      const makeDecodeSlotFromSmallcaps = (prefix) => {
        return (stringEncoding, _decodeRecur) => {
          assert(stringEncoding.charAt(0) === prefix);
          const i = stringEncoding.indexOf(".");
          const index = Number(stringEncoding.slice(1, i < 0 ? void 0 : i));
          const iface = i < 0 ? void 0 : stringEncoding.slice(i + 1);
          return decodeSlotCommon({ iface, index });
        };
      };
      const decodeRemotableFromSmallcaps = makeDecodeSlotFromSmallcaps("$");
      const decodePromiseFromSmallcaps = makeDecodeSlotFromSmallcaps("&");
      const decodeErrorFromSmallcaps = (encoding, decodeRecur) => {
        const { "#error": message, ...restErrData } = encoding;
        !hasOwn9(restErrData, "message") || Fail5`unexpected encoded error property ${q5("message")}`;
        return decodeErrorCommon({ message, ...restErrData }, decodeRecur);
      };
      const reviveFromSmallcaps = makeDecodeFromSmallcaps({
        // @ts-ignore XXX SmallCapsEncoding
        decodeRemotableFromSmallcaps,
        // @ts-ignore XXX SmallCapsEncoding
        decodePromiseFromSmallcaps,
        decodeErrorFromSmallcaps
      });
      return harden_default({ reviveFromCapData, reviveFromSmallcaps });
    };
    const fromCapData = (data) => {
      const { body, slots } = data;
      typeof body === "string" || Fail5`unserialize() given non-capdata (.body is ${body}, not string)`;
      isArray6(data.slots) || Fail5`unserialize() given non-capdata (.slots are not Array)`;
      const { reviveFromCapData, reviveFromSmallcaps } = makeFullRevive(slots);
      let result;
      if (body.charAt(0) === "#") {
        const smallcapsBody = body.slice(1);
        const encoding = harden_default(JSON.parse(smallcapsBody));
        result = harden_default(reviveFromSmallcaps(encoding));
      } else {
        const rawTree = harden_default(JSON.parse(body));
        result = harden_default(reviveFromCapData(rawTree));
      }
      assertPassable(result);
      return (
        /** @type {PassableCap} */
        result
      );
    };
    return harden_default({
      toCapData,
      fromCapData,
      // for backwards compatibility
      /** @deprecated use toCapData */
      serialize: toCapData,
      /** @deprecated use fromCapData */
      unserialize: fromCapData
    });
  };

  // ../marshal/src/marshal-stringify.js
  var { freeze: freeze10 } = Object;
  var doNotConvertValToSlot = (val) => Fail5`Marshal's stringify rejects presences and promises ${val}`;
  var doNotConvertSlotToVal = (slot, _iface) => Fail5`Marshal's parse must not encode any slots ${slot}`;
  var badArrayHandler = harden_default({
    get: (_target, name, _receiver) => {
      if (name === "length") {
        return 0;
      }
      throw Fail5`Marshal's parse must not encode any slot positions ${name}`;
    }
  });
  var arrayTarget = freeze10(
    /** @type {any[]} */
    []
  );
  var badArray = new Proxy(arrayTarget, badArrayHandler);
  var { serialize, unserialize } = makeMarshal(
    doNotConvertValToSlot,
    doNotConvertSlotToVal,
    {
      errorTagging: "off",
      // TODO fix tests to works with smallcaps.
      serializeBodyFormat: "capdata"
    }
  );
  var stringify = (val) => serialize(val).body;
  harden_default(stringify);
  var parse = (str) => unserialize(
    // `freeze` but not `harden` since the `badArray` proxy and its target
    // must remain trapping.
    // See https://github.com/endojs/endo/blob/master/packages/ses/docs/preparing-for-stabilize.md
    freeze10({
      body: str,
      slots: badArray
    })
  );
  harden_default(parse);

  // ../marshal/src/marshal-justin.js
  var { ownKeys: ownKeys16 } = Reflect;
  var { isArray: isArray7 } = Array;
  var { stringify: quote2 } = JSON;
  var makeYesIndenter = () => {
    const strings = [];
    let level = 0;
    let needSpace = false;
    const line = () => {
      needSpace = false;
      return strings.push("\n", "  ".repeat(level));
    };
    return harden_default({
      open: (openBracket) => {
        level += 1;
        if (needSpace) {
          strings.push(" ");
        }
        needSpace = false;
        return strings.push(openBracket);
      },
      line,
      next: (token) => {
        if (needSpace && token !== "," && token !== ")") {
          strings.push(" ");
        }
        needSpace = true;
        return strings.push(token);
      },
      close: (closeBracket) => {
        assert(level >= 1);
        level -= 1;
        line();
        return strings.push(closeBracket);
      },
      done: () => {
        assert.equal(level, 0);
        return strings.join("");
      }
    });
  };
  var badPairPattern = /^(?:\w\w|<<|>>|\+\+|--|<!|->)$/;
  var makeNoIndenter = () => {
    const strings = [];
    return harden_default({
      open: (openBracket) => strings.push(openBracket),
      line: () => strings.length,
      next: (token) => {
        if (strings.length >= 1) {
          const last = strings[strings.length - 1];
          if (last.length >= 1 && token.length >= 1) {
            const pair = `${last[last.length - 1]}${token[0]}`;
            if (badPairPattern.test(pair)) {
              strings.push(" ");
            }
          }
        }
        return strings.push(token);
      },
      close: (closeBracket) => {
        if (strings.length >= 1 && strings[strings.length - 1] === ",") {
          strings.pop();
        }
        return strings.push(closeBracket);
      },
      done: () => strings.join("")
    });
  };
  var identPattern = /^[a-zA-Z]\w*$/;
  harden_default(identPattern);
  var AtAtPrefixPattern2 = /^@@(.*)$/;
  harden_default(AtAtPrefixPattern2);
  var decodeToJustin = (encoding, shouldIndent = false, slots = []) => {
    const prepare = (rawTree) => {
      if (isPrimitive3(rawTree)) {
        return;
      }
      assert.typeof(rawTree, "object");
      assert(rawTree !== null);
      if (QCLASS in rawTree) {
        const qclass = rawTree[QCLASS];
        typeof qclass === "string" || Fail5`invalid qclass typeof ${q5(typeof qclass)}`;
        assert(!isArray7(rawTree));
        switch (rawTree["@qclass"]) {
          case "undefined":
          case "NaN":
          case "Infinity":
          case "-Infinity": {
            return;
          }
          case "bigint": {
            const { digits } = rawTree;
            typeof digits === "string" || Fail5`invalid digits typeof ${q5(typeof digits)}`;
            return;
          }
          case "@@asyncIterator": {
            return;
          }
          case "symbol": {
            const { name } = rawTree;
            assert.typeof(name, "string");
            const sym = passableSymbolForName(name);
            assert.typeof(sym, "symbol");
            return;
          }
          case "tagged": {
            const { tag, payload } = rawTree;
            assert.typeof(tag, "string");
            prepare(payload);
            return;
          }
          case "slot": {
            const { index, iface } = rawTree;
            assert.typeof(index, "number");
            Nat(index);
            if (iface !== void 0) {
              assert.typeof(iface, "string");
            }
            return;
          }
          case "hilbert": {
            const { original, rest } = rawTree;
            "original" in rawTree || Fail5`Invalid Hilbert Hotel encoding ${rawTree}`;
            prepare(original);
            if ("rest" in rawTree) {
              if (typeof rest !== "object") {
                throw Fail5`Rest ${rest} encoding must be an object`;
              }
              if (rest === null) {
                throw Fail5`Rest ${rest} encoding must not be null`;
              }
              if (isArray7(rest)) {
                throw Fail5`Rest ${rest} encoding must not be an array`;
              }
              if (QCLASS in rest) {
                throw Fail5`Rest encoding ${rest} must not contain ${q5(QCLASS)}`;
              }
              const names = ownKeys16(rest);
              for (const name of names) {
                typeof name === "string" || Fail5`Property name ${name} of ${rawTree} must be a string`;
                prepare(rest[name]);
              }
            }
            return;
          }
          case "error": {
            const { name, message } = rawTree;
            if (typeof name !== "string") {
              throw Fail5`invalid error name typeof ${q5(typeof name)}`;
            }
            getErrorConstructor(name) !== void 0 || Fail5`Must be the name of an Error constructor ${name}`;
            typeof message === "string" || Fail5`invalid error message typeof ${q5(typeof message)}`;
            return;
          }
          default: {
            assert.fail(X3`unrecognized ${q5(QCLASS)} ${q5(qclass)}`, TypeError);
          }
        }
      } else if (isArray7(rawTree)) {
        const { length } = rawTree;
        for (let i = 0; i < length; i += 1) {
          prepare(rawTree[i]);
        }
      } else {
        const names = ownKeys16(rawTree);
        for (const name of names) {
          if (typeof name !== "string") {
            throw Fail5`Property name ${name} of ${rawTree} must be a string`;
          }
          prepare(rawTree[name]);
        }
      }
    };
    const makeIndenter = shouldIndent ? makeYesIndenter : makeNoIndenter;
    let out = makeIndenter();
    const decode = (rawTree) => {
      return recur(rawTree);
    };
    const decodeProperty = (name, value) => {
      out.line();
      if (name === "__proto__") {
        out.next(`["__proto__"]:`);
      } else if (identPattern.test(name)) {
        out.next(`${name}:`);
      } else {
        out.next(`${quote2(name)}:`);
      }
      decode(value);
      out.next(",");
    };
    const recur = (rawTree) => {
      if (isPrimitive3(rawTree)) {
        return out.next(quote2(rawTree));
      }
      assert.typeof(rawTree, "object");
      assert(rawTree !== null);
      if (QCLASS in rawTree) {
        const qclass = rawTree[QCLASS];
        assert.typeof(qclass, "string");
        assert(!isArray7(rawTree));
        switch (rawTree["@qclass"]) {
          // Encoding of primitives not handled by JSON
          case "undefined":
          case "NaN":
          case "Infinity":
          case "-Infinity": {
            return out.next(qclass);
          }
          case "bigint": {
            const { digits } = rawTree;
            assert.typeof(digits, "string");
            return out.next(`${BigInt(digits)}n`);
          }
          case "@@asyncIterator": {
            return out.next("Symbol.asyncIterator");
          }
          case "symbol": {
            const { name } = rawTree;
            assert.typeof(name, "string");
            const sym = passableSymbolForName(name);
            assert.typeof(sym, "symbol");
            const registeredName = nameForPassableSymbol(sym);
            if (registeredName === void 0) {
              const match = AtAtPrefixPattern2.exec(name);
              assert(match !== null);
              const suffix = match[1];
              assert(Symbol[suffix] === sym);
              assert(identPattern.test(suffix));
              return out.next(`Symbol.${suffix}`);
            }
            return out.next(`passableSymbolForName(${quote2(registeredName)})`);
          }
          case "tagged": {
            const { tag, payload } = rawTree;
            out.next(`makeTagged(${quote2(tag)}`);
            out.next(",");
            decode(payload);
            return out.next(")");
          }
          case "slot": {
            const { iface } = rawTree;
            const index = Number(Nat(rawTree.index));
            const nestedRender = (arg) => {
              const oldOut = out;
              try {
                out = makeNoIndenter();
                decode(arg);
                return out.done();
              } finally {
                out = oldOut;
              }
            };
            if (index < slots.length) {
              const renderedSlot = nestedRender(slots[index]);
              return iface === void 0 ? out.next(`slotToVal(${renderedSlot})`) : out.next(`slotToVal(${renderedSlot},${nestedRender(iface)})`);
            }
            return iface === void 0 ? out.next(`slot(${index})`) : out.next(`slot(${index},${nestedRender(iface)})`);
          }
          case "hilbert": {
            const { original, rest } = rawTree;
            out.open("{");
            decodeProperty(QCLASS, original);
            if ("rest" in rawTree) {
              assert.typeof(rest, "object");
              assert(rest !== null);
              const names = ownKeys16(rest);
              for (const name of names) {
                if (typeof name !== "string") {
                  throw Fail5`Property name ${q5(
                    name
                  )} of ${rest} must be a string`;
                }
                decodeProperty(name, rest[name]);
              }
            }
            return out.close("}");
          }
          case "error": {
            const {
              name,
              message,
              cause = void 0,
              errors = void 0
            } = rawTree;
            cause === void 0 || Fail5`error cause not yet implemented in marshal-justin`;
            name !== `AggregateError` || Fail5`AggregateError not yet implemented in marshal-justin`;
            errors === void 0 || Fail5`error errors not yet implemented in marshal-justin`;
            return out.next(`${name}(${quote2(message)})`);
          }
          default: {
            throw assert.fail(
              X3`unrecognized ${q5(QCLASS)} ${q5(qclass)}`,
              TypeError
            );
          }
        }
      } else if (isArray7(rawTree)) {
        const { length } = rawTree;
        if (length === 0) {
          return out.next("[]");
        } else {
          out.open("[");
          for (let i = 0; i < length; i += 1) {
            out.line();
            decode(rawTree[i]);
            out.next(",");
          }
          return out.close("]");
        }
      } else {
        const names = (
          /** @type {string[]} */
          ownKeys16(rawTree)
        );
        if (names.length === 0) {
          return out.next("{}");
        } else {
          out.open("{");
          for (const name of names) {
            decodeProperty(name, rawTree[name]);
          }
          return out.close("}");
        }
      }
    };
    prepare(encoding);
    decode(encoding);
    return out.done();
  };
  harden_default(decodeToJustin);
  var passableAsJustin = (passable, shouldIndent = true) => {
    let slotCount = 0;
    const convertValToSlot = (val) => `s${slotCount++}`;
    const { toCapData } = makeMarshal(convertValToSlot);
    const { body, slots } = toCapData(passable);
    const encoded = JSON.parse(body);
    return decodeToJustin(encoded, shouldIndent, slots);
  };
  harden_default(passableAsJustin);
  var qp = (payload) => `\`${passableAsJustin(harden_default(payload), true)}\``;
  harden_default(qp);

  // ../marshal/src/encodePassable.js
  var { isArray: isArray8 } = Array;
  var { fromEntries: fromEntries4, is: is3 } = Object;
  var { ownKeys: ownKeys17 } = Reflect;
  var rC0 = /[\x00-\x1F]/;
  var getSuffix = (str, index) => index === 0 ? str : str.substring(index);
  var recordNames = (record) => (
    // https://github.com/endojs/endo/pull/1260#discussion_r1003657244
    // compares two ways of reverse sorting, and shows that `.sort().reverse()`
    // is currently faster on Moddable XS, while the other way,
    // `.sort(reverseComparator)`, is faster on v8. We currently care more about
    // XS performance, so we reverse sort using `.sort().reverse()`.
    harden_default(
      /** @type {string[]} */
      ownKeys17(record).sort().reverse()
    )
  );
  harden_default(recordNames);
  var recordValues = (record, names) => harden_default(names.map((name) => record[name]));
  harden_default(recordValues);
  var zeroes = Array(16).fill(void 0).map((_, i) => "0".repeat(i));
  var zeroPad = (n, size) => {
    const nStr = `${n}`;
    const fillLen = size - nStr.length;
    if (fillLen === 0) return nStr;
    assert(fillLen > 0 && fillLen < zeroes.length);
    return `${zeroes[fillLen]}${nStr}`;
  };
  harden_default(zeroPad);
  var asNumber = new Float64Array(1);
  var asBits = new BigUint64Array(asNumber.buffer);
  var CanonicalNaNBits = "fff8000000000000";
  var encodeBinary64 = (n) => {
    if (is3(n, -0)) {
      n = 0;
    } else if (is3(n, NaN)) {
      return `f${CanonicalNaNBits}`;
    }
    asNumber[0] = n;
    let bits = asBits[0];
    if (n < 0) {
      bits ^= 0xffffffffffffffffn;
    } else {
      bits ^= 0x8000000000000000n;
    }
    return `f${zeroPad(bits.toString(16), 16)}`;
  };
  var decodeBinary64 = (encoded, skip = 0) => {
    encoded.charAt(skip) === "f" || Fail5`Encoded number expected: ${encoded}`;
    let bits = BigInt(`0x${getSuffix(encoded, skip + 1)}`);
    if (encoded.charAt(skip + 1) < "8") {
      bits ^= 0xffffffffffffffffn;
    } else {
      bits ^= 0x8000000000000000n;
    }
    asBits[0] = bits;
    const result = asNumber[0];
    !is3(result, -0) || Fail5`Unexpected negative zero: ${getSuffix(encoded, skip)}`;
    return result;
  };
  var encodeBigInt = (n) => {
    const abs = n < ZERO_N ? -n : n;
    const nDigits = abs.toString().length;
    const lDigits = nDigits.toString().length;
    if (n < ZERO_N) {
      return `n${// A "#" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      "#".repeat(lDigits - 1)}${// The ten's complement of the count of digits.
      (10 ** lDigits - nDigits).toString().padStart(lDigits, "0")}:${// The ten's complement of the digits.
      (10n ** BigInt(nDigits) + n).toString().padStart(nDigits, "0")}`;
    } else {
      return `p${// A "~" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      "~".repeat(lDigits - 1)}${// The count of digits.
      nDigits}:${// The digits.
      n}`;
    }
  };
  var rBigIntPayload = /([0-9]+)(:([0-9]+$|)|)/s;
  var decodeBigInt = (encoded) => {
    const typePrefix = encoded.charAt(0);
    typePrefix === "p" || typePrefix === "n" || Fail5`Encoded bigint expected: ${encoded}`;
    const {
      index: lDigits,
      1: snDigits,
      2: tail,
      3: digits
    } = encoded.match(rBigIntPayload) || Fail5`Digit count expected: ${encoded}`;
    snDigits.length === lDigits || Fail5`Unary-prefixed decimal digit count expected: ${encoded}`;
    let nDigits = parseInt(snDigits, 10);
    if (typePrefix === "n") {
      nDigits = 10 ** /** @type {number} */
      lDigits - nDigits;
    }
    tail.charAt(0) === ":" || Fail5`Separator expected: ${encoded}`;
    digits.length === nDigits || Fail5`Fixed-length digit sequence expected: ${encoded}`;
    let n = BigInt(digits);
    if (typePrefix === "n") {
      n = -(10n ** BigInt(nDigits) - n);
    }
    return n;
  };
  var stringEscapes = Array(34).fill(void 0).map((_, cp) => {
    switch (String.fromCharCode(cp)) {
      case " ":
        return "!_";
      case "!":
        return "!|";
      default:
        return `!${String.fromCharCode(cp + 33)}`;
    }
  });
  stringEscapes["^".charCodeAt(0)] = "_@";
  stringEscapes["_".charCodeAt(0)] = "__";
  var encodeCompactStringSuffix = (str) => str.replace(/[\0-!^_]/g, (ch) => stringEscapes[ch.charCodeAt(0)]);
  var decodeCompactStringSuffix = (encoded) => {
    return encoded.replace(/([\0-!_])(.|\n)?/g, (esc, prefix, suffix) => {
      switch (esc) {
        case "!_":
          return " ";
        case "!|":
          return "!";
        case "_@":
          return "^";
        case "__":
          return "_";
        default: {
          const ch = (
            /** @type {string} */
            suffix
          );
          prefix === "!" && suffix !== void 0 && ch >= "!" && ch <= "@" || Fail5`invalid string escape: ${q5(esc)}`;
          return String.fromCharCode(ch.charCodeAt(0) - 33);
        }
      }
    });
  };
  var encodeLegacyStringSuffix = (str) => str;
  var decodeLegacyStringSuffix = (encoded) => encoded;
  var encodeCompactArray = (array, encodePassable) => {
    const chars = ["^"];
    for (const element of array) {
      const enc = encodePassable(element);
      chars.push(enc, " ");
    }
    return chars.join("");
  };
  var decodeCompactArray = (encoded, decodePassable, skip = 0) => {
    const elements = [];
    let depth = 0;
    let nextIndex = skip + 1;
    let currentElementStart = skip + 1;
    for (const { 0: ch, index: i } of encoded.matchAll(/[\^ ]/g)) {
      const index = (
        /** @type {number} */
        i
      );
      if (index <= skip) {
        if (index === skip) {
          ch === "^" || Fail5`Encoded array expected: ${getSuffix(encoded, skip)}`;
        }
      } else if (ch === "^") {
        depth += 1;
      } else {
        if (index === nextIndex) {
          depth -= 1;
          depth >= 0 || // prettier-ignore
          Fail5`unexpected array element terminator: ${encoded.slice(skip, index + 2)}`;
        }
        if (depth === 0) {
          elements.push(
            decodePassable(encoded.slice(currentElementStart, index))
          );
          currentElementStart = index + 1;
        }
      }
      nextIndex = index + 1;
    }
    depth === 0 || Fail5`unterminated array: ${getSuffix(encoded, skip)}`;
    nextIndex === encoded.length || Fail5`unterminated array element: ${getSuffix(
      encoded,
      currentElementStart
    )}`;
    return harden_default(elements);
  };
  var encodeLegacyArray = (array, encodePassable) => {
    const chars = ["["];
    for (const element of array) {
      const enc = encodePassable(element);
      for (const c of enc) {
        if (c === "\0" || c === "") {
          chars.push("");
        }
        chars.push(c);
      }
      chars.push("\0");
    }
    return chars.join("");
  };
  var decodeLegacyArray = (encoded, decodePassable, skip = 0) => {
    const elements = [];
    const elemChars = [];
    let stillToSkip = skip + 1;
    let inEscape = false;
    for (const c of encoded) {
      if (stillToSkip > 0) {
        stillToSkip -= 1;
        if (stillToSkip === 0) {
          c === "[" || Fail5`Encoded array expected: ${getSuffix(encoded, skip)}`;
        }
      } else if (inEscape) {
        c === "\0" || c === "" || Fail5`Unexpected character after u0001 escape: ${c}`;
        elemChars.push(c);
      } else if (c === "\0") {
        const encodedElement = elemChars.join("");
        elemChars.length = 0;
        const element = decodePassable(encodedElement);
        elements.push(element);
      } else if (c === "") {
        inEscape = true;
        continue;
      } else {
        elemChars.push(c);
      }
      inEscape = false;
    }
    !inEscape || Fail5`unexpected end of encoding ${getSuffix(encoded, skip)}`;
    elemChars.length === 0 || Fail5`encoding terminated early: ${getSuffix(encoded, skip)}`;
    return harden_default(elements);
  };
  var encodeByteArray = (byteArray, _encodePassable) => {
    Fail5`encodePassable(byteArray) not yet implemented: ${byteArray}`;
    return "";
  };
  var encodeRecord = (record, encodeArray, encodePassable) => {
    const names = recordNames(record);
    const values4 = recordValues(record, names);
    return `(${encodeArray(harden_default([names, values4]), encodePassable)}`;
  };
  var decodeRecord = (encoded, decodeArray, decodePassable, skip = 0) => {
    assert(encoded.charAt(skip) === "(");
    const unzippedEntries = decodeArray(encoded, decodePassable, skip + 1);
    unzippedEntries.length === 2 || Fail5`expected keys,values pair: ${getSuffix(encoded, skip)}`;
    const [keys, vals] = unzippedEntries;
    passStyleOf(keys) === "copyArray" && passStyleOf(vals) === "copyArray" && keys.length === vals.length && keys.every((key) => typeof key === "string") || Fail5`not a valid record encoding: ${getSuffix(encoded, skip)}`;
    const mapEntries = keys.map((key, i) => [key, vals[i]]);
    const record = harden_default(fromEntries4(mapEntries));
    assertRecord(record, "decoded record");
    return record;
  };
  var encodeTagged = (tagged, encodeArray, encodePassable) => `:${encodeArray(harden_default([getTag(tagged), tagged.payload]), encodePassable)}`;
  var decodeTagged = (encoded, decodeArray, decodePassable, skip = 0) => {
    assert(encoded.charAt(skip) === ":");
    const taggedPayload = decodeArray(encoded, decodePassable, skip + 1);
    taggedPayload.length === 2 || Fail5`expected tag,payload pair: ${getSuffix(encoded, skip)}`;
    const [tag, payload] = taggedPayload;
    passStyleOf(tag) === "string" || Fail5`not a valid tagged encoding: ${getSuffix(encoded, skip)}`;
    return makeTagged(tag, payload);
  };
  var makeEncodeRemotable = (unsafeEncodeRemotable, verifyEncoding) => {
    const encodeRemotable = (r, innerEncode) => {
      const encoding = unsafeEncodeRemotable(r, innerEncode);
      typeof encoding === "string" && encoding.charAt(0) === "r" || Fail5`Remotable encoding must start with "r": ${encoding}`;
      verifyEncoding(encoding, "Remotable");
      return encoding;
    };
    return encodeRemotable;
  };
  var makeEncodePromise = (unsafeEncodePromise, verifyEncoding) => {
    const encodePromise = (p, innerEncode) => {
      const encoding = unsafeEncodePromise(p, innerEncode);
      typeof encoding === "string" && encoding.charAt(0) === "?" || Fail5`Promise encoding must start with "?": ${encoding}`;
      verifyEncoding(encoding, "Promise");
      return encoding;
    };
    return encodePromise;
  };
  var makeEncodeError = (unsafeEncodeError, verifyEncoding) => {
    const encodeError = (err, innerEncode) => {
      const encoding = unsafeEncodeError(err, innerEncode);
      typeof encoding === "string" && encoding.charAt(0) === "!" || Fail5`Error encoding must start with "!": ${encoding}`;
      verifyEncoding(encoding, "Error");
      return encoding;
    };
    return encodeError;
  };
  var makeInnerEncode = (encodeStringSuffix, encodeArray, options) => {
    const {
      encodeRemotable: unsafeEncodeRemotable,
      encodePromise: unsafeEncodePromise,
      encodeError: unsafeEncodeError,
      verifyEncoding = () => {
      }
    } = options;
    const encodeRemotable = makeEncodeRemotable(
      unsafeEncodeRemotable,
      verifyEncoding
    );
    const encodePromise = makeEncodePromise(unsafeEncodePromise, verifyEncoding);
    const encodeError = makeEncodeError(unsafeEncodeError, verifyEncoding);
    const innerEncode = (passable) => {
      if (isErrorLike(passable)) {
        return encodeError(passable, innerEncode);
      }
      const passStyle = passStyleOf(passable);
      switch (passStyle) {
        case "null": {
          return "v";
        }
        case "undefined": {
          return "z";
        }
        case "number": {
          return encodeBinary64(passable);
        }
        case "string": {
          return `s${encodeStringSuffix(passable)}`;
        }
        case "boolean": {
          return `b${passable}`;
        }
        case "bigint": {
          return encodeBigInt(passable);
        }
        case "remotable": {
          return encodeRemotable(passable, innerEncode);
        }
        case "error": {
          return encodeError(passable, innerEncode);
        }
        case "promise": {
          return encodePromise(passable, innerEncode);
        }
        case "symbol": {
          const name = nameForPassableSymbol(passable);
          assert.typeof(name, "string");
          return `y${encodeStringSuffix(name)}`;
        }
        case "copyArray": {
          return encodeArray(passable, innerEncode);
        }
        case "byteArray": {
          return encodeByteArray(passable, innerEncode);
        }
        case "copyRecord": {
          return encodeRecord(passable, encodeArray, innerEncode);
        }
        case "tagged": {
          return encodeTagged(passable, encodeArray, innerEncode);
        }
        default: {
          throw Fail5`a ${q5(passStyle)} cannot be used as a collection passable`;
        }
      }
    };
    return innerEncode;
  };
  var liberalDecoders = (
    /** @type {Required<DecodeOptions>} */
    /** @type {unknown} */
    {
      decodeRemotable: (_encoding, _innerDecode) => void 0,
      decodePromise: (_encoding, _innerDecode) => void 0,
      decodeError: (_encoding, _innerDecode) => void 0
    }
  );
  var makeInnerDecode = (decodeStringSuffix, decodeArray, options) => {
    const { decodeRemotable, decodePromise, decodeError } = options;
    const innerDecode = (encoded, skip = 0) => {
      switch (encoded.charAt(skip)) {
        case "v": {
          return null;
        }
        case "z": {
          return void 0;
        }
        case "f": {
          return decodeBinary64(encoded, skip);
        }
        case "s": {
          return decodeStringSuffix(getSuffix(encoded, skip + 1));
        }
        case "b": {
          const substring = getSuffix(encoded, skip + 1);
          if (substring === "true") {
            return true;
          } else if (substring === "false") {
            return false;
          }
          throw Fail5`expected encoded boolean to be "btrue" or "bfalse": ${substring}`;
        }
        case "n":
        case "p": {
          return decodeBigInt(getSuffix(encoded, skip));
        }
        case "r": {
          return decodeRemotable(getSuffix(encoded, skip), innerDecode);
        }
        case "?": {
          return decodePromise(getSuffix(encoded, skip), innerDecode);
        }
        case "!": {
          return decodeError(getSuffix(encoded, skip), innerDecode);
        }
        case "y": {
          const name = decodeStringSuffix(getSuffix(encoded, skip + 1));
          return passableSymbolForName(name);
        }
        case "[":
        case "^": {
          return decodeArray(encoded, innerDecode, skip);
        }
        case "(": {
          return decodeRecord(encoded, decodeArray, innerDecode, skip);
        }
        case ":": {
          return decodeTagged(encoded, decodeArray, innerDecode, skip);
        }
        default: {
          throw Fail5`invalid database key: ${getSuffix(encoded, skip)}`;
        }
      }
    };
    return innerDecode;
  };
  var makePassableKit = (options = {}) => {
    const {
      encodeRemotable = (r, _) => Fail5`remotable unexpected: ${r}`,
      encodePromise = (p, _) => Fail5`promise unexpected: ${p}`,
      encodeError = (err, _) => Fail5`error unexpected: ${err}`,
      format = "legacyOrdered",
      decodeRemotable = (encoding, _) => Fail5`remotable unexpected: ${encoding}`,
      decodePromise = (encoding, _) => Fail5`promise unexpected: ${encoding}`,
      decodeError = (encoding, _) => Fail5`error unexpected: ${encoding}`
    } = options;
    let encodePassable;
    const encodeOptions = { encodeRemotable, encodePromise, encodeError, format };
    if (format === "compactOrdered") {
      const liberalDecode = makeInnerDecode(
        decodeCompactStringSuffix,
        decodeCompactArray,
        liberalDecoders
      );
      const verifyEncoding = (encoding, label) => {
        !encoding.match(rC0) || Fail5`${b(
          label
        )} encoding must not contain a C0 control character: ${encoding}`;
        const decoded = decodeCompactArray(`^v ${encoding} v `, liberalDecode);
        isArray8(decoded) && decoded.length === 3 && decoded[0] === null && decoded[2] === null || Fail5`${b(label)} encoding must be embeddable: ${encoding}`;
      };
      const encodeCompact = makeInnerEncode(
        encodeCompactStringSuffix,
        encodeCompactArray,
        { ...encodeOptions, verifyEncoding }
      );
      encodePassable = (passable) => `~${encodeCompact(passable)}`;
    } else if (format === "legacyOrdered") {
      encodePassable = makeInnerEncode(
        encodeLegacyStringSuffix,
        encodeLegacyArray,
        encodeOptions
      );
    } else {
      throw Fail5`Unrecognized format: ${q5(format)}`;
    }
    const decodeOptions = { decodeRemotable, decodePromise, decodeError };
    const decodeCompact = makeInnerDecode(
      decodeCompactStringSuffix,
      decodeCompactArray,
      decodeOptions
    );
    const decodeLegacy = makeInnerDecode(
      decodeLegacyStringSuffix,
      decodeLegacyArray,
      decodeOptions
    );
    const decodePassable = (encoded) => {
      if (encoded.charAt(0) === "~") {
        return decodeCompact(encoded, 1);
      }
      return decodeLegacy(encoded);
    };
    return harden_default({ encodePassable, decodePassable });
  };
  harden_default(makePassableKit);
  var makeEncodePassable = (encodeOptions) => {
    const { encodePassable } = makePassableKit(encodeOptions);
    return encodePassable;
  };
  harden_default(makeEncodePassable);
  var makeDecodePassable = (decodeOptions) => {
    const { decodePassable } = makePassableKit(decodeOptions);
    return decodePassable;
  };
  harden_default(makeDecodePassable);
  var isEncodedRemotable = (encoded) => encoded.charAt(0) === "r";
  harden_default(isEncodedRemotable);
  var passStylePrefixes = {
    error: "!",
    copyRecord: "(",
    tagged: ":",
    promise: "?",
    copyArray: "[^",
    byteArray: "a",
    boolean: "b",
    number: "f",
    bigint: "np",
    remotable: "r",
    string: "s",
    null: "v",
    symbol: "y",
    // Because Array.prototype.sort puts undefined values at the end without
    // passing them to a comparison function, undefined MUST be the last
    // category.
    undefined: "z"
  };
  Object.setPrototypeOf(passStylePrefixes, null);
  harden_default(passStylePrefixes);

  // ../marshal/src/rankOrder.js
  var { isNaN: NumberIsNaN } = Number;
  var { entries: entries5, fromEntries: fromEntries5, setPrototypeOf: setPrototypeOf3, is: is4 } = Object;
  var ENDO_RANK_STRINGS = getEnvironmentOption("ENDO_RANK_STRINGS", "utf16-code-unit-order", [
    "unicode-code-point-order",
    "error-if-order-choice-matters"
  ]);
  var sameValueZero = (x, y) => x === y || is4(x, y);
  var trivialComparator = (left, right) => (
    // eslint-disable-next-line no-nested-ternary, @endo/restrict-comparison-operands
    left < right ? -1 : left === right ? 0 : 1
  );
  harden_default(trivialComparator);
  var compareByCodePoints = (left, right) => {
    const leftIter = left[Symbol.iterator]();
    const rightIter = right[Symbol.iterator]();
    for (; ; ) {
      const { value: leftChar } = leftIter.next();
      const { value: rightChar } = rightIter.next();
      if (leftChar === void 0 && rightChar === void 0) {
        return 0;
      } else if (leftChar === void 0) {
        return -1;
      } else if (rightChar === void 0) {
        return 1;
      }
      const leftCodepoint = (
        /** @type {number} */
        leftChar.codePointAt(0)
      );
      const rightCodepoint = (
        /** @type {number} */
        rightChar.codePointAt(0)
      );
      if (leftCodepoint < rightCodepoint) return -1;
      if (leftCodepoint > rightCodepoint) return 1;
    }
  };
  harden_default(compareByCodePoints);
  var compareNumerics = (left, right) => {
    if (left < right) return -1;
    if (left > right) return 1;
    if (NumberIsNaN(left) === NumberIsNaN(right)) return 0;
    if (NumberIsNaN(right)) return -1;
    assert(NumberIsNaN(left));
    return 1;
  };
  harden_default(compareNumerics);
  var passStyleRanks = (
    /** @type {PassStyleRanksRecord} */
    fromEntries5(
      entries5(passStylePrefixes).sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes]) => {
        return trivialComparator(leftPrefixes, rightPrefixes);
      }).map(([passStyle, prefixes], index) => {
        prefixes === prefixes.split("").sort().join("") || Fail5`unsorted prefixes for passStyle ${q5(passStyle)}: ${q5(prefixes)}`;
        const cover = [
          prefixes.charAt(0),
          String.fromCharCode(prefixes.charCodeAt(prefixes.length - 1) + 1)
        ];
        return [passStyle, { index, cover }];
      })
    )
  );
  setPrototypeOf3(passStyleRanks, null);
  harden_default(passStyleRanks);
  var getPassStyleCover = (passStyle) => passStyleRanks[passStyle].cover;
  harden_default(getPassStyleCover);
  var memoOfSorted = /* @__PURE__ */ new WeakMap();
  var comparatorMirrorImages = /* @__PURE__ */ new WeakMap();
  var makeComparatorKit = (compareRemotables = (_x, _y) => NaN) => {
    const comparator = (left, right) => {
      if (sameValueZero(left, right)) {
        return 0;
      }
      const leftStyle = passStyleOf(left);
      const rightStyle = passStyleOf(right);
      if (leftStyle !== rightStyle) {
        return compareNumerics(
          passStyleRanks[leftStyle].index,
          passStyleRanks[rightStyle].index
        );
      }
      switch (leftStyle) {
        case "remotable": {
          return compareRemotables(left, right);
        }
        case "undefined":
        case "null":
        case "error":
        case "promise": {
          return 0;
        }
        case "boolean":
        case "bigint": {
          return trivialComparator(left, right);
        }
        case "string": {
          switch (ENDO_RANK_STRINGS) {
            case "utf16-code-unit-order": {
              return trivialComparator(left, right);
            }
            case "unicode-code-point-order": {
              return compareByCodePoints(left, right);
            }
            case "error-if-order-choice-matters": {
              const result1 = trivialComparator(left, right);
              const result2 = compareByCodePoints(left, right);
              result1 === result2 || Fail5`Comparisons differed: ${left} vs ${right}, ${q5(result1)} vs ${q5(result2)}`;
              return result1;
            }
            default: {
              throw Fail5`Unexpected ENDO_RANK_STRINGS ${q5(ENDO_RANK_STRINGS)}`;
            }
          }
        }
        case "symbol": {
          return comparator(
            nameForPassableSymbol(left),
            nameForPassableSymbol(right)
          );
        }
        case "number": {
          return compareNumerics(left, right);
        }
        case "copyRecord": {
          const leftNames = recordNames(left);
          const rightNames = recordNames(right);
          const result = comparator(leftNames, rightNames);
          if (result !== 0) {
            return result;
          }
          const leftValues = recordValues(left, leftNames);
          const rightValues = recordValues(right, rightNames);
          return comparator(leftValues, rightValues);
        }
        case "copyArray": {
          const len = Math.min(left.length, right.length);
          for (let i = 0; i < len; i += 1) {
            const result = comparator(left[i], right[i]);
            if (result !== 0) {
              return result;
            }
          }
          return comparator(left.length, right.length);
        }
        case "byteArray": {
          const { byteLength: leftLen } = left;
          const { byteLength: rightLen } = right;
          if (leftLen < rightLen) {
            return -1;
          }
          if (leftLen > rightLen) {
            return 1;
          }
          const leftArray = Object.getPrototypeOf(left) === ArrayBuffer.prototype ? new Uint8Array(left) : new Uint8Array(left.slice(0));
          const rightArray = Object.getPrototypeOf(right) === ArrayBuffer.prototype ? new Uint8Array(right) : new Uint8Array(right.slice(0));
          for (let i = 0; i < leftLen; i += 1) {
            const leftByte = leftArray[i];
            const rightByte = rightArray[i];
            if (leftByte < rightByte) {
              return -1;
            }
            if (leftByte > rightByte) {
              return 1;
            }
          }
          return 0;
        }
        case "tagged": {
          const labelComp = comparator(getTag(left), getTag(right));
          if (labelComp !== 0) {
            return labelComp;
          }
          return comparator(left.payload, right.payload);
        }
        default: {
          throw Fail5`Unrecognized passStyle: ${q5(leftStyle)}`;
        }
      }
    };
    const outerComparator = (x, y) => (
      // When the inner comparator returns NaN to indicate incomparability,
      // replace that with 0 to indicate a tie.
      /** @type {Exclude<PartialComparison, NaN>} */
      comparator(x, y) || 0
    );
    const antiComparator = (x, y) => outerComparator(y, x);
    memoOfSorted.set(outerComparator, /* @__PURE__ */ new WeakSet());
    memoOfSorted.set(antiComparator, /* @__PURE__ */ new WeakSet());
    comparatorMirrorImages.set(outerComparator, antiComparator);
    comparatorMirrorImages.set(antiComparator, outerComparator);
    return harden_default({ comparator: outerComparator, antiComparator });
  };
  harden_default(makeComparatorKit);
  var comparatorMirrorImage = (comparator) => comparatorMirrorImages.get(comparator);
  harden_default(comparatorMirrorImage);
  var { comparator: compareRank, antiComparator: compareAntiRank } = makeComparatorKit();
  var isRankSorted = (passables, compare) => {
    const subMemoOfSorted = memoOfSorted.get(compare);
    assert(subMemoOfSorted !== void 0);
    if (subMemoOfSorted.has(passables)) {
      return true;
    }
    assert(passStyleOf(passables) === "copyArray");
    for (let i = 1; i < passables.length; i += 1) {
      if (compare(passables[i - 1], passables[i]) >= 1) {
        return false;
      }
    }
    subMemoOfSorted.add(passables);
    return true;
  };
  harden_default(isRankSorted);
  var assertRankSorted = (sorted, compare) => isRankSorted(sorted, compare) || // TODO assert on bug could lead to infinite recursion. Fix.
  // eslint-disable-next-line no-use-before-define
  Fail5`Must be rank sorted: ${sorted} vs ${sortByRank(sorted, compare)}`;
  harden_default(assertRankSorted);
  var sortByRank = (passables, compare) => {
    let unsorted;
    if (Array.isArray(passables)) {
      harden_default(passables);
      if (isRankSorted(passables, compare)) {
        return passables;
      }
      unsorted = [...passables];
    } else {
      unsorted = Array.from(passables, harden_default);
    }
    const sorted = unsorted.sort(compare);
    if (compare(true, void 0) > 0) {
      let i = sorted.length - 1;
      while (i >= 0 && sorted[i] === void 0) i -= 1;
      const n = sorted.length - i - 1;
      if (n > 0 && n < sorted.length) {
        sorted.copyWithin(n, 0);
        sorted.fill(
          /** @type {T} */
          void 0,
          0,
          n
        );
      }
    }
    harden_default(sorted);
    const subMemoOfSorted = memoOfSorted.get(compare);
    assert(subMemoOfSorted !== void 0);
    subMemoOfSorted.add(sorted);
    return sorted;
  };
  harden_default(sortByRank);
  var rankSearch = (sorted, compare, key, bias = "leftMost") => {
    assertRankSorted(sorted, compare);
    let left = 0;
    let right = sorted.length;
    while (left < right) {
      const m = Math.floor((left + right) / 2);
      const comp = compare(sorted[m], key);
      if (comp <= -1 || comp === 0 && bias === "rightMost") {
        left = m + 1;
      } else {
        assert(comp >= 1 || comp === 0 && bias === "leftMost");
        right = m;
      }
    }
    return bias === "leftMost" ? left : right - 1;
  };
  var getIndexCover = (sorted, compare, [leftKey, rightKey]) => {
    assertRankSorted(sorted, compare);
    const leftIndex = rankSearch(sorted, compare, leftKey, "leftMost");
    const rightIndex = rankSearch(sorted, compare, rightKey, "rightMost");
    return [leftIndex, rightIndex];
  };
  harden_default(getIndexCover);
  var FullRankCover = harden_default(["", "{"]);
  var coveredEntries = (sorted, [leftIndex, rightIndex]) => {
    const iterable = harden_default({
      [Symbol.iterator]: () => {
        let i = leftIndex;
        return harden_default({
          next: () => {
            if (i <= rightIndex) {
              const element = sorted[i];
              i += 1;
              return harden_default({ value: [i, element], done: false });
            } else {
              return harden_default({ value: void 0, done: true });
            }
          }
        });
      }
    });
    return iterable;
  };
  harden_default(coveredEntries);
  var maxRank = (compare, a, b2) => compare(a, b2) >= 0 ? a : b2;
  var minRank = (compare, a, b2) => compare(a, b2) <= 0 ? a : b2;
  var unionRankCovers = (compare, covers) => {
    const unionRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
      minRank(compare, leftA, leftB),
      maxRank(compare, rightA, rightB)
    ];
    return covers.reduce(unionRankCoverPair, ["{", ""]);
  };
  harden_default(unionRankCovers);
  var intersectRankCovers = (compare, covers) => {
    const intersectRankCoverPair = ([leftA, rightA], [leftB, rightB]) => [
      maxRank(compare, leftA, leftB),
      minRank(compare, rightA, rightB)
    ];
    return covers.reduce(intersectRankCoverPair, ["", "{"]);
  };
  harden_default(intersectRankCovers);
  var makeFullOrderComparatorKit = (longLived = false) => {
    let numSeen = 0;
    const MapConstructor = longLived ? WeakMap : Map;
    const seen = new MapConstructor();
    const tag = (r) => {
      if (seen.has(r)) {
        return seen.get(r);
      }
      numSeen += 1;
      seen.set(r, numSeen);
      return numSeen;
    };
    const compareRemotables = (x, y) => compareRank(tag(x), tag(y));
    return makeComparatorKit(compareRemotables);
  };
  harden_default(makeFullOrderComparatorKit);

  // ../patterns/src/keys/copySet.js
  var confirmNoDuplicates = (elements, fullCompare, reject) => {
    fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;
    elements = sortByRank(elements, fullCompare);
    const { length } = elements;
    for (let i = 1; i < length; i += 1) {
      const k0 = elements[i - 1];
      const k1 = elements[i];
      if (fullCompare(k0, k1) === 0) {
        return reject && reject`value has duplicate keys: ${k0}`;
      }
    }
    return true;
  };
  var assertNoDuplicates = (elements, fullCompare = void 0) => {
    confirmNoDuplicates(elements, fullCompare, Fail5);
  };
  var confirmElements = (elements, reject) => {
    if (passStyleOf(elements) !== "copyArray") {
      return reject && reject`The keys of a copySet or copyMap must be a copyArray: ${elements}`;
    }
    if (!isRankSorted(elements, compareAntiRank)) {
      return reject && reject`The keys of a copySet or copyMap must be sorted in reverse rank order: ${elements}`;
    }
    return confirmNoDuplicates(elements, void 0, reject);
  };
  harden_default(confirmElements);
  var assertElements = (elements) => {
    confirmElements(elements, Fail5);
  };
  hideAndHardenFunction(assertElements);
  var coerceToElements = (elementsList) => {
    const elements = sortByRank(elementsList, compareAntiRank);
    assertElements(elements);
    return elements;
  };
  harden_default(coerceToElements);
  var makeSetOfElements = (elementIter) => makeTagged("copySet", coerceToElements(elementIter));
  harden_default(makeSetOfElements);

  // ../patterns/src/keys/copyBag.js
  var confirmNoDuplicateKeys = (bagEntries, fullCompare, reject) => {
    fullCompare = fullCompare || makeFullOrderComparatorKit().antiComparator;
    bagEntries = sortByRank(bagEntries, fullCompare);
    const { length } = bagEntries;
    for (let i = 1; i < length; i += 1) {
      const k0 = bagEntries[i - 1][0];
      const k1 = bagEntries[i][0];
      if (fullCompare(k0, k1) === 0) {
        return reject && reject`value has duplicate keys: ${k0}`;
      }
    }
    return true;
  };
  var assertNoDuplicateKeys = (bagEntries, fullCompare = void 0) => {
    confirmNoDuplicateKeys(bagEntries, fullCompare, Fail5);
  };
  var confirmBagEntries = (bagEntries, reject) => {
    if (passStyleOf(bagEntries) !== "copyArray") {
      return reject && reject`The entries of a copyBag must be a copyArray: ${bagEntries}`;
    }
    if (!isRankSorted(bagEntries, compareAntiRank)) {
      return reject && reject`The entries of a copyBag must be sorted in reverse rank order: ${bagEntries}`;
    }
    for (const entry of bagEntries) {
      if (passStyleOf(entry) !== "copyArray" || entry.length !== 2 || typeof entry[1] !== "bigint") {
        return reject && reject`Each entry of a copyBag must be pair of a key and a bigint representing a count: ${entry}`;
      }
      if (entry[1] < 1) {
        return reject && reject`Each entry of a copyBag must have a positive count: ${entry}`;
      }
    }
    return confirmNoDuplicateKeys(bagEntries, void 0, reject);
  };
  harden_default(confirmBagEntries);
  var assertBagEntries = (bagEntries) => {
    confirmBagEntries(bagEntries, Fail5);
  };
  hideAndHardenFunction(assertBagEntries);
  var coerceToBagEntries = (bagEntriesList) => {
    const bagEntries = sortByRank(bagEntriesList, compareAntiRank);
    assertBagEntries(bagEntries);
    return bagEntries;
  };
  harden_default(coerceToBagEntries);
  var makeBagOfEntries = (bagEntryIter) => makeTagged("copyBag", coerceToBagEntries(bagEntryIter));
  harden_default(makeBagOfEntries);

  // ../patterns/src/keys/checkKey.js
  var { ownKeys: ownKeys18 } = Reflect;
  var confirmScalarKey = (val, reject) => {
    if (isAtom(val)) {
      return true;
    }
    const passStyle = passStyleOf(val);
    if (passStyle === "remotable") {
      return true;
    }
    return reject && reject`A ${q5(passStyle)} cannot be a scalar key: ${val}`;
  };
  var isScalarKey = (val) => confirmScalarKey(val, false);
  hideAndHardenFunction(isScalarKey);
  var assertScalarKey = (val) => {
    confirmScalarKey(val, Fail5);
  };
  hideAndHardenFunction(assertScalarKey);
  var keyMemo = /* @__PURE__ */ new WeakSet();
  var confirmKey = (val, reject) => {
    if (isAtom(val)) {
      return true;
    }
    if (keyMemo.has(val)) {
      return true;
    }
    const result = confirmKeyInternal(val, reject);
    if (result) {
      keyMemo.add(val);
    }
    return result;
  };
  harden_default(confirmKey);
  var isKey = (val) => confirmKey(val, false);
  hideAndHardenFunction(isKey);
  var assertKey = (val) => {
    confirmKey(val, Fail5);
  };
  hideAndHardenFunction(assertKey);
  var copySetMemo = /* @__PURE__ */ new WeakSet();
  var confirmCopySet = (s, reject) => {
    if (copySetMemo.has(s)) {
      return true;
    }
    const result = (passStyleOf(s) === "tagged" && getTag(s) === "copySet" || reject && reject`Not a copySet: ${s}`) && confirmElements(s.payload, reject) && confirmKey(s.payload, reject);
    if (result) {
      copySetMemo.add(s);
    }
    return result;
  };
  harden_default(confirmCopySet);
  var isCopySet = (s) => confirmCopySet(s, false);
  hideAndHardenFunction(isCopySet);
  var assertCopySet = (s) => {
    confirmCopySet(s, Fail5);
  };
  hideAndHardenFunction(assertCopySet);
  var getCopySetKeys = (s) => {
    assertCopySet(s);
    return s.payload;
  };
  harden_default(getCopySetKeys);
  var everyCopySetKey = (s, fn) => getCopySetKeys(s).every((key, index) => fn(key, index));
  harden_default(everyCopySetKey);
  var makeCopySet = (elementIter) => {
    const result = makeSetOfElements(elementIter);
    assertCopySet(result);
    return result;
  };
  harden_default(makeCopySet);
  var copyBagMemo = /* @__PURE__ */ new WeakSet();
  var confirmCopyBag = (b2, reject) => {
    if (copyBagMemo.has(b2)) {
      return true;
    }
    const result = (passStyleOf(b2) === "tagged" && getTag(b2) === "copyBag" || reject && reject`Not a copyBag: ${b2}`) && confirmBagEntries(b2.payload, reject) && confirmKey(b2.payload, reject);
    if (result) {
      copyBagMemo.add(b2);
    }
    return result;
  };
  harden_default(confirmCopyBag);
  var isCopyBag = (b2) => confirmCopyBag(b2, false);
  hideAndHardenFunction(isCopyBag);
  var assertCopyBag = (b2) => {
    confirmCopyBag(b2, Fail5);
  };
  hideAndHardenFunction(assertCopyBag);
  var getCopyBagEntries = (b2) => {
    assertCopyBag(b2);
    return b2.payload;
  };
  harden_default(getCopyBagEntries);
  var everyCopyBagEntry = (b2, fn) => getCopyBagEntries(b2).every((entry, index) => fn(entry, index));
  harden_default(everyCopyBagEntry);
  var makeCopyBag = (bagEntryIter) => {
    const result = makeBagOfEntries(bagEntryIter);
    assertCopyBag(result);
    return result;
  };
  harden_default(makeCopyBag);
  var makeCopyBagFromElements = (elementIter) => {
    const fullCompare = makeFullOrderComparatorKit().antiComparator;
    const sorted = sortByRank(elementIter, fullCompare);
    const entries7 = [];
    for (let i = 0; i < sorted.length; ) {
      const k = sorted[i];
      let j = i + 1;
      while (j < sorted.length && fullCompare(k, sorted[j]) === 0) {
        j += 1;
      }
      entries7.push([k, BigInt(j - i)]);
      i = j;
    }
    return makeCopyBag(entries7);
  };
  harden_default(makeCopyBagFromElements);
  var copyMapMemo = /* @__PURE__ */ new WeakSet();
  var confirmCopyMap = (m, reject) => {
    if (copyMapMemo.has(m)) {
      return true;
    }
    if (!(passStyleOf(m) === "tagged" && getTag(m) === "copyMap")) {
      return reject && reject`Not a copyMap: ${m}`;
    }
    const { payload } = m;
    if (passStyleOf(payload) !== "copyRecord") {
      return reject && reject`A copyMap's payload must be a record: ${m}`;
    }
    const { keys, values: values4, ...rest } = payload;
    const result = (ownKeys18(rest).length === 0 || reject && reject`A copyMap's payload must only have .keys and .values: ${m}`) && confirmElements(keys, reject) && confirmKey(keys, reject) && (passStyleOf(values4) === "copyArray" || reject && reject`A copyMap's .values must be a copyArray: ${m}`) && (keys.length === values4.length || reject && reject`A copyMap must have the same number of keys and values: ${m}`);
    if (result) {
      copyMapMemo.add(m);
    }
    return result;
  };
  harden_default(confirmCopyMap);
  var isCopyMap = (m) => confirmCopyMap(m, false);
  hideAndHardenFunction(isCopyMap);
  var assertCopyMap = (m) => {
    confirmCopyMap(m, Fail5);
  };
  hideAndHardenFunction(assertCopyMap);
  var getCopyMapKeys = (m) => {
    assertCopyMap(m);
    return m.payload.keys;
  };
  harden_default(getCopyMapKeys);
  var getCopyMapValues = (m) => {
    assertCopyMap(m);
    return m.payload.values;
  };
  harden_default(getCopyMapValues);
  var getCopyMapEntryArray = (m) => {
    assertCopyMap(m);
    const {
      payload: { keys, values: values4 }
    } = m;
    return harden_default(keys.map((key, i) => [key, values4[i]]));
  };
  harden_default(getCopyMapEntryArray);
  var getCopyMapEntries = (m) => {
    assertCopyMap(m);
    const {
      payload: { keys, values: values4 }
    } = m;
    const { length } = (
      /** @type {Array} */
      keys
    );
    return Far("CopyMap entries iterable", {
      [Symbol.iterator]: () => {
        let i = 0;
        return Far("CopyMap entries iterator", {
          next: () => {
            let result;
            if (i < length) {
              result = harden_default({ done: false, value: [keys[i], values4[i]] });
              i += 1;
              return result;
            } else {
              result = harden_default({ done: true, value: void 0 });
            }
            return result;
          }
        });
      }
    });
  };
  harden_default(getCopyMapEntries);
  var everyCopyMapKey = (m, fn) => getCopyMapKeys(m).every((key, index) => fn(key, index));
  harden_default(everyCopyMapKey);
  var everyCopyMapValue = (m, fn) => getCopyMapValues(m).every((value, index) => fn(value, index));
  harden_default(everyCopyMapValue);
  var copyMapKeySet = (m) => (
    // A copyMap's keys are already in the internal form used by copySets.
    makeTagged("copySet", m.payload.keys)
  );
  harden_default(copyMapKeySet);
  var makeCopyMap = (entries7) => {
    const sortedEntries = sortByRank(entries7, compareAntiRank);
    const keys = sortedEntries.map(([k, _v]) => k);
    const values4 = sortedEntries.map(([_k, v]) => v);
    const result = makeTagged("copyMap", { keys, values: values4 });
    assertCopyMap(result);
    return result;
  };
  harden_default(makeCopyMap);
  var confirmKeyInternal = (val, reject) => {
    const checkIt = (child) => confirmKey(child, reject);
    const passStyle = passStyleOf(val);
    switch (passStyle) {
      case "remotable": {
        return true;
      }
      case "copyRecord": {
        return Object.values(val).every(checkIt);
      }
      case "copyArray": {
        return val.every(checkIt);
      }
      case "tagged": {
        const tag = getTag(val);
        switch (tag) {
          case "copySet": {
            return confirmCopySet(val, reject);
          }
          case "copyBag": {
            return confirmCopyBag(val, reject);
          }
          case "copyMap": {
            return confirmCopyMap(val, reject) && // For a copyMap to be a key, all its keys and values must
            // be keys. Keys already checked by `confirmCopyMap` since
            // that's a copyMap requirement in general.
            everyCopyMapValue(val, checkIt);
          }
          default: {
            return reject && reject`A passable tagged ${q5(tag)} is not a key: ${val}`;
          }
        }
      }
      case "error":
      case "promise": {
        return reject && reject`A ${q5(passStyle)} cannot be a key`;
      }
      default: {
        throw Fail5`unexpected passStyle ${q5(passStyle)}: ${val}`;
      }
    }
  };

  // ../common/make-iterator.js
  var makeIterator = (next) => {
    const iter = harden_default({
      [Symbol.iterator]: () => iter,
      next
    });
    return iter;
  };
  harden_default(makeIterator);

  // ../common/make-array-iterator.js
  var makeArrayIterator = (arr) => {
    const { length } = arr;
    let i = 0;
    return makeIterator(() => {
      let value;
      if (i < length) {
        value = arr[i];
        i += 1;
        return harden_default({ done: false, value });
      }
      return harden_default({ done: true, value });
    });
  };
  harden_default(makeArrayIterator);

  // ../patterns/src/keys/keycollection-operators.js
  var generateFullSortedEntries = (entries7, rankCompare, fullCompare) => {
    assertRankSorted(entries7, rankCompare);
    const { length } = entries7;
    let i = 0;
    let sameRankIterator;
    return makeIterator(() => {
      if (sameRankIterator) {
        const result = sameRankIterator.next();
        if (!result.done) {
          return result;
        }
        sameRankIterator = void 0;
      }
      if (i < length) {
        const entry = entries7[i];
        let j = i + 1;
        while (j < length && rankCompare(entry[0], entries7[j][0]) === 0) {
          j += 1;
        }
        if (j === i + 1) {
          i = j;
          return harden_default({ done: false, value: entry });
        }
        const ties = entries7.slice(i, j);
        i = j;
        const sortedTies = sortByRank(ties, fullCompare);
        for (let k = 1; k < sortedTies.length; k += 1) {
          const [key0] = sortedTies[k - 1];
          const [key1] = sortedTies[k];
          Math.sign(fullCompare(key0, key1)) || Fail5`Duplicate entry key: ${key0}`;
        }
        sameRankIterator = makeArrayIterator(sortedTies);
        return sameRankIterator.next();
      }
      return harden_default({ done: true, value: void 0 });
    });
  };
  harden_default(generateFullSortedEntries);
  var generateCollectionPairEntries = (c1, c2, getEntries, absentValue) => {
    const e1 = getEntries(c1);
    const e2 = getEntries(c2);
    const fullCompare = makeFullOrderComparatorKit().antiComparator;
    const x = generateFullSortedEntries(e1, compareAntiRank, fullCompare);
    const y = generateFullSortedEntries(e2, compareAntiRank, fullCompare);
    let xDone;
    let xKey;
    let xValue;
    let yDone;
    let yKey;
    let yValue;
    const nonEntry = [void 0, void 0];
    const nextX = () => {
      !xDone || Fail5`Internal: nextX must not be called once done`;
      const result = xValue;
      ({ done: xDone, value: [xKey, xValue] = nonEntry } = x.next());
      return result;
    };
    nextX();
    const nextY = () => {
      !yDone || Fail5`Internal: nextY must not be called once done`;
      const result = yValue;
      ({ done: yDone, value: [yKey, yValue] = nonEntry } = y.next());
      return result;
    };
    nextY();
    return makeIterator(() => {
      let done = false;
      let value;
      if (xDone && yDone) {
        done = true;
        value = [void 0, absentValue, absentValue];
      } else if (xDone) {
        value = [yKey, absentValue, nextY()];
      } else if (yDone) {
        value = [xKey, nextX(), absentValue];
      } else {
        const comp = fullCompare(xKey, yKey);
        if (comp === 0) {
          value = [xKey, nextX(), nextY()];
        } else if (comp < 0) {
          value = [xKey, nextX(), absentValue];
        } else if (comp > 0) {
          value = [yKey, absentValue, nextY()];
        } else {
          throw Fail5`Unexpected key comparison ${q5(comp)} for ${xKey} vs ${yKey}`;
        }
      }
      return harden_default({ done, value });
    });
  };
  harden_default(generateCollectionPairEntries);
  var makeCompareCollection = (getEntries, absentValue, compareValues) => harden_default((left, right) => {
    const merged = generateCollectionPairEntries(
      left,
      right,
      getEntries,
      absentValue
    );
    let leftIsBigger = false;
    let rightIsBigger = false;
    for (const [_key, leftValue, rightValue] of merged) {
      const comp = compareValues(leftValue, rightValue);
      if (comp === 0) {
        continue;
      } else if (comp < 0) {
        rightIsBigger = true;
      } else if (comp > 0) {
        leftIsBigger = true;
      } else {
        Number.isNaN(comp) || // prettier-ignore
        Fail5`Unexpected value comparison ${q5(comp)} for ${leftValue} vs ${rightValue}`;
        return NaN;
      }
      if (leftIsBigger && rightIsBigger) {
        return NaN;
      }
    }
    return leftIsBigger ? 1 : rightIsBigger ? -1 : 0;
  });
  harden_default(makeCompareCollection);

  // ../patterns/src/keys/compareKeys.js
  var setCompare = makeCompareCollection(
    /** @type {<K extends Key>(s: CopySet<K>) => Array<[K, 1]>} */
    ((s) => harden_default(getCopySetKeys(s).map((key) => [key, 1]))),
    0,
    compareNumerics
  );
  harden_default(setCompare);
  var bagCompare = makeCompareCollection(
    getCopyBagEntries,
    0n,
    compareNumerics
  );
  harden_default(bagCompare);
  var ABSENT = /* @__PURE__ */ Symbol("absent");
  var _mapCompare = makeCompareCollection(
    getCopyMapEntryArray,
    ABSENT,
    (leftValue, rightValue) => {
      if (leftValue === ABSENT && rightValue === ABSENT) {
        throw Fail5`Internal: Unexpected absent entry pair`;
      } else if (leftValue === ABSENT) {
        return -1;
      } else if (rightValue === ABSENT) {
        return 1;
      } else {
        return compareKeys(leftValue, rightValue);
      }
    }
  );
  harden_default(_mapCompare);
  var compareKeys = (left, right) => {
    assertKey(left);
    assertKey(right);
    const leftStyle = passStyleOf(left);
    const rightStyle = passStyleOf(right);
    if (leftStyle !== rightStyle) {
      return NaN;
    }
    switch (leftStyle) {
      case "undefined":
      case "null":
      case "boolean":
      case "bigint":
      case "string":
      case "byteArray":
      case "symbol": {
        return compareRank(left, right);
      }
      case "number": {
        const rankComp = compareRank(left, right);
        if (rankComp === 0) {
          return 0;
        }
        if (Number.isNaN(left) || Number.isNaN(right)) {
          assert(!Number.isNaN(left) || !Number.isNaN(right));
          return NaN;
        }
        return rankComp;
      }
      case "remotable": {
        if (left === right) {
          return 0;
        }
        return NaN;
      }
      case "copyArray": {
        const len = Math.min(left.length, right.length);
        for (let i = 0; i < len; i += 1) {
          const result = compareKeys(left[i], right[i]);
          if (result !== 0) {
            return result;
          }
        }
        return compareRank(left.length, right.length);
      }
      case "copyRecord": {
        const leftNames = recordNames(left);
        const rightNames = recordNames(right);
        if (!keyEQ(leftNames, rightNames)) {
          return NaN;
        }
        const leftValues = recordValues(left, leftNames);
        const rightValues = recordValues(right, rightNames);
        let result = 0;
        for (let i = 0; i < leftValues.length; i += 1) {
          const comp = compareKeys(leftValues[i], rightValues[i]);
          if (Number.isNaN(comp)) {
            return NaN;
          }
          if (result !== comp && comp !== 0) {
            if (result === 0) {
              result = comp;
            } else {
              assert(
                result === -1 && comp === 1 || result === 1 && comp === -1
              );
              return NaN;
            }
          }
        }
        return result;
      }
      case "tagged": {
        const leftTag = getTag(left);
        const rightTag = getTag(right);
        if (leftTag !== rightTag) {
          return NaN;
        }
        switch (leftTag) {
          case "copySet": {
            return setCompare(left, right);
          }
          case "copyBag": {
            return bagCompare(left, right);
          }
          case "copyMap": {
            throw Fail5`Map comparison not yet implemented: ${left} vs ${right}`;
          }
          default: {
            throw Fail5`unexpected tag ${q5(leftTag)}: ${left}`;
          }
        }
      }
      default: {
        throw Fail5`unexpected passStyle ${q5(leftStyle)}: ${left}`;
      }
    }
  };
  harden_default(compareKeys);
  var keyLT = (left, right) => compareKeys(left, right) < 0;
  harden_default(keyLT);
  var keyLTE = (left, right) => compareKeys(left, right) <= 0;
  harden_default(keyLTE);
  var keyEQ = (left, right) => compareKeys(left, right) === 0;
  harden_default(keyEQ);
  var keyGTE = (left, right) => compareKeys(left, right) >= 0;
  harden_default(keyGTE);
  var keyGT = (left, right) => compareKeys(left, right) > 0;
  harden_default(keyGT);

  // ../patterns/src/keys/merge-set-operators.js
  var windowResort = (elements, rankCompare, fullCompare) => {
    assertRankSorted(elements, rankCompare);
    const { length } = elements;
    let i = 0;
    let optInnerIterator;
    return harden_default({
      [Symbol.iterator]: () => harden_default({
        next: () => {
          if (optInnerIterator) {
            const result = optInnerIterator.next();
            if (result.done) {
              optInnerIterator = void 0;
            } else {
              return result;
            }
          }
          if (i < length) {
            const value = elements[i];
            let j = i + 1;
            while (j < length && rankCompare(value, elements[j]) === 0) {
              j += 1;
            }
            if (j === i + 1) {
              i = j;
              return harden_default({ done: false, value });
            }
            const similarRun = elements.slice(i, j);
            i = j;
            const resorted = sortByRank(similarRun, fullCompare);
            assertNoDuplicates(resorted, fullCompare);
            optInnerIterator = resorted[Symbol.iterator]();
            return optInnerIterator.next();
          } else {
            return harden_default({ done: true, value: null });
          }
        }
      })
    });
  };
  var merge = (xelements, yelements) => {
    const fullCompare = makeFullOrderComparatorKit().antiComparator;
    const xs = windowResort(xelements, compareAntiRank, fullCompare);
    const ys = windowResort(yelements, compareAntiRank, fullCompare);
    return harden_default({
      [Symbol.iterator]: () => {
        let x;
        let xDone;
        let y;
        let yDone;
        const xi = xs[Symbol.iterator]();
        const nextX = () => {
          !xDone || Fail5`Internal: nextX should not be called once done`;
          ({ done: xDone, value: x } = xi.next());
        };
        nextX();
        const yi = ys[Symbol.iterator]();
        const nextY = () => {
          !yDone || Fail5`Internal: nextY should not be called once done`;
          ({ done: yDone, value: y } = yi.next());
        };
        nextY();
        return harden_default({
          next: () => {
            let done = false;
            let value;
            if (xDone && yDone) {
              done = true;
              value = [null, 0n, 0n];
            } else if (xDone) {
              value = [y, 0n, 1n];
              nextY();
            } else if (yDone) {
              value = [x, 1n, 0n];
              nextX();
            } else {
              const comp = fullCompare(x, y);
              if (comp === 0) {
                value = [x, 1n, 1n];
                nextX();
                nextY();
              } else if (comp < 0) {
                value = [x, 1n, 0n];
                nextX();
              } else {
                comp > 0 || Fail5`Internal: Unexpected comp ${q5(comp)}`;
                value = [y, 0n, 1n];
                nextY();
              }
            }
            return harden_default({ done, value });
          }
        });
      }
    });
  };
  harden_default(merge);
  var iterIsSuperset = (xyi) => {
    for (const [_m, xc, _yc] of xyi) {
      if (xc === 0n) {
        return false;
      }
    }
    return true;
  };
  var iterIsDisjoint = (xyi) => {
    for (const [_m, xc, yc] of xyi) {
      if (xc >= 1n && yc >= 1n) {
        return false;
      }
    }
    return true;
  };
  var iterCompare = (xyi) => {
    let loneY = false;
    let loneX = false;
    for (const [_m, xc, yc] of xyi) {
      if (xc === 0n) {
        loneY = true;
      }
      if (yc === 0n) {
        loneX = true;
      }
      if (loneX && loneY) {
        return NaN;
      }
    }
    if (loneX) {
      return 1;
    } else if (loneY) {
      return -1;
    } else {
      !loneX && !loneY || Fail5`Internal: Unexpected lone pair ${q5([loneX, loneY])}`;
      return 0;
    }
  };
  var iterUnion = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      if (xc >= 0n) {
        result.push(m);
      } else {
        yc >= 0n || Fail5`Internal: Unexpected count ${q5(yc)}`;
        result.push(m);
      }
    }
    return result;
  };
  var iterDisjointUnion = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      xc === 0n || yc === 0n || Fail5`Sets must not have common elements: ${m}`;
      if (xc >= 1n) {
        result.push(m);
      } else {
        yc >= 1n || Fail5`Internal: Unexpected count ${q5(yc)}`;
        result.push(m);
      }
    }
    return result;
  };
  var iterIntersection = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      if (xc >= 1n && yc >= 1n) {
        result.push(m);
      }
    }
    return result;
  };
  var iterDisjointSubtract = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      xc >= 1n || Fail5`right element ${m} was not in left`;
      if (yc === 0n) {
        result.push(m);
      }
    }
    return result;
  };
  var mergeify = (iterOp) => (xelements, yelements) => iterOp(merge(xelements, yelements));
  var elementsIsSuperset = mergeify(iterIsSuperset);
  var elementsIsDisjoint = mergeify(iterIsDisjoint);
  var elementsCompare = mergeify(iterCompare);
  var elementsUnion = mergeify(iterUnion);
  var elementsDisjointUnion = mergeify(iterDisjointUnion);
  var elementsIntersection = mergeify(iterIntersection);
  var elementsDisjointSubtract = mergeify(iterDisjointSubtract);
  var rawSetify = (elementsOp) => (xset, yset) => elementsOp(xset.payload, yset.payload);
  var setify = (elementsOp) => (xset, yset) => makeSetOfElements(elementsOp(xset.payload, yset.payload));
  var setIsSuperset = rawSetify(elementsIsSuperset);
  var setIsDisjoint = rawSetify(elementsIsDisjoint);
  var setUnion = setify(elementsUnion);
  var setDisjointUnion = setify(elementsDisjointUnion);
  var setIntersection = setify(elementsIntersection);
  var setDisjointSubtract = setify(elementsDisjointSubtract);

  // ../patterns/src/keys/merge-bag-operators.js
  var bagWindowResort = (bagEntries, rankCompare, fullCompare) => {
    assertRankSorted(bagEntries, rankCompare);
    const { length } = bagEntries;
    let i = 0;
    let optInnerIterator;
    return harden_default({
      [Symbol.iterator]: () => harden_default({
        next: () => {
          if (optInnerIterator) {
            const result = optInnerIterator.next();
            if (result.done) {
              optInnerIterator = void 0;
            } else {
              return result;
            }
          }
          if (i < length) {
            const entry = bagEntries[i];
            let j = i + 1;
            while (j < length && rankCompare(entry[0], bagEntries[j][0]) === 0) {
              j += 1;
            }
            if (j === i + 1) {
              i = j;
              return harden_default({ done: false, value: entry });
            }
            const similarRun = bagEntries.slice(i, j);
            i = j;
            const resorted = sortByRank(similarRun, fullCompare);
            assertNoDuplicateKeys(resorted, fullCompare);
            optInnerIterator = resorted[Symbol.iterator]();
            return optInnerIterator.next();
          } else {
            return harden_default({ done: true, value: [null, 0n] });
          }
        }
      })
    });
  };
  var merge2 = (xbagEntries, ybagEntries) => {
    const fullCompare = makeFullOrderComparatorKit().antiComparator;
    const xs = bagWindowResort(xbagEntries, compareAntiRank, fullCompare);
    const ys = bagWindowResort(ybagEntries, compareAntiRank, fullCompare);
    return harden_default({
      [Symbol.iterator]: () => {
        let x;
        let xc;
        let xDone;
        let y;
        let yc;
        let yDone;
        const xi = xs[Symbol.iterator]();
        const nextX = () => {
          !xDone || Fail5`Internal: nextX should not be called once done`;
          ({
            done: xDone,
            value: [x, xc]
          } = xi.next());
        };
        nextX();
        const yi = ys[Symbol.iterator]();
        const nextY = () => {
          !yDone || Fail5`Internal: nextY should not be called once done`;
          ({
            done: yDone,
            value: [y, yc]
          } = yi.next());
        };
        nextY();
        return harden_default({
          next: () => {
            let done = false;
            let value;
            if (xDone && yDone) {
              done = true;
              value = [null, 0n, 0n];
            } else if (xDone) {
              value = [y, 0n, yc];
              nextY();
            } else if (yDone) {
              value = [x, xc, 0n];
              nextX();
            } else {
              const comp = fullCompare(x, y);
              if (comp === 0) {
                value = [x, xc, yc];
                nextX();
                nextY();
              } else if (comp < 0) {
                value = [x, xc, 0n];
                nextX();
              } else {
                comp > 0 || Fail5`Internal: Unexpected comp ${q5(comp)}`;
                value = [y, 0n, yc];
                nextY();
              }
            }
            return harden_default({ done, value });
          }
        });
      }
    });
  };
  harden_default(merge2);
  var bagIterIsSuperbag = (xyi) => {
    for (const [_m, xc, yc] of xyi) {
      if (xc < yc) {
        return false;
      }
    }
    return true;
  };
  var bagIterIsDisjoint = (xyi) => {
    for (const [_m, xc, yc] of xyi) {
      if (xc >= 1n && yc >= 1n) {
        return false;
      }
    }
    return true;
  };
  var bagIterUnion = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      result.push([m, xc + yc]);
    }
    return result;
  };
  var bagIterIntersection = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      const mc = xc <= yc ? xc : yc;
      result.push([m, mc]);
    }
    return result;
  };
  var bagIterDisjointSubtract = (xyi) => {
    const result = [];
    for (const [m, xc, yc] of xyi) {
      const mc = xc - yc;
      mc >= 0n || Fail5`right element ${m} was not in left`;
      if (mc >= 1n) {
        result.push([m, mc]);
      }
    }
    return result;
  };
  var mergeify2 = (bagIterOp) => (xbagEntries, ybagEntries) => bagIterOp(merge2(xbagEntries, ybagEntries));
  var bagEntriesIsSuperbag = mergeify2(bagIterIsSuperbag);
  var bagEntriesIsDisjoint = mergeify2(bagIterIsDisjoint);
  var bagEntriesUnion = mergeify2(bagIterUnion);
  var bagEntriesIntersection = mergeify2(bagIterIntersection);
  var bagEntriesDisjointSubtract = mergeify2(bagIterDisjointSubtract);
  var rawBagify = (bagEntriesOp) => (xbag, ybag) => bagEntriesOp(xbag.payload, ybag.payload);
  var bagify = (bagEntriesOp) => (xbag, ybag) => makeBagOfEntries(bagEntriesOp(xbag.payload, ybag.payload));
  var bagIsSuperbag = rawBagify(bagEntriesIsSuperbag);
  var bagIsDisjoint = rawBagify(bagEntriesIsDisjoint);
  var bagUnion = bagify(bagEntriesUnion);
  var bagIntersection = bagify(bagEntriesIntersection);
  var bagDisjointSubtract = bagify(bagEntriesDisjointSubtract);

  // ../common/throw-labeled.js
  var throwLabeled = (innerErr, label, errConstructor = void 0, options = void 0) => {
    if (typeof label === "number") {
      label = `[${label}]`;
    }
    const outerErr = makeError(
      `${label}: ${innerErr.message}`,
      errConstructor,
      options
    );
    annotateError2(outerErr, X3`Caused by ${innerErr}`);
    throw outerErr;
  };
  hideAndHardenFunction(throwLabeled);

  // ../common/apply-labeling-error.js
  var applyLabelingError = (func, args, label = void 0) => {
    if (label === void 0) {
      return func(...args);
    }
    let result;
    try {
      result = func(...args);
    } catch (err) {
      throwLabeled(err, label);
    }
    if (isPromise(result)) {
      return E.when(result, void 0, (reason) => throwLabeled(reason, label));
    } else {
      return result;
    }
  };
  hideAndHardenFunction(applyLabelingError);

  // ../common/from-unique-entries.js
  var { fromEntries: fromEntries6 } = Object;
  var { ownKeys: ownKeys19 } = Reflect;
  var fromUniqueEntries = (allEntries) => {
    const entriesArray = [...allEntries];
    const result = harden_default(fromEntries6(entriesArray));
    if (ownKeys19(result).length === entriesArray.length) {
      return result;
    }
    const names = /* @__PURE__ */ new Set();
    for (const [name, _] of entriesArray) {
      if (names.has(name)) {
        Fail5`collision on property name ${q5(name)}: ${entriesArray}`;
      }
      names.add(name);
    }
    throw Fail5`internal: failed to create object from unique entries`;
  };
  harden_default(fromUniqueEntries);

  // ../common/list-difference.js
  var listDifference = (leftList, rightList) => {
    const rightSet = new Set(rightList);
    return leftList.filter((element) => !rightSet.has(element));
  };
  harden_default(listDifference);

  // ../patterns/src/patterns/patternMatchers.js
  var { entries: entries6, values: values2, hasOwn: hasOwn10 } = Object;
  var { ownKeys: ownKeys20 } = Reflect;
  var patternMemo = /* @__PURE__ */ new WeakSet();
  var MM;
  var defaultLimits = harden_default({
    decimalDigitsLimit: 100,
    stringLengthLimit: 1e5,
    symbolNameLengthLimit: 100,
    numPropertiesLimit: 80,
    propertyNameLengthLimit: 100,
    arrayLengthLimit: 1e4,
    byteLengthLimit: 1e5,
    numSetElementsLimit: 1e4,
    numUniqueBagElementsLimit: 1e4,
    numMapEntriesLimit: 5e3
  });
  var limit = (limits = {}) => (
    /** @type {AllLimits} */
    harden_default({ __proto__: defaultLimits, ...limits })
  );
  var confirmIsWellFormedWithLimit = (payload, mainPayloadShape, prefix, reject) => {
    assert(Array.isArray(mainPayloadShape));
    if (!Array.isArray(payload)) {
      return reject && reject`${q5(prefix)} payload must be an array: ${payload}`;
    }
    const mainLength = mainPayloadShape.length;
    if (!(payload.length === mainLength || payload.length === mainLength + 1)) {
      return reject && reject`${q5(prefix)} payload unexpected size: ${payload}`;
    }
    const limits = payload[mainLength];
    payload = harden_default(payload.slice(0, mainLength));
    if (!confirmLabeledMatches(payload, mainPayloadShape, prefix, reject)) {
      return false;
    }
    if (limits === void 0) {
      return true;
    }
    return (passStyleOf(limits) === "copyRecord" || reject && reject`Limits must be a record: ${q5(limits)}`) && entries6(limits).every(
      ([key, value]) => passStyleOf(value) === "number" || reject && reject`Value of limit ${q5(key)} but be a number: ${q5(value)}`
    );
  };
  var confirmDecimalDigitsLimit = (specimen, decimalDigitsLimit, reject) => {
    if (Math.floor(Math.log10(Math.abs(Number(specimen)))) + 1 <= decimalDigitsLimit) {
      return true;
    }
    return reject && reject`bigint ${specimen} must not have more than ${decimalDigitsLimit} digits`;
  };
  var makePatternKit = () => {
    const maybeMatchHelper = (tag) => (
      // eslint-disable-next-line no-use-before-define
      HelpersByMatchTag[tag]
    );
    const maybePayloadShape = (tag) => (
      // eslint-disable-next-line no-use-before-define
      GuardPayloadShapes[tag]
    );
    const singletonKinds = /* @__PURE__ */ new Map([
      ["null", null],
      ["undefined", void 0]
    ]);
    const tagMemo = /* @__PURE__ */ new WeakMap();
    const confirmTagged = (tagged, tag, reject) => {
      const matchHelper = maybeMatchHelper(tag);
      if (matchHelper) {
        return matchHelper.confirmIsWellFormed(tagged.payload, reject);
      } else {
        const payloadShape = maybePayloadShape(tag);
        if (payloadShape !== void 0) {
          return confirmNestedMatches(tagged.payload, payloadShape, tag, reject);
        }
      }
      switch (tag) {
        case "copySet": {
          return confirmCopySet(tagged, reject);
        }
        case "copyBag": {
          return confirmCopyBag(tagged, reject);
        }
        case "copyMap": {
          return confirmCopyMap(tagged, reject);
        }
        default: {
          return reject && reject`cannot check unrecognized tag ${q5(tag)}: ${tagged}`;
        }
      }
    };
    const confirmKindOf = (specimen, reject) => {
      const passStyle = passStyleOf(specimen);
      if (passStyle !== "tagged") {
        return passStyle;
      }
      if (tagMemo.has(specimen)) {
        return tagMemo.get(specimen);
      }
      const tag = getTag(specimen);
      if (confirmTagged(specimen, tag, reject)) {
        tagMemo.set(specimen, tag);
        return tag;
      }
      reject && reject`cannot check unrecognized tag ${q5(tag)}`;
      return void 0;
    };
    harden_default(confirmKindOf);
    const kindOf2 = (specimen) => confirmKindOf(specimen, false);
    harden_default(kindOf2);
    const confirmKind = (specimen, kind, reject) => {
      if (singletonKinds.has(kind)) {
        return confirmAsKeyPatt(specimen, singletonKinds.get(kind), reject);
      }
      const realKind = confirmKindOf(specimen, reject);
      if (kind === realKind) {
        return true;
      }
      return reject && reject`${b(realKind)} ${specimen} - Must be a ${b(kind)}`;
    };
    const isKind = (specimen, kind) => confirmKind(specimen, kind, false);
    const isUndefinedPatt = (patt) => patt === void 0 || isKind(patt, "match:kind") && patt.payload === "undefined";
    const confirmAsKeyPatt = (specimen, keyAsPattern, reject) => {
      if (isKey(specimen) && keyEQ(specimen, keyAsPattern)) {
        return true;
      }
      return (
        // When the mismatch occurs against a key used as a pattern,
        // the pattern should still be redacted.
        reject && reject`${specimen} - Must be: ${keyAsPattern}`
      );
    };
    const confirmPattern = (patt, reject) => {
      if (isKey(patt)) {
        return true;
      }
      if (patternMemo.has(patt)) {
        return true;
      }
      const result = confirmPatternInternal(patt, reject);
      if (result) {
        patternMemo.add(patt);
      }
      return result;
    };
    const confirmPatternInternal = (patt, reject) => {
      const checkIt = (child) => confirmPattern(child, reject);
      const kind = confirmKindOf(patt, reject);
      switch (kind) {
        case void 0: {
          return false;
        }
        case "copyRecord": {
          return values2(patt).every(checkIt);
        }
        case "copyArray": {
          return patt.every(checkIt);
        }
        case "copyMap": {
          return confirmPattern(patt.values, reject);
        }
        case "error":
        case "promise": {
          return reject && reject`A ${q5(kind)} cannot be a pattern`;
        }
        default: {
          if (maybeMatchHelper(kind) !== void 0) {
            return true;
          }
          return reject && reject`A passable of kind ${q5(kind)} is not a pattern: ${patt}`;
        }
      }
    };
    const isPattern2 = (patt) => confirmPattern(patt, false);
    const assertPattern2 = (patt) => {
      confirmPattern(patt, Fail5);
    };
    const confirmMatches2 = (specimen, pattern, reject) => (
      // eslint-disable-next-line no-use-before-define
      confirmMatchesInternal(specimen, pattern, reject)
    );
    hideAndHardenFunction(confirmMatches2);
    const confirmMatchesInternal = (specimen, patt, reject) => {
      const patternKind = confirmKindOf(patt, Fail5);
      const specimenKind = kindOf2(specimen);
      switch (patternKind) {
        case void 0: {
          return reject && reject`pattern expected: ${patt}`;
        }
        case "promise": {
          return reject && reject`promises cannot be patterns: ${patt}`;
        }
        case "error": {
          return reject && reject`errors cannot be patterns: ${patt}`;
        }
        case "undefined":
        case "null":
        case "boolean":
        case "number":
        case "bigint":
        case "string":
        case "symbol":
        case "byteArray":
        case "copySet":
        case "copyBag":
        case "remotable": {
          return confirmAsKeyPatt(specimen, patt, reject);
        }
        case "copyArray": {
          if (isKey(patt)) {
            return confirmAsKeyPatt(specimen, patt, reject);
          }
          if (specimenKind !== "copyArray") {
            return reject && reject`${specimen} - Must be a copyArray to match a copyArray pattern: ${qp(
              patt
            )}`;
          }
          const { length } = patt;
          if (specimen.length !== length) {
            return reject && reject`Array ${specimen} - Must be as long as copyArray pattern: ${qp(
              patt
            )}`;
          }
          return patt.every(
            (p, i) => (
              // eslint-disable-next-line no-use-before-define
              confirmNestedMatches(specimen[i], p, i, reject)
            )
          );
        }
        case "copyRecord": {
          if (isKey(patt)) {
            return confirmAsKeyPatt(specimen, patt, reject);
          }
          if (specimenKind !== "copyRecord") {
            return reject && reject`${specimen} - Must be a copyRecord to match a copyRecord pattern: ${qp(
              patt
            )}`;
          }
          const specimenNames = recordNames(specimen);
          const pattNames = recordNames(patt);
          const missing2 = listDifference(pattNames, specimenNames);
          if (missing2.length >= 1) {
            return reject && reject`${specimen} - Must have missing properties ${q5(missing2)}`;
          }
          const unexpected = listDifference(specimenNames, pattNames);
          if (unexpected.length >= 1) {
            return reject && reject`${specimen} - Must not have unexpected properties: ${q5(
              unexpected
            )}`;
          }
          const specimenValues = recordValues(specimen, specimenNames);
          const pattValues = recordValues(patt, pattNames);
          return pattNames.every(
            (label, i) => (
              // eslint-disable-next-line no-use-before-define
              confirmNestedMatches(specimenValues[i], pattValues[i], label, reject)
            )
          );
        }
        case "copyMap": {
          if (isKey(patt)) {
            return confirmAsKeyPatt(specimen, patt, reject);
          }
          if (specimenKind !== "copyMap") {
            return reject && reject`${specimen} - Must be a copyMap to match a copyMap pattern: ${qp(
              patt
            )}`;
          }
          const pattKeySet = copyMapKeySet(patt);
          const specimenKeySet = copyMapKeySet(specimen);
          if (!confirmMatches2(specimenKeySet, pattKeySet, reject)) {
            return false;
          }
          const pattValues = [];
          const specimenValues = [];
          const entryPairs = generateCollectionPairEntries(
            patt,
            specimen,
            getCopyMapEntryArray,
            void 0
          );
          for (const [_key, pattValue, specimenValue] of entryPairs) {
            pattValues.push(pattValue);
            specimenValues.push(specimenValue);
          }
          return confirmMatches2(
            harden_default(specimenValues),
            harden_default(pattValues),
            reject
          );
        }
        default: {
          const matchHelper = maybeMatchHelper(patternKind);
          if (matchHelper) {
            return matchHelper.confirmMatches(specimen, patt.payload, reject);
          }
          throw Fail5`internal: should have recognized ${q5(patternKind)} `;
        }
      }
    };
    const confirmNestedMatches = (specimen, pattern, prefix, reject) => applyLabelingError(confirmMatches2, [specimen, pattern, reject], prefix);
    const matches2 = (specimen, patt) => confirmMatches2(specimen, patt, false);
    const mustMatch2 = (specimen, patt, label = void 0) => {
      let innerError;
      try {
        if (confirmMatches2(specimen, patt, false)) {
          return;
        }
      } catch (er) {
        innerError = er;
      }
      confirmNestedMatches(specimen, patt, label, Fail5);
      const outerError = makeError(
        X3`internal: ${label}: inconsistent pattern match: ${qp(patt)}`
      );
      if (innerError !== void 0) {
        annotateError2(outerError, X3`caused by ${innerError}`);
      }
      throw outerError;
    };
    const getRankCover2 = (patt, encodePassable) => {
      if (isKey(patt)) {
        const encoded = encodePassable(patt);
        if (encoded !== void 0) {
          return [encoded, `${encoded}~`];
        }
      }
      const passStyle = passStyleOf(patt);
      switch (passStyle) {
        case "copyArray": {
          break;
        }
        case "copyRecord": {
          break;
        }
        case "tagged": {
          const tag = getTag(patt);
          const matchHelper = maybeMatchHelper(tag);
          if (matchHelper) {
            return matchHelper.getRankCover(patt.payload, encodePassable);
          }
          switch (tag) {
            case "copySet": {
              break;
            }
            case "copyMap": {
              break;
            }
            default: {
              break;
            }
          }
          break;
        }
        default: {
          break;
        }
      }
      return getPassStyleCover(passStyle);
    };
    const confirmArrayEveryMatchPattern = (array, patt, labelPrefix, reject) => {
      if (isKind(patt, "match:any")) {
        return true;
      }
      return array.every(
        (el, i) => confirmNestedMatches(el, patt, `${labelPrefix}[${i}]`, reject)
      );
    };
    const matchAnyHelper = Far("match:any helper", {
      confirmMatches: (_specimen, _matcherPayload, _reject) => true,
      confirmIsWellFormed: (matcherPayload, reject) => matcherPayload === void 0 || reject && reject`match:any payload: ${matcherPayload} - Must be undefined`,
      getRankCover: (_matchPayload, _encodePassable) => ["", "{"]
    });
    const matchAndHelper = Far("match:and helper", {
      confirmMatches: (specimen, patts, reject) => {
        return patts.every((patt) => confirmMatches2(specimen, patt, reject));
      },
      confirmIsWellFormed: (allegedPatts, reject) => {
        const checkIt = (patt) => confirmPattern(patt, reject);
        return (passStyleOf(allegedPatts) === "copyArray" || reject && reject`Needs array of sub-patterns: ${qp(allegedPatts)}`) && allegedPatts.every(checkIt);
      },
      getRankCover: (patts, encodePassable) => intersectRankCovers(
        compareRank,
        patts.map((p) => getRankCover2(p, encodePassable))
      )
    });
    const matchOrHelper = Far("match:or helper", {
      confirmMatches: (specimen, patts, reject) => {
        const { length } = patts;
        if (length === 0) {
          return reject && reject`${specimen} - no pattern disjuncts to match: ${qp(patts)}`;
        }
        const binaryUndefPattIdx = patts.length === 2 ? patts.findIndex((patt) => isUndefinedPatt(patt)) : -1;
        if (binaryUndefPattIdx !== -1) {
          return specimen === void 0 || confirmMatches2(specimen, patts[1 - binaryUndefPattIdx], reject);
        }
        if (patts.some((patt) => matches2(specimen, patt))) {
          return true;
        }
        return reject && reject`${specimen} - Must match one of ${qp(patts)}`;
      },
      confirmIsWellFormed: matchAndHelper.confirmIsWellFormed,
      getRankCover: (patts, encodePassable) => unionRankCovers(
        compareRank,
        patts.map((p) => getRankCover2(p, encodePassable))
      )
    });
    const matchNotHelper = Far("match:not helper", {
      confirmMatches: (specimen, patt, reject) => {
        if (matches2(specimen, patt)) {
          return reject && reject`${specimen} - Must fail negated pattern: ${qp(patt)}`;
        } else {
          return true;
        }
      },
      confirmIsWellFormed: confirmPattern,
      getRankCover: (_patt, _encodePassable) => ["", "{"]
    });
    const matchScalarHelper = Far("match:scalar helper", {
      confirmMatches: (specimen, _matcherPayload, reject) => confirmScalarKey(specimen, reject),
      confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,
      getRankCover: (_matchPayload, _encodePassable) => ["a", "z~"]
    });
    const matchKeyHelper = Far("match:key helper", {
      confirmMatches: (specimen, _matcherPayload, reject) => confirmKey(specimen, reject),
      confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,
      getRankCover: (_matchPayload, _encodePassable) => ["a", "z~"]
    });
    const matchPatternHelper = Far("match:pattern helper", {
      confirmMatches: (specimen, _matcherPayload, reject) => confirmPattern(specimen, reject),
      confirmIsWellFormed: matchAnyHelper.confirmIsWellFormed,
      getRankCover: (_matchPayload, _encodePassable) => ["a", "z~"]
    });
    const matchKindHelper = Far("match:kind helper", {
      confirmMatches: confirmKind,
      confirmIsWellFormed: (allegedKeyKind, reject) => typeof allegedKeyKind === "string" || reject && reject`match:kind: payload: ${allegedKeyKind} - A kind name must be a string`,
      getRankCover: (kind, _encodePassable) => {
        let style;
        switch (kind) {
          case "copySet":
          case "copyMap": {
            style = "tagged";
            break;
          }
          default: {
            style = kind;
            break;
          }
        }
        return getPassStyleCover(style);
      }
    });
    const matchTaggedHelper = Far("match:tagged helper", {
      confirmMatches: (specimen, [tagPatt, payloadPatt], reject) => {
        if (passStyleOf(specimen) !== "tagged") {
          return reject && reject`Expected tagged object, not ${q5(
            passStyleOf(specimen)
          )}: ${specimen}`;
        }
        return confirmNestedMatches(getTag(specimen), tagPatt, "tag", reject) && confirmNestedMatches(specimen.payload, payloadPatt, "payload", reject);
      },
      confirmIsWellFormed: (payload, reject) => confirmNestedMatches(
        payload,
        harden_default([MM.pattern(), MM.pattern()]),
        "match:tagged payload",
        reject
      ),
      getRankCover: (_kind, _encodePassable) => getPassStyleCover("tagged")
    });
    const matchBigintHelper = Far("match:bigint helper", {
      confirmMatches: (specimen, [limits = void 0], reject) => {
        const { decimalDigitsLimit } = limit(limits);
        return confirmKind(specimen, "bigint", reject) && confirmDecimalDigitsLimit(specimen, decimalDigitsLimit, reject);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([]),
        "match:bigint payload",
        reject
      ),
      getRankCover: (_matchPayload, _encodePassable) => getPassStyleCover("bigint")
    });
    const matchNatHelper = Far("match:nat helper", {
      confirmMatches: (specimen, [limits = void 0], reject) => {
        const { decimalDigitsLimit } = limit(limits);
        const typedSpecimen = (
          /** @type {bigint} */
          specimen
        );
        return confirmKind(specimen, "bigint", reject) && (typedSpecimen >= 0n || reject && reject`${typedSpecimen} - Must be non-negative`) && confirmDecimalDigitsLimit(typedSpecimen, decimalDigitsLimit, reject);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([]),
        "match:nat payload",
        reject
      ),
      getRankCover: (_matchPayload, _encodePassable) => (
        // TODO Could be more precise
        getPassStyleCover("bigint")
      )
    });
    const matchStringHelper = Far("match:string helper", {
      confirmMatches: (specimen, [limits = void 0], reject) => {
        const { stringLengthLimit } = limit(limits);
        const typedSpecimen = (
          /** @type {string} */
          specimen
        );
        return confirmKind(specimen, "string", reject) && (typedSpecimen.length <= stringLengthLimit || reject && reject`string ${typedSpecimen} must not be bigger than ${stringLengthLimit}`);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([]),
        "match:string payload",
        reject
      ),
      getRankCover: (_matchPayload, _encodePassable) => getPassStyleCover("string")
    });
    const matchSymbolHelper = Far("match:symbol helper", {
      confirmMatches: (specimen, [limits = void 0], reject) => {
        const { symbolNameLengthLimit } = limit(limits);
        if (!confirmKind(specimen, "symbol", reject)) {
          return false;
        }
        const symbolName = nameForPassableSymbol(specimen);
        if (typeof symbolName !== "string") {
          throw Fail5`internal: Passable symbol ${specimen} must have a passable name`;
        }
        return symbolName.length <= symbolNameLengthLimit || reject && reject`Symbol name ${q5(
          symbolName
        )} must not be bigger than ${symbolNameLengthLimit}`;
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([]),
        "match:symbol payload",
        reject
      ),
      getRankCover: (_matchPayload, _encodePassable) => getPassStyleCover("symbol")
    });
    const matchRemotableHelper = Far("match:remotable helper", {
      confirmMatches: (specimen, remotableDesc, reject) => {
        if (isKind(specimen, "remotable")) {
          return true;
        }
        if (!reject) {
          return false;
        }
        const { label } = remotableDesc;
        const passStyle = passStyleOf(specimen);
        const kindDetails = passStyle !== "tagged" ? (
          // Pass style can be embedded in details without quotes.
          b(passStyle)
        ) : (
          // Tag must be quoted because it is potentially attacker-controlled
          // (unlike `kindOf`, this does not reject unrecognized tags).
          q5(getTag(specimen))
        );
        return reject && reject`${specimen} - Must be a remotable ${b(label)}, not ${kindDetails}`;
      },
      confirmIsWellFormed: (allegedRemotableDesc, reject) => confirmNestedMatches(
        allegedRemotableDesc,
        harden_default({ label: MM.string() }),
        "match:remotable payload",
        reject
      ),
      getRankCover: (_remotableDesc, _encodePassable) => getPassStyleCover("remotable")
    });
    const matchLTEHelper = Far("match:lte helper", {
      confirmMatches: (specimen, rightOperand, reject) => keyLTE(specimen, rightOperand) || reject && reject`${specimen} - Must be <= ${rightOperand}`,
      confirmIsWellFormed: confirmKey,
      getRankCover: (rightOperand, encodePassable) => {
        const passStyle = passStyleOf(rightOperand);
        let [leftBound, rightBound] = getPassStyleCover(passStyle);
        const newRightBound = `${encodePassable(rightOperand)}~`;
        if (newRightBound !== void 0) {
          rightBound = newRightBound;
        }
        return [leftBound, rightBound];
      }
    });
    const matchLTHelper = Far("match:lt helper", {
      confirmMatches: (specimen, rightOperand, reject) => keyLT(specimen, rightOperand) || reject && reject`${specimen} - Must be < ${rightOperand}`,
      confirmIsWellFormed: confirmKey,
      getRankCover: matchLTEHelper.getRankCover
    });
    const matchGTEHelper = Far("match:gte helper", {
      confirmMatches: (specimen, rightOperand, reject) => keyGTE(specimen, rightOperand) || reject && reject`${specimen} - Must be >= ${rightOperand}`,
      confirmIsWellFormed: confirmKey,
      getRankCover: (rightOperand, encodePassable) => {
        const passStyle = passStyleOf(rightOperand);
        let [leftBound, rightBound] = getPassStyleCover(passStyle);
        const newLeftBound = encodePassable(rightOperand);
        if (newLeftBound !== void 0) {
          leftBound = newLeftBound;
        }
        return [leftBound, rightBound];
      }
    });
    const matchGTHelper = Far("match:gt helper", {
      confirmMatches: (specimen, rightOperand, reject) => keyGT(specimen, rightOperand) || reject && reject`${specimen} - Must be > ${rightOperand}`,
      confirmIsWellFormed: confirmKey,
      getRankCover: matchGTEHelper.getRankCover
    });
    const matchRecordOfHelper = Far("match:recordOf helper", {
      confirmMatches: (specimen, [keyPatt, valuePatt, limits = void 0], reject) => {
        const { numPropertiesLimit, propertyNameLengthLimit } = limit(limits);
        return confirmKind(specimen, "copyRecord", reject) && (ownKeys20(specimen).length <= numPropertiesLimit || reject && reject`Must not have more than ${q5(
          numPropertiesLimit
        )} properties: ${specimen}`) && entries6(specimen).every(
          ([key, value]) => (key.length <= propertyNameLengthLimit || reject && applyLabelingError(
            () => reject`Property name must not be longer than ${q5(
              propertyNameLengthLimit
            )}`,
            [],
            key
          )) && confirmNestedMatches(
            harden_default([key, value]),
            harden_default([keyPatt, valuePatt]),
            key,
            reject
          )
        );
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern(), MM.pattern()]),
        "match:recordOf payload",
        reject
      ),
      getRankCover: (_entryPatt) => getPassStyleCover("copyRecord")
    });
    const matchArrayOfHelper = Far("match:arrayOf helper", {
      confirmMatches: (specimen, [subPatt, limits = void 0], reject) => {
        const { arrayLengthLimit } = limit(limits);
        return confirmKind(specimen, "copyArray", reject) && /** @type {Array} */
        (specimen.length <= arrayLengthLimit || reject && reject`Array length ${specimen.length} must be <= limit ${arrayLengthLimit}`) && confirmArrayEveryMatchPattern(specimen, subPatt, "", reject);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern()]),
        "match:arrayOf payload",
        reject
      ),
      getRankCover: () => getPassStyleCover("copyArray")
    });
    const matchByteArrayHelper = Far("match:byteArray helper", {
      confirmMatches: (specimen, [limits = void 0], reject) => {
        const { byteLengthLimit } = limit(limits);
        return confirmKind(specimen, "byteArray", reject) && /** @type {ArrayBuffer} */
        (specimen.byteLength <= byteLengthLimit || reject && reject`byteArray ${specimen} must not be bigger than ${byteLengthLimit}`);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([]),
        "match:byteArray payload",
        reject
      ),
      getRankCover: (_matchPayload, _encodePassable) => getPassStyleCover("byteArray")
    });
    const matchSetOfHelper = Far("match:setOf helper", {
      confirmMatches: (specimen, [keyPatt, limits = void 0], reject) => {
        const { numSetElementsLimit } = limit(limits);
        return (confirmKind(specimen, "copySet", reject) && /** @type {Array} */
        specimen.payload.length < numSetElementsLimit || reject && reject`Set must not have more than ${q5(numSetElementsLimit)} elements: ${specimen.payload.length}`) && confirmArrayEveryMatchPattern(
          specimen.payload,
          keyPatt,
          "set elements",
          reject
        );
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern()]),
        "match:setOf payload",
        reject
      ),
      getRankCover: () => getPassStyleCover("tagged")
    });
    const matchBagOfHelper = Far("match:bagOf helper", {
      confirmMatches: (specimen, [keyPatt, countPatt, limits = void 0], reject) => {
        const { numUniqueBagElementsLimit, decimalDigitsLimit } = limit(limits);
        return (confirmKind(specimen, "copyBag", reject) && /** @type {Array} */
        specimen.payload.length <= numUniqueBagElementsLimit || reject && reject`Bag must not have more than ${q5(
          numUniqueBagElementsLimit
        )} unique elements: ${specimen}`) && specimen.payload.every(
          ([key, count], i) => confirmNestedMatches(key, keyPatt, `bag keys[${i}]`, reject) && applyLabelingError(
            () => confirmDecimalDigitsLimit(count, decimalDigitsLimit, reject) && confirmMatches2(count, countPatt, reject),
            [],
            `bag counts[${i}]`
          )
        );
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern(), MM.pattern()]),
        "match:bagOf payload",
        reject
      ),
      getRankCover: () => getPassStyleCover("tagged")
    });
    const confirmElementsHasSplit = (elements, elementPatt, bound, reject, inResults, outResults, direction) => {
      let inCount = 0n;
      const firstIndex = direction === -1 ? elements.length - 1 : 0;
      const stopIndex = direction === -1 ? -1 : elements.length;
      for (let i = firstIndex; i !== stopIndex; i += direction) {
        const element = elements[i];
        if (inCount >= bound) {
          if (!outResults) break;
          outResults.push(element);
        } else if (matches2(element, elementPatt)) {
          inCount += 1n;
          if (inResults) inResults.push(element);
        } else if (outResults) {
          outResults.push(element);
        }
      }
      return inCount >= bound || reject && reject`Has only ${q5(inCount)} matches, but needs ${q5(bound)}`;
    };
    const pairsHasSplit = (pairs, elementPatt, bound, reject, inResults = void 0, outResults = void 0) => {
      let inCount = 0n;
      for (let i = pairs.length - 1; i >= 0; i -= 1) {
        const [element, num] = pairs[i];
        const stillNeeds = bound - inCount;
        if (stillNeeds <= 0n) {
          if (!outResults) break;
          outResults.push([element, num]);
        } else if (matches2(element, elementPatt)) {
          const isPartial = num > stillNeeds;
          const numTake = isPartial ? stillNeeds : num;
          inCount += numTake;
          if (inResults) inResults.push([element, numTake]);
          if (isPartial && outResults) outResults.push([element, num - numTake]);
        } else if (outResults) {
          outResults.push([element, num]);
        }
      }
      return inCount >= bound || reject && reject`Has only ${q5(inCount)} matches, but needs ${q5(bound)}`;
    };
    const containerHasSplit2 = (specimen, elementPatt, bound, reject, needInResults = false, needOutResults = false) => {
      const inResults = needInResults ? [] : void 0;
      const outResults = needOutResults ? [] : void 0;
      const kind = kindOf2(specimen);
      switch (kind) {
        case "copyArray": {
          return confirmElementsHasSplit(
            specimen,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            1
          ) && harden_default([inResults, outResults]);
        }
        case "copySet": {
          return confirmElementsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults,
            -1
          ) && harden_default([
            inResults && makeCopySet(inResults),
            outResults && makeCopySet(outResults)
          ]);
        }
        case "copyBag": {
          return pairsHasSplit(
            specimen.payload,
            elementPatt,
            bound,
            reject,
            inResults,
            outResults
          ) && harden_default([
            inResults && makeCopyBag(inResults),
            outResults && makeCopyBag(outResults)
          ]);
        }
        default: {
          return reject && reject`unexpected ${q5(kind)}`;
        }
      }
    };
    const matchContainerHasHelper = Far("M.containerHas helper", {
      /**
       * @param {CopyArray | CopySet | CopyBag} specimen
       * @param {[Pattern, bigint, Limits?]} payload
       * @param {Rejector} reject
       */
      confirmMatches: (specimen, [elementPatt, bound, limits = void 0], reject) => {
        const kind = confirmKindOf(specimen, reject);
        const { decimalDigitsLimit } = limit(limits);
        if (!applyLabelingError(
          confirmDecimalDigitsLimit,
          [bound, decimalDigitsLimit, reject],
          `${kind} matches`
        )) {
          return false;
        }
        return !!containerHasSplit2(specimen, elementPatt, bound, reject);
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern(), MM.gte(1n)]),
        "M.containerHas payload",
        reject
      ),
      getRankCover: () => getPassStyleCover("tagged")
    });
    const matchMapOfHelper = Far("match:mapOf helper", {
      confirmMatches: (specimen, [keyPatt, valuePatt, limits = void 0], reject) => {
        const { numMapEntriesLimit } = limit(limits);
        return confirmKind(specimen, "copyMap", reject) && // eslint-disable-next-line @endo/restrict-comparison-operands
        (specimen.payload.keys.length <= numMapEntriesLimit || reject && reject`CopyMap must have no more than ${q5(
          numMapEntriesLimit
        )} entries: ${specimen}`) && confirmArrayEveryMatchPattern(
          specimen.payload.keys,
          keyPatt,
          "map keys",
          reject
        ) && confirmArrayEveryMatchPattern(
          specimen.payload.values,
          valuePatt,
          "map values",
          reject
        );
      },
      confirmIsWellFormed: (payload, reject) => confirmIsWellFormedWithLimit(
        payload,
        harden_default([MM.pattern(), MM.pattern()]),
        "match:mapOf payload",
        reject
      ),
      getRankCover: (_entryPatt) => getPassStyleCover("tagged")
    });
    const splitArrayParts = (specimen, requiredPatt, optionalPatt) => {
      const numRequired = requiredPatt.length;
      const numOptional = optionalPatt.length;
      const requiredSpecimen = specimen.slice(0, numRequired);
      const optionalSpecimen = specimen.slice(
        numRequired,
        numRequired + numOptional
      );
      const restSpecimen = specimen.slice(numRequired + numOptional);
      return harden_default({ requiredSpecimen, optionalSpecimen, restSpecimen });
    };
    const adaptArrayPattern = (optionalPatt, length) => harden_default(optionalPatt.slice(0, length).map((patt) => MM.opt(patt)));
    const matchSplitArrayHelper = Far("match:splitArray helper", {
      confirmMatches: (specimen, [requiredPatt, optionalPatt = [], restPatt = MM.any()], reject) => {
        if (!confirmKind(specimen, "copyArray", reject)) {
          return false;
        }
        const { requiredSpecimen, optionalSpecimen, restSpecimen } = splitArrayParts(specimen, requiredPatt, optionalPatt);
        const partialPatt = adaptArrayPattern(
          optionalPatt,
          optionalSpecimen.length
        );
        let argNum = 0;
        return (requiredSpecimen.length === requiredPatt.length || reject && reject`Expected at least ${q5(
          requiredPatt.length
        )} arguments: ${specimen}`) && requiredPatt.every(
          (p, i) => confirmNestedMatches(
            requiredSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}`,
            reject
          )
        ) && partialPatt.every(
          (p, i) => confirmNestedMatches(
            optionalSpecimen[i],
            p,
            // eslint-disable-next-line no-plusplus
            `arg ${argNum++}?`,
            reject
          )
        ) && confirmNestedMatches(restSpecimen, restPatt, "...rest", reject);
      },
      /**
       * @param {Array} splitArray
       * @param {Rejector} reject
       */
      confirmIsWellFormed: (splitArray, reject) => {
        if (passStyleOf(splitArray) === "copyArray" && (splitArray.length >= 1 || splitArray.length <= 3)) {
          const [requiredPatt, optionalPatt = void 0, restPatt = void 0] = splitArray;
          if (isPattern2(requiredPatt) && passStyleOf(requiredPatt) === "copyArray" && (optionalPatt === void 0 || isPattern2(optionalPatt) && passStyleOf(optionalPatt) === "copyArray") && (restPatt === void 0 || isPattern2(restPatt))) {
            return true;
          }
        }
        return reject && reject`Must be an array of a requiredPatt array, an optional optionalPatt array, and an optional restPatt: ${q5(
          splitArray
        )}`;
      },
      getRankCover: ([
        _requiredPatt,
        _optionalPatt = void 0,
        _restPatt = void 0
      ]) => getPassStyleCover("copyArray")
    });
    const splitRecordParts = (specimen, requiredPatt, optionalPatt) => {
      const requiredEntries = [];
      const optionalEntries = [];
      const restEntries = [];
      for (const [name, value] of entries6(specimen)) {
        if (hasOwn10(requiredPatt, name)) {
          requiredEntries.push([name, value]);
        } else if (hasOwn10(optionalPatt, name)) {
          optionalEntries.push([name, value]);
        } else {
          restEntries.push([name, value]);
        }
      }
      return harden_default({
        requiredSpecimen: fromUniqueEntries(requiredEntries),
        optionalSpecimen: fromUniqueEntries(optionalEntries),
        restSpecimen: fromUniqueEntries(restEntries)
      });
    };
    const adaptRecordPattern = (optionalPatt, names) => fromUniqueEntries(names.map((name) => [name, MM.opt(optionalPatt[name])]));
    const matchSplitRecordHelper = Far("match:splitRecord helper", {
      confirmMatches: (specimen, [requiredPatt, optionalPatt = {}, restPatt = MM.any()], reject) => {
        if (!confirmKind(specimen, "copyRecord", reject)) {
          return false;
        }
        const { requiredSpecimen, optionalSpecimen, restSpecimen } = splitRecordParts(specimen, requiredPatt, optionalPatt);
        const partialNames = (
          /** @type {string[]} */
          ownKeys20(optionalSpecimen)
        );
        const partialPatt = adaptRecordPattern(optionalPatt, partialNames);
        return confirmMatches2(requiredSpecimen, requiredPatt, reject) && partialNames.every(
          (name) => confirmNestedMatches(
            optionalSpecimen[name],
            partialPatt[name],
            `${name}?`,
            reject
          )
        ) && confirmNestedMatches(restSpecimen, restPatt, "...rest", reject);
      },
      /**
       * @param {Array} splitArray
       * @param {Rejector} reject
       */
      confirmIsWellFormed: (splitArray, reject) => {
        if (passStyleOf(splitArray) === "copyArray" && (splitArray.length >= 1 || splitArray.length <= 3)) {
          const [requiredPatt, optionalPatt = void 0, restPatt = void 0] = splitArray;
          if (isPattern2(requiredPatt) && passStyleOf(requiredPatt) === "copyRecord" && (optionalPatt === void 0 || isPattern2(optionalPatt) && passStyleOf(optionalPatt) === "copyRecord") && (restPatt === void 0 || isPattern2(restPatt))) {
            return true;
          }
        }
        return reject && reject`Must be an array of a requiredPatt record, an optional optionalPatt record, and an optional restPatt: ${q5(
          splitArray
        )}`;
      },
      getRankCover: ([
        requiredPatt,
        _optionalPatt = void 0,
        _restPatt = void 0
      ]) => getPassStyleCover(passStyleOf(requiredPatt))
    });
    const HelpersByMatchTag = harden_default({
      "match:any": matchAnyHelper,
      "match:and": matchAndHelper,
      "match:or": matchOrHelper,
      "match:not": matchNotHelper,
      "match:scalar": matchScalarHelper,
      "match:key": matchKeyHelper,
      "match:pattern": matchPatternHelper,
      "match:kind": matchKindHelper,
      "match:tagged": matchTaggedHelper,
      "match:bigint": matchBigintHelper,
      "match:nat": matchNatHelper,
      "match:string": matchStringHelper,
      "match:symbol": matchSymbolHelper,
      "match:remotable": matchRemotableHelper,
      "match:lt": matchLTHelper,
      "match:lte": matchLTEHelper,
      "match:gte": matchGTEHelper,
      "match:gt": matchGTHelper,
      "match:arrayOf": matchArrayOfHelper,
      "match:byteArray": matchByteArrayHelper,
      "match:recordOf": matchRecordOfHelper,
      "match:setOf": matchSetOfHelper,
      "match:bagOf": matchBagOfHelper,
      "match:containerHas": matchContainerHasHelper,
      "match:mapOf": matchMapOfHelper,
      "match:splitArray": matchSplitArrayHelper,
      "match:splitRecord": matchSplitRecordHelper
    });
    const makeMatcher = (tag, payload) => {
      const matcher = makeTagged(tag, payload);
      assertPattern2(matcher);
      return matcher;
    };
    const makeKindMatcher = (kind) => makeMatcher("match:kind", kind);
    const AnyShape = makeMatcher("match:any", void 0);
    const ScalarShape = makeMatcher("match:scalar", void 0);
    const KeyShape = makeMatcher("match:key", void 0);
    const PatternShape = makeMatcher("match:pattern", void 0);
    const BooleanShape = makeKindMatcher("boolean");
    const NumberShape = makeKindMatcher("number");
    const BigIntShape = makeTagged("match:bigint", []);
    const NatShape = makeTagged("match:nat", []);
    const StringShape = makeTagged("match:string", []);
    const SymbolShape = makeTagged("match:symbol", []);
    const RecordShape = makeTagged("match:recordOf", [AnyShape, AnyShape]);
    const ArrayShape = makeTagged("match:arrayOf", [AnyShape]);
    const ByteArrayShape = makeTagged("match:byteArray", []);
    const SetShape = makeTagged("match:setOf", [AnyShape]);
    const BagShape = makeTagged("match:bagOf", [AnyShape, AnyShape]);
    const MapShape = makeTagged("match:mapOf", [AnyShape, AnyShape]);
    const RemotableShape = makeKindMatcher("remotable");
    const ErrorShape = makeKindMatcher("error");
    const PromiseShape = makeKindMatcher("promise");
    const UndefinedShape = makeKindMatcher("undefined");
    const makeLimitsMatcher = (tag, payload) => {
      if (payload[payload.length - 1] === void 0) {
        payload = harden_default(payload.slice(0, payload.length - 1));
      }
      return makeMatcher(tag, payload);
    };
    const makeRemotableMatcher = (label = void 0) => label === void 0 ? RemotableShape : makeMatcher("match:remotable", harden_default({ label }));
    const makeSplitPayload = (empty, base, optional = void 0, rest = void 0) => {
      if (rest) {
        return [base, optional || empty, rest];
      }
      if (optional) {
        return [base, optional];
      }
      return [base];
    };
    const M2 = harden_default({
      any: () => AnyShape,
      and: (...patts) => makeMatcher("match:and", patts),
      or: (...patts) => makeMatcher("match:or", patts),
      not: (subPatt) => makeMatcher("match:not", subPatt),
      scalar: () => ScalarShape,
      key: () => KeyShape,
      pattern: () => PatternShape,
      kind: makeKindMatcher,
      tagged: (tagPatt = M2.string(), payloadPatt = M2.any()) => makeMatcher("match:tagged", harden_default([tagPatt, payloadPatt])),
      boolean: () => BooleanShape,
      number: () => NumberShape,
      bigint: (limits = void 0) => limits ? makeLimitsMatcher("match:bigint", [limits]) : BigIntShape,
      nat: (limits = void 0) => limits ? makeLimitsMatcher("match:nat", [limits]) : NatShape,
      string: (limits = void 0) => limits ? makeLimitsMatcher("match:string", [limits]) : StringShape,
      symbol: (limits = void 0) => limits ? makeLimitsMatcher("match:symbol", [limits]) : SymbolShape,
      record: (limits = void 0) => limits ? M2.recordOf(M2.any(), M2.any(), limits) : RecordShape,
      // struct: A pattern that matches CopyRecords with a fixed quantity of
      // entries where the values match patterns for corresponding keys is merely
      // a hardened object with patterns in the places of values for
      // corresponding keys.
      // For example, a pattern that matches CopyRecords that have a string value
      // for the key 'x' and a number for the key 'y' is:
      // harden({ x: M.string(), y: M.number() }).
      array: (limits = void 0) => limits ? M2.arrayOf(M2.any(), limits) : ArrayShape,
      // tuple: A pattern that matches CopyArrays with a fixed quantity of values
      // that match a heterogeneous array of patterns is merely a hardened array
      // of the respective patterns.
      // For example, a pattern that matches CopyArrays of length 2 that have a
      // string at index 0 and a number at index 1 is:
      // harden([ M.string(), M.number() ]).
      byteArray: (limits = void 0) => limits ? makeLimitsMatcher("match:byteArray", [limits]) : ByteArrayShape,
      set: (limits = void 0) => limits ? M2.setOf(M2.any(), limits) : SetShape,
      bag: (limits = void 0) => limits ? M2.bagOf(M2.any(), M2.any(), limits) : BagShape,
      map: (limits = void 0) => limits ? M2.mapOf(M2.any(), M2.any(), limits) : MapShape,
      // heterogeneous map: A pattern that matches CopyMaps with a fixed quantity
      // of entries where the value for each key matches a corresponding pattern
      // is merely a (hardened) CopyMap with patterns instead of values for the
      // corresponding keys.
      // For example, a pattern that matches CopyMaps where the value for the key
      // 'x' is a number and the value for the key 'y' is a string is:
      // makeCopyMap([['x', M.number()], ['y', M.string()]]).
      remotable: makeRemotableMatcher,
      error: () => ErrorShape,
      promise: () => PromiseShape,
      undefined: () => UndefinedShape,
      null: () => null,
      lt: (rightOperand) => makeMatcher("match:lt", rightOperand),
      lte: (rightOperand) => makeMatcher("match:lte", rightOperand),
      eq: (key) => {
        assertKey(key);
        return key === void 0 ? M2.undefined() : key;
      },
      neq: (key) => M2.not(M2.eq(key)),
      gte: (rightOperand) => makeMatcher("match:gte", rightOperand),
      gt: (rightOperand) => makeMatcher("match:gt", rightOperand),
      recordOf: (keyPatt = M2.any(), valuePatt = M2.any(), limits = void 0) => makeLimitsMatcher("match:recordOf", [keyPatt, valuePatt, limits]),
      arrayOf: (subPatt = M2.any(), limits = void 0) => makeLimitsMatcher("match:arrayOf", [subPatt, limits]),
      setOf: (keyPatt = M2.any(), limits = void 0) => makeLimitsMatcher("match:setOf", [keyPatt, limits]),
      bagOf: (keyPatt = M2.any(), countPatt = M2.any(), limits = void 0) => makeLimitsMatcher("match:bagOf", [keyPatt, countPatt, limits]),
      containerHas: (elementPatt = M2.any(), countPatt = 1n, limits = void 0) => makeLimitsMatcher("match:containerHas", [elementPatt, countPatt, limits]),
      mapOf: (keyPatt = M2.any(), valuePatt = M2.any(), limits = void 0) => makeLimitsMatcher("match:mapOf", [keyPatt, valuePatt, limits]),
      splitArray: (base, optional = void 0, rest = void 0) => makeMatcher(
        "match:splitArray",
        makeSplitPayload([], base, optional, rest)
      ),
      splitRecord: (base, optional = void 0, rest = void 0) => makeMatcher(
        "match:splitRecord",
        makeSplitPayload({}, base, optional, rest)
      ),
      split: (base, rest = void 0) => {
        if (passStyleOf(harden_default(base)) === "copyArray") {
          return M2.splitArray(base, rest && [], rest);
        } else {
          return M2.splitRecord(base, rest && {}, rest);
        }
      },
      partial: (base, rest = void 0) => {
        if (passStyleOf(harden_default(base)) === "copyArray") {
          return M2.splitArray([], base, rest);
        } else {
          return M2.splitRecord({}, base, rest);
        }
      },
      eref: (t) => M2.or(t, M2.promise()),
      opt: (t) => M2.or(M2.undefined(), t),
      interface: (interfaceName, methodGuards, options) => (
        // eslint-disable-next-line no-use-before-define
        makeInterfaceGuard(interfaceName, methodGuards, options)
      ),
      call: (...argPatterns) => (
        // eslint-disable-next-line no-use-before-define
        makeMethodGuardMaker("sync", argPatterns)
      ),
      callWhen: (...argGuards) => (
        // eslint-disable-next-line no-use-before-define
        makeMethodGuardMaker("async", argGuards)
      ),
      await: (argPattern) => (
        // eslint-disable-next-line no-use-before-define
        makeAwaitArgGuard(argPattern)
      ),
      raw: () => (
        // eslint-disable-next-line no-use-before-define
        makeRawGuard()
      )
    });
    return harden_default({
      confirmMatches: confirmMatches2,
      confirmLabeledMatches: confirmNestedMatches,
      matches: matches2,
      mustMatch: mustMatch2,
      assertPattern: assertPattern2,
      isPattern: isPattern2,
      getRankCover: getRankCover2,
      M: M2,
      kindOf: kindOf2,
      containerHasSplit: containerHasSplit2
    });
  };
  var {
    confirmMatches,
    confirmLabeledMatches,
    matches,
    mustMatch,
    assertPattern,
    isPattern,
    getRankCover,
    M,
    kindOf,
    containerHasSplit
  } = makePatternKit();
  MM = M;
  var AwaitArgGuardPayloadShape = harden_default({
    argGuard: M.pattern()
  });
  var AwaitArgGuardShape = M.kind("guard:awaitArgGuard");
  var isAwaitArgGuard = (specimen) => matches(specimen, AwaitArgGuardShape);
  hideAndHardenFunction(isAwaitArgGuard);
  var assertAwaitArgGuard = (specimen) => {
    mustMatch(specimen, AwaitArgGuardShape, "awaitArgGuard");
  };
  hideAndHardenFunction(assertAwaitArgGuard);
  var makeAwaitArgGuard = (argPattern) => {
    const result = makeTagged("guard:awaitArgGuard", {
      argGuard: argPattern
    });
    assertAwaitArgGuard(result);
    return result;
  };
  var RawGuardPayloadShape = M.record();
  var RawGuardShape = M.kind("guard:rawGuard");
  var isRawGuard = (specimen) => matches(specimen, RawGuardShape);
  var makeRawGuard = () => makeTagged("guard:rawGuard", {});
  var SyncValueGuardShape = M.or(RawGuardShape, M.pattern());
  var SyncValueGuardListShape = M.arrayOf(SyncValueGuardShape);
  var ArgGuardShape = M.or(RawGuardShape, AwaitArgGuardShape, M.pattern());
  var ArgGuardListShape = M.arrayOf(ArgGuardShape);
  var SyncMethodGuardPayloadShape = harden_default({
    callKind: "sync",
    argGuards: SyncValueGuardListShape,
    optionalArgGuards: M.opt(SyncValueGuardListShape),
    restArgGuard: M.opt(SyncValueGuardShape),
    returnGuard: SyncValueGuardShape
  });
  var AsyncMethodGuardPayloadShape = harden_default({
    callKind: "async",
    argGuards: ArgGuardListShape,
    optionalArgGuards: M.opt(ArgGuardListShape),
    restArgGuard: M.opt(SyncValueGuardShape),
    returnGuard: SyncValueGuardShape
  });
  var MethodGuardPayloadShape = M.or(
    SyncMethodGuardPayloadShape,
    AsyncMethodGuardPayloadShape
  );
  var MethodGuardShape = M.kind("guard:methodGuard");
  var assertMethodGuard = (specimen) => {
    mustMatch(specimen, MethodGuardShape, "methodGuard");
  };
  hideAndHardenFunction(assertMethodGuard);
  var makeMethodGuardMaker = (callKind, argGuards, optionalArgGuards = void 0, restArgGuard = void 0) => harden_default({
    optional: (...optArgGuards) => {
      optionalArgGuards === void 0 || Fail5`Can only have one set of optional guards`;
      restArgGuard === void 0 || Fail5`optional arg guards must come before rest arg`;
      return makeMethodGuardMaker(callKind, argGuards, optArgGuards);
    },
    rest: (rArgGuard) => {
      restArgGuard === void 0 || Fail5`Can only have one rest arg`;
      return makeMethodGuardMaker(
        callKind,
        argGuards,
        optionalArgGuards,
        rArgGuard
      );
    },
    returns: (returnGuard = M.undefined()) => {
      const result = makeTagged("guard:methodGuard", {
        callKind,
        argGuards,
        optionalArgGuards,
        restArgGuard,
        returnGuard
      });
      assertMethodGuard(result);
      return result;
    }
  });
  var InterfaceGuardPayloadShape = M.splitRecord(
    {
      interfaceName: M.string(),
      methodGuards: M.recordOf(M.string(), MethodGuardShape)
    },
    {
      defaultGuards: M.or(M.undefined(), "passable", "raw"),
      sloppy: M.boolean(),
      symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape)
    }
  );
  var InterfaceGuardShape = M.kind("guard:interfaceGuard");
  var assertInterfaceGuard = (specimen) => {
    mustMatch(specimen, InterfaceGuardShape, "interfaceGuard");
  };
  hideAndHardenFunction(assertInterfaceGuard);
  var makeInterfaceGuard = (interfaceName, methodGuards, options = {}) => {
    const { sloppy = false, defaultGuards = sloppy ? "passable" : void 0 } = options;
    const stringMethodGuards = {};
    const symbolMethodGuardsEntries = [];
    for (const key of ownKeys20(methodGuards)) {
      const value = methodGuards[
        /** @type {string} */
        key
      ];
      if (typeof key === "symbol") {
        symbolMethodGuardsEntries.push([key, value]);
      } else {
        stringMethodGuards[key] = value;
      }
    }
    const result = makeTagged("guard:interfaceGuard", {
      interfaceName,
      methodGuards: stringMethodGuards,
      ...symbolMethodGuardsEntries.length ? { symbolMethodGuards: makeCopyMap(symbolMethodGuardsEntries) } : {},
      defaultGuards
    });
    assertInterfaceGuard(result);
    return (
      /** @type {InterfaceGuard<M>} */
      result
    );
  };
  var GuardPayloadShapes = harden_default({
    "guard:awaitArgGuard": AwaitArgGuardPayloadShape,
    "guard:rawGuard": RawGuardPayloadShape,
    "guard:methodGuard": MethodGuardPayloadShape,
    "guard:interfaceGuard": InterfaceGuardPayloadShape
  });

  // ../patterns/src/patterns/getGuardPayloads.js
  var LegacyAwaitArgGuardShape = harden_default({
    klass: "awaitArg",
    argGuard: M.pattern()
  });
  var getAwaitArgGuardPayload = (awaitArgGuard) => {
    if (matches(awaitArgGuard, LegacyAwaitArgGuardShape)) {
      const { klass: _, ...payload } = awaitArgGuard;
      return payload;
    }
    assertAwaitArgGuard(awaitArgGuard);
    return awaitArgGuard.payload;
  };
  harden_default(getAwaitArgGuardPayload);
  var LegacySyncMethodGuardShape = M.splitRecord(
    {
      klass: "methodGuard",
      callKind: "sync",
      argGuards: SyncValueGuardListShape,
      returnGuard: SyncValueGuardShape
    },
    {
      optionalArgGuards: SyncValueGuardListShape,
      restArgGuard: SyncValueGuardShape
    }
  );
  var LegacyArgGuardShape = M.or(
    RawGuardShape,
    AwaitArgGuardShape,
    LegacyAwaitArgGuardShape,
    M.pattern()
  );
  var LegacyArgGuardListShape = M.arrayOf(LegacyArgGuardShape);
  var LegacyAsyncMethodGuardShape = M.splitRecord(
    {
      klass: "methodGuard",
      callKind: "async",
      argGuards: LegacyArgGuardListShape,
      returnGuard: SyncValueGuardShape
    },
    {
      optionalArgGuards: ArgGuardListShape,
      restArgGuard: SyncValueGuardShape
    }
  );
  var LegacyMethodGuardShape = M.or(
    LegacySyncMethodGuardShape,
    LegacyAsyncMethodGuardShape
  );
  var adaptLegacyArgGuard = (argGuard) => matches(argGuard, LegacyAwaitArgGuardShape) ? M.await(getAwaitArgGuardPayload(argGuard).argGuard) : argGuard;
  var getMethodGuardPayload = (methodGuard) => {
    if (matches(methodGuard, MethodGuardShape)) {
      return methodGuard.payload;
    }
    mustMatch(methodGuard, LegacyMethodGuardShape, "legacyMethodGuard");
    const {
      // @ts-expect-error Legacy adaptor can be ill typed
      klass: _,
      // @ts-expect-error Legacy adaptor can be ill typed
      callKind,
      // @ts-expect-error Legacy adaptor can be ill typed
      returnGuard,
      // @ts-expect-error Legacy adaptor can be ill typed
      restArgGuard
    } = methodGuard;
    let {
      // @ts-expect-error Legacy adaptor can be ill typed
      argGuards,
      // @ts-expect-error Legacy adaptor can be ill typed
      optionalArgGuards
    } = methodGuard;
    if (callKind === "async") {
      argGuards = argGuards.map(adaptLegacyArgGuard);
      optionalArgGuards = optionalArgGuards && optionalArgGuards.map(adaptLegacyArgGuard);
    }
    const payload = harden_default({
      callKind,
      argGuards,
      optionalArgGuards,
      restArgGuard,
      returnGuard
    });
    mustMatch(payload, MethodGuardPayloadShape, "internalMethodGuardAdaptor");
    return payload;
  };
  harden_default(getMethodGuardPayload);
  var LegacyInterfaceGuardShape = M.splitRecord(
    {
      klass: "Interface",
      interfaceName: M.string(),
      methodGuards: M.recordOf(
        M.string(),
        M.or(MethodGuardShape, LegacyMethodGuardShape)
      )
    },
    {
      defaultGuards: M.or(M.undefined(), "passable", "raw"),
      sloppy: M.boolean(),
      // There is no need to accommodate LegacyMethodGuardShape in
      // this position, since `symbolMethodGuards happened
      // after https://github.com/endojs/endo/pull/1712
      symbolMethodGuards: M.mapOf(M.symbol(), MethodGuardShape)
    }
  );
  var adaptMethodGuard = (methodGuard) => {
    if (matches(methodGuard, LegacyMethodGuardShape)) {
      const {
        callKind,
        argGuards,
        optionalArgGuards = [],
        restArgGuard = M.any(),
        returnGuard
      } = getMethodGuardPayload(methodGuard);
      const mCall = callKind === "sync" ? M.call : M.callWhen;
      return mCall(...argGuards).optional(...optionalArgGuards).rest(restArgGuard).returns(returnGuard);
    }
    return methodGuard;
  };
  var getInterfaceGuardPayload = (interfaceGuard) => {
    if (matches(interfaceGuard, InterfaceGuardShape)) {
      return interfaceGuard.payload;
    }
    mustMatch(interfaceGuard, LegacyInterfaceGuardShape, "legacyInterfaceGuard");
    let { klass: _, interfaceName, methodGuards, ...rest } = interfaceGuard;
    methodGuards = objectMap(methodGuards, adaptMethodGuard);
    const payload = harden_default({
      interfaceName,
      methodGuards,
      ...rest
    });
    mustMatch(
      payload,
      InterfaceGuardPayloadShape,
      "internalInterfaceGuardAdaptor"
    );
    return payload;
  };
  harden_default(getInterfaceGuardPayload);
  var emptyCopyMap = makeCopyMap([]);
  var getInterfaceMethodKeys = (interfaceGuard) => {
    const { methodGuards, symbolMethodGuards = emptyCopyMap } = getInterfaceGuardPayload(interfaceGuard);
    return harden_default([
      ...Reflect.ownKeys(methodGuards),
      ...getCopyMapKeys(symbolMethodGuards)
    ]);
  };
  harden_default(getInterfaceMethodKeys);
  var getNamedMethodGuards = (interfaceGuard) => getInterfaceGuardPayload(interfaceGuard).methodGuards;
  harden_default(getNamedMethodGuards);

  // ../exo/src/get-interface.js
  var GET_INTERFACE_GUARD = "__getInterfaceGuard__";

  // ../exo/src/exo-tools.js
  var { apply: apply8, ownKeys: ownKeys21 } = Reflect;
  var { defineProperties: defineProperties4, fromEntries: fromEntries7, hasOwn: hasOwn11 } = Object;
  var RawMethodGuard = M.call().rest(M.raw()).returns(M.raw());
  var REDACTED_RAW_ARG = "<redacted raw arg>";
  var PassableMethodGuard = M.call().rest(M.any()).returns(M.any());
  var defendSyncArgs = (syncArgs, matchConfig, label = void 0) => {
    const {
      declaredLen,
      hasRestArgGuard,
      restArgGuardIsRaw,
      paramsPattern,
      redactedIndices
    } = matchConfig;
    let matchableArgs = syncArgs;
    if (restArgGuardIsRaw && syncArgs.length > declaredLen) {
      const restLen = syncArgs.length - declaredLen;
      const redactedRest = Array(restLen).fill(REDACTED_RAW_ARG);
      matchableArgs = [...syncArgs.slice(0, declaredLen), ...redactedRest];
    } else if (redactedIndices.length > 0 && redactedIndices[0] < syncArgs.length) {
      matchableArgs = [...syncArgs];
    }
    for (const i of redactedIndices) {
      if (i >= matchableArgs.length) {
        break;
      }
      matchableArgs[i] = REDACTED_RAW_ARG;
    }
    mustMatch(harden_default(matchableArgs), paramsPattern, label);
    if (hasRestArgGuard) {
      return syncArgs;
    }
    syncArgs.length <= declaredLen || Fail5`${q5(label)} accepts at most ${q5(declaredLen)} arguments, not ${q5(
      syncArgs.length
    )}: ${syncArgs}`;
    return syncArgs;
  };
  var buildMatchConfig = (methodGuardPayload) => {
    const {
      argGuards,
      optionalArgGuards = [],
      restArgGuard
    } = methodGuardPayload;
    const matchableArgGuards = [...argGuards, ...optionalArgGuards];
    const redactedIndices = [];
    for (let i = 0; i < matchableArgGuards.length; i += 1) {
      if (isRawGuard(matchableArgGuards[i])) {
        matchableArgGuards[i] = REDACTED_RAW_ARG;
        redactedIndices.push(i);
      }
    }
    let matchableRestArgGuard = restArgGuard;
    if (isRawGuard(matchableRestArgGuard)) {
      matchableRestArgGuard = M.arrayOf(REDACTED_RAW_ARG);
    }
    const matchableMethodGuardPayload = harden_default({
      ...methodGuardPayload,
      argGuards: matchableArgGuards.slice(0, argGuards.length),
      optionalArgGuards: matchableArgGuards.slice(argGuards.length),
      restArgGuard: matchableRestArgGuard
    });
    const paramsPattern = M.splitArray(
      matchableMethodGuardPayload.argGuards,
      matchableMethodGuardPayload.optionalArgGuards,
      matchableMethodGuardPayload.restArgGuard
    );
    return harden_default({
      declaredLen: matchableArgGuards.length,
      hasRestArgGuard: restArgGuard !== void 0,
      restArgGuardIsRaw: restArgGuard !== matchableRestArgGuard,
      paramsPattern,
      redactedIndices,
      matchableMethodGuardPayload
    });
  };
  var defendSyncMethod = (getContext, behaviorMethod, methodGuardPayload, label) => {
    const { returnGuard } = methodGuardPayload;
    const isRawReturn = isRawGuard(returnGuard);
    const matchConfig = buildMatchConfig(methodGuardPayload);
    const { syncMethod } = {
      // Note purposeful use of `this` and concise method syntax
      syncMethod(...syncArgs) {
        try {
          const context = getContext(this);
          const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
          const result = apply8(behaviorMethod, context, realArgs);
          if (!isRawReturn) {
            mustMatch(harden_default(result), returnGuard, `${label}: result`);
          }
          return result;
        } catch (thrownThing) {
          throw toThrowable(thrownThing);
        }
      }
    };
    return syncMethod;
  };
  var desync = (methodGuardPayload) => {
    const {
      argGuards,
      optionalArgGuards = [],
      restArgGuard
    } = methodGuardPayload;
    !isAwaitArgGuard(restArgGuard) || Fail5`Rest args may not be awaited: ${restArgGuard}`;
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
        optionalArgGuards: rawArgGuards.slice(argGuards.length)
      }
    };
  };
  var defendAsyncMethod = (getContext, behaviorMethod, methodGuardPayload, label) => {
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
          /** @param {any[]} awaitedArgs */
          (awaitedArgs) => {
            for (let j = 0; j < awaitedArgs.length; j += 1) {
              syncArgs[awaitIndexes[j]] = awaitedArgs[j];
            }
            const context = getContext(this);
            const realArgs = defendSyncArgs(syncArgs, matchConfig, label);
            return apply8(behaviorMethod, context, realArgs);
          }
        );
        return E.when(resultP, (fulfillment) => {
          if (!isRawReturn) {
            mustMatch(harden_default(fulfillment), returnGuard, `${label}: result`);
          }
          return fulfillment;
        }).catch(
          (reason) => (
            // Done is a chained `.catch` rather than an onRejected clause of the
            // `E.when` above in case the `mustMatch` throws.
            Promise.reject(toThrowable(reason))
          )
        );
      }
    };
    return asyncMethod;
  };
  var defendMethod = (getContext, behaviorMethod, methodGuard, label) => {
    const methodGuardPayload = getMethodGuardPayload(methodGuard);
    const { callKind } = methodGuardPayload;
    if (callKind === "sync") {
      return defendSyncMethod(
        getContext,
        behaviorMethod,
        methodGuardPayload,
        label
      );
    } else {
      assert(callKind === "async");
      return defendAsyncMethod(
        getContext,
        behaviorMethod,
        methodGuardPayload,
        label
      );
    }
  };
  var bindMethod = (methodTag, contextProvider, behaviorMethod, methodGuard) => {
    assert.typeof(behaviorMethod, "function");
    const getContext = (representative) => {
      representative || // separate line to ease breakpointing
      Fail5`Method ${methodTag} called without 'this' object`;
      const context = contextProvider(representative);
      if (context === void 0) {
        throw Fail5`${q5(
          methodTag
        )} may only be applied to a valid instance: ${representative}`;
      }
      return context;
    };
    const method = defendMethod(
      getContext,
      behaviorMethod,
      methodGuard,
      methodTag
    );
    defineProperties4(method, {
      name: { value: methodTag },
      length: { value: behaviorMethod.length }
    });
    return method;
  };
  var defendPrototype = (tag, contextProvider, behaviorMethods, thisfulMethods = false, interfaceGuard = void 0) => {
    const prototype = {};
    const methodNames = getRemotableMethodNames(behaviorMethods).filter(
      // By ignoring any method that seems to be a constructor, we can use a
      // class.prototype as a behaviorMethods.
      (key) => {
        if (key !== "constructor") {
          return true;
        }
        const constructor = behaviorMethods.constructor;
        return !(constructor.prototype && constructor.prototype.constructor === constructor);
      }
    );
    let methodGuards;
    let defaultGuards;
    if (interfaceGuard) {
      const {
        interfaceName,
        methodGuards: mg,
        symbolMethodGuards,
        sloppy,
        defaultGuards: dg = sloppy ? "passable" : void 0
      } = getInterfaceGuardPayload(interfaceGuard);
      methodGuards = harden_default({
        ...mg,
        ...symbolMethodGuards && fromEntries7(getCopyMapEntries(symbolMethodGuards))
      });
      defaultGuards = dg;
      {
        const methodGuardNames = ownKeys21(methodGuards);
        const unimplemented = listDifference(methodGuardNames, methodNames);
        unimplemented.length === 0 || Fail5`methods ${q5(unimplemented)} not implemented by ${q5(tag)}`;
        if (defaultGuards === void 0) {
          const unguarded = listDifference(methodNames, methodGuardNames);
          unguarded.length === 0 || Fail5`methods ${q5(unguarded)} not guarded by ${q5(interfaceName)}`;
        }
      }
    }
    for (const prop of methodNames) {
      const originalMethod = behaviorMethods[prop];
      const { shiftedMethod } = {
        shiftedMethod(...args) {
          return originalMethod(this, ...args);
        }
      };
      const behaviorMethod = thisfulMethods ? originalMethod : shiftedMethod;
      let methodGuard = methodGuards && methodGuards[prop];
      if (!methodGuard) {
        switch (defaultGuards) {
          case void 0: {
            if (thisfulMethods) {
              methodGuard = PassableMethodGuard;
            } else {
              methodGuard = RawMethodGuard;
            }
            break;
          }
          case "passable": {
            methodGuard = PassableMethodGuard;
            break;
          }
          case "raw": {
            methodGuard = RawMethodGuard;
            break;
          }
          default: {
            throw Fail5`Unrecognized defaultGuards ${q5(defaultGuards)}`;
          }
        }
      }
      prototype[prop] = bindMethod(
        `In ${q5(prop)} method of (${tag})`,
        contextProvider,
        behaviorMethod,
        methodGuard
      );
    }
    if (!hasOwn11(prototype, GET_INTERFACE_GUARD)) {
      const getInterfaceGuardMethod = {
        [GET_INTERFACE_GUARD]() {
          return interfaceGuard;
        }
      }[GET_INTERFACE_GUARD];
      prototype[GET_INTERFACE_GUARD] = bindMethod(
        `In ${q5(GET_INTERFACE_GUARD)} method of (${tag})`,
        contextProvider,
        getInterfaceGuardMethod,
        PassableMethodGuard
      );
    }
    return Far(
      tag,
      /** @type {T & GetInterfaceGuard<T>} */
      prototype
    );
  };
  harden_default(defendPrototype);
  var defendPrototypeKit = (tag, contextProviderKit, behaviorMethodsKit, thisfulMethods = false, interfaceGuardKit = void 0) => {
    const facetNames = ownKeys21(behaviorMethodsKit).sort();
    facetNames.length > 1 || Fail5`A multi-facet object must have multiple facets`;
    if (interfaceGuardKit) {
      const interfaceNames = ownKeys21(interfaceGuardKit);
      const extraInterfaceNames = listDifference(facetNames, interfaceNames);
      extraInterfaceNames.length === 0 || Fail5`Interfaces ${q5(extraInterfaceNames)} not implemented by ${q5(tag)}`;
      const extraFacetNames2 = listDifference(interfaceNames, facetNames);
      extraFacetNames2.length === 0 || Fail5`Facets ${q5(extraFacetNames2)} of ${q5(tag)} not guarded by interfaces`;
    }
    const contextMapNames = ownKeys21(contextProviderKit);
    const extraContextNames = listDifference(facetNames, contextMapNames);
    extraContextNames.length === 0 || Fail5`Contexts ${q5(extraContextNames)} not implemented by ${q5(tag)}`;
    const extraFacetNames = listDifference(contextMapNames, facetNames);
    extraFacetNames.length === 0 || Fail5`Facets ${q5(extraFacetNames)} of ${q5(tag)} missing contexts`;
    const protoKit = objectMap(
      behaviorMethodsKit,
      (behaviorMethods, facetName) => defendPrototype(
        `${tag} ${String(facetName)}`,
        contextProviderKit[facetName],
        behaviorMethods,
        thisfulMethods,
        interfaceGuardKit && interfaceGuardKit[facetName]
      )
    );
    return protoKit;
  };

  // ../exo/src/exo-makers.js
  var { create: create4, seal, freeze: freeze11, defineProperty: defineProperty4, values: values3 } = Object;
  var LABEL_INSTANCES = environmentOptionsListHas("DEBUG", "label-instances");
  var makeSelf = (proto, instanceCount) => {
    const self = create4(proto);
    if (LABEL_INSTANCES) {
      defineProperty4(self, Symbol.toStringTag, {
        value: `${proto[Symbol.toStringTag]}#${instanceCount}`,
        writable: false,
        enumerable: false,
        configurable: false
      });
    }
    return harden_default(self);
  };
  var emptyRecord = harden_default({});
  var initEmpty = () => emptyRecord;
  var defineExoClass = (tag, interfaceGuard, init, methods, options = {}) => {
    harden_default(methods);
    const {
      finish = void 0,
      receiveAmplifier = void 0,
      receiveInstanceTester = void 0
    } = options;
    receiveAmplifier === void 0 || Fail5`Only facets of an exo class kit can be amplified ${q5(tag)}`;
    const contextMap = /* @__PURE__ */ new WeakMap();
    const proto = defendPrototype(
      tag,
      (self) => (
        /** @type {any} */
        contextMap.get(self)
      ),
      methods,
      true,
      interfaceGuard
    );
    let instanceCount = 0;
    const makeInstance = (...args) => {
      const state = seal(init(...args));
      instanceCount += 1;
      const self = makeSelf(proto, instanceCount);
      const context = freeze11({ state, self });
      contextMap.set(self, context);
      if (finish) {
        finish(context);
      }
      return self;
    };
    if (receiveInstanceTester) {
      const isInstance = (exo, facetName = void 0) => {
        facetName === void 0 || Fail5`facetName can only be used with an exo class kit: ${q5(
          tag
        )} has no facet ${q5(facetName)}`;
        return contextMap.has(exo);
      };
      harden_default(isInstance);
      receiveInstanceTester(isInstance);
    }
    return harden_default(makeInstance);
  };
  harden_default(defineExoClass);
  var defineExoClassKit = (tag, interfaceGuardKit, init, methodsKit, options = {}) => {
    harden_default(methodsKit);
    const {
      finish = void 0,
      receiveAmplifier = void 0,
      receiveInstanceTester = void 0
    } = options;
    const contextMapKit = objectMap(methodsKit, () => /* @__PURE__ */ new WeakMap());
    const getContextKit = objectMap(
      contextMapKit,
      (contextMap) => (facet) => contextMap.get(facet)
    );
    const prototypeKit = defendPrototypeKit(
      tag,
      getContextKit,
      methodsKit,
      true,
      interfaceGuardKit
    );
    let instanceCount = 0;
    const makeInstanceKit = (...args) => {
      const state = seal(init(...args));
      const context = { state, facets: null };
      instanceCount += 1;
      const facets = objectMap(prototypeKit, (proto, facetName) => {
        const self = makeSelf(proto, instanceCount);
        contextMapKit[facetName].set(self, context);
        return self;
      });
      context.facets = facets;
      freeze11(context);
      if (finish) {
        finish(context);
      }
      return (
        /** @type {GuardedKit<F>} */
        context.facets
      );
    };
    if (receiveAmplifier) {
      const amplify = (exoFacet) => {
        for (const contextMap of values3(contextMapKit)) {
          if (contextMap.has(exoFacet)) {
            const { facets } = contextMap.get(exoFacet);
            return facets;
          }
        }
        throw Fail5`Must be a facet of ${q5(tag)}: ${exoFacet}`;
      };
      harden_default(amplify);
      receiveAmplifier(amplify);
    }
    if (receiveInstanceTester) {
      const isInstance = (exoFacet, facetName = void 0) => {
        if (facetName === void 0) {
          return values3(contextMapKit).some(
            (contextMap2) => contextMap2.has(exoFacet)
          );
        }
        assert.typeof(facetName, "string");
        const contextMap = contextMapKit[facetName];
        contextMap !== void 0 || Fail5`exo class kit ${q5(tag)} has no facet named ${q5(facetName)}`;
        return contextMap.has(exoFacet);
      };
      harden_default(isInstance);
      receiveInstanceTester(isInstance);
    }
    return harden_default(makeInstanceKit);
  };
  harden_default(defineExoClassKit);
  var makeExo = (tag, interfaceGuard, methods, options = void 0) => {
    const makeInstance = defineExoClass(
      tag,
      interfaceGuard,
      initEmpty,
      methods,
      options
    );
    return makeInstance();
  };
  harden_default(makeExo);

  // ../platform/src/fs/interfaces.js
  var AsyncIteratorInterface = M.interface("AsyncIterator", {
    next: M.call().returns(M.promise()),
    return: M.call().optional(M.any()).returns(M.promise()),
    throw: M.call().optional(M.any()).returns(M.promise())
  });
  harden(AsyncIteratorInterface);
  var ReadableBlobInterface = M.interface("ReadableBlob", {
    streamBase64: M.call().returns(M.remotable()),
    text: M.call().returns(M.promise()),
    json: M.call().returns(M.promise())
  });
  harden(ReadableBlobInterface);
  var SnapshotBlobInterface = M.interface("SnapshotBlob", {
    sha256: M.call().returns(M.string()),
    streamBase64: M.call().returns(M.remotable()),
    text: M.call().returns(M.promise()),
    json: M.call().returns(M.promise())
  });
  harden(SnapshotBlobInterface);
  var ReadableTreeInterface = M.interface("ReadableTree", {
    has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise())
  });
  harden(ReadableTreeInterface);
  var SnapshotTreeInterface = M.interface("SnapshotTree", {
    sha256: M.call().returns(M.string()),
    has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise())
  });
  harden(SnapshotTreeInterface);
  var ContentStoreInterface = M.interface("ContentStore", {
    store: M.call(M.remotable()).returns(M.promise()),
    fetch: M.call(M.string()).returns(M.remotable()),
    has: M.call(M.string()).returns(M.promise())
  });
  harden(ContentStoreInterface);
  var SnapshotStoreInterface = M.interface("SnapshotStore", {
    store: M.call(M.remotable()).returns(M.promise()),
    fetch: M.call(M.string()).returns(M.remotable()),
    has: M.call(M.string()).returns(M.promise()),
    loadBlob: M.call(M.string()).returns(M.remotable()),
    loadTree: M.call(M.string()).returns(M.remotable())
  });
  harden(SnapshotStoreInterface);
  var TreeWriterInterface = M.interface("TreeWriter", {
    writeBlob: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
    makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise())
  });
  harden(TreeWriterInterface);
  var FileInterface = M.interface("File", {
    streamBase64: M.call().returns(M.remotable()),
    text: M.call().returns(M.promise()),
    json: M.call().returns(M.promise()),
    writeText: M.call(M.string()).returns(M.promise()),
    writeBytes: M.call(M.remotable()).returns(M.promise()),
    append: M.call(M.string()).returns(M.promise()),
    readOnly: M.call().returns(M.remotable("ReadableBlob")),
    snapshot: M.call().returns(M.promise())
  });
  harden(FileInterface);
  var DirectoryInterface = M.interface("Directory", {
    has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise()),
    write: M.call(M.arrayOf(M.string()), M.remotable()).returns(M.promise()),
    remove: M.call(M.arrayOf(M.string())).returns(M.promise()),
    move: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(
      M.promise()
    ),
    copy: M.call(M.arrayOf(M.string()), M.arrayOf(M.string())).returns(
      M.promise()
    ),
    makeDirectory: M.call(M.arrayOf(M.string())).returns(M.promise()),
    readOnly: M.call().returns(M.remotable("ReadableTree")),
    snapshot: M.call().returns(M.promise())
  });
  harden(DirectoryInterface);

  // ../platform/src/fs/snapshot-blob.js
  var snapshotBlobMethods = (store, sha256) => {
    const { text, json, streamBase64 } = store.fetch(sha256);
    return harden_default({
      sha256: () => sha256,
      streamBase64,
      text,
      json
    });
  };
  harden_default(snapshotBlobMethods);

  // ../platform/src/fs/snapshot-tree.js
  var snapshotTreeMethods = (store, sha256) => {
    const { json } = store.fetch(sha256);
    let entriesPromise;
    const getEntries = () => {
      if (!entriesPromise) {
        entriesPromise = json();
      }
      return entriesPromise;
    };
    const resolveChild = (childType, childSha256) => {
      if (childType === "blob") {
        return store.loadBlob(childSha256);
      } else if (childType === "tree") {
        return store.loadTree(childSha256);
      }
      throw new TypeError(`Unknown entry type: ${JSON.stringify(childType)}`);
    };
    return harden_default({
      sha256: () => sha256,
      /**
       * @param {...string} petNamePath
       */
      has: async (...petNamePath) => {
        if (petNamePath.length === 0) {
          return true;
        }
        const entries7 = await getEntries();
        const [head, ...tail] = petNamePath;
        const entry = entries7.find(([name]) => name === head);
        if (!entry) {
          return false;
        }
        if (tail.length === 0) {
          return true;
        }
        const child = resolveChild(entry[1], entry[2]);
        return E(child).has(...tail);
      },
      /**
       * @param {...string} petNamePath
       */
      list: async (...petNamePath) => {
        const entries7 = await getEntries();
        if (petNamePath.length === 0) {
          return harden_default(entries7.map(([name]) => name));
        }
        const [head, ...tail] = petNamePath;
        const entry = entries7.find(([name]) => name === head);
        if (!entry) {
          throw new TypeError(`Unknown name: ${JSON.stringify(head)}`);
        }
        const child = resolveChild(entry[1], entry[2]);
        return E(child).list(...tail);
      },
      /**
       * @param {string | string[]} petNamePath
       */
      lookup: async (petNamePath) => {
        const namePath = typeof petNamePath === "string" ? [petNamePath] : petNamePath;
        const entries7 = await getEntries();
        const [head, ...tail] = namePath;
        const entry = entries7.find(([name]) => name === head);
        if (!entry) {
          throw new TypeError(`Unknown name: ${JSON.stringify(head)}`);
        }
        const child = resolveChild(entry[1], entry[2]);
        if (tail.length === 0) {
          return child;
        }
        return tail.reduce(
          (hub, name) => E(hub).lookup(name),
          /** @type {any} */
          child
        );
      }
    });
  };
  harden_default(snapshotTreeMethods);

  // ../platform/src/fs/snapshot-store.js
  var makeSnapshotStore = (contentStore) => {
    const snapshotStore = harden_default({
      store: (readable) => contentStore.store(readable),
      fetch: (sha256) => contentStore.fetch(sha256),
      has: (sha256) => contentStore.has(sha256),
      loadBlob: (sha256) => makeExo(
        `SnapshotBlob ${sha256.slice(0, 8)}...`,
        SnapshotBlobInterface,
        snapshotBlobMethods(snapshotStore, sha256)
      ),
      loadTree: (sha256) => makeExo(
        `SnapshotTree ${sha256.slice(0, 8)}...`,
        SnapshotTreeInterface,
        snapshotTreeMethods(snapshotStore, sha256)
      )
    });
    return snapshotStore;
  };
  harden_default(makeSnapshotStore);

  // ../base64/src/common.js
  var { freeze: freeze12 } = Object;
  var padding = "=";
  var alphabet64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var monodu64 = {};
  for (let i = 0; i < alphabet64.length; i += 1) {
    const c = alphabet64[i];
    monodu64[c] = i;
  }
  freeze12(monodu64);

  // ../base64/src/encode.js
  var jsEncodeBase64 = (data) => {
    let string = "";
    let register = 0;
    let quantum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const b2 = data[i];
      register = register << 8 | b2;
      quantum += 8;
      if (quantum === 24) {
        string += alphabet64[register >>> 18 & 63] + alphabet64[register >>> 12 & 63] + alphabet64[register >>> 6 & 63] + alphabet64[register >>> 0 & 63];
        register = 0;
        quantum = 0;
      }
    }
    switch (quantum) {
      case 0:
        break;
      case 8:
        string += alphabet64[register >>> 2 & 63] + alphabet64[register << 4 & 63] + padding + padding;
        break;
      case 16:
        string += alphabet64[register >>> 10 & 63] + alphabet64[register >>> 4 & 63] + alphabet64[register << 2 & 63] + padding;
        break;
      default:
        throw Error(`internal: bad quantum ${quantum}`);
    }
    return string;
  };
  var encodeBase64 = globalThis.Base64 !== void 0 ? globalThis.Base64.encode : jsEncodeBase64;

  // ../base64/src/decode.js
  var jsDecodeBase64 = (string, name = "<unknown>") => {
    const data = new Uint8Array(Math.ceil(string.length * 4 / 3));
    let register = 0;
    let quantum = 0;
    let i = 0;
    let j = 0;
    while (i < string.length && string[i] !== padding) {
      const number = monodu64[string[i]];
      if (number === void 0) {
        throw Error(`Invalid base64 character ${string[i]} in string ${name}`);
      }
      register = register << 6 | number;
      quantum += 6;
      if (quantum >= 8) {
        quantum -= 8;
        data[j] = register >>> quantum;
        j += 1;
        register &= (1 << quantum) - 1;
      }
      i += 1;
    }
    while (quantum > 0) {
      if (i === string.length || string[i] !== padding) {
        throw Error(`Missing padding at offset ${i} of string ${name}`);
      }
      i += 1;
      quantum -= 2;
    }
    if (i < string.length) {
      throw Error(
        `Base64 string has trailing garbage ${string.substr(
          i
        )} in string ${name}`
      );
    }
    return data.subarray(0, j);
  };
  var adaptDecoder = (nativeDecodeBase64) => (...args) => {
    const decoded = nativeDecodeBase64(...args);
    if (decoded instanceof Uint8Array) {
      return decoded;
    }
    return new Uint8Array(decoded);
  };
  var decodeBase64 = globalThis.Base64 !== void 0 ? adaptDecoder(globalThis.Base64.decode) : jsDecodeBase64;

  // ../stream/index.js
  var freeze13 = (
    /** @type {<T>(v: T | Readonly<T>) => T} */
    Object.freeze
  );
  var makeQueue = () => {
    let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
    return {
      put(value) {
        const { resolve, promise } = makePromiseKit();
        tailResolve(freeze13({ value, promise }));
        tailResolve = resolve;
      },
      get() {
        const promise = tailPromise.then((next) => next.value);
        tailPromise = tailPromise.then((next) => next.promise);
        return harden_default(promise);
      }
    };
  };
  harden_default(makeQueue);
  var makeStream = (acks, data) => {
    const stream = harden_default({
      /**
       * @param {TWrite} value
       */
      next(value) {
        data.put(freeze13({ value, done: false }));
        return acks.get();
      },
      /**
       * @param {TWriteReturn} value
       */
      return(value) {
        data.put(freeze13({ value, done: true }));
        return acks.get();
      },
      /**
       * @param {Error} error
       */
      throw(error) {
        data.put(harden_default(Promise.reject(error)));
        return acks.get();
      },
      [Symbol.asyncIterator]() {
        return stream;
      }
    });
    return stream;
  };
  harden_default(makeStream);
  var makePipe = () => {
    const data = makeQueue();
    const acks = makeQueue();
    const reader = makeStream(acks, data);
    const writer = makeStream(data, acks);
    return harden_default([writer, reader]);
  };
  harden_default(makePipe);
  var pump = async (writer, reader, primer) => {
    const tick = (promise) => E.when(
      promise,
      (result) => {
        if (result.done) {
          return writer.return(result.value);
        } else {
          return tock(writer.next(result.value));
        }
      },
      (error) => {
        return writer.throw(error);
      }
    );
    const tock = (promise) => E.when(
      promise,
      (result) => {
        if (result.done) {
          return reader.return(result.value);
        } else {
          return tick(reader.next(result.value));
        }
      },
      (error) => {
        return reader.throw(error);
      }
    );
    await tick(reader.next(primer));
    return void 0;
  };
  harden_default(pump);
  var prime = (generator, primer) => {
    const first = generator.next(primer);
    let result;
    const primed = harden_default({
      /** @param {TWrite} value */
      async next(value) {
        if (result === void 0) {
          result = await first;
          if (result.done) {
            return result;
          }
        }
        return generator.next(value);
      },
      /** @param {TReturn} value */
      async return(value) {
        if (result === void 0) {
          result = await first;
          if (result.done) {
            return result;
          }
        }
        return generator.return(value);
      },
      /** @param {Error} error */
      async throw(error) {
        if (result === void 0) {
          result = await first;
          if (result.done) {
            throw error;
          }
        }
        return generator.throw(error);
      }
    });
    return primed;
  };
  harden_default(prime);
  var mapReader = (reader, transform) => {
    async function* transformGenerator() {
      for await (const value of reader) {
        yield transform(value);
      }
      return void 0;
    }
    harden_default(transformGenerator);
    return harden_default(transformGenerator());
  };
  harden_default(mapReader);
  var mapWriter = (writer, transform) => {
    const transformedWriter = harden_default({
      /**
       * @param {TIn} value
       */
      async next(value) {
        return writer.next(transform(value));
      },
      /**
       * @param {Error} error
       */
      async throw(error) {
        return writer.throw(error);
      },
      /**
       * @param {undefined} value
       */
      async return(value) {
        return writer.return(value);
      },
      [Symbol.asyncIterator]() {
        return transformedWriter;
      }
    });
    return transformedWriter;
  };
  harden_default(mapWriter);

  // ../platform/src/fs/ref-reader.js
  var makeRefIterator = (iteratorRef) => {
    const iterator = harden_default({
      /** @param {[] | [TNext]} args */
      next: async (...args) => E(iteratorRef).next(...args),
      /** @param {[] | [TReturn]} args */
      return: async (...args) => E(iteratorRef).return(...args),
      /** @param {any} error */
      throw: async (error) => E(iteratorRef).throw(error),
      [Symbol.asyncIterator]: () => iterator
    });
    return iterator;
  };
  harden_default(makeRefIterator);
  var makeRefReader = (readerRef) => mapReader(makeRefIterator(readerRef), decodeBase64);
  harden_default(makeRefReader);

  // ../platform/src/fs/checkin.js
  var MAX_CHECKIN_DEPTH = 64;
  var checkinTree = async (remoteTree, store, options = {}) => {
    const { maxDepth = MAX_CHECKIN_DEPTH } = options;
    const checkinNode = async (remoteNode, isTree, depth) => {
      if (depth > maxDepth) {
        throw new TypeError(`Maximum checkin depth (${maxDepth}) exceeded`);
      }
      if (!isTree) {
        const readerRef = E(remoteNode).streamBase64();
        const sha2562 = await store.store(makeRefReader(readerRef));
        return { type: "blob", sha256: sha2562 };
      }
      const names = await E(remoteNode).list();
      const treeEntries = [];
      for (const name of names) {
        const child = await E(remoteNode).lookup(name);
        const methods = await E(child).__getMethodNames__();
        const childIsTree = methods.includes("list");
        const result = await checkinNode(child, childIsTree, depth + 1);
        treeEntries.push([name, result.type, result.sha256]);
      }
      treeEntries.sort(([a], [b2]) => a < b2 ? -1 : a > b2 ? 1 : 0);
      const treeJson = JSON.stringify(treeEntries);
      const treeBytes = new TextEncoder().encode(treeJson);
      async function* singleChunk() {
        yield treeBytes;
      }
      const sha256 = await store.store(singleChunk());
      return { type: "tree", sha256 };
    };
    return checkinNode(remoteTree, true, 0);
  };
  harden_default(checkinTree);

  // ../platform/src/fs/checkout.js
  var checkoutTree = async (tree, writer, options = {}) => {
    const { onFile } = options;
    const walk = async (node, pathSegments) => {
      await writer.makeDirectory(pathSegments);
      const names = await E(node).list();
      for (const name of names) {
        const child = await E(node).lookup(name);
        const childPath = [...pathSegments, name];
        const methods = await E(child).__getMethodNames__();
        const isTree = methods.includes("list");
        if (isTree) {
          await walk(child, childPath);
        } else {
          const readerRef = E(child).streamBase64();
          const readable = makeRefReader(readerRef);
          await writer.writeBlob(childPath, readable);
          if (onFile) onFile();
        }
      }
    };
    await walk(tree, []);
  };
  harden_default(checkoutTree);

  // ../platform/src/fs/reader-ref.js
  var asyncIterate = (iterable) => {
    let iterator;
    if (iterable[Symbol.asyncIterator]) {
      iterator = iterable[Symbol.asyncIterator]();
    } else if (iterable[Symbol.iterator]) {
      iterator = iterable[Symbol.iterator]();
    } else if ("next" in iterable) {
      iterator = iterable;
    }
    return iterator;
  };
  var makeIteratorRef = (iterable) => {
    const iterator = asyncIterate(iterable);
    return makeExo("AsyncIterator", AsyncIteratorInterface, {
      async next() {
        return iterator.next(void 0);
      },
      /**
       * @param {any} value
       */
      async return(value) {
        if (iterator.return !== void 0) {
          return iterator.return(value);
        }
        return harden_default({ done: true, value: void 0 });
      },
      /**
       * @param {any} error
       */
      async throw(error) {
        if (iterator.throw !== void 0) {
          return iterator.throw(error);
        }
        return harden_default({ done: true, value: void 0 });
      }
    });
  };
  harden_default(makeIteratorRef);
  var makeReaderRef = (readable) => makeIteratorRef(mapReader(asyncIterate(readable), encodeBase64));
  harden_default(makeReaderRef);

  // src/ref-reader.js
  var makeRefIterator2 = (iteratorRef) => {
    const iterator = harden_default({
      /** @param {[] | [TNext]} args */
      next: async (...args) => E(iteratorRef).next(...args),
      /** @param {[] | [TReturn]} args */
      return: async (...args) => E(iteratorRef).return(...args),
      /** @param {any} error */
      throw: async (error) => E(iteratorRef).throw(error),
      [Symbol.asyncIterator]: () => iterator
    });
    return iterator;
  };
  harden_default(makeRefIterator2);
  var makeRefReader2 = (readerRef) => mapReader(makeRefIterator2(readerRef), decodeBase64);

  // src/interfaces.js
  var NameShape = M.string();
  var NamePathShape = M.arrayOf(NameShape);
  var NameOrPathShape = M.or(NameShape, NamePathShape);
  var NamesOrPathsShape = M.arrayOf(NameOrPathShape);
  var EdgeNameShape = M.string();
  var EdgeNamesShape = M.arrayOf(EdgeNameShape);
  var IdShape = M.string();
  var LocatorShape = M.string();
  var MessageNumberShape = M.bigint();
  var EnvShape = M.recordOf(M.string(), M.string());
  var MakeCapletOptionsShape = M.splitRecord(
    {},
    {
      powersName: NameShape,
      resultName: NameOrPathShape,
      env: EnvShape,
      workerTrustedShims: M.arrayOf(M.string())
    }
  );
  var EvaluateMethodGuard = M.call(
    M.or(NameShape, M.undefined()),
    M.string(),
    M.arrayOf(M.string()),
    NamesOrPathsShape
  ).optional(NameOrPathShape).returns(M.promise());
  var WorkerInterface = M.interface("EndoWorker", {});
  var ResponderInterface = M.interface("EndoResponder", {
    resolveWithId: M.call(M.or(IdShape, M.promise())).returns()
  });
  var NameHubInterface = M.interface("EndoNameHub", {
    has: M.call().rest(NamePathShape).returns(M.promise()),
    identify: M.call().rest(NamePathShape).returns(M.promise()),
    locate: M.call().rest(NamePathShape).returns(M.promise()),
    reverseLocate: M.call(LocatorShape).returns(M.promise()),
    followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
    list: M.call().rest(NamePathShape).returns(M.promise()),
    listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
    listLocators: M.call().rest(NamePathShape).returns(M.promise()),
    followNameChanges: M.call().returns(M.remotable()),
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    maybeLookup: M.call(NameOrPathShape).returns(M.any()),
    reverseLookup: M.call(M.any()).returns(M.promise()),
    storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    remove: M.call().rest(NamePathShape).returns(M.promise()),
    move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    copy: M.call(NamePathShape, NamePathShape).returns(M.promise())
  });
  var EnvelopeInterface = M.interface("EndoEnvelope", {});
  var DismisserInterface = M.interface("EndoDismisser", {
    dismiss: M.call().returns(M.promise())
  });
  var HandleInterface = M.interface(
    "EndoHandle",
    {},
    { defaultGuards: "passable" }
  );
  var AsyncIteratorInterface2 = M.interface("AsyncIterator", {
    next: M.call().returns(M.promise()),
    return: M.call().optional(M.any()).returns(M.promise()),
    throw: M.call().optional(M.any()).returns(M.promise())
  });
  var DirectoryInterface2 = M.interface("EndoDirectory", {
    // Self-documentation
    help: M.call().optional(M.string()).returns(M.string()),
    // Check if a name exists
    has: M.call().rest(NamePathShape).returns(M.promise()),
    // Get formula identifier for a name path
    identify: M.call().rest(NamePathShape).returns(M.promise()),
    // Get locator string for a name path
    locate: M.call().rest(NamePathShape).returns(M.promise()),
    // Find names for a locator
    reverseLocate: M.call(LocatorShape).returns(M.promise()),
    // Subscribe to name changes for a locator (returns iterator ref)
    followLocatorNameChanges: M.call(LocatorShape).returns(M.remotable()),
    // List names in a directory
    list: M.call().rest(NamePathShape).returns(M.promise()),
    // List unique formula identifiers
    listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
    // List locators for names
    listLocators: M.call().rest(NamePathShape).returns(M.promise()),
    // Subscribe to name changes (returns iterator ref)
    followNameChanges: M.call().returns(M.remotable()),
    // Resolve a name path to a value
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    // Resolve a name path, returning undefined if the head name is absent
    maybeLookup: M.call(NameOrPathShape).returns(M.any()),
    // Get names for a value
    reverseLookup: M.call(M.any()).returns(M.promise()),
    // Store a formula identifier with a name
    storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    // Store an endo:// locator with a name
    storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    // Remove a name
    remove: M.call().rest(NamePathShape).returns(M.promise()),
    // Move/rename a reference
    move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    // Copy a reference
    copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    // Create a new directory
    makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
    // Text I/O (delegated to mount)
    readText: M.call(NameOrPathShape).returns(M.promise()),
    maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
    writeText: M.call(NameOrPathShape, M.string()).returns(M.promise())
  });
  var GuestInterface = M.interface("EndoGuest", {
    // Self-documentation
    help: M.call().optional(M.string()).returns(M.string()),
    // Directory
    has: M.call().rest(NamePathShape).returns(M.promise()),
    identify: M.call().rest(NamePathShape).returns(M.promise()),
    reverseIdentify: M.call(IdShape).returns(M.array()),
    locate: M.call().rest(NamePathShape).returns(M.promise()),
    reverseLocate: M.call(LocatorShape).returns(M.promise()),
    followLocatorNameChanges: M.call(LocatorShape).returns(M.promise()),
    list: M.call().rest(NamePathShape).returns(M.promise()),
    listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
    listLocators: M.call().rest(NamePathShape).returns(M.promise()),
    followNameChanges: M.call().returns(M.promise()),
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    maybeLookup: M.call(NameOrPathShape).returns(M.any()),
    lookupById: M.call(IdShape).returns(M.promise()),
    reverseLookup: M.call(M.any()).returns(M.promise()),
    storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    remove: M.call().rest(NamePathShape).returns(M.promise()),
    move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
    // Text I/O (delegated to mount)
    readText: M.call(NameOrPathShape).returns(M.promise()),
    maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
    writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
    // Mail
    // Get the guest's mailbox handle
    handle: M.call().returns(M.remotable()),
    // List all messages
    listMessages: M.call().returns(M.promise()),
    // Subscribe to messages (returns iterator ref)
    followMessages: M.call().returns(M.promise()),
    // Respond to a request with a formula identifier
    resolve: M.call(MessageNumberShape, NameOrPathShape).returns(M.promise()),
    // Decline a request
    reject: M.call(MessageNumberShape).optional(M.string()).returns(M.promise()),
    // Adopt a reference from an incoming message
    adopt: M.call(MessageNumberShape, NameOrPathShape, NameOrPathShape).returns(
      M.promise()
    ),
    // Remove a message from inbox
    dismiss: M.call(MessageNumberShape).returns(M.promise()),
    // Remove all messages from inbox
    dismissAll: M.call().returns(M.promise()),
    // Send a request and wait for response
    request: M.call(NameOrPathShape, M.string()).optional(NameOrPathShape).returns(M.promise()),
    // Send a package message
    send: M.call(
      NameOrPathShape,
      M.arrayOf(M.string()),
      EdgeNamesShape,
      NamesOrPathsShape
    ).optional(MessageNumberShape).returns(M.promise()),
    // Reply to a message
    reply: M.call(
      MessageNumberShape,
      M.arrayOf(M.string()),
      EdgeNamesShape,
      NamesOrPathsShape
    ).returns(M.promise()),
    // Request sandboxed evaluation (guest -> host)
    requestEvaluation: M.call(
      M.string(),
      // source
      M.arrayOf(M.string()),
      // codeNames
      NamesOrPathsShape
      // petNamePaths
    ).optional(NameOrPathShape).returns(M.promise()),
    // Define code with named slots
    define: M.call(
      M.string(),
      // source
      M.record()
      // slots
    ).returns(M.promise()),
    // Send a form to a recipient
    form: M.call(
      NameOrPathShape,
      // recipientName
      M.string(),
      // description
      M.arrayOf(M.record())
      // fields
    ).returns(M.promise()),
    // Store a blob
    storeBlob: M.call(M.remotable()).optional(NameOrPathShape).returns(M.promise()),
    // Store a passable value
    storeValue: M.call(M.any(), NameOrPathShape).returns(M.promise()),
    // Submit values for a form
    submit: M.call(
      MessageNumberShape,
      // messageNumber
      M.record()
      // values
    ).returns(M.promise()),
    // Send a retained value as a reply
    sendValue: M.call(
      MessageNumberShape,
      // messageNumber
      NameOrPathShape
      // petNameOrPath
    ).returns(M.promise()),
    // Internal: deliver a message
    deliver: M.call(M.record()).returns(),
    // Evaluate code directly in a worker
    evaluate: EvaluateMethodGuard
  });
  var HostInterface = M.interface("EndoHost", {
    // Self-documentation
    help: M.call().optional(M.string()).returns(M.string()),
    // Directory
    has: M.call().rest(NamePathShape).returns(M.promise()),
    identify: M.call().rest(NamePathShape).returns(M.promise()),
    reverseIdentify: M.call(IdShape).returns(M.array()),
    locate: M.call().rest(NamePathShape).returns(M.promise()),
    reverseLocate: M.call(LocatorShape).returns(M.promise()),
    followLocatorNameChanges: M.call(LocatorShape).returns(M.promise()),
    list: M.call().rest(NamePathShape).returns(M.promise()),
    listIdentifiers: M.call().rest(NamePathShape).returns(M.promise()),
    listLocators: M.call().rest(NamePathShape).returns(M.promise()),
    followNameChanges: M.call().returns(M.promise()),
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    maybeLookup: M.call(NameOrPathShape).returns(M.any()),
    lookupById: M.call(IdShape).returns(M.promise()),
    reverseLookup: M.call(M.any()).returns(M.promise()),
    storeIdentifier: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    storeLocator: M.call(NameOrPathShape, IdShape).returns(M.promise()),
    remove: M.call().rest(NamePathShape).returns(M.promise()),
    move: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    copy: M.call(NamePathShape, NamePathShape).returns(M.promise()),
    makeDirectory: M.call(NameOrPathShape).returns(M.promise()),
    // Text I/O (delegated to mount)
    readText: M.call(NameOrPathShape).returns(M.promise()),
    maybeReadText: M.call(NameOrPathShape).returns(M.promise()),
    writeText: M.call(NameOrPathShape, M.string()).returns(M.promise()),
    // Mail
    handle: M.call().returns(M.remotable()),
    listMessages: M.call().returns(M.promise()),
    followMessages: M.call().returns(M.promise()),
    resolve: M.call(MessageNumberShape, NameOrPathShape).returns(M.promise()),
    reject: M.call(MessageNumberShape).optional(M.string()).returns(M.promise()),
    adopt: M.call(MessageNumberShape, NameOrPathShape, NameOrPathShape).returns(
      M.promise()
    ),
    dismiss: M.call(MessageNumberShape).returns(M.promise()),
    dismissAll: M.call().returns(M.promise()),
    request: M.call(NameOrPathShape, M.string()).optional(NameOrPathShape).returns(M.promise()),
    send: M.call(
      NameOrPathShape,
      M.arrayOf(M.string()),
      EdgeNamesShape,
      NamesOrPathsShape
    ).optional(MessageNumberShape).returns(M.promise()),
    deliver: M.call(M.record()).returns(),
    // Send a form to a recipient
    form: M.call(
      NameOrPathShape,
      // recipientName
      M.string(),
      // description
      M.arrayOf(M.record())
      // fields
    ).returns(M.promise()),
    // Host
    // Store a blob
    storeBlob: M.call(M.remotable()).optional(NameOrPathShape).returns(M.promise()),
    // Store a passable value
    storeValue: M.call(M.any(), NameOrPathShape).returns(M.promise()),
    // Check in a remote readable-tree Exo, storing content-addressed
    storeTree: M.call(M.remotable(), NameOrPathShape).returns(M.promise()),
    // Mount an external directory
    provideMount: M.call(M.string(), NameOrPathShape).optional(M.splitRecord({}, { readOnly: M.boolean() })).returns(M.promise()),
    // Create a daemon-managed scratch mount
    provideScratchMount: M.call(NameOrPathShape).optional(M.splitRecord({}, { readOnly: M.boolean() })).returns(M.promise()),
    // Provide a guest
    provideGuest: M.call().optional(NameShape, M.record()).returns(M.promise()),
    // Provide a host
    provideHost: M.call().optional(NameShape, M.record()).returns(M.promise()),
    // Provide a worker
    provideWorker: M.call(NameOrPathShape).returns(M.promise()),
    // Evaluate code directly in a worker
    evaluate: EvaluateMethodGuard,
    // Make an unconfined caplet
    makeUnconfined: M.call(M.or(NameShape, M.undefined()), M.string()).optional(MakeCapletOptionsShape).returns(M.promise()),
    // Make a bundle caplet
    makeBundle: M.call(M.or(NameShape, M.undefined()), NameShape).optional(MakeCapletOptionsShape).returns(M.promise()),
    // Create a channel
    makeChannel: M.call(NameShape, M.string()).returns(M.promise()),
    // Create a timer
    makeTimer: M.call(NameShape, M.number()).optional(M.string()).returns(M.promise()),
    // Cancel a value
    cancel: M.call(NameOrPathShape).optional(M.error()).returns(M.promise()),
    // Get the greeter
    greeter: M.call().returns(M.promise()),
    // Get the gateway
    gateway: M.call().returns(M.promise()),
    // Sign hex-encoded bytes with the daemon's root Ed25519 key, returns hex signature
    sign: M.call(M.string()).returns(M.promise()),
    // Get peer info
    getPeerInfo: M.call().returns(M.promise()),
    // Add peer info
    addPeerInfo: M.call(M.record()).returns(M.promise()),
    // List all known remote peers
    listKnownPeers: M.call().returns(M.promise()),
    // Follow changes to the known peers store
    followPeerChanges: M.call().returns(M.promise()),
    // Locate a formula with connection hints for sharing with remote peers
    locateForSharing: M.call().rest(NamePathShape).returns(M.promise()),
    // Adopt a value from a locator with connection hints
    adoptFromLocator: M.call(LocatorShape, NameOrPathShape).returns(M.promise()),
    // Create an invitation
    invite: M.call(NameShape).returns(M.promise()),
    // Accept an invitation
    accept: M.call(LocatorShape, NameShape).returns(M.promise()),
    // Approve a sandboxed evaluation request
    approveEvaluation: M.call(MessageNumberShape).optional(M.or(NameShape, M.undefined())).returns(M.promise()),
    // Reply to a message
    reply: M.call(
      MessageNumberShape,
      M.arrayOf(M.string()),
      EdgeNamesShape,
      NamesOrPathsShape
    ).returns(M.promise()),
    // Endow a definition request with bindings
    endow: M.call(
      MessageNumberShape,
      // messageNumber
      M.record()
      // bindings
    ).optional(
      M.or(NameShape, M.undefined()),
      // workerName
      NameOrPathShape
      // resultName
    ).returns(M.promise()),
    // Submit values for a form
    submit: M.call(
      MessageNumberShape,
      // messageNumber
      M.record()
      // values
    ).returns(M.promise()),
    // Send a retained value as a reply
    sendValue: M.call(
      MessageNumberShape,
      // messageNumber
      NameOrPathShape
      // petNameOrPath
    ).returns(M.promise()),
    // Get formula dependency graph snapshot for this agent's pet store
    getFormulaGraph: M.call().returns(M.promise())
  });
  var ChannelInterface = M.interface("EndoChannel", {
    help: M.call().optional(M.string()).returns(M.string()),
    post: M.call(M.arrayOf(M.string()), EdgeNamesShape, NamesOrPathsShape).optional(M.or(M.string(), M.undefined()), M.arrayOf(IdShape), M.or(M.string(), M.undefined())).returns(M.promise()),
    followMessages: M.call().returns(M.promise()),
    listMessages: M.call().returns(M.promise()),
    createInvitation: M.call(M.string()).returns(M.promise()),
    join: M.call(M.string()).returns(M.promise()),
    getMembers: M.call().returns(M.promise()),
    getProposedName: M.call().returns(M.string()),
    getMemberId: M.call().returns(M.string()),
    getMember: M.call(M.string()).returns(M.promise()),
    getAttenuator: M.call(M.string()).returns(M.promise()),
    getHeatConfig: M.call().returns(M.promise()),
    getHopInfo: M.call().returns(M.promise()),
    followHeatEvents: M.call().returns(M.promise())
  });
  var ChannelMemberInterface = M.interface("EndoChannelMember", {
    help: M.call().optional(M.string()).returns(M.string()),
    post: M.call(M.arrayOf(M.string()), EdgeNamesShape, NamesOrPathsShape).optional(M.or(M.string(), M.undefined()), M.arrayOf(IdShape), M.or(M.string(), M.undefined())).returns(M.promise()),
    setProposedName: M.call(M.string()).returns(M.promise()),
    followMessages: M.call().returns(M.promise()),
    listMessages: M.call().returns(M.promise()),
    createInvitation: M.call(M.string()).returns(M.promise()),
    getMembers: M.call().returns(M.promise()),
    getProposedName: M.call().returns(M.string()),
    getMemberId: M.call().returns(M.string()),
    getMember: M.call(M.string()).returns(M.promise()),
    getAttenuator: M.call(M.string()).returns(M.promise()),
    getHeatConfig: M.call().returns(M.promise()),
    getHopInfo: M.call().returns(M.promise()),
    followHeatEvents: M.call().returns(M.promise())
  });
  var ChannelInvitationInterface = M.interface("EndoChannelInvitation", {
    help: M.call().optional(M.string()).returns(M.string()),
    join: M.call(M.string()).returns(M.promise())
  });
  harden(ChannelInvitationInterface);
  var AttenuatorInterface = M.interface("EndoChannelAttenuator", {
    setInvitationValidity: M.call(M.boolean()).returns(M.promise()),
    setHeatConfig: M.call(M.record()).returns(M.promise()),
    getHeatConfig: M.call().returns(M.promise()),
    temporaryBan: M.call(M.number()).returns(M.promise())
  });
  harden(AttenuatorInterface);
  var InvitationInterface = M.interface("EndoInvitation", {
    accept: M.call(IdShape).optional(M.string()).returns(M.promise()),
    locate: M.call().returns(M.promise())
  });
  var InspectorHubInterface = M.interface("EndoInspectorHub", {
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    list: M.call().returns(M.array())
  });
  var InspectorInterface = M.interface("EndoInspector", {
    lookup: M.call(NameOrPathShape).returns(M.promise()),
    list: M.call().returns(M.array())
  });
  var BlobInterface = M.interface("EndoBlob", {
    help: M.call().optional(M.string()).returns(M.string()),
    sha256: M.call().returns(M.string()),
    streamBase64: M.call().returns(M.remotable()),
    text: M.call().returns(M.promise()),
    json: M.call().returns(M.promise())
  });
  var PathSegmentsShape = M.arrayOf(M.string());
  var PathArgShape = M.or(M.string(), PathSegmentsShape);
  var MountInterface = M.interface("EndoMount", {
    // ReadableTree-compatible surface
    has: M.call().rest(PathSegmentsShape).returns(M.promise()),
    list: M.call().rest(PathSegmentsShape).returns(M.promise()),
    lookup: M.call(PathArgShape).returns(M.promise()),
    // Raw data I/O
    readText: M.call(PathArgShape).returns(M.promise()),
    maybeReadText: M.call(PathArgShape).returns(M.promise()),
    writeText: M.call(PathArgShape, M.string()).returns(M.promise()),
    // Mutation
    remove: M.call(PathArgShape).returns(M.promise()),
    move: M.call(PathArgShape, PathArgShape).returns(M.promise()),
    makeDirectory: M.call(PathArgShape).returns(M.promise()),
    // Attenuation
    readOnly: M.call().returns(M.remotable()),
    // Snapshot
    snapshot: M.call().returns(M.promise()),
    // Discoverability
    help: M.call().returns(M.string())
  });
  var MountFileInterface = M.interface("EndoMountFile", {
    text: M.call().returns(M.promise()),
    streamBase64: M.call().returns(M.remotable()),
    json: M.call().returns(M.promise()),
    writeText: M.call(M.string()).returns(M.promise()),
    writeBytes: M.call(M.remotable()).returns(M.promise()),
    readOnly: M.call().returns(M.remotable()),
    help: M.call().returns(M.string())
  });
  var ReadableTreeInterface2 = M.interface("EndoReadableTree", {
    help: M.call().optional(M.string()).returns(M.string()),
    sha256: M.call().returns(M.string()),
    has: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    list: M.call().rest(M.arrayOf(M.string())).returns(M.promise()),
    lookup: M.call(M.or(M.string(), M.arrayOf(M.string()))).returns(M.promise())
  });
  var DaemonFacetForWorkerInterface = M.interface(
    "EndoDaemonFacetForWorker",
    {}
  );
  var WorkerFacetForDaemonInterface = M.interface(
    "EndoWorkerFacetForDaemon",
    {
      terminate: M.call().returns(M.promise()),
      evaluate: M.call(
        M.string(),
        M.arrayOf(M.string()),
        M.arrayOf(M.any()),
        IdShape,
        M.promise()
      ).returns(M.promise()),
      // These methods receive promises that get resolved inside the worker
      // Args: (readableP, powersP, contextP, env)
      makeBundle: M.call(M.any(), M.any(), M.any(), EnvShape).returns(
        M.promise()
      ),
      // Args: (specifier, powersP, contextP, env)
      makeUnconfined: M.call(M.string(), M.any(), M.any(), EnvShape).returns(
        M.promise()
      )
    }
  );
  var EndoInterface = M.interface("Endo", {
    help: M.call().optional(M.string()).returns(M.string()),
    ping: M.call().returns(M.promise()),
    terminate: M.call().returns(M.promise()),
    host: M.call().returns(M.promise()),
    leastAuthority: M.call().returns(M.promise()),
    greeter: M.call().returns(M.promise()),
    gateway: M.call().returns(M.promise()),
    nodeId: M.call().returns(M.string()),
    sign: M.call(M.string()).returns(M.promise()),
    reviveNetworks: M.call().returns(M.promise()),
    revivePins: M.call().returns(M.promise()),
    addPeerInfo: M.call(M.record()).returns(M.promise()),
    listKnownPeers: M.call().returns(M.promise()),
    followPeerChanges: M.call().returns(M.promise())
  });

  // src/reader-ref.js
  var asyncIterate2 = (iterable) => {
    let iterator;
    if (iterable[Symbol.asyncIterator]) {
      iterator = iterable[Symbol.asyncIterator]();
    } else if (iterable[Symbol.iterator]) {
      iterator = iterable[Symbol.iterator]();
    } else if ("next" in iterable) {
      iterator = iterable;
    }
    return iterator;
  };
  var makeIteratorRef2 = (iterable) => {
    const iterator = asyncIterate2(iterable);
    return makeExo("AsyncIterator", AsyncIteratorInterface2, {
      async next() {
        return iterator.next(void 0);
      },
      /**
       * @param {any} value
       */
      async return(value) {
        if (iterator.return !== void 0) {
          return iterator.return(value);
        }
        return harden_default({ done: true, value: void 0 });
      },
      /**
       * @param {any} error
       */
      async throw(error) {
        if (iterator.throw !== void 0) {
          return iterator.throw(error);
        }
        return harden_default({ done: true, value: void 0 });
      }
    });
  };

  // src/formula-identifier.js
  var numberPattern = /^[0-9a-f]{64}$/;
  var idPattern = /^(?<number>[0-9a-f]{64}):(?<node>[0-9a-f]{64})$/;
  var isValidNumber = (allegedNumber) => typeof allegedNumber === "string" && numberPattern.test(allegedNumber);
  var assertValidNumber = (allegedNumber) => {
    if (!isValidNumber(allegedNumber)) {
      throw makeError(`Invalid number ${q5(allegedNumber)}`);
    }
  };
  var assertFormulaNumber = (allegedFormulaNumber) => {
    if (!isValidNumber(allegedFormulaNumber)) {
      throw makeError(`Invalid formula number ${q5(allegedFormulaNumber)}`);
    }
  };
  var assertNodeNumber = (allegedNodeNumber) => {
    if (!isValidNumber(allegedNodeNumber)) {
      throw makeError(`Invalid node number ${q5(allegedNodeNumber)}`);
    }
  };
  var assertValidId = (id, petName) => {
    if (typeof id !== "string" || !idPattern.test(id)) {
      let message = `Invalid formula identifier ${q5(id)}`;
      if (petName !== void 0) {
        message += ` for pet name ${q5(petName)}`;
      }
      throw new Error(message);
    }
  };
  var parseId = (id) => {
    const match = idPattern.exec(id);
    if (match === null) {
      throw makeError(`Invalid formula identifier ${q5(id)}`);
    }
    const { groups } = match;
    if (groups === void 0) {
      throw makeError(
        `Programmer invariant failure: expected match groups, formula identifier was ${q5(
          id
        )}`
      );
    }
    const { number, node } = groups;
    const formulaNumber = (
      /** @type {FormulaNumber} */
      number
    );
    const nodeNumber = (
      /** @type {NodeNumber} */
      node
    );
    return {
      number: formulaNumber,
      node: nodeNumber,
      id
    };
  };
  var formatId = ({ number, node }) => {
    const id = `${String(number)}:${String(node)}`;
    assertValidId(id);
    return (
      /** @type {FormulaIdentifier} */
      id
    );
  };

  // src/formula-type.js
  var formulaTypes = /* @__PURE__ */ new Set([
    "channel",
    "directory",
    "endo",
    "eval",
    "guest",
    "handle",
    "host",
    "invitation",
    "keypair",
    "known-peers-store",
    "least-authority",
    "lookup",
    "loopback-network",
    "mail-hub",
    "mailbox-store",
    "make-bundle",
    "make-unconfined",
    "marshal",
    "message",
    "mount",
    "peer",
    "pet-inspector",
    "pet-store",
    "promise",
    "readable-blob",
    "readable-tree",
    "resolver",
    "scratch-mount",
    "synced-pet-store",
    "timer",
    "worker"
  ]);
  var isValidFormulaType = (allegedType) => formulaTypes.has(allegedType);
  var assertValidFormulaType = (allegedType) => {
    if (!isValidFormulaType(allegedType)) {
      assert.Fail`Unrecognized formula type ${q5(allegedType)}`;
    }
  };

  // src/locator.js
  var LOCAL_NODE = (
    /** @type {NodeNumber} */
    "0".repeat(64)
  );
  var isValidLocatorType = (allegedType) => isValidFormulaType(allegedType) || allegedType === "remote";
  var assertValidLocatorType = (allegedType) => {
    if (!isValidLocatorType(allegedType)) {
      throw makeError(`Unrecognized locator type ${q5(allegedType)}`);
    }
  };
  var parseLocator = (allegedLocator) => {
    const errorPrefix = `Invalid locator ${q5(allegedLocator)}:`;
    if (!URL.canParse(allegedLocator)) {
      throw makeError(`${errorPrefix} Invalid URL.`);
    }
    const url = new URL(allegedLocator);
    if (!allegedLocator.startsWith("endo://")) {
      throw makeError(`${errorPrefix} Invalid protocol.`);
    }
    const node = url.host;
    if (!isValidNumber(node)) {
      throw makeError(`${errorPrefix} Invalid node identifier.`);
    }
    if (!url.searchParams.has("id") || !url.searchParams.has("type")) {
      throw makeError(`${errorPrefix} Invalid search params.`);
    }
    for (const key of url.searchParams.keys()) {
      if (key !== "id" && key !== "type" && key !== "at") {
        throw makeError(`${errorPrefix} Invalid search params.`);
      }
    }
    const number = url.searchParams.get("id");
    if (number === null || !isValidNumber(number)) {
      throw makeError(`${errorPrefix} Invalid id.`);
    }
    const formulaType = url.searchParams.get("type");
    if (formulaType === null || !isValidLocatorType(formulaType)) {
      throw makeError(`${errorPrefix} Invalid type.`);
    }
    const nodeNumber = (
      /** @type {NodeNumber} */
      node
    );
    const formulaNumber = (
      /** @type {FormulaNumber} */
      number
    );
    return { formulaType, node: nodeNumber, number: formulaNumber };
  };
  var formatLocator = (id, formulaType) => {
    const { number, node } = parseId(id);
    const url = new URL(`endo://${node}`);
    url.pathname = "/";
    url.searchParams.set("id", number);
    assertValidLocatorType(formulaType);
    url.searchParams.set("type", formulaType);
    return url.toString();
  };
  var idFromLocator = (locator) => {
    const { number, node } = parseLocator(locator);
    return formatId({ number, node });
  };
  var formatLocatorForSharing = (id, formulaType, addresses) => {
    const { number, node } = parseId(id);
    const url = new URL(`endo://${node}`);
    url.pathname = "/";
    url.searchParams.set("id", number);
    assertValidLocatorType(formulaType);
    url.searchParams.set("type", formulaType);
    for (const address of addresses) {
      url.searchParams.append("at", address);
    }
    return url.toString();
  };
  var addressesFromLocator = (locator) => {
    const url = new URL(locator);
    return url.searchParams.getAll("at");
  };
  var externalizeId = (id, formulaType, agentNodeNumber, addresses = []) => {
    const { number, node } = parseId(id);
    const peerKey = node === LOCAL_NODE ? agentNodeNumber : node;
    const externalId = formatId({ number, node: peerKey });
    if (addresses.length > 0) {
      return formatLocatorForSharing(externalId, formulaType, addresses);
    }
    return formatLocator(externalId, formulaType);
  };
  var internalizeLocator = (locator, isLocalKey) => {
    const { number, node, formulaType } = parseLocator(locator);
    const addresses = addressesFromLocator(locator);
    const normalizedNode = isLocalKey(node) ? LOCAL_NODE : node;
    const id = formatId({ number, node: normalizedNode });
    return { id, formulaType, addresses };
  };

  // src/pet-name.js
  var isValidName = (name) => typeof name === "string" && name.length > 0 && name.length <= 255 && !name.includes("/") && !name.includes("\0") && !name.includes("@") && name !== "." && name !== "..";
  var validSpecialNamePattern = /^@[a-z][a-z0-9-]{0,127}$/;
  var isPetName = (petName) => isValidName(petName);
  var isSpecialName = (name) => validSpecialNamePattern.test(name);
  var isName = (name) => isPetName(name) || isSpecialName(name);
  var assertPetName = (petName) => {
    if (typeof petName !== "string" || !isPetName(petName)) {
      throw new Error(`Invalid pet name ${q5(petName)}`);
    }
  };
  var assertName = (name) => {
    if (typeof name !== "string" || !isName(name)) {
      throw new Error(`Invalid name ${q5(name)}`);
    }
  };
  var assertNames = (names) => {
    for (const name of names) {
      assertName(name);
    }
  };
  var assertNamePath = (namePath) => {
    if (!Array.isArray(namePath) || namePath.length < 1) {
      throw new Error(`Invalid name path`);
    }
    for (const name of namePath) {
      assertName(name);
    }
  };
  var assertPetNamePath = (path) => {
    if (!Array.isArray(path) || path.length < 1) {
      throw new Error(`Invalid name path`);
    }
    const lastIndex = path.length - 1;
    for (let i = 0; i < lastIndex; i += 1) {
      assertName(path[i]);
    }
    const petName = path[lastIndex];
    assertPetName(petName);
    return {
      namePath: (
        /** @type {NamePath} */
        path
      ),
      prefixPath: (
        /** @type {NamePath} */
        path.slice(0, -1)
      ),
      petName
    };
  };
  var namePathFrom = (nameOrPath) => {
    const path = typeof nameOrPath === "string" ? [nameOrPath] : nameOrPath;
    assertNamePath(path);
    return (
      /** @type {NamePath} */
      path
    );
  };

  // src/deferred-tasks.js
  var makeDeferredTasks = () => {
    const tasks = [];
    return {
      execute: async (param) => {
        await Promise.all(tasks.map((task) => task(param)));
      },
      push: (task) => {
        tasks.push(task);
      }
    };
  };

  // src/helpdown.js
  var import_fs = __toESM(__require("fs"), 1);
  var import_meta = {};
  var extractMethodName = (headerText) => {
    const match = headerText.match(/^(\w+)/);
    if (!match) {
      return headerText.trim();
    }
    return match[1];
  };
  var isFenceLine = (line) => /^ {0,3}(`{3,}|~{3,})/.test(line);
  var isBlockquoteLine = (line) => /^ {0,3}>/.test(line);
  var parseHelpdown = (text) => {
    const lines = text.split("\n");
    const entries7 = [];
    let currentEntityName;
    let currentHelp;
    let currentKey;
    let currentLines = [];
    let inCodeFence = false;
    const flush = () => {
      if (currentHelp !== void 0 && currentKey !== void 0) {
        while (currentLines.length > 0 && currentLines[currentLines.length - 1] === "") {
          currentLines.pop();
        }
        if (currentKey !== "" && currentLines.length > 1) {
          let bodyStart = 1;
          while (bodyStart < currentLines.length && currentLines[bodyStart] === "") {
            bodyStart += 1;
          }
          if (bodyStart > 1) {
            currentLines.splice(1, bodyStart - 1);
          }
        }
        const value = currentLines.join("\n");
        currentHelp[currentKey] = value;
      }
      currentLines = [];
    };
    const flushEntity = () => {
      flush();
      if (currentEntityName !== void 0 && currentHelp !== void 0) {
        entries7.push([currentEntityName, currentHelp]);
      }
    };
    for (const line of lines) {
      if (isFenceLine(line)) {
        inCodeFence = !inCodeFence;
        currentLines.push(line);
        continue;
      }
      if (inCodeFence) {
        currentLines.push(line);
        continue;
      }
      if (isBlockquoteLine(line)) {
        currentLines.push(line);
        continue;
      }
      const h1Match = line.match(/^# (.+)$/);
      if (h1Match) {
        flushEntity();
        const headerText = h1Match[1];
        const dashIndex = headerText.indexOf(" - ");
        currentEntityName = dashIndex >= 0 ? headerText.slice(0, dashIndex) : headerText.trim();
        currentHelp = {};
        currentKey = "";
        currentLines = [headerText];
        continue;
      }
      const h2Match = line.match(/^## (.+)$/);
      if (h2Match) {
        flush();
        const headerText = h2Match[1];
        currentKey = extractMethodName(headerText);
        currentLines = [headerText];
        continue;
      }
      currentLines.push(line);
    }
    flushEntity();
    return entries7;
  };
  var loadHelpTextFile = (path) => {
    return harden({
      [Symbol.asyncIterator]: () => {
        let entries7;
        let index = 0;
        return harden({
          /** @returns {Promise<IteratorResult<[string, HelpText]>>} */
          next: async () => {
            if (entries7 === void 0) {
              const filePath = path instanceof URL ? path : new URL(path, import_meta.url);
              const text = await import_fs.default.promises.readFile(filePath, "utf-8");
              entries7 = parseHelpdown(text);
            }
            if (index < entries7.length) {
              const value = entries7[index];
              index += 1;
              return harden({ value, done: false });
            }
            return harden({ value: void 0, done: true });
          }
        });
      }
    });
  };
  var readHelpTextFileSync = (path) => {
    const filePath = path instanceof URL ? path : new URL(path, import_meta.url);
    const text = import_fs.default.readFileSync(filePath, "utf-8");
    const entries7 = parseHelpdown(text);
    return new Map(entries7);
  };
  harden(parseHelpdown);
  harden(loadHelpTextFile);
  harden(readHelpTextFileSync);

  // src/help-text.js
  var import_meta2 = {};
  var helpMap = readHelpTextFileSync(new URL("./help.md", import_meta2.url));
  var directoryHelp = helpMap.get("EndoDirectory") || {};
  var mailHelp = helpMap.get("Mail Operations") || {};
  var guestHelp = helpMap.get("EndoGuest") || {};
  var hostHelp = helpMap.get("EndoHost") || {};
  var blobHelp = helpMap.get("EndoReadable") || {};
  var endoHelp = helpMap.get("Endo Bootstrap") || {};
  var readableTreeHelp = helpMap.get("ReadableTree") || {};
  var mountHelp = helpMap.get("EndoMount") || {};
  var mountFileHelp = helpMap.get("EndoMountFile") || {};
  var makeHelp = (helpText, fallbacks = []) => {
    const help = (methodName = "") => {
      if (methodName in helpText) {
        return helpText[methodName];
      }
      for (const fallback of fallbacks) {
        if (methodName in fallback) {
          return fallback[methodName];
        }
      }
      if (methodName === "") {
        return "No documentation available for this interface.";
      }
      return `No documentation available for method "${methodName}".`;
    };
    return help;
  };
  harden(directoryHelp);
  harden(mailHelp);
  harden(guestHelp);
  harden(hostHelp);
  harden(blobHelp);
  harden(readableTreeHelp);
  harden(mountHelp);
  harden(mountFileHelp);
  harden(endoHelp);
  harden(makeHelp);

  // src/directory.js
  var makeDirectoryMaker = ({
    provide,
    provideStoreController,
    getIdForRef,
    getTypeForId,
    formulateDirectory,
    formulateReadableBlob,
    pinTransient,
    unpinTransient
  }) => {
    const makeDirectoryNode = (controller, agentNodeNumber, isLocalKey, getNetworkAddresses) => {
      const lookup = (petNamePath) => {
        const namePath = namePathFrom(petNamePath);
        const [headName, ...tailNames] = namePath;
        const id = controller.identifyLocal(headName);
        if (id === void 0) {
          throw new TypeError(`Unknown pet name: ${q5(headName)}`);
        }
        const value = provide(
          /** @type {FormulaIdentifier} */
          id,
          "hub"
        );
        return tailNames.reduce(
          (directory2, petName) => E(directory2).lookup(petName),
          value
        );
      };
      const maybeLookup = (petNamePath) => {
        const namePath = namePathFrom(petNamePath);
        const [headName, ...tailNames] = namePath;
        const id = controller.identifyLocal(headName);
        if (id === void 0) {
          return void 0;
        }
        const value = provide(
          /** @type {FormulaIdentifier} */
          id,
          "hub"
        );
        return tailNames.reduce(
          (directory2, petName) => E(directory2).lookup(petName),
          value
        );
      };
      const reverseLookup = async (presence) => {
        await null;
        const id = getIdForRef(await presence);
        if (id === void 0) {
          return harden_default([]);
        }
        return controller.reverseIdentify(id);
      };
      const lookupTailNameHub = async (petNamePath) => {
        assertNamePath(petNamePath);
        const tailName = petNamePath[petNamePath.length - 1];
        if (petNamePath.length === 1) {
          return { hub: directory, name: tailName };
        }
        const prefixPath = petNamePath.slice(0, -1);
        const hub = (
          /** @type {NameHub} */
          await lookup(prefixPath)
        );
        return { hub, name: tailName };
      };
      const has = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          const petName = petNamePath[0];
          return controller.has(petName);
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).has(name);
      };
      const identify = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          const petName = petNamePath[0];
          return controller.identifyLocal(petName);
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).identify(name);
      };
      const locate = async (...petNamePath) => {
        assertNames(petNamePath);
        const id = await identify(...petNamePath);
        if (id === void 0) {
          return void 0;
        }
        const formulaType = await getTypeForId(
          /** @type {FormulaIdentifier} */
          id
        );
        const addresses = await getNetworkAddresses();
        return externalizeId(
          /** @type {FormulaIdentifier} */
          id,
          formulaType,
          agentNodeNumber,
          addresses
        );
      };
      const reverseLocate = async (locator) => {
        const { id } = internalizeLocator(locator, isLocalKey);
        return controller.reverseIdentify(id);
      };
      const followLocatorNameChanges = async function* followLocatorNameChanges2(locator) {
        const { id } = internalizeLocator(locator, isLocalKey);
        for await (const idNameChange of controller.followIdNameChanges(id)) {
          const locatorNameChange = {
            ...idNameChange,
            ...Object.hasOwn(idNameChange, "add") ? { add: locator } : { remove: locator }
          };
          yield (
            /** @type {LocatorNameChange} */
            locatorNameChange
          );
        }
      };
      const list = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          return controller.list();
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).list();
      };
      const listIdentifiers = async (...petNamePath) => {
        assertNames(petNamePath);
        const names = await list(...petNamePath);
        const identities = /* @__PURE__ */ new Set();
        await Promise.all(
          names.map(async (name) => {
            const id = await identify(...petNamePath, name);
            if (id !== void 0) {
              identities.add(id);
            }
          })
        );
        return harden_default(Array.from(identities).sort());
      };
      const listLocators = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          const names = await controller.list();
          const record = {};
          await Promise.all(
            names.map(async (name) => {
              const locator = await locate(name);
              if (locator !== void 0) {
                record[name] = locator;
              }
            })
          );
          return harden_default(record);
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).listLocators();
      };
      const followNameChanges = async function* followNameChanges2(...petNamePath) {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          yield* controller.followNameChanges();
          return;
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        yield* await E(hub).followNameChanges();
      };
      const remove = async (...petNamePath) => {
        const { prefixPath, petName } = assertPetNamePath(petNamePath);
        await null;
        if (prefixPath.length === 0) {
          await controller.remove(petName);
          return;
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(prefixPath)
        );
        await E(hub).remove(petName);
      };
      const move = async (fromPath, toPath) => {
        const { prefixPath: fromPrefixPath, petName: fromPetName } = assertPetNamePath(fromPath);
        const { prefixPath: toPrefixPath, petName: toPetName } = assertPetNamePath(toPath);
        await null;
        if (fromPrefixPath.length === toPrefixPath.length) {
          const samePrefix = fromPrefixPath.every(
            (name, i) => name === toPrefixPath[i]
          );
          if (samePrefix) {
            if (fromPrefixPath.length === 0) {
              await controller.rename(fromPetName, toPetName);
            } else {
              const hub = (
                /** @type {NameHub} */
                await lookup(fromPrefixPath)
              );
              await E(hub).move([fromPetName], [toPetName]);
            }
            return;
          }
        }
        const id = await identify(...fromPath);
        if (id === void 0) {
          throw new Error(`Unknown name: ${q5(fromPath)}`);
        }
        await storeIdentifier(toPath, id);
        await remove(...fromPath);
      };
      const copy = async (fromPath, toPath) => {
        assertNamePath(fromPath);
        assertPetNamePath(toPath);
        const fromNamePath = (
          /** @type {NamePath} */
          fromPath
        );
        const { hub: fromHub, name: fromName } = await lookupTailNameHub(fromNamePath);
        const id = await E(fromHub).identify(fromName);
        if (id === void 0) {
          throw new Error(`Unknown name: ${q5(fromPath)}`);
        }
        await storeIdentifier(toPath, id);
      };
      const storeIdentifier = async (petNamePath, id) => {
        const { prefixPath, petName } = assertPetNamePath(
          namePathFrom(petNamePath)
        );
        await null;
        if (prefixPath.length === 0) {
          await controller.storeIdentifier(petName, id);
          return;
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(prefixPath)
        );
        await E(hub).storeIdentifier([petName], id);
      };
      const storeLocator = async (petNamePath, locator) => {
        if (!locator.startsWith("endo://")) {
          throw new Error(
            `storeLocator requires an endo:// locator, got ${q5(locator)}`
          );
        }
        const { id } = internalizeLocator(locator, isLocalKey);
        await storeIdentifier(petNamePath, id);
      };
      const makeDirectory = async (directoryPetNamePath) => {
        const { value: newDirectory, id } = await formulateDirectory();
        pinTransient(id);
        try {
          await storeIdentifier(directoryPetNamePath, id);
        } finally {
          unpinTransient(id);
        }
        return newDirectory;
      };
      const readText = async (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        assertNamePath(namePath);
        if (namePath.length < 2) {
          const blob = await lookup(namePath);
          return E(blob).text();
        }
        const { hub, name } = await lookupTailNameHub(namePath);
        return E(hub).readText(name);
      };
      const maybeReadText = async (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        assertNamePath(namePath);
        if (namePath.length < 2) {
          const blob = maybeLookup(namePath);
          if (blob === void 0) {
            return void 0;
          }
          return E(blob).text();
        }
        const { hub, name } = await lookupTailNameHub(namePath);
        return E(hub).maybeReadText(name);
      };
      const writeText = async (petNameOrPath, content) => {
        const namePath = namePathFrom(petNameOrPath);
        assertNamePath(namePath);
        if (namePath.length < 2) {
          const bytes = new TextEncoder().encode(content);
          const readerRef = makeIteratorRef2(
            harden_default([encodeBase64(bytes)])[Symbol.iterator]()
          );
          const tasks = makeDeferredTasks();
          tasks.push(
            (identifiers) => storeIdentifier(namePath, identifiers.readableBlobId)
          );
          await formulateReadableBlob(readerRef, tasks);
          return;
        }
        const { hub, name } = await lookupTailNameHub(namePath);
        await E(hub).writeText(name, content);
      };
      const directory = {
        has,
        identify,
        locate,
        reverseLocate,
        followLocatorNameChanges,
        list,
        listIdentifiers,
        listLocators,
        followNameChanges,
        lookup,
        maybeLookup,
        reverseLookup,
        storeIdentifier,
        storeLocator,
        move,
        remove,
        copy,
        makeDirectory,
        readText,
        maybeReadText,
        writeText
      };
      return directory;
    };
    const makeIdentifiedDirectory = async ({
      petStoreId,
      context,
      agentNodeNumber,
      isLocalKey
    }) => {
      const petStore = await provideStoreController(petStoreId);
      const noNetworkAddresses = async () => [];
      const directory = makeDirectoryNode(
        petStore,
        agentNodeNumber,
        isLocalKey,
        noNetworkAddresses
      );
      const help = makeHelp(directoryHelp);
      const {
        has,
        identify,
        locate,
        reverseLocate,
        list,
        listIdentifiers,
        listLocators,
        lookup,
        reverseLookup,
        remove,
        move,
        copy,
        makeDirectory
      } = directory;
      return makeExo("EndoDirectory", DirectoryInterface2, {
        help,
        has,
        identify,
        locate,
        reverseLocate,
        followLocatorNameChanges: (locator) => makeIteratorRef2(directory.followLocatorNameChanges(locator)),
        list,
        listIdentifiers,
        listLocators,
        followNameChanges: () => makeIteratorRef2(directory.followNameChanges()),
        lookup,
        maybeLookup: directory.maybeLookup,
        reverseLookup,
        storeIdentifier: directory.storeIdentifier,
        storeLocator: directory.storeLocator,
        remove,
        move,
        copy,
        makeDirectory,
        readText: directory.readText,
        maybeReadText: directory.maybeReadText,
        writeText: directory.writeText
      });
    };
    return { makeIdentifiedDirectory, makeDirectoryNode };
  };

  // src/pubsub.js
  var freeze14 = (
    /** @type {<T>(v: T | Readonly<T>) => T} */
    Object.freeze
  );
  var makeNullQueue = (value) => harden_default({
    put: () => {
    },
    get: async () => value
  });
  var nullIteratorQueue = makeNullQueue(
    harden_default({ value: void 0, done: false })
  );
  var makeChangePubSub = () => {
    let { promise: tailPromise, resolve: tailResolve } = makePromiseKit();
    const sink2 = {
      /**
       * @param {TValue} value
       */
      put: (value) => {
        const { resolve, promise } = makePromiseKit();
        tailResolve(freeze14({ value, promise }));
        tailResolve = resolve;
        tailPromise = promise;
      }
    };
    const makeSpring = () => {
      let cursor = tailPromise;
      return {
        get: () => {
          const promise = cursor.then((next) => next.value);
          cursor = cursor.then((next) => next.promise);
          return harden_default(promise);
        }
      };
    };
    return harden_default({ sink: sink2, makeSpring });
  };
  harden_default(makeChangePubSub);
  var makeChangeTopic = () => {
    const { sink: sink2, makeSpring } = makeChangePubSub();
    return harden_default({
      publisher: makeStream(nullIteratorQueue, sink2),
      subscribe: () => makeStream(makeSpring(), nullIteratorQueue)
    });
  };
  harden_default(makeChangeTopic);

  // src/serial-jobs.js
  var makeSerialJobs = () => {
    const queue = makeQueue();
    const lock = () => {
      return queue.get();
    };
    const unlock = () => {
      queue.put();
    };
    unlock();
    return {
      enqueue: async (asyncFn = (
        /** @type {any} */
        (async () => {
        })
      )) => {
        await lock();
        try {
          return await asyncFn();
        } finally {
          unlock();
        }
      }
    };
  };

  // src/mail.js
  var NEXT_MESSAGE_NUMBER_NAME = (
    /** @type {PetName} */
    "next-number"
  );
  var messageNumberNamePattern = /^(0|[1-9][0-9]*)$/;
  var assertMailboxStoreName = (name) => {
    if (name === NEXT_MESSAGE_NUMBER_NAME) {
      return;
    }
    if (!messageNumberNamePattern.test(name)) {
      throw new Error(`Invalid mailbox store name ${q5(name)}`);
    }
  };
  var parseMessageNumberName = (name) => {
    if (!messageNumberNamePattern.test(name)) {
      return void 0;
    }
    try {
      const number = BigInt(name);
      return number >= 0n ? number : void 0;
    } catch {
      return void 0;
    }
  };
  var coerceMessageNumber = (value) => {
    if (typeof value === "bigint") {
      return value >= 0n ? value : void 0;
    }
    if (typeof value === "number") {
      return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : void 0;
    }
    return void 0;
  };
  var MESSAGE_SPECIAL_NAMES = /* @__PURE__ */ new Set([
    "@from",
    "@to",
    "@date",
    "@type",
    "@message",
    "@reply",
    "@description",
    "@strings",
    "@promise",
    "@resolver",
    "@result"
  ]);
  var assertUniqueEdgeNames = (edgeNames) => {
    const seen = /* @__PURE__ */ new Set();
    for (const edgeName of edgeNames) {
      if (MESSAGE_SPECIAL_NAMES.has(edgeName)) {
        throw new Error(`Message name ${q5(edgeName)} is reserved`);
      }
      if (seen.has(edgeName)) {
        throw new Error(`Message name ${q5(edgeName)} is duplicated`);
      }
      seen.add(edgeName);
    }
  };
  var makeEnvelope = () => makeExo("Envelope", EnvelopeInterface, {});
  var makeMailboxMaker = ({
    provide,
    formulateMarshalValue,
    formulatePromise,
    formulateMessage,
    getFormulaForId,
    getTypeForId,
    randomHex256,
    pinTransient = () => {
    },
    unpinTransient = () => {
    }
  }) => {
    const makeMailbox = async ({
      selfId: localSelfId,
      agentNodeNumber,
      petStore,
      mailboxStore,
      directory,
      context
    }) => {
      const { number: selfNumber } = parseId(localSelfId);
      const selfId = formatId({
        number: selfNumber,
        node: (
          /** @type {import('./types.js').NodeNumber} */
          agentNodeNumber
        )
      });
      const externalizeForMessage = async (id) => {
        const formulaType = await getTypeForId(id);
        return externalizeId(id, formulaType, agentNodeNumber);
      };
      const externalizeMessage = async (message) => {
        const fromLocator = await externalizeForMessage(message.from);
        const toLocator = await externalizeForMessage(message.to);
        const base = { ...message, from: fromLocator, to: toLocator };
        if (message.ids) {
          const locators = await Promise.all(
            message.ids.map((id) => externalizeForMessage(id))
          );
          return harden_default({ ...base, ids: locators });
        }
        if (message.promiseId) {
          const promiseLocator = await externalizeForMessage(message.promiseId);
          return harden_default({ ...base, promiseId: promiseLocator });
        }
        return harden_default(base);
      };
      const messages = /* @__PURE__ */ new Map();
      const outbox = /* @__PURE__ */ new WeakMap();
      const messagesTopic = makeChangeTopic();
      const mailboxStoreJobs = makeSerialJobs();
      let nextMessageNumber = 0n;
      const listMessages = async () => {
        const externalized = await Promise.all(
          Array.from(messages.values()).map(externalizeMessage)
        );
        return harden_default(externalized);
      };
      const followMessages = async function* currentAndSubsequentMessages() {
        const subsequentRequests = messagesTopic.subscribe();
        for (const message of messages.values()) {
          yield await externalizeMessage(message);
        }
        for await (const message of subsequentRequests) {
          yield await externalizeMessage(message);
        }
      };
      const makeRequest = async (description, fromId, toId, messageId) => {
        const { promiseId, resolverId } = await formulatePromise(pinTransient);
        const resolutionIdP = provide(promiseId);
        const settled = resolutionIdP.then(
          () => (
            /** @type {const} */
            "fulfilled"
          ),
          () => (
            /** @type {const} */
            "rejected"
          )
        );
        const request2 = harden_default({
          type: (
            /** @type {const} */
            "request"
          ),
          from: fromId,
          to: toId,
          messageId,
          description,
          promiseId,
          resolverId,
          settled
        });
        return harden_default({ request: request2, response: resolutionIdP });
      };
      const makeEvalRequest = async (source, codeNames, petNamePaths, fromId, toId) => {
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const { promiseId, resolverId } = await formulatePromise(pinTransient);
        const resolutionIdP = provide(promiseId);
        const settled = resolutionIdP.then(
          () => (
            /** @type {const} */
            "fulfilled"
          ),
          () => (
            /** @type {const} */
            "rejected"
          )
        );
        const request2 = harden_default({
          type: (
            /** @type {const} */
            "eval-request"
          ),
          from: fromId,
          to: toId,
          messageId,
          source,
          codeNames,
          petNamePaths,
          promiseId,
          resolverId,
          settled
        });
        return harden_default({ request: request2, response: resolutionIdP });
      };
      const makeDefineRequest = async (source, slots, fromId, toId) => {
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        return harden_default({
          type: (
            /** @type {const} */
            "definition"
          ),
          from: fromId,
          to: toId,
          messageId,
          source,
          slots
        });
      };
      const makeForm = async (description, fields, fromId, toId) => {
        const messageId = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        return harden_default({
          type: (
            /** @type {const} */
            "form"
          ),
          from: fromId,
          to: toId,
          messageId,
          description,
          fields
        });
      };
      const makeMessageFormula = (envelope, date) => {
        const { type, messageId, replyTo, from, to } = envelope;
        const replyToRecord = replyTo === void 0 ? {} : { replyTo };
        const envelopeRecord = {
          date,
          messageType: type,
          messageId,
          from,
          to,
          ...replyToRecord
        };
        if (type === "request") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            description: envelope.description,
            promiseId: (
              /** @type {FormulaIdentifier} */
              envelope.promiseId
            ),
            resolverId: (
              /** @type {FormulaIdentifier} */
              envelope.resolverId
            )
          });
        }
        if (type === "package") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            strings: envelope.strings,
            names: envelope.names,
            ids: (
              /** @type {FormulaIdentifier[]} */
              envelope.ids
            )
          });
        }
        if (type === "eval-request") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            source: envelope.source,
            codeNames: envelope.codeNames,
            petNamePaths: envelope.petNamePaths,
            promiseId: (
              /** @type {FormulaIdentifier} */
              envelope.promiseId
            ),
            resolverId: (
              /** @type {FormulaIdentifier} */
              envelope.resolverId
            )
          });
        }
        if (type === "definition") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            source: envelope.source,
            slots: envelope.slots
          });
        }
        if (type === "form") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            description: envelope.description,
            fields: envelope.fields
          });
        }
        if (type === "value") {
          return harden_default({
            type: "message",
            ...envelopeRecord,
            valueId: (
              /** @type {FormulaIdentifier} */
              envelope.valueId
            )
          });
        }
        throw new Error("Unknown message type");
      };
      const assertMessageEnvelope = (envelope) => {
        if (typeof envelope.messageId !== "string") {
          throw new Error("Invalid messageId");
        }
        assertFormulaNumber(envelope.messageId);
        if (envelope.replyTo !== void 0 && typeof envelope.replyTo !== "string") {
          throw new Error("Invalid replyTo");
        }
        if (envelope.replyTo !== void 0) {
          assertFormulaNumber(envelope.replyTo);
        }
        if (envelope.type === "request") {
          if (typeof envelope.description !== "string") {
            throw new Error("Invalid request description");
          }
          return;
        }
        if (envelope.type === "package") {
          assertNames(envelope.names);
          assertUniqueEdgeNames(envelope.names);
          if (envelope.names.length !== envelope.ids.length) {
            throw new Error(
              `Message must have one formula identifier (${q5(
                envelope.ids.length
              )}) for every edge name (${q5(envelope.names.length)})`
            );
          }
          if (envelope.strings.length < envelope.names.length) {
            throw new Error(
              `Message must have one string before every value delivered`
            );
          }
          return;
        }
        if (envelope.type === "eval-request") {
          if (typeof envelope.source !== "string") {
            throw new Error("Invalid eval-request source");
          }
          if (!Array.isArray(envelope.codeNames)) {
            throw new Error("Invalid eval-request codeNames");
          }
          if (!Array.isArray(envelope.petNamePaths)) {
            throw new Error("Invalid eval-request petNamePaths");
          }
          if (envelope.codeNames.length !== envelope.petNamePaths.length) {
            throw new Error(
              `Eval request must have one pet name path for each code name`
            );
          }
          return;
        }
        if (envelope.type === "definition") {
          if (typeof envelope.source !== "string") {
            throw new Error("Invalid definition source");
          }
          if (typeof envelope.slots !== "object" || envelope.slots === null) {
            throw new Error("Invalid definition slots");
          }
          return;
        }
        if (envelope.type === "form") {
          if (typeof envelope.description !== "string") {
            throw new Error("Invalid form description");
          }
          if (!Array.isArray(envelope.fields)) {
            throw new Error("Invalid form fields");
          }
          return;
        }
        if (envelope.type === "value") {
          if (typeof envelope.replyTo !== "string") {
            throw new Error("Invalid value replyTo");
          }
          if (typeof envelope.valueId !== "string") {
            throw new Error("Invalid value valueId");
          }
          return;
        }
        throw new Error("Unknown message type");
      };
      const makeDismisser = (messageNumber, dismissal) => makeExo("Dismisser", DismisserInterface, {
        async dismiss() {
          await mailboxStoreJobs.enqueue(async () => {
            const messageNumberName = (
              /** @type {PetName} */
              String(messageNumber)
            );
            await mailboxStore.remove(messageNumberName);
            messages.delete(messageNumber);
            dismissal.resolve();
          });
          return void 0;
        }
      });
      const makeStampedMessage = (messageNumber, formula) => {
        if (typeof formula.messageId !== "string") {
          throw new Error("Message formula is missing messageId");
        }
        assertFormulaNumber(formula.messageId);
        if (formula.replyTo !== void 0) {
          assertFormulaNumber(formula.replyTo);
        }
        const dismissal = makePromiseKit();
        const dismisser = makeDismisser(messageNumber, dismissal);
        if (formula.messageType === "request") {
          if (formula.description === void 0 || formula.promiseId === void 0 || formula.resolverId === void 0) {
            throw new Error("Request message formula is incomplete");
          }
          const resolutionIdP = provide(formula.promiseId);
          const settled = resolutionIdP.then(
            () => (
              /** @type {const} */
              "fulfilled"
            ),
            () => (
              /** @type {const} */
              "rejected"
            )
          );
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            description: formula.description,
            promiseId: formula.promiseId,
            resolverId: formula.resolverId,
            settled,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        if (formula.messageType === "package") {
          if (formula.strings === void 0 || formula.names === void 0 || formula.ids === void 0) {
            throw new Error("Package message formula is incomplete");
          }
          assertNames(formula.names);
          assertUniqueEdgeNames(formula.names);
          if (formula.names.length !== formula.ids.length) {
            throw new Error(
              `Message must have one formula identifier (${q5(
                formula.ids.length
              )}) for every edge name (${q5(formula.names.length)})`
            );
          }
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            strings: formula.strings,
            names: formula.names,
            ids: formula.ids,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        if (formula.messageType === "eval-request") {
          if (formula.source === void 0 || formula.promiseId === void 0 || formula.resolverId === void 0) {
            throw new Error("Eval-request message formula is incomplete");
          }
          const resolutionIdP = provide(formula.promiseId);
          const settled = resolutionIdP.then(
            () => (
              /** @type {const} */
              "fulfilled"
            ),
            () => (
              /** @type {const} */
              "rejected"
            )
          );
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            source: formula.source,
            codeNames: (
              /** @type {string[]} */
              formula.codeNames
            ),
            petNamePaths: (
              /** @type {NamePath[]} */
              formula.petNamePaths
            ),
            promiseId: formula.promiseId,
            resolverId: formula.resolverId,
            settled,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        if (formula.messageType === "definition") {
          if (formula.source === void 0 || formula.slots === void 0) {
            throw new Error("Definition message formula is incomplete");
          }
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            source: formula.source,
            slots: formula.slots,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        if (formula.messageType === "form") {
          if (formula.description === void 0 || formula.fields === void 0) {
            throw new Error("Form message formula is incomplete");
          }
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            description: formula.description,
            fields: formula.fields,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        if (formula.messageType === "value") {
          if (formula.valueId === void 0) {
            throw new Error("Value message formula is incomplete");
          }
          return harden_default({
            type: formula.messageType,
            from: formula.from,
            to: formula.to,
            valueId: formula.valueId,
            messageId: formula.messageId,
            replyTo: formula.replyTo,
            number: messageNumber,
            date: formula.date,
            dismissed: dismissal.promise,
            dismisser
          });
        }
        throw new Error("Unknown message formula type");
      };
      const persistMessage = async (messageNumber, formula) => {
        const messageNumberName = (
          /** @type {PetName} */
          String(messageNumber)
        );
        const { id } = await formulateMessage(formula, pinTransient);
        try {
          await mailboxStore.storeIdentifier(messageNumberName, id);
        } finally {
          unpinTransient(id);
        }
      };
      const persistNextMessageNumber = async (messageNumber) => {
        const tasks = makeDeferredTasks();
        const { id } = await formulateMarshalValue(
          messageNumber,
          tasks,
          pinTransient
        );
        try {
          await mailboxStore.storeIdentifier(NEXT_MESSAGE_NUMBER_NAME, id);
        } finally {
          unpinTransient(id);
        }
      };
      const loadMailboxState = async () => {
        await null;
        let storedNextNumber;
        const nextNumberId = mailboxStore.identifyLocal(NEXT_MESSAGE_NUMBER_NAME);
        if (nextNumberId !== void 0) {
          try {
            const value = await provide(
              /** @type {FormulaIdentifier} */
              nextNumberId
            );
            storedNextNumber = coerceMessageNumber(value);
          } catch {
          }
        }
        const messageNumbers = mailboxStore.list().map(parseMessageNumberName).filter((number) => number !== void 0).sort((a, b2) => {
          if (a === b2) {
            return 0;
          }
          return a < b2 ? -1 : 1;
        });
        const maxNumber = messageNumbers.length === 0 ? -1n : messageNumbers[messageNumbers.length - 1];
        const maxNextNumber = maxNumber + 1n;
        let computedNextNumber = storedNextNumber ?? 0n;
        if (maxNextNumber > computedNextNumber) {
          computedNextNumber = maxNextNumber;
        }
        nextMessageNumber = computedNextNumber;
        const messageRecords = await Promise.allSettled(
          messageNumbers.map(async (messageNumber) => {
            const messageNumberName = (
              /** @type {PetName} */
              String(messageNumber)
            );
            const messageId = mailboxStore.identifyLocal(messageNumberName);
            if (messageId === void 0) {
              return void 0;
            }
            assertValidId(messageId);
            const formula = await getFormulaForId(messageId);
            if (formula.type !== "message") {
              throw new Error(
                `Mailbox entry ${q5(
                  String(messageNumber)
                )} is not a message formula`
              );
            }
            return { messageNumber, formula };
          })
        );
        messageRecords.forEach((entry) => {
          if (entry.status === "fulfilled" && entry.value !== void 0) {
            const { messageNumber, formula } = entry.value;
            const message = makeStampedMessage(messageNumber, formula);
            messages.set(messageNumber, message);
          }
        });
        if (storedNextNumber === void 0 || storedNextNumber !== computedNextNumber) {
          await mailboxStoreJobs.enqueue(async () => {
            await persistNextMessageNumber(computedNextNumber);
          });
        }
      };
      const mustParseBigint = (messageNumber, label) => {
        const normalized = coerceMessageNumber(messageNumber);
        if (normalized === void 0) {
          throw new Error(`Invalid ${label} number ${q5(messageNumber)}`);
        }
        return normalized;
      };
      const deliver = async (envelope) => {
        await mailboxStoreJobs.enqueue(async () => {
          assertMessageEnvelope(envelope);
          const messageNumber = nextMessageNumber;
          const date = (/* @__PURE__ */ new Date()).toISOString();
          const formula = makeMessageFormula(envelope, date);
          await persistMessage(messageNumber, formula);
          nextMessageNumber += 1n;
          await persistNextMessageNumber(nextMessageNumber);
          const dismissal = makePromiseKit();
          const dismisser = makeDismisser(messageNumber, dismissal);
          const message = harden_default({
            ...envelope,
            number: messageNumber,
            date,
            dismissed: dismissal.promise,
            dismisser
          });
          messages.set(messageNumber, message);
          messagesTopic.publisher.next(message);
        });
      };
      const provideHandle = async (id) => {
        const type = await getTypeForId(id);
        if (type === "host" || type === "guest") {
          const formula = await getFormulaForId(id);
          const hostOrGuestFormula = (
            /** @type {import('./types.js').HostFormula | import('./types.js').GuestFormula} */
            formula
          );
          return provide(
            /** @type {FormulaIdentifier} */
            hostOrGuestFormula.handle,
            "handle"
          );
        }
        return provide(id, "handle");
      };
      const post = async (recipient, message) => {
        const envelope = makeEnvelope();
        outbox.set(envelope, message);
        await E(recipient).receive(envelope, selfId);
        if (message.from !== message.to) {
          await deliver(message);
        }
      };
      const resolve = async (messageNumber, resolutionNameOrPath) => {
        const resolutionPath = namePathFrom(resolutionNameOrPath);
        const normalizedMessageNumber = mustParseBigint(messageNumber, "request");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`Invalid request, ${q5(messageNumber)}`);
        }
        const id = await E(directory).identify(...resolutionPath);
        if (id === void 0) {
          throw new TypeError(
            `No formula exists for the pet name ${q5(resolutionNameOrPath)}`
          );
        }
        const req = (
          /** @type {Request} */
          message
        );
        const resolver = (
          /** @type {ERef<Responder>} */
          provide(req.resolverId, "resolver")
        );
        E.sendOnly(resolver).resolveWithId(id);
      };
      const reject = async (messageNumber, reason = "Declined") => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "request");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (message.type === "definition") {
          throw new Error(
            `Cannot reject message ${q5(messageNumber)} (type ${q5(message.type)})`
          );
        }
        const rejection = harden_default(Promise.reject(harden_default(new Error(reason))));
        const req = (
          /** @type {Request} */
          message
        );
        const resolver = (
          /** @type {ERef<Responder>} */
          provide(req.resolverId, "resolver")
        );
        E.sendOnly(resolver).resolveWithId(rejection);
      };
      const send = async (toNameOrPath, strings, edgeNames, petNamesOrPaths, replyToMessageNumber) => {
        const toPath = namePathFrom(toNameOrPath);
        assertNames(edgeNames);
        assertUniqueEdgeNames(edgeNames);
        const toId = await E(directory).identify(...toPath);
        if (toId === void 0) {
          throw new Error(`Unknown recipient ${q5(toNameOrPath)}`);
        }
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          toId
        );
        if (petNamesOrPaths.length !== edgeNames.length) {
          throw new Error(
            `Message must have one edge name (${q5(
              edgeNames.length
            )}) for every pet name (${q5(petNamesOrPaths.length)})`
          );
        }
        if (strings.length < petNamesOrPaths.length) {
          throw new Error(
            `Message must have one string before every value delivered`
          );
        }
        const ids = await Promise.all(
          petNamesOrPaths.map(async (petNameOrPath) => {
            const petPath = namePathFrom(petNameOrPath);
            const id = await E(directory).identify(...petPath);
            if (id === void 0) {
              throw new Error(`Unknown pet name ${q5(petNameOrPath)}`);
            }
            assertValidId(id);
            return (
              /** @type {FormulaIdentifier} */
              id
            );
          })
        );
        let replyTo;
        if (replyToMessageNumber !== void 0) {
          const normalizedNumber = mustParseBigint(
            replyToMessageNumber,
            "message"
          );
          const parent = messages.get(normalizedNumber);
          if (parent !== void 0 && typeof parent.messageId === "string") {
            replyTo = parent.messageId;
          }
        }
        const message = harden_default({
          type: (
            /** @type {const} */
            "package"
          ),
          strings,
          names: edgeNames,
          ids,
          messageId,
          ...replyTo !== void 0 ? { replyTo } : {},
          from: selfId,
          to: (
            /** @type {FormulaIdentifier} */
            toId
          )
        });
        await post(to, message);
      };
      const reply = async (messageNumber, strings, edgeNames, petNamesOrPaths) => {
        assertNames(edgeNames);
        assertUniqueEdgeNames(edgeNames);
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const parent = messages.get(normalizedMessageNumber);
        if (parent === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (typeof parent.messageId !== "string") {
          throw new Error(`Message ${q5(messageNumber)} has no messageId`);
        }
        const otherId = parent.from === selfId ? parent.to : parent.from;
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          otherId
        );
        if (petNamesOrPaths.length !== edgeNames.length) {
          throw new Error(
            `Message must have one edge name (${q5(
              edgeNames.length
            )}) for every pet name (${q5(petNamesOrPaths.length)})`
          );
        }
        if (strings.length < petNamesOrPaths.length) {
          throw new Error(
            `Message must have one string before every value delivered`
          );
        }
        const ids = await Promise.all(
          petNamesOrPaths.map(async (petNameOrPath) => {
            const petPath = namePathFrom(petNameOrPath);
            const id = await E(directory).identify(...petPath);
            if (id === void 0) {
              throw new Error(`Unknown pet name ${q5(petNameOrPath)}`);
            }
            assertValidId(id);
            return (
              /** @type {FormulaIdentifier} */
              id
            );
          })
        );
        const message = harden_default({
          type: (
            /** @type {const} */
            "package"
          ),
          strings,
          names: edgeNames,
          ids,
          messageId,
          replyTo: parent.messageId,
          from: selfId,
          to: (
            /** @type {FormulaIdentifier} */
            otherId
          )
        });
        await post(to, message);
      };
      const dismiss = async (messageNumber) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "request");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`Invalid request number ${messageNumber}`);
        }
        const { dismisser } = E.get(message);
        return E(dismisser).dismiss();
      };
      const dismissAll = async () => {
        const toDismiss = Array.from(messages.values());
        await Promise.all(
          toDismiss.map((message) => {
            const { dismisser } = E.get(message);
            return E(dismisser).dismiss();
          })
        );
      };
      const adopt = async (messageNumber, edgeName, petNameOrPath) => {
        assertName(edgeName);
        const petNamePath = namePathFrom(petNameOrPath);
        assertPetNamePath(petNamePath);
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (message.type === "value") {
          if (edgeName !== "value") {
            throw new Error(
              `Value messages only have a "value" edge, not ${q5(edgeName)}`
            );
          }
          const id2 = (
            /** @type {FormulaIdentifier} */
            message.valueId
          );
          context.thisDiesIfThatDies(id2);
          await E(directory).storeIdentifier(petNamePath, id2);
          return;
        }
        if (message.type !== "package") {
          throw new Error(
            `Message must be a package or value ${q5(messageNumber)}`
          );
        }
        const index = message.names.lastIndexOf(edgeName);
        if (index === -1) {
          throw new Error(
            `No reference named ${q5(edgeName)} in message ${q5(messageNumber)}`
          );
        }
        const id = message.ids[index];
        if (id === void 0) {
          throw new Error(
            `panic: message must contain a formula for every name, including the name ${q5(
              edgeName
            )} at ${q5(index)}`
          );
        }
        context.thisDiesIfThatDies(id);
        await E(directory).storeIdentifier(petNamePath, id);
      };
      const request = async (toNameOrPath, description, responseName) => {
        const toPath = namePathFrom(toNameOrPath);
        await null;
        if (responseName !== void 0) {
          const responseNamePath = namePathFrom(responseName);
          const resolutionId2 = await E(directory).identify(...responseNamePath);
          if (resolutionId2 !== void 0) {
            context.thisDiesIfThatDies(resolutionId2);
            return provide(
              /** @type {FormulaIdentifier} */
              resolutionId2
            );
          }
        }
        const toId = await E(directory).identify(...toPath);
        if (toId === void 0) {
          throw new Error(`Unknown recipient ${toPath.join("/")}`);
        }
        assertValidId(toId);
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          toId
        );
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const { request: req, response: resolutionIdP } = await makeRequest(
          description,
          selfId,
          /** @type {FormulaIdentifier} */
          toId,
          messageId
        );
        try {
          await post(to, req);
        } finally {
          unpinTransient(req.promiseId);
          unpinTransient(req.resolverId);
        }
        const resolutionId = (
          /** @type {FormulaIdentifier} */
          await resolutionIdP
        );
        assertValidId(resolutionId);
        context.thisDiesIfThatDies(resolutionId);
        const responseP = provide(resolutionId);
        if (responseName !== void 0) {
          const responseNamePath = namePathFrom(responseName);
          await E(directory).storeIdentifier(responseNamePath, resolutionId);
        }
        return responseP;
      };
      const open = (envelope) => {
        const message = outbox.get(envelope);
        if (message === void 0) {
          throw new Error("Mail fraud: unrecognized parcel");
        }
        return message;
      };
      const receive = async (envelope, allegedFromId) => {
        assertValidId(allegedFromId);
        const senderId = allegedFromId;
        const sender = provide(senderId, "handle");
        const message = await E(sender).open(envelope);
        if (senderId !== message.from) {
          throw new Error("Mail fraud: alleged sender does not recognize parcel");
        }
        await deliver(message);
      };
      const requestEvaluation = async (toNameOrPath, source, codeNames, petNamesOrPaths, responseName) => {
        const toPath = namePathFrom(toNameOrPath);
        await null;
        if (responseName !== void 0) {
          const responseNamePath = namePathFrom(responseName);
          const responseId = await E(directory).identify(...responseNamePath);
          if (responseId !== void 0) {
            context.thisDiesIfThatDies(responseId);
            return provide(
              /** @type {FormulaIdentifier} */
              responseId
            );
          }
        }
        const normalizedPaths = petNamesOrPaths.map(namePathFrom);
        if (codeNames.length !== normalizedPaths.length) {
          throw new Error(
            `Eval request must have one pet name path for each code name`
          );
        }
        const toId = await E(directory).identify(...toPath);
        if (toId === void 0) {
          throw new Error(`Unknown recipient ${toPath.join("/")}`);
        }
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          toId
        );
        const { request: req, response: resolutionIdP } = await makeEvalRequest(
          source,
          codeNames,
          normalizedPaths,
          selfId,
          /** @type {FormulaIdentifier} */
          toId
        );
        await post(to, req);
        const resolutionId = (
          /** @type {FormulaIdentifier} */
          await resolutionIdP
        );
        unpinTransient(req.promiseId);
        unpinTransient(req.resolverId);
        assertValidId(resolutionId);
        context.thisDiesIfThatDies(resolutionId);
        const responseP = provide(resolutionId);
        if (responseName !== void 0) {
          const responseNamePath = namePathFrom(responseName);
          await E(directory).storeIdentifier(responseNamePath, resolutionId);
        }
        return responseP;
      };
      const getEvalRequest = (messageNumber) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (message.type !== "eval-request") {
          throw new Error(
            `Message ${q5(messageNumber)} is not an eval-request (is ${q5(message.type)})`
          );
        }
        const evalReq = (
          /** @type {EvalRequest & { from: FormulaIdentifier, resolverId: FormulaIdentifier }} */
          message
        );
        return harden_default({
          source: evalReq.source,
          codeNames: evalReq.codeNames,
          petNamePaths: evalReq.petNamePaths,
          resolverId: evalReq.resolverId,
          guestHandleId: evalReq.from
        });
      };
      const define = async (source, slots) => {
        await null;
        const hostHandleId = petStore.identifyLocal(
          /** @type {Name} */
          "@host"
        );
        if (hostHandleId === void 0) {
          throw new Error("No @host found in namespace");
        }
        const hostHandle = await provideHandle(
          /** @type {FormulaIdentifier} */
          hostHandleId
        );
        const req = await makeDefineRequest(
          source,
          slots,
          selfId,
          /** @type {FormulaIdentifier} */
          hostHandleId
        );
        await post(hostHandle, req);
      };
      const form = async (toNameOrPath, description, fields) => {
        const toPath = namePathFrom(toNameOrPath);
        await null;
        const toId = await E(directory).identify(...toPath);
        if (toId === void 0) {
          throw new Error(`Unknown recipient ${toPath.join("/")}`);
        }
        assertValidId(toId);
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          toId
        );
        const req = await makeForm(
          description,
          fields,
          selfId,
          /** @type {FormulaIdentifier} */
          toId
        );
        await post(to, req);
      };
      const getDefineRequest = (messageNumber) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (message.type !== "definition") {
          throw new Error(
            `Message ${q5(messageNumber)} is not a definition (is ${q5(message.type)})`
          );
        }
        const defReq = (
          /** @type {DefineRequest & { from: FormulaIdentifier }} */
          message
        );
        return harden_default({
          source: defReq.source,
          slots: defReq.slots,
          guestHandleId: defReq.from,
          messageId: defReq.messageId
        });
      };
      const getForm = (messageNumber) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const message = messages.get(normalizedMessageNumber);
        if (message === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (message.type !== "form") {
          throw new Error(
            `Message ${q5(messageNumber)} is not a form (is ${q5(message.type)})`
          );
        }
        const formMsg = (
          /** @type {Form & { from: FormulaIdentifier, messageId: FormulaNumber }} */
          message
        );
        return harden_default({
          description: formMsg.description,
          fields: formMsg.fields,
          messageId: formMsg.messageId,
          guestHandleId: formMsg.from
        });
      };
      const submit = async (messageNumber, values4) => {
        const {
          fields,
          messageId: formMessageId,
          guestHandleId
        } = getForm(messageNumber);
        for (const { name, pattern } of fields) {
          if (!(name in values4)) {
            throw new Error(`Missing value for field ${q5(name)}`);
          }
          const effectivePattern = pattern !== void 0 ? pattern : M.string();
          mustMatch(values4[name], effectivePattern, `field ${q5(name)}`);
        }
        const marshalTasks = makeDeferredTasks();
        const { id: marshalledId } = await formulateMarshalValue(
          /** @type {import('@endo/pass-style').Passable} */
          harden_default(values4),
          marshalTasks,
          pinTransient
        );
        try {
          const valueMessageId = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const valueEnvelope = harden_default({
            type: (
              /** @type {const} */
              "value"
            ),
            from: (
              /** @type {FormulaIdentifier} */
              selfId
            ),
            to: (
              /** @type {FormulaIdentifier} */
              guestHandleId
            ),
            messageId: valueMessageId,
            replyTo: formMessageId,
            valueId: marshalledId
          });
          const recipientHandle = await provideHandle(
            /** @type {FormulaIdentifier} */
            guestHandleId
          );
          await post(recipientHandle, valueEnvelope);
        } finally {
          unpinTransient(marshalledId);
        }
      };
      const sendValue = async (messageNumber, petNameOrPath) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const parent = messages.get(normalizedMessageNumber);
        if (parent === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (typeof parent.messageId !== "string") {
          throw new Error(`Message ${q5(messageNumber)} has no messageId`);
        }
        const otherId = parent.from === selfId ? parent.to : parent.from;
        const petPath = namePathFrom(petNameOrPath);
        const valueId = await E(directory).identify(...petPath);
        if (valueId === void 0) {
          throw new Error(`Unknown pet name ${q5(petNameOrPath)}`);
        }
        assertValidId(valueId);
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const to = await provideHandle(
          /** @type {FormulaIdentifier} */
          otherId
        );
        const message = harden_default({
          type: (
            /** @type {const} */
            "value"
          ),
          from: (
            /** @type {FormulaIdentifier} */
            selfId
          ),
          to: (
            /** @type {FormulaIdentifier} */
            otherId
          ),
          messageId,
          replyTo: parent.messageId,
          valueId
        });
        await post(to, message);
      };
      const deliverValueById = async (messageNumber, valueId) => {
        const normalizedMessageNumber = mustParseBigint(messageNumber, "message");
        const parent = messages.get(normalizedMessageNumber);
        if (parent === void 0) {
          throw new Error(`No such message with number ${q5(messageNumber)}`);
        }
        if (typeof parent.messageId !== "string") {
          throw new Error(`Message ${q5(messageNumber)} has no messageId`);
        }
        assertValidId(valueId);
        const messageId = (
          /** @type {import('./types.js').FormulaNumber} */
          await randomHex256()
        );
        const message = harden_default({
          type: (
            /** @type {const} */
            "value"
          ),
          from: (
            /** @type {FormulaIdentifier} */
            selfId
          ),
          to: (
            /** @type {FormulaIdentifier} */
            selfId
          ),
          messageId,
          replyTo: parent.messageId,
          valueId
        });
        await deliver(message);
      };
      const handle = makeExo("Handle", HandleInterface, {
        receive,
        open
      });
      await loadMailboxState();
      return harden_default({
        handle: () => handle,
        deliver,
        petStore,
        listMessages,
        followMessages,
        request,
        send,
        reply,
        resolve,
        reject,
        dismiss,
        dismissAll,
        adopt,
        requestEvaluation,
        getEvalRequest,
        define,
        form,
        getDefineRequest,
        getForm,
        submit,
        sendValue,
        deliverValueById
      });
    };
    return makeMailbox;
  };

  // src/pet-sitter.js
  var makePetSitter = (controller, specialNames) => {
    const has = (petName) => {
      return Object.hasOwn(specialNames, petName) || controller.has(petName);
    };
    const identifyLocal = (petName) => {
      if (Object.hasOwn(specialNames, petName)) {
        return specialNames[petName];
      }
      if (!isPetName(petName)) {
        throw new Error(
          `Invalid pet name ${q5(petName)} and not one of ${Object.keys(
            specialNames
          ).join(", ")}`
        );
      }
      return controller.identifyLocal(petName);
    };
    const idRecordForName = (petName) => {
      assertName(petName);
      const id = identifyLocal(petName);
      if (id === void 0) {
        throw new Error(`Formula does not exist for pet name ${q5(petName)}`);
      }
      return parseId(id);
    };
    const list = () => {
      const specialKeys = (
        /** @type {SpecialName[]} */
        Object.keys(specialNames).sort()
      );
      return harden_default([...specialKeys, ...controller.list()]);
    };
    const followNameChanges = async function* currentAndSubsequentNames() {
      const specialKeys = (
        /** @type {SpecialName[]} */
        Object.keys(specialNames).sort()
      );
      for (const name of specialKeys) {
        const idRecord = idRecordForName(name);
        yield (
          /** @type {{ add: Name, value: IdRecord }} */
          {
            add: name,
            value: idRecord
          }
        );
      }
      yield* controller.followNameChanges();
    };
    const followIdNameChanges = async function* currentAndSubsequentIds(id) {
      const subscription = controller.followIdNameChanges(id);
      const idSpecialNames = Object.entries(specialNames).filter(([_, specialId]) => specialId === id).map(([specialName, _]) => (
        /** @type {SpecialName} */
        specialName
      ));
      if (idSpecialNames.includes(
        /** @type {SpecialName} */
        "@self"
      ) && idSpecialNames.includes(
        /** @type {SpecialName} */
        "@host"
      )) {
        const filtered = idSpecialNames.filter((name) => name !== "@host");
        idSpecialNames.length = 0;
        idSpecialNames.push(...filtered);
      }
      const { value: existingNames } = await subscription.next();
      if (existingNames?.names) {
        existingNames.names.unshift(...idSpecialNames);
      }
      existingNames?.names?.sort();
      yield (
        /** @type {PetStoreIdNameChange} */
        existingNames
      );
      yield* subscription;
    };
    const reverseIdentify = (id) => {
      const names = Array.from(controller.reverseIdentify(id));
      for (const [specialName, specialId] of Object.entries(specialNames)) {
        if (specialId === id) {
          names.push(
            /** @type {SpecialName} */
            specialName
          );
        }
      }
      return harden_default(names);
    };
    const { storeIdentifier, storeLocator, remove, rename, seedGcEdges } = controller;
    const petSitter = {
      has,
      identifyLocal,
      reverseIdentify,
      list,
      followIdNameChanges,
      followNameChanges,
      storeIdentifier,
      storeLocator,
      remove,
      rename,
      seedGcEdges
    };
    return petSitter;
  };

  // src/guest.js
  var makeGuestMaker = ({
    provide,
    provideStoreController,
    formulateEval,
    formulateReadableBlob,
    formulateMarshalValue,
    getFormulaForId,
    getAllNetworkAddresses,
    makeMailbox,
    makeDirectoryNode,
    isLocalKey,
    collectIfDirty = async () => {
    },
    pinTransient = (
      /** @param {any} _id */
      (_id) => {
      }
    ),
    unpinTransient = (
      /** @param {any} _id */
      (_id) => {
      }
    )
  }) => {
    const makeGuest = async (guestId, handleId, keypairId, agentNodeNumber, hostAgentId, hostHandleId, petStoreId, mailboxStoreId, mailHubId, mainWorkerId, networksDirectoryId, context) => {
      context.thisDiesIfThatDies(hostHandleId);
      context.thisDiesIfThatDies(hostAgentId);
      context.thisDiesIfThatDies(petStoreId);
      context.thisDiesIfThatDies(mailboxStoreId);
      if (mailHubId !== void 0) {
        context.thisDiesIfThatDies(mailHubId);
      }
      context.thisDiesIfThatDies(mainWorkerId);
      context.thisDiesIfThatDies(networksDirectoryId);
      const baseController = await provideStoreController(petStoreId);
      const mailboxController = await provideStoreController(mailboxStoreId);
      const specialNames = {
        "@agent": guestId,
        "@self": handleId,
        "@host": hostHandleId,
        "@keypair": keypairId
      };
      if (mailHubId !== void 0) {
        specialNames["@mail"] = mailHubId;
      }
      specialNames["@nets"] = networksDirectoryId;
      const specialStore = makePetSitter(baseController, specialNames);
      const getNetworkAddresses = () => getAllNetworkAddresses(networksDirectoryId);
      const directory = makeDirectoryNode(
        specialStore,
        agentNodeNumber,
        isLocalKey,
        getNetworkAddresses
      );
      const mailbox = await makeMailbox({
        petStore: specialStore,
        agentNodeNumber,
        mailboxStore: mailboxController,
        directory,
        selfId: handleId,
        context
      });
      const { handle } = mailbox;
      const { reverseIdentify } = specialStore;
      const {
        has,
        identify,
        locate,
        reverseLocate,
        list,
        listIdentifiers,
        listLocators,
        followNameChanges,
        followLocatorNameChanges,
        lookup,
        maybeLookup,
        reverseLookup,
        storeIdentifier: directoryStoreIdentifier,
        storeLocator: directoryStoreLocator,
        readText: directoryReadText,
        maybeReadText: directoryMaybeReadText,
        writeText: directoryWriteText,
        move,
        remove,
        copy,
        makeDirectory
      } = directory;
      const lookupById = async (id) => provide(
        /** @type {FormulaIdentifier} */
        id
      );
      const {
        listMessages,
        followMessages,
        resolve,
        reject,
        adopt,
        dismiss,
        dismissAll,
        reply,
        request,
        send,
        deliver,
        requestEvaluation: mailboxRequestEvaluation,
        define: mailboxDefine,
        form: mailboxForm,
        submit: mailboxSubmit,
        sendValue: mailboxSendValue
      } = mailbox;
      const requestEvaluation = (source, codeNames, petNamePaths, resultName) => mailboxRequestEvaluation(
        "@host",
        source,
        codeNames,
        petNamePaths,
        resultName
      );
      const prepareWorkerFormulation = (workerName, deferTask) => {
        if (workerName === void 0) {
          return void 0;
        }
        const workerId = (
          /** @type {FormulaIdentifier | undefined} */
          specialStore.identifyLocal(workerName)
        );
        if (workerId === void 0) {
          assertPetName(workerName);
          const petName = workerName;
          deferTask((identifiers) => {
            return specialStore.storeIdentifier(petName, identifiers.workerId);
          });
          return void 0;
        }
        return workerId;
      };
      const evaluate = async (workerName, source, codeNames, petNamesOrPaths, resultName) => {
        if (workerName !== void 0) {
          assertName(workerName);
        }
        if (!Array.isArray(codeNames)) {
          throw new Error("Evaluator requires an array of code names");
        }
        for (const codeName of codeNames) {
          if (typeof codeName !== "string") {
            throw new Error(`Invalid endowment name: ${q5(codeName)}`);
          }
        }
        if (resultName !== void 0) {
          const resultNamePath = namePathFrom(resultName);
          assertNamePath(resultNamePath);
        }
        if (petNamesOrPaths.length !== codeNames.length) {
          throw new Error("Evaluator requires one pet name for each code name");
        }
        const tasks = makeDeferredTasks();
        const workerId = prepareWorkerFormulation(workerName, tasks.push);
        const endowmentFormulaIdsOrPaths = petNamesOrPaths.map((petNameOrPath) => {
          const petNamePath = namePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const id2 = specialStore.identifyLocal(petNamePath[0]);
            if (id2 === void 0) {
              throw new Error(`Unknown pet name ${q5(petNamePath[0])}`);
            }
            return (
              /** @type {FormulaIdentifier} */
              id2
            );
          }
          return petNamePath;
        });
        if (resultName !== void 0) {
          const resultNamePath = namePathFrom(resultName);
          tasks.push(
            (identifiers) => E(directory).storeIdentifier(resultNamePath, identifiers.evalId)
          );
        }
        const { id, value } = await formulateEval(
          guestId,
          source,
          codeNames,
          endowmentFormulaIdsOrPaths,
          tasks,
          workerId,
          resultName === void 0 ? pinTransient : void 0
        );
        if (resultName === void 0) {
          try {
            return await value;
          } finally {
            unpinTransient(id);
          }
        }
        return value;
      };
      const define = (source, slots) => mailboxDefine(source, slots);
      const form = (recipientName, description, fields) => mailboxForm(recipientName, description, fields);
      const submit = (messageNumber, values4) => mailboxSubmit(messageNumber, values4);
      const sendValue = (messageNumber, petNameOrPath) => mailboxSendValue(messageNumber, petNameOrPath);
      const storeBlob = async (readerRef, petName) => {
        const { namePath } = assertPetNamePath(namePathFrom(petName));
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.readableBlobId)
        );
        const { value: blob } = await formulateReadableBlob(readerRef, tasks);
        return blob;
      };
      const storeValue = async (value, petName) => {
        const namePath = namePathFrom(petName);
        assertNamePath(namePath);
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.marshalId)
        );
        const { id } = await formulateMarshalValue(value, tasks, pinTransient);
        unpinTransient(id);
      };
      const guest = {
        // Directory
        has,
        identify,
        reverseIdentify,
        locate,
        reverseLocate,
        list,
        listIdentifiers,
        listLocators,
        followLocatorNameChanges,
        followNameChanges,
        lookup,
        maybeLookup,
        lookupById,
        reverseLookup,
        storeIdentifier: directoryStoreIdentifier,
        storeLocator: directoryStoreLocator,
        move,
        remove,
        copy,
        makeDirectory,
        readText: directoryReadText,
        maybeReadText: directoryMaybeReadText,
        writeText: directoryWriteText,
        // Mail
        handle,
        listMessages,
        followMessages,
        resolve,
        reject,
        adopt,
        dismiss,
        dismissAll,
        reply,
        request,
        send,
        deliver,
        evaluate,
        // Eval/Define/Form
        requestEvaluation,
        define,
        form,
        storeBlob,
        storeValue,
        submit,
        sendValue
      };
      const withCollection = (fn) => async (...args) => {
        await null;
        try {
          return await fn(...args);
        } finally {
          await collectIfDirty();
        }
      };
      const unwrappedMethods = /* @__PURE__ */ new Set([
        "handle",
        "reverseIdentify",
        "submit",
        "sendValue"
      ]);
      const wrappedGuest = Object.fromEntries(
        Object.entries(guest).map(([name, fn]) => [
          name,
          unwrappedMethods.has(name) ? fn : withCollection(fn)
        ])
      );
      return makeExo("EndoGuest", GuestInterface, {
        help: makeHelp(guestHelp),
        ...wrappedGuest,
        /** @param {string} locator */
        followLocatorNameChanges: async (locator) => {
          const iterator = guest.followLocatorNameChanges(locator);
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        },
        followMessages: async () => {
          const iterator = guest.followMessages();
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        },
        followNameChanges: async () => {
          const iterator = guest.followNameChanges();
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        }
      });
    };
    return makeGuest;
  };

  // src/channel.js
  var channelHelp = {
    "": `EndoChannel - A multi-party chat room with capability-secure invitations.

Members can post messages, follow the message stream, and invite new members.
Each member has a proposed name and a pedigree chain showing their invitation path.`,
    post: "Post a message to the channel.",
    followMessages: "Subscribe to all messages (existing and future).",
    listMessages: "List all messages posted so far.",
    createInvitation: "Create a new channel invitation; returns [invitation, attenuator].",
    join: "Join the channel as a member with the given proposed name (requires a prior invitation).",
    getMembers: "List all members with their proposed names and pedigree chains.",
    getProposedName: "Get the proposed display name for this channel or member.",
    getMemberId: "Get the stable member ID for this channel admin.",
    getAttenuator: "Get an attenuator for a previously invited member by name."
  };
  harden(channelHelp);
  var channelMemberHelp = {
    "": `EndoChannelMember - A member handle for a multi-party channel.

Use this to post messages, follow the stream, and invite others.`,
    post: "Post a message to the channel.",
    setProposedName: "Change your display name in the channel.",
    followMessages: "Subscribe to all messages (existing and future).",
    listMessages: "List all messages posted so far.",
    createInvitation: "Create a new sub-member invitation with the given proposed name.",
    getMembers: "List all members with their proposed names and pedigree chains.",
    getProposedName: "Get your proposed display name.",
    getMemberId: "Get your stable member ID in the channel.",
    getAttenuator: "Get an attenuator for a previously invited member by name."
  };
  harden(channelMemberHelp);
  var channelInvitationHelp = {
    "": `EndoChannelInvitation - An invitation to join a channel.

Call join(proposedName) to accept the invitation and get a channel handle.`,
    join: "Accept this invitation and join the channel with the given proposed name."
  };
  harden(channelInvitationHelp);
  var makeChannelMaker = ({
    provide,
    provideStoreController,
    persistValue,
    randomHex256
  }) => {
    const makeChannel = async (channelId, handleId, creatorAgentId, messageStoreId, memberStoreId, proposedName, context) => {
      context.thisDiesIfThatDies(handleId);
      context.thisDiesIfThatDies(messageStoreId);
      context.thisDiesIfThatDies(memberStoreId);
      const messageStore = await provideStoreController(messageStoreId);
      const memberStore = await provideStoreController(memberStoreId);
      const messages = [];
      const messagesTopic = makeChangeTopic();
      let nextMessageNumber = 0n;
      const existingNames = messageStore.list();
      for (const name of existingNames) {
        const id = messageStore.identifyLocal(name);
        if (id !== void 0) {
          const value = await provide(id);
          if (value && typeof value === "object") {
            const raw = (
              /** @type {any} */
              value
            );
            const msg = raw.type === "package" ? raw : harden({
              type: "package",
              messageId: (
                /** @type {FormulaNumber} */
                raw.messageId || "0"
              ),
              number: raw.number,
              date: raw.date,
              memberId: raw.memberId || "0",
              strings: raw.strings,
              names: raw.edgeNames || raw.names || [],
              ids: raw.ids || [],
              replyTo: raw.replyTo,
              replyType: raw.replyType
            });
            messages.push(msg);
            if (msg.number >= nextMessageNumber) {
              nextMessageNumber = msg.number + 1n;
            }
          }
        }
      }
      messages.sort((a, b2) => {
        if (a.number < b2.number) return -1;
        if (a.number > b2.number) return 1;
        return 0;
      });
      const adminMemberId = "0";
      let nextMemberIdNum = 1;
      const HEAT_LOCKOUT_THRESHOLD = 90;
      const heatStates = /* @__PURE__ */ new Map();
      const memberEntries = /* @__PURE__ */ new Map();
      const heatEventsTopic = makeChangeTopic();
      const invitationRegistry = /* @__PURE__ */ new Map();
      const persistMemberEntry = async (entry) => {
        const persistable = harden({
          proposedName: entry.proposedName,
          invitedAs: entry.invitedAs,
          memberId: entry.memberId,
          inviterMemberId: entry.inviterMemberId,
          pedigree: [...entry.pedigree],
          valid: entry.valid,
          joined: entry.joined,
          heatConfig: entry.heatConfig,
          temporaryBanUntil: entry.temporaryBanUntil
        });
        const formulaId = await persistValue(persistable);
        await memberStore.storeIdentifier(`member-${entry.memberId}`, formulaId);
      };
      const buildPedigreeMemberIds = (entry) => {
        const ids = [];
        let currentId = entry.inviterMemberId;
        while (currentId && memberEntries.has(currentId)) {
          ids.unshift(currentId);
          const parent = (
            /** @type {MemberEntry} */
            memberEntries.get(currentId)
          );
          currentId = parent.inviterMemberId;
        }
        return ids;
      };
      const postInternal = async (memberId, strings, names, ids, replyTo, replyType) => {
        const messageNumber = nextMessageNumber;
        nextMessageNumber += 1n;
        const messageId = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        const message = harden({
          type: "package",
          messageId,
          number: messageNumber,
          date: (/* @__PURE__ */ new Date()).toISOString(),
          memberId,
          strings,
          names,
          ids,
          replyTo,
          replyType
        });
        const formulaId = await persistValue(message);
        await messageStore.storeIdentifier(`msg-${String(messageNumber)}`, formulaId);
        messages.push(message);
        messagesTopic.publisher.next(message);
      };
      const allocateMemberId = () => {
        const id = String(nextMemberIdNum);
        nextMemberIdNum += 1;
        return id;
      };
      const checkEntryValidity = (entry) => {
        if (!entry.valid) {
          throw new Error(
            `Channel member ${q5(entry.invitedAs)} has been disabled`
          );
        }
        if (entry.temporaryBanUntil > 0 && Date.now() < entry.temporaryBanUntil) {
          throw new Error(
            `Channel member ${q5(entry.invitedAs)} is temporarily banned`
          );
        }
      };
      const makeGatedFollowMessages = (checkAccess) => {
        checkAccess();
        const iterator = (async function* channelMessages() {
          yield* messages;
          yield* messagesTopic.subscribe();
        })();
        const rawIterRef = makeIteratorRef2(iterator);
        return makeExo("GatedAsyncIterator", AsyncIteratorInterface2, {
          async next() {
            checkAccess();
            const result = await rawIterRef.next();
            checkAccess();
            return result;
          },
          async return(value) {
            return rawIterRef.return(value);
          },
          async throw(error) {
            return rawIterRef.throw(error);
          }
        });
      };
      const makeAttenuator = (entry) => {
        return makeExo("EndoChannelAttenuator", AttenuatorInterface, {
          setInvitationValidity: async (valid) => {
            entry.valid = valid;
            await persistMemberEntry(entry);
          },
          setHeatConfig: async (config) => {
            entry.heatConfig = config ? harden({
              burstLimit: config.burstLimit,
              sustainedRate: config.sustainedRate,
              lockoutDurationMs: config.lockoutDurationMs,
              postLockoutPct: config.postLockoutPct
            }) : null;
            await persistMemberEntry(entry);
          },
          getHeatConfig: async () => {
            return entry.heatConfig;
          },
          temporaryBan: async (seconds) => {
            entry.temporaryBanUntil = Date.now() + seconds * 1e3;
            await persistMemberEntry(entry);
          }
        });
      };
      const makeHeatCheckPostRate = (entry, parentCheckPostRate) => {
        if (!heatStates.has(entry.memberId)) {
          heatStates.set(entry.memberId, {
            heat: 0,
            locked: false,
            lockEndTime: 0,
            lastHeatUpdateTime: 0
          });
        }
        return (now) => {
          parentCheckPostRate(now);
          const config = entry.heatConfig;
          if (!config) return;
          const stateObj = (
            /** @type {{ heat: number, locked: boolean, lockEndTime: number, lastHeatUpdateTime: number }} */
            heatStates.get(entry.memberId)
          );
          const heatPerMessage = HEAT_LOCKOUT_THRESHOLD / config.burstLimit;
          const coolRate = heatPerMessage * (config.sustainedRate / 60);
          if (stateObj.lockEndTime > 0) {
            if (now < stateObj.lockEndTime) {
              const remaining = Math.ceil((stateObj.lockEndTime - now) / 1e3);
              throw new Error(
                `Rate limit lockout for ${q5(entry.invitedAs)} (${remaining}s remaining)`
              );
            }
            stateObj.heat = config.postLockoutPct;
            stateObj.locked = false;
            stateObj.lockEndTime = 0;
            stateObj.lastHeatUpdateTime = now;
          }
          if (stateObj.lastHeatUpdateTime > 0) {
            const dt = (now - stateObj.lastHeatUpdateTime) / 1e3;
            stateObj.heat = Math.max(0, stateObj.heat - coolRate * dt);
          }
          stateObj.heat += heatPerMessage;
          stateObj.lastHeatUpdateTime = now;
          heatEventsTopic.publisher.next(
            harden({
              type: "heat",
              hopMemberId: entry.memberId,
              heat: stateObj.heat,
              locked: false,
              lockEndTime: 0,
              timestamp: now
            })
          );
          if (stateObj.heat >= HEAT_LOCKOUT_THRESHOLD) {
            stateObj.lockEndTime = now + config.lockoutDurationMs;
            stateObj.locked = true;
            const remaining = Math.ceil(config.lockoutDurationMs / 1e3);
            heatEventsTopic.publisher.next(
              harden({
                type: "heat",
                hopMemberId: entry.memberId,
                heat: stateObj.heat,
                locked: true,
                lockEndTime: stateObj.lockEndTime,
                timestamp: now
              })
            );
            throw new Error(
              `Rate limit lockout for ${q5(entry.invitedAs)} (${remaining}s remaining)`
            );
          }
        };
      };
      const getAncestorChain = (entry) => {
        const chain = [];
        let current = entry;
        while (current) {
          chain.push(current);
          if (current.inviterMemberId === "" || current.inviterMemberId === current.memberId) {
            break;
          }
          const parent = memberEntries.get(current.inviterMemberId);
          if (!parent) break;
          current = parent;
        }
        chain.reverse();
        return chain;
      };
      const buildHopInfo = (entry) => {
        const chain = getAncestorChain(entry);
        const policies = [];
        const states = [];
        let hopIndex = 0;
        const now = Date.now();
        for (const hop of chain) {
          if (hop.heatConfig) {
            const stateObj = heatStates.get(hop.memberId);
            let heat = 0;
            let locked = false;
            let lockEndTime = 0;
            if (stateObj) {
              const config = hop.heatConfig;
              const heatPerMessage = HEAT_LOCKOUT_THRESHOLD / config.burstLimit;
              const coolRate = heatPerMessage * (config.sustainedRate / 60);
              if (stateObj.lockEndTime > 0 && now >= stateObj.lockEndTime) {
                heat = config.postLockoutPct;
                locked = false;
                lockEndTime = 0;
              } else if (stateObj.lockEndTime > 0 && now < stateObj.lockEndTime) {
                heat = stateObj.heat;
                locked = true;
                lockEndTime = stateObj.lockEndTime;
              } else if (stateObj.lastHeatUpdateTime > 0) {
                const dt = (now - stateObj.lastHeatUpdateTime) / 1e3;
                heat = Math.max(0, stateObj.heat - coolRate * dt);
                locked = false;
                lockEndTime = 0;
              }
            }
            const lockRemaining = locked ? Math.max(0, lockEndTime - now) : 0;
            policies.push(
              harden({
                hopIndex,
                label: hop.proposedName,
                memberId: hop.memberId,
                burstLimit: hop.heatConfig.burstLimit,
                sustainedRate: hop.heatConfig.sustainedRate,
                lockoutDurationMs: hop.heatConfig.lockoutDurationMs,
                postLockoutPct: hop.heatConfig.postLockoutPct
              })
            );
            states.push(
              harden({
                hopIndex,
                heat,
                locked,
                lockRemaining
              })
            );
            hopIndex += 1;
          }
        }
        return { policies, states };
      };
      const getAncestorMemberIds = (entry) => {
        const chain = getAncestorChain(entry);
        const ids = /* @__PURE__ */ new Set();
        for (const hop of chain) {
          if (hop.heatConfig) {
            ids.add(hop.memberId);
          }
        }
        return ids;
      };
      const makeGatedFollowHeatEvents = (entry, checkAccess) => {
        checkAccess();
        const ancestorIds = getAncestorMemberIds(entry);
        const subscription = heatEventsTopic.subscribe();
        const iterator = (async function* heatEvents() {
          let lastSnapshotTime = Date.now();
          for await (const event of subscription) {
            if (ancestorIds.has(event.hopMemberId)) {
              yield event;
              const now = Date.now();
              if (now - lastSnapshotTime > 5e3) {
                lastSnapshotTime = now;
                const snapInfo = buildHopInfo(entry);
                const snapChain = getAncestorChain(entry);
                const configuredHops = snapChain.filter((h) => h.heatConfig);
                for (let si = 0; si < snapInfo.states.length; si += 1) {
                  const snapState = snapInfo.states[si];
                  const hop = configuredHops[si];
                  if (hop) {
                    yield harden({
                      type: "snapshot",
                      hopMemberId: hop.memberId,
                      heat: snapState.heat,
                      locked: snapState.locked,
                      lockEndTime: snapState.locked ? now + snapState.lockRemaining : 0,
                      timestamp: now
                    });
                  }
                }
              }
            }
          }
        })();
        const rawIterRef = makeIteratorRef2(iterator);
        return makeExo("GatedHeatEventIterator", AsyncIteratorInterface2, {
          async next() {
            checkAccess();
            const result = await rawIterRef.next();
            checkAccess();
            return result;
          },
          async return(value) {
            return rawIterRef.return(value);
          },
          async throw(error) {
            return rawIterRef.throw(error);
          }
        });
      };
      const makeInvitation = (entry, parentCheckAccess, parentCheckPostRate) => {
        let joinedHandle;
        const invitation = makeExo(
          "EndoChannelInvitation",
          ChannelInvitationInterface,
          {
            help: makeHelp(channelInvitationHelp),
            join: async (memberProposedName) => {
              if (joinedHandle) {
                return joinedHandle;
              }
              entry.proposedName = memberProposedName;
              entry.joined = true;
              await persistMemberEntry(entry);
              const checkAccess = () => {
                parentCheckAccess();
                checkEntryValidity(entry);
              };
              const checkPostRate = makeHeatCheckPostRate(
                entry,
                parentCheckPostRate
              );
              joinedHandle = makeChannelMemberHandle(
                entry,
                checkAccess,
                checkPostRate
              );
              return joinedHandle;
            }
          }
        );
        return invitation;
      };
      const makeChannelMemberHandle = (entry, checkAccess, checkPostRate) => {
        const localInvitations = /* @__PURE__ */ new Map();
        return makeExo("EndoChannelMember", ChannelMemberInterface, {
          help: makeHelp(channelMemberHelp),
          post: async (strings, names, petNamesOrPaths, replyTo, resolvedIds, replyType) => {
            checkAccess();
            const now = Date.now();
            checkPostRate(now);
            const ids = (
              /** @type {FormulaIdentifier[]} */
              resolvedIds || []
            );
            await postInternal(entry.memberId, strings, names, ids, replyTo, replyType);
          },
          setProposedName: async (newName) => {
            checkAccess();
            entry.proposedName = newName;
          },
          followMessages: async () => {
            return makeGatedFollowMessages(checkAccess);
          },
          listMessages: async () => {
            checkAccess();
            return harden([...messages]);
          },
          createInvitation: async (subMemberName) => {
            checkAccess();
            if (localInvitations.has(subMemberName)) {
              throw new Error(
                `An invitation named ${q5(subMemberName)} already exists from this member`
              );
            }
            const subPedigree = [...entry.pedigree, entry.proposedName];
            const subMemberId = allocateMemberId();
            const subEntry = {
              proposedName: subMemberName,
              invitedAs: subMemberName,
              memberId: subMemberId,
              inviterMemberId: entry.memberId,
              pedigree: subPedigree,
              valid: true,
              joined: false,
              heatConfig: (
                /** @type {HeatConfig | null} */
                null
              ),
              temporaryBanUntil: 0
            };
            memberEntries.set(subMemberId, subEntry);
            const attenuator = makeAttenuator(subEntry);
            const invitation = makeInvitation(
              subEntry,
              checkAccess,
              checkPostRate
            );
            localInvitations.set(subMemberName, {
              invitation,
              attenuator,
              entry: subEntry
            });
            const regKey = `${entry.memberId}:${subMemberName}`;
            invitationRegistry.set(regKey, {
              invitation,
              entry: subEntry,
              attenuator
            });
            await persistMemberEntry(subEntry);
            return harden([invitation, attenuator]);
          },
          getMembers: async () => {
            checkAccess();
            const result = [];
            for (const [, rec] of localInvitations) {
              result.push(
                harden({
                  proposedName: rec.entry.proposedName,
                  invitedAs: rec.entry.invitedAs,
                  memberId: rec.entry.memberId,
                  pedigree: [...rec.entry.pedigree],
                  active: rec.entry.valid
                })
              );
            }
            return harden(result);
          },
          getProposedName: () => {
            checkAccess();
            return entry.proposedName;
          },
          getMemberId: () => {
            checkAccess();
            return entry.memberId;
          },
          getMember: async (targetMemberId) => {
            checkAccess();
            const targetEntry = memberEntries.get(targetMemberId);
            if (!targetEntry) {
              return void 0;
            }
            const pedigreeMemberIds = buildPedigreeMemberIds(targetEntry);
            return harden({
              proposedName: targetEntry.proposedName,
              invitedAs: targetEntry.invitedAs,
              memberId: targetEntry.memberId,
              pedigree: [...targetEntry.pedigree],
              pedigreeMemberIds
            });
          },
          getAttenuator: async (invitedAs) => {
            checkAccess();
            const rec = localInvitations.get(invitedAs);
            if (!rec) {
              throw new Error(
                `No invitation named ${q5(invitedAs)} found from this member`
              );
            }
            return rec.attenuator;
          },
          getHeatConfig: async () => {
            checkAccess();
            return entry.heatConfig;
          },
          getHopInfo: async () => {
            checkAccess();
            const info = buildHopInfo(entry);
            return harden({
              policies: harden(info.policies),
              states: harden(info.states)
            });
          },
          followHeatEvents: async () => {
            return makeGatedFollowHeatEvents(entry, checkAccess);
          }
        });
      };
      const adminEntry = {
        proposedName,
        invitedAs: proposedName,
        memberId: adminMemberId,
        inviterMemberId: "",
        pedigree: (
          /** @type {string[]} */
          []
        ),
        valid: true,
        joined: true,
        heatConfig: (
          /** @type {HeatConfig | null} */
          null
        ),
        temporaryBanUntil: 0
      };
      memberEntries.set(adminMemberId, adminEntry);
      const adminCheckAccess = () => {
      };
      const adminCheckPostRate = (_now) => {
      };
      const adminInvitations = /* @__PURE__ */ new Map();
      const memberStoreNames = memberStore.list();
      const rehydratedEntries = [];
      for (const storeName of memberStoreNames) {
        if (storeName.startsWith("member-")) {
          const id = memberStore.identifyLocal(storeName);
          if (id !== void 0) {
            const value = await provide(id);
            if (value && typeof value === "object") {
              const data = (
                /** @type {any} */
                value
              );
              let heatConfig = data.heatConfig || null;
              if (!heatConfig && data.rateLimitPerSecond && data.rateLimitPerSecond !== 0) {
                heatConfig = harden({
                  burstLimit: 5,
                  sustainedRate: Math.round(data.rateLimitPerSecond * 60),
                  lockoutDurationMs: 1e4,
                  postLockoutPct: 40
                });
              }
              rehydratedEntries.push({
                proposedName: data.proposedName,
                invitedAs: data.invitedAs,
                memberId: data.memberId,
                inviterMemberId: data.inviterMemberId,
                pedigree: [...data.pedigree],
                valid: data.valid,
                // Default to true for backward compat: old entries without
                // this field were likely already claimed.
                joined: data.joined !== void 0 ? data.joined : true,
                heatConfig,
                temporaryBanUntil: data.temporaryBanUntil
              });
              const num = Number(data.memberId);
              if (num >= nextMemberIdNum) {
                nextMemberIdNum = num + 1;
              }
            }
          }
        }
      }
      rehydratedEntries.sort((a, b2) => a.pedigree.length - b2.pedigree.length);
      const memberHandleInfo = /* @__PURE__ */ new Map();
      memberHandleInfo.set(adminMemberId, {
        checkAccess: adminCheckAccess,
        checkPostRate: adminCheckPostRate,
        invitations: adminInvitations
      });
      for (const entry of rehydratedEntries) {
        memberEntries.set(entry.memberId, entry);
        const parentInfo = memberHandleInfo.get(entry.inviterMemberId);
        if (!parentInfo) {
        } else {
          const parentCheckAccess = parentInfo.checkAccess;
          const parentCheckPostRate = parentInfo.checkPostRate;
          const checkAccess = () => {
            parentCheckAccess();
            checkEntryValidity(entry);
          };
          const checkPostRate = makeHeatCheckPostRate(entry, parentCheckPostRate);
          const attenuator = makeAttenuator(entry);
          const invitation = makeInvitation(
            entry,
            parentCheckAccess,
            parentCheckPostRate
          );
          const rec = { invitation, attenuator, entry };
          parentInfo.invitations.set(entry.invitedAs, rec);
          const regKey = `${entry.inviterMemberId}:${entry.invitedAs}`;
          invitationRegistry.set(regKey, rec);
          const childInvitations = /* @__PURE__ */ new Map();
          memberHandleInfo.set(entry.memberId, {
            checkAccess,
            checkPostRate,
            invitations: childInvitations
          });
        }
      }
      const channelExo = makeExo("EndoChannel", ChannelInterface, {
        help: makeHelp(channelHelp),
        post: async (strings, names, petNamesOrPaths, replyTo, resolvedIds, replyType) => {
          const ids = (
            /** @type {FormulaIdentifier[]} */
            resolvedIds || []
          );
          await postInternal(adminMemberId, strings, names, ids, replyTo, replyType);
        },
        followMessages: async () => {
          const iterator = (async function* channelMessages() {
            yield* messages;
            yield* messagesTopic.subscribe();
          })();
          return makeIteratorRef2(iterator);
        },
        listMessages: async () => harden([...messages]),
        createInvitation: async (memberProposedName) => {
          if (adminInvitations.has(memberProposedName)) {
            throw new Error(
              `An invitation named ${q5(memberProposedName)} already exists from this member`
            );
          }
          const pedigree = [proposedName];
          const memberId = allocateMemberId();
          const newEntry = {
            proposedName: memberProposedName,
            invitedAs: memberProposedName,
            memberId,
            inviterMemberId: adminMemberId,
            pedigree,
            valid: true,
            joined: false,
            heatConfig: (
              /** @type {HeatConfig | null} */
              null
            ),
            temporaryBanUntil: 0
          };
          memberEntries.set(memberId, newEntry);
          const attenuator = makeAttenuator(newEntry);
          const invitation = makeInvitation(
            newEntry,
            adminCheckAccess,
            adminCheckPostRate
          );
          const rec = { invitation, attenuator, entry: newEntry };
          adminInvitations.set(memberProposedName, rec);
          const regKey = `${adminMemberId}:${memberProposedName}`;
          invitationRegistry.set(regKey, rec);
          const childInvitations = /* @__PURE__ */ new Map();
          const checkAccess = () => {
            checkEntryValidity(newEntry);
          };
          const checkPostRate = makeHeatCheckPostRate(
            newEntry,
            adminCheckPostRate
          );
          memberHandleInfo.set(memberId, {
            checkAccess,
            checkPostRate,
            invitations: childInvitations
          });
          await persistMemberEntry(newEntry);
          return harden([invitation, attenuator]);
        },
        join: async (memberProposedName) => {
          const adminKey = `${adminMemberId}:${memberProposedName}`;
          const adminRec = invitationRegistry.get(adminKey);
          if (adminRec) {
            return adminRec.invitation.join(memberProposedName);
          }
          for (const [, rec] of invitationRegistry) {
            if (rec.entry.invitedAs === memberProposedName) {
              return rec.invitation.join(memberProposedName);
            }
          }
          for (const [, rec] of invitationRegistry) {
            if (!rec.entry.joined) {
              return rec.invitation.join(memberProposedName);
            }
          }
          throw new Error(
            `No unclaimed invitation exists \u2014 ask the channel admin to create one`
          );
        },
        getMembers: async () => {
          const result = [];
          for (const [, rec] of adminInvitations) {
            result.push(
              harden({
                proposedName: rec.entry.proposedName,
                invitedAs: rec.entry.invitedAs,
                memberId: rec.entry.memberId,
                pedigree: [...rec.entry.pedigree],
                active: rec.entry.valid
              })
            );
          }
          return harden(result);
        },
        getProposedName: () => proposedName,
        getMemberId: () => adminMemberId,
        getMember: async (targetMemberId) => {
          const targetEntry = memberEntries.get(targetMemberId);
          if (!targetEntry) {
            return void 0;
          }
          const pedigreeMemberIds = buildPedigreeMemberIds(targetEntry);
          return harden({
            proposedName: targetEntry.proposedName,
            invitedAs: targetEntry.invitedAs,
            memberId: targetEntry.memberId,
            pedigree: [...targetEntry.pedigree],
            pedigreeMemberIds
          });
        },
        getAttenuator: async (invitedAs) => {
          const rec = adminInvitations.get(invitedAs);
          if (!rec) {
            throw new Error(
              `No invitation named ${q5(invitedAs)} found from this member`
            );
          }
          return rec.attenuator;
        },
        getHeatConfig: async () => {
          return null;
        },
        getHopInfo: async () => {
          return harden({ policies: harden([]), states: harden([]) });
        },
        followHeatEvents: async () => {
          const iterator = (async function* emptyHeatEvents() {
          })();
          return makeIteratorRef2(iterator);
        }
      });
      return channelExo;
    };
    return makeChannel;
  };
  harden(makeChannelMaker);

  // src/hex.js
  var toHex = (
    // @ts-expect-error ES2024 Uint8Array.prototype.toHex
    typeof Uint8Array.prototype.toHex === "function" ? (bytes) => (
      /** @type {any} */
      bytes.toHex()
    ) : (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
  harden(toHex);
  var fromHex = (
    // @ts-expect-error ES2024 Uint8Array.fromHex
    typeof Uint8Array.fromHex === "function" ? (hex) => (
      /** @type {any} */
      Uint8Array.fromHex(hex)
    ) : (hex) => {
      const bytes = new Uint8Array(hex.length / 2);
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      return bytes;
    }
  );
  harden(fromHex);

  // src/host.js
  var assertPowersName = (name) => {
    ["@none", "@agent", "@endo"].includes(name) || assertPetName(name);
  };
  var normalizeHostOrGuestOptions = (opts) => ({
    introducedNames: (
      /** @type {Record<Name, PetName>} */
      opts?.introducedNames ?? /* @__PURE__ */ Object.create(null)
    ),
    agentName: (
      /** @type {PetName | undefined} */
      opts?.agentName
    )
  });
  var makeHostMaker = ({
    provide,
    provideStoreController,
    cancelValue,
    formulateWorker,
    formulateHost,
    formulateGuest,
    formulateMarshalValue,
    formulateEval,
    formulateUnconfined,
    formulateBundle,
    formulateReadableBlob,
    checkinTree: checkinTree2,
    formulateMount,
    formulateScratchMount,
    formulateInvitation,
    formulateSyncedPetStore,
    formulateDirectoryForStore,
    getPeerIdForNodeIdentifier,
    formulateChannel,
    formulateTimer,
    getAllNetworkAddresses,
    getTypeForId,
    getFormulaForId,
    makeMailbox,
    makeDirectoryNode,
    localNodeNumber,
    isLocalKey,
    getAgentIdForHandleId,
    collectIfDirty = async () => {
    },
    pinTransient = (
      /** @param {any} _id */
      (_id) => {
      }
    ),
    unpinTransient = (
      /** @param {any} _id */
      (_id) => {
      }
    ),
    getFormulaGraphSnapshot = (
      /** @param {any[]} _ids */
      async (_ids) => harden({ nodes: [], edges: [] })
    )
  }) => {
    const makeHost = async (hostId, handleId, hostHandleId, keypairId, agentNodeNumber, agentSignBytes, storeId, mailboxStoreId, mailHubId, inspectorId, mainWorkerId, endoId, networksDirectoryId, pinsDirectoryId, leastAuthorityId, platformNames, context) => {
      context.thisDiesIfThatDies(storeId);
      context.thisDiesIfThatDies(mainWorkerId);
      context.thisDiesIfThatDies(mailboxStoreId);
      if (mailHubId !== void 0) {
        context.thisDiesIfThatDies(mailHubId);
      }
      const baseController = await provideStoreController(storeId);
      const mailboxController = await provideStoreController(mailboxStoreId);
      const specialNames = {
        ...platformNames,
        "@agent": hostId,
        "@self": handleId,
        "@host": hostHandleId ?? handleId,
        "@keypair": keypairId,
        "@main": mainWorkerId,
        "@endo": endoId,
        "@nets": networksDirectoryId,
        "@pins": pinsDirectoryId,
        "@info": inspectorId,
        "@none": leastAuthorityId
      };
      if (mailHubId !== void 0) {
        specialNames["@mail"] = mailHubId;
      }
      const specialStore = makePetSitter(baseController, specialNames);
      const getNetworkAddresses = () => getAllNetworkAddresses(networksDirectoryId);
      const directory = makeDirectoryNode(
        specialStore,
        agentNodeNumber,
        isLocalKey,
        getNetworkAddresses
      );
      const mailbox = await makeMailbox({
        petStore: specialStore,
        agentNodeNumber,
        mailboxStore: mailboxController,
        directory,
        selfId: handleId,
        context
      });
      const { petStore, handle } = mailbox;
      const getEndoBootstrap = async () => provide(endoId, "endo");
      const storeBlob = async (readerRef, petName) => {
        const { namePath } = assertPetNamePath(namePathFrom(petName));
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.readableBlobId)
        );
        const { value } = await formulateReadableBlob(readerRef, tasks);
        return value;
      };
      const storeTree = async (remoteTree, petName) => {
        const { namePath } = assertPetNamePath(namePathFrom(petName));
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.readableTreeId)
        );
        const { value } = await checkinTree2(remoteTree, tasks);
        return value;
      };
      const provideMount = async (mountPath, petName, options = {}) => {
        const { readOnly = false } = options;
        const { namePath } = assertPetNamePath(namePathFrom(petName));
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.mountId)
        );
        const { value } = await formulateMount(mountPath, readOnly, tasks);
        return value;
      };
      const provideScratchMount = async (petName, options = {}) => {
        const { readOnly = false } = options;
        const { namePath } = assertPetNamePath(namePathFrom(petName));
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.scratchMountId)
        );
        const { value } = await formulateScratchMount(readOnly, tasks);
        return value;
      };
      const storeValue = async (value, petName) => {
        const namePath = namePathFrom(petName);
        assertNamePath(namePath);
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.marshalId)
        );
        const { id } = await formulateMarshalValue(value, tasks, pinTransient);
        unpinTransient(id);
      };
      const provideWorker = async (workerNamePath) => {
        const namePath = namePathFrom(workerNamePath);
        assertNamePath(namePath);
        const workerId = await E(directory).identify(...namePath);
        if (workerId !== void 0) {
          return provide(
            /** @type {FormulaIdentifier} */
            workerId,
            "worker"
          );
        }
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => E(directory).storeIdentifier(namePath, identifiers.workerId)
        );
        const { value } = await formulateWorker(tasks);
        return value;
      };
      const prepareWorkerFormulation = (workerName, deferTask) => {
        if (workerName === void 0) {
          return void 0;
        }
        const workerId = (
          /** @type {FormulaIdentifier | undefined} */
          petStore.identifyLocal(workerName)
        );
        if (workerId === void 0) {
          assertPetName(workerName);
          const petName = workerName;
          deferTask((identifiers) => {
            return petStore.storeIdentifier(petName, identifiers.workerId);
          });
          return void 0;
        }
        return workerId;
      };
      const evaluate = async (workerName, source, codeNames, petNamePaths, resultName) => {
        if (workerName !== void 0) {
          assertName(workerName);
        }
        if (!Array.isArray(codeNames)) {
          throw new Error("Evaluator requires an array of code names");
        }
        for (const codeName of codeNames) {
          if (typeof codeName !== "string") {
            throw new Error(`Invalid endowment name: ${q5(codeName)}`);
          }
        }
        if (resultName !== void 0) {
          const resultNamePath = namePathFrom(resultName);
          assertNamePath(resultNamePath);
        }
        if (petNamePaths.length !== codeNames.length) {
          throw new Error("Evaluator requires one pet name for each code name");
        }
        const tasks = makeDeferredTasks();
        const workerId = prepareWorkerFormulation(workerName, tasks.push);
        const endowmentFormulaIdsOrPaths = petNamePaths.map((petNameOrPath) => {
          const petNamePath = namePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const id2 = petStore.identifyLocal(petNamePath[0]);
            if (id2 === void 0) {
              throw new Error(`Unknown pet name ${q5(petNamePath[0])}`);
            }
            return (
              /** @type {FormulaIdentifier} */
              id2
            );
          }
          return petNamePath;
        });
        if (resultName !== void 0) {
          const resultNamePath = namePathFrom(resultName);
          tasks.push(
            (identifiers) => E(directory).storeIdentifier(resultNamePath, identifiers.evalId)
          );
        }
        const { id, value } = await formulateEval(
          hostId,
          source,
          codeNames,
          endowmentFormulaIdsOrPaths,
          tasks,
          workerId,
          resultName === void 0 ? pinTransient : void 0
        );
        if (resultName === void 0) {
          try {
            return await value;
          } finally {
            unpinTransient(id);
          }
        }
        return value;
      };
      const prepareMakeCaplet = (workerName, options = {}) => {
        const {
          powersName = "@none",
          resultName,
          env = {},
          workerTrustedShims
        } = options;
        if (workerName !== void 0) {
          assertName(workerName);
        }
        assertPowersName(powersName);
        const tasks = makeDeferredTasks();
        const workerId = prepareWorkerFormulation(workerName, tasks.push);
        const powersId = petStore.identifyLocal(
          /** @type {Name} */
          powersName
        );
        if (powersId === void 0) {
          assertPetName(powersName);
          const powersPetName = powersName;
          tasks.push((identifiers) => {
            return petStore.storeIdentifier(powersPetName, identifiers.powersId);
          });
        }
        if (resultName !== void 0) {
          tasks.push(
            (identifiers) => E(directory).storeIdentifier(namePathFrom(resultName), identifiers.capletId)
          );
        }
        return {
          tasks,
          workerId,
          powersId,
          env,
          workerTrustedShims
        };
      };
      const makeUnconfined = async (workerName, specifier, options) => {
        const { tasks, workerId, powersId, env, workerTrustedShims } = prepareMakeCaplet(
          /** @type {Name | undefined} */
          workerName,
          options
        );
        const { value } = await formulateUnconfined(
          hostId,
          handleId,
          specifier,
          tasks,
          workerId,
          powersId,
          env,
          workerTrustedShims
        );
        return value;
      };
      const makeBundle = async (workerName, bundleName, options) => {
        const bundleId = petStore.identifyLocal(
          /** @type {Name} */
          bundleName
        );
        if (bundleId === void 0) {
          throw new TypeError(`Unknown pet name for bundle: ${q5(bundleName)}`);
        }
        const { tasks, workerId, powersId, env, workerTrustedShims } = prepareMakeCaplet(
          /** @type {Name | undefined} */
          workerName,
          options
        );
        const { value } = await formulateBundle(
          hostId,
          handleId,
          /** @type {FormulaIdentifier} */
          bundleId,
          tasks,
          workerId,
          powersId,
          env,
          workerTrustedShims
        );
        return value;
      };
      const introduceNamesToAgent = async (agentId, introducedNames) => {
        const agent = await provide(agentId, "agent");
        await Promise.all(
          Object.entries(introducedNames).map(async ([parentName, childName]) => {
            const introducedId = petStore.identifyLocal(
              /** @type {Name} */
              parentName
            );
            if (introducedId === void 0) {
              return;
            }
            await agent.storeIdentifier([childName], introducedId);
          })
        );
      };
      const getNamedAgent = (petName, type) => {
        if (petName !== void 0) {
          const id = petStore.identifyLocal(petName);
          if (id !== void 0) {
            const formulaId = (
              /** @type {FormulaIdentifier} */
              id
            );
            return {
              id: formulaId,
              value: provide(formulaId, type)
            };
          }
        }
        return void 0;
      };
      const getDeferredTasksForAgent = (handleName, agentName) => {
        const tasks = makeDeferredTasks();
        if (handleName !== void 0) {
          assertPetName(handleName);
          const handlePetName = handleName;
          tasks.push((identifiers) => {
            return petStore.storeIdentifier(handlePetName, identifiers.handleId);
          });
        }
        if (agentName !== void 0) {
          assertPetName(agentName);
          const agentPetName = agentName;
          tasks.push((identifiers) => {
            return petStore.storeIdentifier(agentPetName, identifiers.agentId);
          });
        }
        return tasks;
      };
      const makeChildHost = async (petName, { introducedNames = /* @__PURE__ */ Object.create(null), agentName = void 0 } = {}) => {
        let host2 = getNamedAgent(petName, "host");
        await null;
        if (host2 === void 0) {
          const { value, id } = (
            // Behold, recursion:
            await formulateHost(
              endoId,
              networksDirectoryId,
              pinsDirectoryId,
              getDeferredTasksForAgent(
                petName,
                /** @type {PetName | undefined} */
                agentName
              ),
              void 0,
              handleId
            )
          );
          host2 = { value: Promise.resolve(value), id };
        }
        await introduceNamesToAgent(
          host2.id,
          /** @type {Record<import('./types.js').Name, import('./types.js').PetName>} */
          introducedNames
        );
        return host2;
      };
      const provideHost = async (petName, opts) => {
        if (petName !== void 0) {
          assertName(petName);
        }
        const normalizedOpts = normalizeHostOrGuestOptions(opts);
        const { value } = await makeChildHost(
          /** @type {PetName | undefined} */
          petName,
          normalizedOpts
        );
        return value;
      };
      const makeGuest = async (handleName, { introducedNames = /* @__PURE__ */ Object.create(null), agentName = void 0 } = {}) => {
        let guest = getNamedAgent(handleName, "guest");
        await null;
        if (guest === void 0) {
          const { value, id } = (
            // Behold, recursion:
            await formulateGuest(
              hostId,
              handleId,
              getDeferredTasksForAgent(
                handleName,
                /** @type {PetName | undefined} */
                agentName
              )
            )
          );
          guest = { value: Promise.resolve(value), id };
        }
        await introduceNamesToAgent(
          guest.id,
          /** @type {Record<import('./types.js').Name, import('./types.js').PetName>} */
          introducedNames
        );
        return guest;
      };
      const provideGuest = async (petName, opts) => {
        if (petName !== void 0) {
          assertName(petName);
        }
        const normalizedOpts = normalizeHostOrGuestOptions(opts);
        const { value } = await makeGuest(
          /** @type {PetName | undefined} */
          petName,
          normalizedOpts
        );
        return value;
      };
      const makeTimerCmd = async (petName, intervalMs, label) => {
        assertPetName(petName);
        const tasks = makeDeferredTasks();
        tasks.push((identifiers) => petStore.write(petName, identifiers.timerId));
        const { value } = await formulateTimer(
          Number(intervalMs),
          label || petName,
          tasks
        );
        return value;
      };
      const makeChannelCmd = async (petName, channelProposedName) => {
        assertPetName(petName);
        const tasks = makeDeferredTasks();
        tasks.push((identifiers) => petStore.storeIdentifier(petName, identifiers.channelId));
        const { value } = await formulateChannel(
          hostId,
          handleId,
          channelProposedName,
          tasks
        );
        return value;
      };
      const invite = async (guestName) => {
        assertPetName(guestName);
        const tasks = makeDeferredTasks();
        tasks.push(
          (identifiers) => petStore.storeIdentifier(guestName, identifiers.invitationId)
        );
        const { value } = await formulateInvitation(
          hostId,
          handleId,
          guestName,
          tasks
        );
        return value;
      };
      const accept = async (invitationLocator, guestName) => {
        assertPetName(guestName);
        const url = new URL(invitationLocator);
        const nodeNumber = url.hostname;
        const invitationNumber = url.searchParams.get("id");
        const remoteHandleNumber = url.searchParams.get("from");
        const addresses = url.searchParams.getAll("at");
        nodeNumber || assert.Fail`Invitation must have a hostname`;
        if (!remoteHandleNumber) {
          throw makeError(`Invitation must have a "from" parameter`);
        }
        if (invitationNumber === null) {
          throw makeError(`Invitation must have an "id" parameter`);
        }
        assertNodeNumber(nodeNumber);
        assertFormulaNumber(remoteHandleNumber);
        assertFormulaNumber(invitationNumber);
        const peerInfo = {
          node: nodeNumber,
          addresses
        };
        await addPeerInfo(peerInfo);
        const invitationId = formatId({
          number: invitationNumber,
          node: nodeNumber
        });
        const { number: handleNumber } = parseId(handleId);
        const { addresses: hostAddresses } = await getPeerInfo();
        const handleUrl = new URL("endo://");
        handleUrl.hostname = agentNodeNumber;
        handleUrl.searchParams.set("id", handleNumber);
        for (const address of hostAddresses) {
          handleUrl.searchParams.append("at", address);
        }
        const handleLocator = handleUrl.href;
        const invitation = await provide(invitationId, "invitation");
        const acceptResult = await E(invitation).accept(
          handleLocator,
          guestName
        );
        const { syncedStoreNumber } = (
          /** @type {{ syncedStoreNumber: import('./types.js').FormulaNumber }} */
          acceptResult
        );
        const peerId = await getPeerIdForNodeIdentifier(
          /** @type {import('./types.js').NodeNumber} */
          nodeNumber
        );
        const { id: syncedStoreId } = await formulateSyncedPetStore(
          peerId,
          "grantee",
          /** @type {import('./types.js').FormulaNumber} */
          syncedStoreNumber,
          peerId
          // store dependency
        );
        const { id: syncedDirectoryId } = await formulateDirectoryForStore(syncedStoreId);
        await petStore.storeIdentifier(guestName, syncedDirectoryId);
      };
      const cancel = async (petNameOrPath, reason = new Error("Cancelled")) => {
        const namePath = namePathFrom(petNameOrPath);
        const id = await E(directory).identify(...namePath);
        if (id === void 0) {
          throw new TypeError(`Unknown pet name: ${q5(petNameOrPath)}`);
        }
        return cancelValue(
          /** @type {FormulaIdentifier} */
          id,
          reason
        );
      };
      const gateway = async () => {
        const endoBootstrap = getEndoBootstrap();
        return E(endoBootstrap).gateway();
      };
      const greeter = async () => {
        const endoBootstrap = getEndoBootstrap();
        return E(endoBootstrap).greeter();
      };
      const sign = async (hexBytes) => {
        return toHex(agentSignBytes(fromHex(hexBytes)));
      };
      const addPeerInfo = async (peerInfo) => {
        const endoBootstrap = getEndoBootstrap();
        await E(endoBootstrap).addPeerInfo(peerInfo);
      };
      const listKnownPeers = async () => {
        const endoBootstrap = getEndoBootstrap();
        return E(endoBootstrap).listKnownPeers();
      };
      const followPeerChanges = async () => {
        const endoBootstrap = getEndoBootstrap();
        return E(endoBootstrap).followPeerChanges();
      };
      const getPeerInfo = async () => {
        const addresses = await getAllNetworkAddresses(networksDirectoryId);
        const peerInfo = {
          node: agentNodeNumber,
          addresses
        };
        return peerInfo;
      };
      const locateForSharing = async (...petNamePath) => {
        return E(directory).locate(...petNamePath);
      };
      const adoptFromLocator = async (locator, petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        assertNamePath(namePath);
        const url = new URL(locator);
        const nodeNumber = url.hostname;
        assertNodeNumber(nodeNumber);
        const addresses = addressesFromLocator(locator);
        if (addresses.length > 0) {
          const peerInfo = {
            node: nodeNumber,
            addresses
          };
          await addPeerInfo(peerInfo);
        }
        const formulaNumber = url.searchParams.get("id");
        if (!formulaNumber) {
          throw makeError('Locator must have an "id" parameter');
        }
        const id = formatId({
          number: (
            /** @type {import('./types.js').FormulaNumber} */
            formulaNumber
          ),
          node: (
            /** @type {NodeNumber} */
            nodeNumber
          )
        });
        await E(directory).storeIdentifier(namePath, id);
      };
      const { reverseIdentify } = specialStore;
      const {
        has,
        identify,
        lookup,
        maybeLookup,
        locate,
        reverseLocate,
        list,
        listIdentifiers,
        listLocators,
        followNameChanges,
        followLocatorNameChanges,
        reverseLookup,
        remove,
        move,
        copy,
        makeDirectory: makeDirectoryLocal,
        storeIdentifier: directoryStoreIdentifier,
        storeLocator: directoryStoreLocator,
        readText: directoryReadText,
        maybeReadText: directoryMaybeReadText,
        writeText: directoryWriteText
      } = directory;
      const makeDirectory = async (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        return makeDirectoryLocal(namePath);
      };
      const {
        listMessages,
        followMessages,
        resolve,
        reject,
        adopt,
        dismiss,
        dismissAll,
        reply,
        request,
        send,
        deliver,
        form,
        submit,
        sendValue,
        deliverValueById
      } = mailbox;
      const lookupById = async (id) => provide(id);
      const approveEvaluation = async (messageNumber, workerName) => {
        if (workerName !== void 0) {
          assertName(workerName);
        }
        const { source, codeNames, petNamePaths, resolverId, guestHandleId } = mailbox.getEvalRequest(messageNumber);
        assertNames(codeNames);
        const guestAgentId = await getAgentIdForHandleId(
          /** @type {FormulaIdentifier} */
          guestHandleId
        );
        const guestAgent = await provide(guestAgentId, "agent");
        const endowmentFormulaIdsOrPaths = await Promise.all(
          petNamePaths.map(async (petNamePath) => {
            if (petNamePath.length === 1) {
              const id = await E(guestAgent).identify(petNamePath[0]);
              if (id === void 0) {
                throw new Error(
                  `Unknown pet name ${q5(petNamePath[0])} in guest namespace`
                );
              }
              return (
                /** @type {FormulaIdentifier} */
                id
              );
            }
            return petNamePath;
          })
        );
        const tasks = makeDeferredTasks();
        const workerId = prepareWorkerFormulation(workerName, tasks.push);
        const { id: evalId } = await formulateEval(
          guestAgentId,
          source,
          codeNames,
          endowmentFormulaIdsOrPaths,
          tasks,
          workerId
        );
        const resolver = await provide(resolverId, "resolver");
        E.sendOnly(resolver).resolveWithId(evalId);
      };
      const endow = async (messageNumber, bindings, workerName, resultName) => {
        if (workerName !== void 0) {
          assertName(workerName);
        }
        const { source, slots, guestHandleId } = mailbox.getDefineRequest(messageNumber);
        const slotKeys = Object.keys(slots);
        for (const key of slotKeys) {
          if (!(key in bindings)) {
            throw new Error(`Missing binding for slot ${q5(key)}`);
          }
        }
        const guestAgentId = await getAgentIdForHandleId(
          /** @type {FormulaIdentifier} */
          guestHandleId
        );
        const codeNames = slotKeys;
        const endowmentFormulaIdsOrPaths = codeNames.map((codeName) => {
          const petNameOrPath = bindings[codeName];
          const petNamePath = namePathFrom(petNameOrPath);
          if (petNamePath.length === 1) {
            const id = petStore.identifyLocal(petNamePath[0]);
            if (id === void 0) {
              throw new Error(`Unknown pet name ${q5(petNamePath[0])}`);
            }
            return (
              /** @type {FormulaIdentifier} */
              id
            );
          }
          return petNamePath;
        });
        const tasks = makeDeferredTasks();
        const workerId = prepareWorkerFormulation(workerName, tasks.push);
        if (resultName !== void 0) {
          const resultNamePath = namePathFrom(resultName);
          tasks.push(
            (identifiers) => E(directory).storeIdentifier(resultNamePath, identifiers.evalId)
          );
        }
        const { id: evalId } = await formulateEval(
          guestAgentId,
          source,
          codeNames,
          endowmentFormulaIdsOrPaths,
          tasks,
          workerId
        );
        await deliverValueById(messageNumber, evalId);
      };
      const getFormulaGraph = async () => {
        const names = await list();
        const seedIds = [];
        await Promise.all(
          names.map(async (name) => {
            const id = await identify(name);
            if (id !== void 0) {
              seedIds.push(
                /** @type {import('./types.js').FormulaIdentifier} */
                id
              );
            }
          })
        );
        return getFormulaGraphSnapshot(seedIds);
      };
      const host = {
        // Directory
        has,
        identify,
        reverseIdentify,
        lookupById,
        locate,
        reverseLocate,
        list,
        listIdentifiers,
        listLocators,
        followLocatorNameChanges,
        followNameChanges,
        lookup,
        maybeLookup,
        reverseLookup,
        storeIdentifier: directoryStoreIdentifier,
        storeLocator: directoryStoreLocator,
        remove,
        move,
        copy,
        makeDirectory,
        readText: directoryReadText,
        maybeReadText: directoryMaybeReadText,
        writeText: directoryWriteText,
        // Mail
        handle,
        listMessages,
        followMessages,
        resolve,
        reject,
        adopt,
        dismiss,
        dismissAll,
        reply,
        request,
        send,
        form,
        // Host
        storeBlob,
        storeValue,
        storeTree,
        provideMount,
        provideScratchMount,
        provideGuest,
        provideHost,
        provideWorker,
        evaluate,
        makeUnconfined,
        makeBundle,
        cancel,
        gateway,
        greeter,
        sign,
        getPeerInfo,
        addPeerInfo,
        listKnownPeers,
        followPeerChanges,
        locateForSharing,
        adoptFromLocator,
        deliver,
        makeChannel: makeChannelCmd,
        makeTimer: makeTimerCmd,
        invite,
        accept,
        approveEvaluation,
        endow,
        submit,
        sendValue,
        // Graph
        getFormulaGraph
      };
      const withCollection = (fn) => async (...args) => {
        await null;
        try {
          return await fn(...args);
        } finally {
          await collectIfDirty();
        }
      };
      const unwrappedMethods = /* @__PURE__ */ new Set([
        "handle",
        "reverseIdentify",
        "approveEvaluation",
        "endow",
        "submit",
        "sendValue"
      ]);
      const wrappedHost = Object.fromEntries(
        Object.entries(host).map(([name, fn]) => [
          name,
          unwrappedMethods.has(name) ? fn : withCollection(fn)
        ])
      );
      const hostExo = makeExo("EndoHost", HostInterface, {
        help: makeHelp(hostHelp),
        ...wrappedHost,
        /** @param {string} locator */
        followLocatorNameChanges: async (locator) => {
          const iterator = host.followLocatorNameChanges(locator);
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        },
        followMessages: async () => {
          const iterator = host.followMessages();
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        },
        followNameChanges: async () => {
          const iterator = host.followNameChanges();
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        },
        followPeerChanges: async () => {
          const iterator = await host.followPeerChanges();
          await collectIfDirty();
          return makeIteratorRef2(iterator);
        }
      });
      await provide(mainWorkerId, "worker");
      return hostExo;
    };
    return makeHost;
  };

  // src/remote-control.js
  var short = (id) => id.slice(0, 8);
  var makeRemoteControlProvider = (localNodeId) => {
    const remoteControls = /* @__PURE__ */ new Map();
    const makeRemoteControl = (remoteNodeId) => {
      let state;
      let stateName = "start";
      const tag = `${short(localNodeId)}\u2192${short(remoteNodeId)}`;
      const accepted = (remoteGateway, cancelCurrent, currentCancelled) => {
        const acceptedState = {
          accept(proposedRemoteGateway, proposedCancel, proposedCancelled, proposedDispose) {
            console.log(
              `Endo remote-control ${tag}: accepted\u2192accepted (replacing connection)`
            );
            cancelCurrent(
              new Error("Connection replaced by new inbound connection.")
            );
            proposedCancelled.catch(() => {
            }).then(proposedDispose);
            return accepted(
              proposedRemoteGateway,
              proposedCancel,
              proposedCancelled
            );
          },
          connect(_getProposedRemoteGateway, proposedCancel, proposedCancelled, proposedDispose) {
            Promise.all([
              currentCancelled.catch(proposedCancel),
              proposedCancelled.catch(cancelCurrent)
            ]).then(() => {
            }).then(proposedDispose);
            return {
              state: accepted(remoteGateway, proposedCancel, proposedCancelled),
              remoteGateway
            };
          }
        };
        currentCancelled.catch(() => {
          if (state === acceptedState) {
            console.log(
              `Endo remote-control ${tag}: accepted\u2192start (connection lost)`
            );
            stateName = "start";
            state = start();
          }
        });
        stateName = "accepted";
        return acceptedState;
      };
      const connected = localNodeId > remoteNodeId ? (remoteGateway, cancelCurrent, currentCancelled) => {
        return {
          accept(_proposedRemoteGateway, proposedCancel, _proposedCancelled, proposedDispose) {
            console.log(
              `Endo remote-control ${tag}: connected, rejecting inbound (connect bias)`
            );
            Promise.resolve(
              proposedCancel(
                new Error(
                  "Connection refused: already connected (crossed hellos, connect bias)"
                )
              )
            ).then(proposedDispose);
            return connected(
              remoteGateway,
              cancelCurrent,
              currentCancelled
            );
          },
          connect(_getProposedRemoteGateway, proposedCancel, proposedCancelled, proposedDispose) {
            Promise.all([
              proposedCancelled.catch(cancelCurrent),
              currentCancelled.catch(proposedCancel)
            ]).then(() => {
            }).then(proposedDispose);
            return {
              state: connected(
                remoteGateway,
                proposedCancel,
                proposedCancelled
              ),
              remoteGateway
            };
          }
        };
      } : (remoteGateway, cancelCurrent, currentCancelled) => {
        const connectedState = {
          accept(proposedRemoteGateway, proposedCancel, proposedCancelled, proposedDispose) {
            console.log(
              `Endo remote-control ${tag}: connected\u2192accepted (accept bias, replacing outbound)`
            );
            cancelCurrent(
              new Error(
                "Connection abandoned: accepted new connection (crossed hellos, accept bias)"
              )
            );
            proposedCancelled.catch(() => {
              if (state === connectedState) {
                console.log(
                  `Endo remote-control ${tag}: connected\u2192start (connection lost, accept bias)`
                );
                stateName = "start";
                state = start();
              }
            }).then(proposedDispose);
            return accepted(
              proposedRemoteGateway,
              proposedCancel,
              proposedCancelled
            );
          },
          connect(_getProposedRemoteGateway, proposedCancel, proposedCancelled, proposedDispose) {
            Promise.all([
              proposedCancelled.catch(cancelCurrent),
              currentCancelled.catch(proposedCancel)
            ]).then(() => {
            }).then(proposedDispose);
            return {
              state: connected(
                remoteGateway,
                proposedCancel,
                proposedCancelled
              ),
              remoteGateway
            };
          }
        };
        return connectedState;
      };
      const start = () => {
        const startState = {
          accept(proposedRemoteGateway, cancelCurrent, currentCancelled, currentDispose) {
            currentCancelled.catch(() => {
              if (state === startState) {
                state = start();
              }
            }).then(currentDispose);
            return accepted(
              proposedRemoteGateway,
              cancelCurrent,
              currentCancelled
            );
          },
          connect(getRemoteGateway, cancelCurrent, currentCancelled, currentDispose) {
            const remoteGateway = getRemoteGateway();
            const connectedState = connected(
              remoteGateway,
              cancelCurrent,
              currentCancelled
            );
            stateName = "connected";
            currentCancelled.then(
              () => {
              },
              () => {
                if (state === connectedState) {
                  console.log(
                    `Endo remote-control ${tag}: connected\u2192start (connection lost)`
                  );
                  stateName = "start";
                  state = start();
                }
              }
            ).then(currentDispose);
            return {
              state: connectedState,
              remoteGateway
            };
          }
        };
        return startState;
      };
      state = start();
      const accept = (proposedRemoteGateway, cancelConnection, connectionCancelled, connectionDispose) => {
        console.log(`Endo remote-control ${tag}: accept (was ${stateName})`);
        state = state.accept(
          proposedRemoteGateway,
          cancelConnection,
          connectionCancelled,
          connectionDispose || (() => {
          })
        );
      };
      const connect = (getRemoteGateway, cancelIncarnation, incarnationCancelled, disposeIncarnation) => {
        console.log(`Endo remote-control ${tag}: connect (was ${stateName})`);
        const { state: nextState, remoteGateway } = state.connect(
          getRemoteGateway,
          cancelIncarnation,
          incarnationCancelled,
          disposeIncarnation
        );
        state = nextState;
        return remoteGateway;
      };
      const getStateName = () => stateName;
      return { accept, connect, getStateName };
    };
    const provideRemoteControl = (remoteNodeId) => {
      let remoteControl = remoteControls.get(remoteNodeId);
      if (remoteControl === void 0) {
        remoteControl = makeRemoteControl(remoteNodeId);
        remoteControls.set(remoteNodeId, remoteControl);
      }
      return remoteControl;
    };
    const getConnectionStates = () => {
      const states = {};
      for (const [nodeId, control] of remoteControls.entries()) {
        states[nodeId] = control.getStateName();
      }
      return states;
    };
    provideRemoteControl.getConnectionStates = getConnectionStates;
    return provideRemoteControl;
  };

  // src/context.js
  var makeContextMaker = ({
    controllerForId,
    provideController,
    getFormulaType
  }) => {
    const makeContext = (id) => {
      let done = false;
      const { promise: cancelled, reject: rejectCancelled } = (
        /** @type {PromiseKit<never>} */
        makePromiseKit()
      );
      const { promise: disposed, resolve: resolveDisposed } = (
        /** @type {PromiseKit<void>} */
        makePromiseKit()
      );
      cancelled.catch(() => {
      });
      const dependents = /* @__PURE__ */ new Map();
      const hooks = [];
      const cancel = (reason, prefix = "*") => {
        if (done) return disposed;
        done = true;
        rejectCancelled(reason || harden_default(new Error("Cancelled")));
        const formulaType = getFormulaType(id) || "?";
        console.log(
          `${prefix} ${id} (${formulaType}) REASON: ${reason?.message || reason}`
        );
        controllerForId.delete(id);
        for (const dependentContext of dependents.values()) {
          dependentContext.cancel(reason, ` ${prefix}`);
        }
        dependents.clear();
        resolveDisposed(Promise.all(hooks.map((hook) => hook())).then(() => {
        }));
        return disposed;
      };
      const thatDiesIfThisDies = (dependentId) => {
        if (done) {
          return;
        }
        const dependentController = provideController(dependentId);
        dependents.set(dependentId, dependentController.context);
      };
      const thisDiesIfThatDies = (dependencyId) => {
        const dependencyController = provideController(dependencyId);
        dependencyController.context.thatDiesIfThisDies(id);
      };
      const onCancel = (hook) => {
        if (done) {
          return;
        }
        hooks.push(hook);
      };
      return {
        id,
        cancel,
        cancelled,
        disposed,
        thatDiesIfThisDies,
        thisDiesIfThatDies,
        onCancel
      };
    };
    return makeContext;
  };

  // src/graph.js
  var makeFormulaGraph = ({ extractDeps, isLocalId }) => {
    const formulaDeps = /* @__PURE__ */ new Map();
    const petStoreEdges = /* @__PURE__ */ new Map();
    const roots = /* @__PURE__ */ new Set();
    const parent = /* @__PURE__ */ new Map();
    const size = /* @__PURE__ */ new Map();
    const promiseResolverByStore = /* @__PURE__ */ new Map();
    let dirty = true;
    const ensure = (id) => {
      if (!parent.has(id)) {
        parent.set(id, id);
        size.set(id, 1);
      }
    };
    const findGroup = (id) => {
      ensure(id);
      const next = (
        /** @type {FormulaIdentifier} */
        parent.get(id)
      );
      if (next !== id) {
        const root = findGroup(next);
        parent.set(id, root);
        return root;
      }
      return id;
    };
    const union = (left, right) => {
      const leftRoot = findGroup(left);
      const rightRoot = findGroup(right);
      if (leftRoot === rightRoot) {
        return;
      }
      const leftSize = size.get(leftRoot) || 1;
      const rightSize = size.get(rightRoot) || 1;
      if (leftSize < rightSize) {
        parent.set(leftRoot, rightRoot);
        size.set(rightRoot, leftSize + rightSize);
      } else {
        parent.set(rightRoot, leftRoot);
        size.set(leftRoot, leftSize + rightSize);
      }
      dirty = true;
    };
    const onFormulaAdded = (id, formula) => {
      ensure(id);
      const deps = extractDeps(formula).filter(isLocalId);
      formulaDeps.set(id, new Set(deps));
      if (formula.type === "handle") {
        union(id, formula.agent);
      } else if (formula.type === "host" || formula.type === "guest") {
        union(id, formula.handle);
      } else if (formula.type === "promise" || formula.type === "resolver") {
        const record = promiseResolverByStore.get(formula.store) || {};
        if (formula.type === "promise") {
          record.promiseId = id;
        } else {
          record.resolverId = id;
        }
        promiseResolverByStore.set(formula.store, record);
        if (record.promiseId && record.resolverId) {
          union(record.promiseId, record.resolverId);
        }
      }
      dirty = true;
    };
    const onFormulaRemoved = (id) => {
      formulaDeps.delete(id);
      for (const [storeId, record] of promiseResolverByStore.entries()) {
        if (record.promiseId === id) {
          delete record.promiseId;
        }
        if (record.resolverId === id) {
          delete record.resolverId;
        }
        if (!record.promiseId && !record.resolverId) {
          promiseResolverByStore.delete(storeId);
        }
      }
      dirty = true;
    };
    const onPetStoreWrite = (petStoreId, id) => {
      const set = petStoreEdges.get(petStoreId) || /* @__PURE__ */ new Set();
      set.add(id);
      petStoreEdges.set(petStoreId, set);
      dirty = true;
    };
    const onPetStoreRemove = (petStoreId, id) => {
      const set = petStoreEdges.get(petStoreId);
      if (set !== void 0) {
        set.delete(id);
        if (set.size === 0) {
          petStoreEdges.delete(petStoreId);
        }
        dirty = true;
      }
    };
    const onPetStoreRemoveAll = (petStoreId) => {
      if (petStoreEdges.delete(petStoreId)) {
        dirty = true;
      }
    };
    const addRoot = (id) => {
      roots.add(id);
      dirty = true;
    };
    return harden({
      addRoot,
      onFormulaAdded,
      onFormulaRemoved,
      onPetStoreWrite,
      onPetStoreRemove,
      onPetStoreRemoveAll,
      findGroup,
      roots,
      isDirty: () => dirty,
      clearDirty: () => {
        dirty = false;
      },
      formulaDeps,
      petStoreEdges
    });
  };

  // ../captp/src/trap.js
  var { freeze: freeze15 } = Object;
  var nearTrapImpl = harden_default({
    applyFunction(target, args) {
      return target(...args);
    },
    applyMethod(target, prop, args) {
      return target[prop](...args);
    },
    get(target, prop) {
      return target[prop];
    }
  });
  var funcTarget2 = freeze15(() => {
  });
  var objTarget2 = freeze15({ __proto__: null });

  // ../captp/src/finalize.js
  var { WeakRef, FinalizationRegistry } = globalThis;
  var makeFinalizingMap = (finalizer, opts) => {
    const { weakValues = false } = opts || {};
    if (!weakValues || !WeakRef || !FinalizationRegistry) {
      const keyToVal = /* @__PURE__ */ new Map();
      return Far("fakeFinalizingMap", {
        clearWithoutFinalizing: keyToVal.clear.bind(keyToVal),
        get: keyToVal.get.bind(keyToVal),
        has: keyToVal.has.bind(keyToVal),
        set: (key, val) => {
          keyToVal.set(key, val);
        },
        delete: keyToVal.delete.bind(keyToVal),
        getSize: () => keyToVal.size
      });
    }
    const keyToRef = /* @__PURE__ */ new Map();
    const registry = new FinalizationRegistry((key) => {
      finalizingMap.delete(key);
    });
    const finalizingMap = Far("finalizingMap", {
      /**
       * `clearWithoutFinalizing` does not `deref` anything, and so does not
       * suppress collection of the weakly-pointed-to values until the end of the
       * turn.  Because `clearWithoutFinalizing` immediately removes all entries
       * from this map, this possible collection is not observable using only this
       * map instance.  But it is observable via other uses of WeakRef or
       * FinalizationGroup, including other map instances made by this
       * `makeFinalizingMap`.
       */
      clearWithoutFinalizing: () => {
        for (const ref of keyToRef.values()) {
          registry.unregister(ref);
        }
        keyToRef.clear();
      },
      // Does deref, and thus does guarantee stability of the value until the
      // end of the turn.
      // UNTIL https://github.com/endojs/endo/issues/1514
      // Prefer: get: key => keyToRef.get(key)?.deref(),
      get: (key) => {
        const wr = keyToRef.get(key);
        if (!wr) {
          return wr;
        }
        return wr.deref();
      },
      has: (key) => finalizingMap.get(key) !== void 0,
      // Does deref, and thus does guarantee stability of both old and new values
      // until the end of the turn.
      set: (key, ref) => {
        assert(!isPrimitive3(ref));
        finalizingMap.delete(key);
        const newWR = new WeakRef(ref);
        keyToRef.set(key, newWR);
        registry.register(ref, key, newWR);
      },
      delete: (key) => {
        const wr = keyToRef.get(key);
        if (!wr) {
          return false;
        }
        registry.unregister(wr);
        keyToRef.delete(key);
        if (finalizer) {
          finalizer(key);
        }
        return true;
      },
      getSize: () => keyToRef.size
    });
    return finalizingMap;
  };

  // ../captp/src/captp.js
  var WELL_KNOWN_SLOT_PROPERTIES = harden_default(["answerID", "questionID", "target"]);
  var sink = () => {
  };
  harden_default(sink);
  var makeDefaultCapTPImportExportTables = ({
    gcImports,
    releaseSlot,
    makeRemoteKit
  }) => {
    const slotToExported = /* @__PURE__ */ new Map();
    const slotToImported = makeFinalizingMap(
      /**
       * @param {CapTPSlot} slotID
       */
      (slotID) => {
        releaseSlot(slotID);
      },
      { weakValues: gcImports }
    );
    let lastExportID = 0;
    let lastPromiseID = 0;
    const makeSlotForValue = (val) => {
      let slot;
      if (isPromise(val)) {
        lastPromiseID += 1;
        slot = `p+${lastPromiseID}`;
      } else {
        lastExportID += 1;
        slot = `o+${lastExportID}`;
      }
      return slot;
    };
    const makeValueForSlot = (slot, iface) => {
      let val;
      const { promise, settler } = makeRemoteKit(slot);
      if (slot[0] === "o" || slot[0] === "t") {
        val = Remotable(iface, void 0, settler.resolveWithPresence());
      } else if (slot[0] === "p") {
        val = promise;
      } else {
        Fail5`Unknown slot type ${slot}`;
      }
      return { val, settler };
    };
    return {
      makeSlotForValue,
      makeValueForSlot,
      hasImport: (slot) => slotToImported.has(slot),
      getImport: (slot) => slotToImported.get(slot),
      markAsImported: (slot, val) => slotToImported.set(slot, val),
      hasExport: (slot) => slotToExported.has(slot),
      getExport: (slot) => slotToExported.get(slot),
      markAsExported: (slot, val) => slotToExported.set(slot, val),
      deleteExport: (slot) => slotToExported.delete(slot),
      didDisconnect: () => slotToImported.clearWithoutFinalizing()
    };
  };

  // ../captp/src/atomics.js
  var MIN_DATA_BUFFER_LENGTH = 1;
  var TRANSFER_OVERHEAD_LENGTH = BigUint64Array.BYTES_PER_ELEMENT + Int32Array.BYTES_PER_ELEMENT;
  var MIN_TRANSFER_BUFFER_LENGTH = MIN_DATA_BUFFER_LENGTH + TRANSFER_OVERHEAD_LENGTH;

  // src/residence.js
  var makeResidenceTracker = ({
    getLocalIdForRef,
    getFormula,
    terminateWorker
  }) => {
    let nextRetainerId = 0;
    const retaineesByRetainer = /* @__PURE__ */ new Map();
    const retainerClose = /* @__PURE__ */ new Map();
    const workerForRetainer = /* @__PURE__ */ new Map();
    const originRetainerForRef = /* @__PURE__ */ new WeakMap();
    const residenceWatcher = harden({
      retain: ({ retainerId, retaineeId, retaineeIncarnation }) => {
        const retainees = retaineesByRetainer.get(retainerId);
        if (!retainees) {
          return;
        }
        let incarnations = retainees.get(retaineeId);
        if (!incarnations) {
          incarnations = /* @__PURE__ */ new Set();
          retainees.set(retaineeId, incarnations);
        }
        incarnations.add(retaineeIncarnation);
      },
      release: ({ retainerId, retaineeId, retaineeIncarnation }) => {
        const retainees = retaineesByRetainer.get(retainerId);
        if (!retainees) {
          return;
        }
        const incarnations = retainees.get(retaineeId);
        if (!incarnations) {
          return;
        }
        incarnations.delete(retaineeIncarnation);
        if (incarnations.size === 0) {
          retainees.delete(retaineeId);
        }
      },
      releaseAllForRetainer: (retainerId) => {
        retaineesByRetainer.delete(retainerId);
      }
    });
    const register = ({ name, close, closed }) => {
      const retainerId = `${name}-${nextRetainerId}`;
      nextRetainerId += 1;
      retaineesByRetainer.set(retainerId, /* @__PURE__ */ new Map());
      retainerClose.set(retainerId, close);
      if (name.startsWith("Worker ")) {
        workerForRetainer.set(retainerId, name.slice("Worker ".length));
      }
      closed.then(() => {
        residenceWatcher.releaseAllForRetainer(retainerId);
        retainerClose.delete(retainerId);
        workerForRetainer.delete(retainerId);
      });
      const capTpOptions = {
        exportHook: (val, slot) => {
          const id = getLocalIdForRef(val);
          if (id !== void 0) {
            residenceWatcher.retain({
              retainerId,
              retaineeId: id,
              retaineeIncarnation: slot
            });
          }
        },
        importHook: (val, _slot) => {
          if (typeof val === "object" && val !== null || typeof val === "function") {
            originRetainerForRef.set(
              /** @type {object} */
              val,
              retainerId
            );
          }
        },
        makeCapTPImportExportTables: (options) => {
          const tables = makeDefaultCapTPImportExportTables(options);
          const { deleteExport } = tables;
          tables.deleteExport = (slot) => {
            const exported = tables.getExport(slot);
            const id = getLocalIdForRef(exported);
            if (id !== void 0) {
              residenceWatcher.release({
                retainerId,
                retaineeId: id,
                retaineeIncarnation: slot
              });
            }
            deleteExport(slot);
          };
          return tables;
        }
      };
      return capTpOptions;
    };
    const disconnectRetainersHolding = (ids) => {
      const collected = new Set(ids);
      for (const [retainerId, retainees] of retaineesByRetainer.entries()) {
        for (const id of retainees.keys()) {
          if (collected.has(id)) {
            const workerId = workerForRetainer.get(retainerId);
            if (!workerId) {
              break;
            }
            const formula = getFormula(id);
            if (!formula || formula.type === "invitation") {
              break;
            }
            const reason = new Error(
              `Formula ${q5(formula.type)} became unreachable by any pet name path and was collected`
            );
            const close = retainerClose.get(retainerId);
            if (close) {
              close(reason).catch(() => {
              });
            }
            terminateWorker(workerId, reason);
            break;
          }
        }
      }
    };
    return harden({
      register,
      disconnectRetainersHolding,
      residenceWatcher
    });
  };

  // src/store-controller.js
  var makeLocalStoreController = (storeId, petStore, gcHooks) => {
    const { onPetStoreWrite, onPetStoreRemove, isLocalId, withFormulaGraphLock } = gcHooks;
    const removeEdgeIfUnreferenced = async (id) => {
      await null;
      const names = petStore.reverseIdentify(id);
      if (names.length === 0) {
        await withFormulaGraphLock(async () => {
          onPetStoreRemove(storeId, id);
        });
      }
    };
    const has = (petName) => petStore.has(petName);
    const identifyLocal = (petName) => petStore.identifyLocal(petName);
    const list = () => petStore.list();
    const reverseIdentify = (id) => petStore.reverseIdentify(id);
    const followNameChanges = () => petStore.followNameChanges();
    const followIdNameChanges = (id) => petStore.followIdNameChanges(id);
    const storeIdentifier = async (petName, id) => {
      assert(isLocalId(id), `Local store received non-local id: ${id}`);
      const previousId = petStore.identifyLocal(petName);
      await petStore.storeIdentifier(petName, id);
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(
          storeId,
          /** @type {FormulaIdentifier} */
          id
        );
      });
      if (previousId && previousId !== id) {
        await removeEdgeIfUnreferenced(
          /** @type {FormulaIdentifier} */
          previousId
        );
      }
    };
    const storeLocator = async (_petName, _locator) => {
      throw new Error(
        "storeLocator is not supported on local stores; use storeIdentifier"
      );
    };
    const remove = async (petName) => {
      const previousId = petStore.identifyLocal(petName);
      await petStore.remove(petName);
      if (previousId) {
        await removeEdgeIfUnreferenced(
          /** @type {FormulaIdentifier} */
          previousId
        );
      }
    };
    const rename = async (fromPetName, toPetName) => {
      const fromId = petStore.identifyLocal(fromPetName);
      const overwrittenId = petStore.identifyLocal(toPetName);
      await petStore.rename(fromPetName, toPetName);
      if (fromId && isLocalId(fromId)) {
        await withFormulaGraphLock(async () => {
          onPetStoreWrite(
            storeId,
            /** @type {FormulaIdentifier} */
            fromId
          );
        });
      }
      if (overwrittenId && overwrittenId !== fromId) {
        await removeEdgeIfUnreferenced(
          /** @type {FormulaIdentifier} */
          overwrittenId
        );
      }
    };
    const seedGcEdges = async () => {
      await null;
      const names = petStore.list();
      const localIds = [];
      for (const name of names) {
        const id = petStore.identifyLocal(name);
        if (id !== void 0 && isLocalId(id)) {
          localIds.push(
            /** @type {FormulaIdentifier} */
            id
          );
        }
      }
      if (localIds.length > 0) {
        await withFormulaGraphLock(async () => {
          for (const id of localIds) {
            onPetStoreWrite(storeId, id);
          }
        });
      }
    };
    const controller = harden_default({
      has,
      identifyLocal,
      list,
      reverseIdentify,
      storeIdentifier,
      storeLocator,
      remove,
      rename,
      followNameChanges,
      followIdNameChanges,
      seedGcEdges
    });
    return controller;
  };
  harden_default(makeLocalStoreController);
  var makeSyncedStoreController = (storeId, syncedStore, gcHooks, converters) => {
    const { onPetStoreWrite, onPetStoreRemove, withFormulaGraphLock } = gcHooks;
    const { idFromLocator: idFromLocator2, isLocalKey } = converters;
    const safeIdFromLocator = (locator) => {
      try {
        return (
          /** @type {FormulaIdentifier} */
          idFromLocator2(locator)
        );
      } catch {
        return void 0;
      }
    };
    const has = (petName) => syncedStore.has(petName);
    const identifyLocal = (petName) => {
      const locator = syncedStore.lookup(petName);
      if (locator === void 0) {
        return void 0;
      }
      const id = safeIdFromLocator(locator);
      if (id === void 0) {
        return void 0;
      }
      const { id: normalizedId } = converters.internalizeLocator(
        locator,
        isLocalKey
      );
      return normalizedId;
    };
    const list = () => syncedStore.list();
    const reverseIdentify = (id) => {
      const names = [];
      const state = syncedStore.getState();
      for (const [key, entry] of Object.entries(state)) {
        if (entry.locator !== null) {
          try {
            const { id: entryId } = converters.internalizeLocator(
              entry.locator,
              isLocalKey
            );
            if (entryId === id) {
              names.push(
                /** @type {Name} */
                key
              );
            }
          } catch {
          }
        }
      }
      return harden_default(names);
    };
    const storeIdentifier = async (petName, id) => {
      const previousId = identifyLocal(petName);
      const formulaType = await converters.getTypeForId(
        /** @type {FormulaIdentifier} */
        id
      );
      const { number, node } = parseId(
        /** @type {FormulaIdentifier} */
        id
      );
      const externalNode = node === LOCAL_NODE ? converters.localNodeNumber : node;
      const externalId = formatId({ number, node: externalNode });
      const locator = converters.formatLocator(externalId, formulaType);
      await syncedStore.storeLocator(petName, locator);
      await withFormulaGraphLock(async () => {
        onPetStoreWrite(
          storeId,
          /** @type {FormulaIdentifier} */
          id
        );
      });
      if (previousId && previousId !== id) {
        const stillReferenced = reverseIdentify(previousId).length > 0;
        if (!stillReferenced) {
          await withFormulaGraphLock(async () => {
            onPetStoreRemove(
              storeId,
              /** @type {FormulaIdentifier} */
              previousId
            );
          });
        }
      }
    };
    const storeLocator = async (petName, locator) => {
      const previousId = identifyLocal(petName);
      await syncedStore.storeLocator(petName, locator);
      const newId = safeIdFromLocator(locator);
      if (newId) {
        await withFormulaGraphLock(async () => {
          onPetStoreWrite(storeId, newId);
        });
      }
      if (previousId && previousId !== (newId ?? "")) {
        const stillReferenced = reverseIdentify(previousId).length > 0;
        if (!stillReferenced) {
          await withFormulaGraphLock(async () => {
            onPetStoreRemove(
              storeId,
              /** @type {FormulaIdentifier} */
              previousId
            );
          });
        }
      }
    };
    const remove = async (petName) => {
      const previousLocator = syncedStore.lookup(petName);
      await syncedStore.remove(petName);
      if (previousLocator) {
        const previousId = safeIdFromLocator(previousLocator);
        if (previousId) {
          const stillReferenced = reverseIdentify(previousId).length > 0;
          if (!stillReferenced) {
            await withFormulaGraphLock(async () => {
              onPetStoreRemove(storeId, previousId);
            });
          }
        }
      }
    };
    const rename = async (fromPetName, toPetName) => {
      const locator = syncedStore.lookup(fromPetName);
      if (locator === void 0) {
        throw new Error(
          `Formula does not exist for pet name ${JSON.stringify(fromPetName)}`
        );
      }
      const overwrittenId = identifyLocal(toPetName);
      await syncedStore.storeLocator(toPetName, locator);
      await syncedStore.remove(fromPetName);
      const fromId = safeIdFromLocator(locator);
      if (fromId) {
        await withFormulaGraphLock(async () => {
          onPetStoreWrite(storeId, fromId);
        });
      }
      if (overwrittenId && overwrittenId !== (fromId ?? "")) {
        const stillReferenced = reverseIdentify(overwrittenId).length > 0;
        if (!stillReferenced) {
          await withFormulaGraphLock(async () => {
            onPetStoreRemove(
              storeId,
              /** @type {FormulaIdentifier} */
              overwrittenId
            );
          });
        }
      }
    };
    const followNameChanges = async function* syncedFollowNameChanges() {
      for await (const { key, entry } of syncedStore.followChanges()) {
        if (entry.locator !== null) {
          const entryId = safeIdFromLocator(entry.locator);
          if (entryId !== void 0) {
            const { id: normalizedId } = converters.internalizeLocator(
              entry.locator,
              isLocalKey
            );
            const idRecord = parseId(normalizedId);
            yield (
              /** @type {import('./types.js').PetStoreNameChange} */
              {
                add: (
                  /** @type {Name} */
                  key
                ),
                value: idRecord
              }
            );
          }
        } else {
          yield (
            /** @type {import('./types.js').PetStoreNameChange} */
            {
              remove: (
                /** @type {Name} */
                key
              )
            }
          );
        }
      }
    };
    const followIdNameChanges = async function* syncedFollowIdNameChanges(id) {
      const currentNames = reverseIdentify(id);
      const idRecord = parseId(id);
      yield (
        /** @type {import('./types.js').PetStoreIdNameChange} */
        {
          add: idRecord,
          names: currentNames
        }
      );
      for await (const { key, entry } of syncedStore.followChanges()) {
        const entryId = entry.locator !== null ? safeIdFromLocator(entry.locator) : void 0;
        let normalizedEntryId;
        if (entryId !== void 0 && entry.locator !== null) {
          ({ id: normalizedEntryId } = converters.internalizeLocator(
            entry.locator,
            isLocalKey
          ));
        }
        if (normalizedEntryId === id) {
          yield (
            /** @type {import('./types.js').PetStoreIdNameChange} */
            {
              add: idRecord,
              names: [
                /** @type {Name} */
                key
              ]
            }
          );
        } else if (entry.locator === null) {
          yield (
            /** @type {import('./types.js').PetStoreIdNameChange} */
            {
              remove: idRecord,
              names: [
                /** @type {Name} */
                key
              ]
            }
          );
        }
      }
    };
    const seedGcEdges = async () => {
      await null;
      const names = syncedStore.list();
      const ids = [];
      for (const name of names) {
        const locator = syncedStore.lookup(name);
        if (locator !== void 0) {
          const id = safeIdFromLocator(locator);
          if (id !== void 0) {
            ids.push(id);
          }
        }
      }
      if (ids.length > 0) {
        await withFormulaGraphLock(async () => {
          for (const id of ids) {
            onPetStoreWrite(storeId, id);
          }
        });
      }
    };
    const controller = harden_default({
      has,
      identifyLocal,
      list,
      reverseIdentify,
      storeIdentifier,
      storeLocator,
      remove,
      rename,
      followNameChanges,
      followIdNameChanges,
      seedGcEdges
    });
    return controller;
  };
  harden_default(makeSyncedStoreController);

  // src/multimap.js
  var internalMakeMultimap = (mapConstructor) => {
    const map = new mapConstructor();
    return {
      add: (key, value) => {
        let set = map.get(key);
        if (set === void 0) {
          set = /* @__PURE__ */ new Set();
          map.set(key, set);
        }
        set.add(value);
      },
      delete: (key, value) => {
        const set = map.get(key);
        if (set !== void 0) {
          const result = set.delete(value);
          if (set.size === 0) {
            map.delete(key);
          }
          return result;
        }
        return false;
      },
      deleteAll: (key) => map.delete(key),
      get: (key) => map.get(key)?.keys().next().value,
      getAllFor: (key) => Array.from(map.get(key) ?? []),
      has: (key) => map.has(key)
    };
  };
  var makeWeakMultimap = () => {
    return internalMakeMultimap(WeakMap);
  };

  // src/networks/loopback.js
  var makeLoopbackNetwork = (gateway) => {
    return Far(
      "Loopback Network",
      /** @type {import('../types.js').EndoNetwork} */
      {
        addresses: () => [],
        supports: (address) => new URL(address).protocol === "loop:",
        connect: (address) => {
          if (address !== "loop:") {
            throw new Error(
              'Failed invariant: loopback only supports "loop:" address'
            );
          }
          return gateway;
        }
      }
    );
  };

  // src/mount.js
  var assertValidSegment = (segment) => {
    if (typeof segment !== "string") {
      throw new Error(`Path segment must be a string, got ${q5(typeof segment)}`);
    }
    if (segment === "") {
      throw new Error("Path segment must not be empty");
    }
    if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
      throw new Error(
        `Path segment must not contain '/', '\\', or '\\0': ${q5(segment)}`
      );
    }
  };
  harden(assertValidSegment);
  var resolveSegments = (currentDir, confinementRoot, segments, filePowers) => {
    let resolved = currentDir;
    for (const segment of segments) {
      if (segment === ".") {
      } else if (segment === "..") {
        const parent = filePowers.joinPath(resolved, "..");
        if (parent.length >= confinementRoot.length) {
          resolved = parent;
        } else {
          resolved = confinementRoot;
        }
      } else {
        assertValidSegment(segment);
        resolved = filePowers.joinPath(resolved, segment);
      }
    }
    return resolved;
  };
  harden(resolveSegments);
  var assertConfined = async (candidatePath, confinementRoot, filePowers) => {
    let resolved;
    try {
      resolved = await filePowers.realPath(candidatePath);
    } catch {
      throw new Error(
        `Path does not exist and cannot be verified: ${q5(candidatePath)}`
      );
    }
    const rootResolved = await filePowers.realPath(confinementRoot);
    if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
      throw new Error(`Path escapes mount root: ${q5(candidatePath)}`);
    }
  };
  harden(assertConfined);
  var assertConfinedOrAncestor = async (candidatePath, confinementRoot, filePowers) => {
    const rootResolved = await filePowers.realPath(confinementRoot);
    let check = candidatePath;
    for (; ; ) {
      try {
        const resolved = await filePowers.realPath(check);
        if (resolved !== rootResolved && !resolved.startsWith(`${rootResolved}/`)) {
          throw new Error(`Path escapes mount root: ${q5(candidatePath)}`);
        }
        return;
      } catch (e) {
        if (e.message && e.message.startsWith("Path escapes")) {
          throw e;
        }
        const parent = filePowers.joinPath(check, "..");
        if (parent === check) {
          throw new Error(`Path escapes mount root: ${q5(candidatePath)}`);
        }
        check = parent;
      }
    }
  };
  harden(assertConfinedOrAncestor);
  var isConfinedPath = async (candidatePath, confinementRoot, filePowers) => {
    try {
      const resolved = await filePowers.realPath(candidatePath);
      const rootResolved = await filePowers.realPath(confinementRoot);
      return resolved === rootResolved || resolved.startsWith(`${rootResolved}/`);
    } catch {
      return false;
    }
  };
  harden(isConfinedPath);
  var makeMountExo = (ctx) => {
    const { currentDir, confinementRoot, readOnly, filePowers, description } = ctx;
    const assertWritable = () => {
      if (readOnly) {
        throw new Error("Mount is read-only");
      }
    };
    const resolve = (segments) => resolveSegments(currentDir, confinementRoot, segments, filePowers);
    const help = makeHelp(mountHelp);
    return makeExo("EndoMount", MountInterface, {
      help,
      async has(...pathSegments) {
        await null;
        if (pathSegments.length === 0) {
          return true;
        }
        const target = resolve(pathSegments);
        const pathExists = await filePowers.exists(target);
        if (!pathExists) {
          return false;
        }
        return isConfinedPath(target, confinementRoot, filePowers);
      },
      async list(...pathSegments) {
        await null;
        const target = resolve(pathSegments);
        await assertConfined(target, confinementRoot, filePowers);
        const entries7 = await filePowers.readDirectory(target);
        const confined = [];
        for (const entry of entries7.sort()) {
          const entryPath = filePowers.joinPath(target, entry);
          if (await isConfinedPath(entryPath, confinementRoot, filePowers)) {
            confined.push(entry);
          }
        }
        return harden(confined);
      },
      async lookup(pathArg) {
        await null;
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        await assertConfined(target, confinementRoot, filePowers);
        const isDir = await filePowers.isDirectory(target);
        if (isDir) {
          return makeMountExo({
            ...ctx,
            currentDir: target,
            description: `Subdirectory of ${description}`
          });
        }
        return makeMountFileExo(target, readOnly, filePowers, confinementRoot);
      },
      async readText(pathArg) {
        await null;
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        await assertConfined(target, confinementRoot, filePowers);
        return filePowers.readFileText(target);
      },
      async maybeReadText(pathArg) {
        await null;
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        try {
          await assertConfined(target, confinementRoot, filePowers);
          return await filePowers.readFileText(target);
        } catch {
          return void 0;
        }
      },
      async writeText(pathArg, content) {
        await null;
        assertWritable();
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        await assertConfinedOrAncestor(target, confinementRoot, filePowers);
        const parent = filePowers.joinPath(target, "..");
        await filePowers.makePath(parent);
        await filePowers.writeFileText(target, content);
      },
      async remove(pathArg) {
        await null;
        assertWritable();
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        await assertConfined(target, confinementRoot, filePowers);
        await filePowers.removePath(target);
      },
      async move(fromArg, toArg) {
        await null;
        assertWritable();
        const from = resolve(typeof fromArg === "string" ? [fromArg] : fromArg);
        const to = resolve(typeof toArg === "string" ? [toArg] : toArg);
        await assertConfined(from, confinementRoot, filePowers);
        await assertConfinedOrAncestor(to, confinementRoot, filePowers);
        await filePowers.renamePath(from, to);
      },
      async makeDirectory(pathArg) {
        await null;
        assertWritable();
        const segments = typeof pathArg === "string" ? [pathArg] : pathArg;
        const target = resolve(segments);
        await assertConfinedOrAncestor(target, confinementRoot, filePowers);
        await filePowers.makePath(target);
      },
      readOnly() {
        if (readOnly) {
          return this;
        }
        return makeMountExo({
          ...ctx,
          readOnly: true,
          description: `Read-only view of ${description}`
        });
      },
      async snapshot() {
        throw new Error("snapshot() is not yet implemented");
      }
    });
  };
  harden(makeMountExo);
  var makeMountFileExo = (filePath, readOnly, filePowers, confinementRoot) => {
    const assertWritable = () => {
      if (readOnly) {
        throw new Error("Mount is read-only");
      }
    };
    const help = makeHelp(mountFileHelp);
    return makeExo("EndoMountFile", MountFileInterface, {
      help,
      async text() {
        await null;
        await assertConfined(filePath, confinementRoot, filePowers);
        return filePowers.readFileText(filePath);
      },
      streamBase64() {
        const reader = filePowers.makeFileReader(filePath);
        return makeIteratorRef2(reader);
      },
      async json() {
        await null;
        const text = await filePowers.readFileText(filePath);
        return JSON.parse(text);
      },
      async writeText(content) {
        await null;
        assertWritable();
        await assertConfined(filePath, confinementRoot, filePowers);
        await filePowers.writeFileText(filePath, content);
      },
      async writeBytes(readableRef) {
        await null;
        assertWritable();
        await assertConfined(filePath, confinementRoot, filePowers);
        const writer = filePowers.makeFileWriter(filePath);
        const iterator = (
          /** @type {AsyncIterator<Uint8Array>} */
          readableRef
        );
        for (; ; ) {
          const { done, value } = await iterator.next();
          if (done) break;
          await writer.next(value);
        }
        await writer.return(void 0);
      },
      readOnly() {
        return makeMountFileExo(filePath, true, filePowers, confinementRoot);
      }
    });
  };
  harden(makeMountFileExo);
  var makeMount = ({ rootPath, readOnly, filePowers }) => {
    const prefix = readOnly ? "Read-only mount" : "Mount";
    const ctx = {
      currentDir: rootPath,
      confinementRoot: rootPath,
      readOnly,
      filePowers,
      description: `${prefix} at ${rootPath}`
    };
    return makeMountExo(ctx);
  };
  harden(makeMount);

  // src/daemon.js
  var delay = async (ms, cancelled) => {
    await Promise.race([cancelled, void 0]);
    return new Promise((resolve, reject) => {
      const handle = setTimeout(resolve, ms);
      cancelled.catch((error) => {
        reject(error);
        clearTimeout(handle);
      });
    });
  };
  var makeInspector = (type, number, record) => makeExo(`Inspector (${type} ${number})`, InspectorInterface, {
    lookup: async (petNameOrPath) => {
      let petName;
      if (Array.isArray(petNameOrPath)) {
        if (petNameOrPath.length !== 1) {
          throw Error("Inspector.lookup(path) requires path length of 1");
        }
        petName = petNameOrPath[0];
      } else {
        petName = petNameOrPath;
      }
      assertName(petName);
      if (!Object.hasOwn(record, petName)) {
        return void 0;
      }
      return record[petName];
    },
    list: () => Object.keys(record)
  });
  var makeFarContext = (context) => Far("Context", {
    id: () => context.id,
    cancel: context.cancel,
    whenCancelled: () => context.cancelled,
    whenDisposed: () => context.disposed,
    addDisposalHook: context.onCancel
  });
  var deriveId = (path, rootNonce, digester) => {
    digester.updateText(rootNonce);
    digester.updateText(path);
    return digester.digestHex();
  };
  var messageNumberNamePattern2 = /^(0|[1-9][0-9]*)$/;
  var MESSAGE_FROM_NAME = "@from";
  var MESSAGE_TO_NAME = "@to";
  var MESSAGE_DATE_NAME = "@date";
  var MESSAGE_TYPE_NAME = "@type";
  var MESSAGE_ID_NAME = "@message";
  var MESSAGE_REPLY_TO_NAME = "@reply";
  var MESSAGE_DESCRIPTION_NAME = "@description";
  var MESSAGE_STRINGS_NAME = "@strings";
  var MESSAGE_PROMISE_NAME = "@promise";
  var MESSAGE_RESOLVER_NAME = "@resolver";
  var isMessageNumberName = (name) => messageNumberNamePattern2.test(name);
  var compareMessageNames = (left, right) => {
    if (left === right) {
      return 0;
    }
    return BigInt(left) < BigInt(right) ? -1 : 1;
  };
  var PROMISE_STATUS_NAME = (
    /** @type {PetName} */
    "status"
  );
  var RESOLVED_VALUE_NAME = (
    /** @type {PetName} */
    "value"
  );
  var makeDaemonCore = async (powers, rootEntropy, {
    cancel,
    gracePeriodMs,
    gracePeriodElapsed,
    specials,
    localNodeNumber,
    signBytes,
    gcEnabled = true
  }) => {
    const {
      crypto: cryptoPowers,
      petStore: petStorePowers,
      persistence: persistencePowers,
      control: controlPowers,
      filePowers
    } = powers;
    const { randomHex256, generateEd25519Keypair, ed25519Sign } = cryptoPowers;
    const contentStore = persistencePowers.makeContentStore();
    const workerDaemonFacets = /* @__PURE__ */ new WeakMap();
    const workerTerminationByNumber = /* @__PURE__ */ new Map();
    const formulaGraphJobs = makeSerialJobs();
    let formulaGraphLockDepth = 0;
    const withFormulaGraphLock = async (asyncFn = async () => void 0) => {
      await null;
      if (formulaGraphLockDepth > 0) {
        return asyncFn();
      }
      formulaGraphLockDepth += 1;
      try {
        return await formulaGraphJobs.enqueue(asyncFn);
      } finally {
        formulaGraphLockDepth -= 1;
      }
    };
    console.log("Node", localNodeNumber);
    const endoFormulaId = formatId({
      number: (
        /** @type {FormulaNumber} */
        rootEntropy
      ),
      node: LOCAL_NODE
    });
    const preformulate = async (derivation, formula) => {
      const formulaNumber = (
        /** @type {FormulaNumber} */
        deriveId(derivation, rootEntropy, cryptoPowers.makeSha256())
      );
      const id = formatId({
        number: formulaNumber,
        node: LOCAL_NODE
      });
      await persistencePowers.writeFormula(formulaNumber, formula);
      return { id, formulaNumber };
    };
    const { id: knownPeersId } = await preformulate("peers", {
      type: "known-peers-store"
    });
    const { id: leastAuthorityId } = await preformulate("least-authority", {
      type: "least-authority"
    });
    const { id: mainWorkerId } = await preformulate("main", { type: "worker" });
    const builtins = {
      NONE: leastAuthorityId,
      MAIN: mainWorkerId,
      ENDO: endoFormulaId
    };
    const platformNames = Object.fromEntries(
      await Promise.all(
        Object.entries(specials).map(async ([specialName, makeFormula]) => {
          const formula = makeFormula(builtins);
          const { id } = await preformulate(specialName, formula);
          return [specialName, id];
        })
      )
    );
    const controllerForId = /* @__PURE__ */ new Map();
    const formulaForId = /* @__PURE__ */ new Map();
    const lifecycleLogEnabled = typeof process === "undefined" || process.env.ENDO_LIFECYCLE_LOG !== "0";
    const lifecycleT0 = Date.now();
    const logLifecycle = (id, event, detail = "") => {
      if (!lifecycleLogEnabled) {
        return;
      }
      const elapsed = Date.now() - lifecycleT0;
      const formula = formulaForId.get(id);
      const type = formula?.type || "?";
      console.log(
        `T+${elapsed}ms	${id.slice(0, 12)}	${type}	${event}	${detail}`
      );
    };
    const extractLabeledDeps = (formula) => {
      switch (formula.type) {
        case "endo":
          return [
            ["networks", formula.networks],
            ["pins", formula.pins],
            ["peers", formula.peers],
            ["host", formula.host],
            ["leastAuthority", formula.leastAuthority]
          ];
        case "channel":
          return [
            ["handle", formula.handle],
            ["creator", formula.creatorAgent],
            ["messages", formula.messageStore],
            ["members", formula.memberStore]
          ];
        case "host":
          return [
            ["handle", formula.handle],
            ["hostHandle", formula.hostHandle],
            ["keypair", formula.keypair],
            ["worker", formula.worker],
            ["inspector", formula.inspector],
            ["petStore", formula.petStore],
            ["mailbox", formula.mailboxStore],
            ["mailHub", formula.mailHub],
            ["endo", formula.endo],
            ["networks", formula.networks],
            ["pins", formula.pins]
          ];
        case "guest":
          return [
            ["handle", formula.handle],
            ["keypair", formula.keypair],
            ["hostHandle", formula.hostHandle],
            ["hostAgent", formula.hostAgent],
            ["petStore", formula.petStore],
            ["mailbox", formula.mailboxStore],
            ["mailHub", formula.mailHub],
            ["worker", formula.worker],
            ["networks", formula.networks]
          ];
        case "marshal":
          return (formula.slots ?? []).map((s, i) => [`slot${i}`, s]);
        case "eval":
          return [
            ["worker", formula.worker],
            ...(formula.values ?? []).map(
              (v, i) => (
                /** @type {[string, FormulaIdentifier]} */
                [
                  formula.names?.[i] || `val${i}`,
                  v
                ]
              )
            )
          ];
        case "lookup":
          return [["hub", formula.hub]];
        case "make-unconfined":
          return [
            ["worker", formula.worker],
            ["powers", formula.powers]
          ];
        case "make-bundle":
          return [
            ["worker", formula.worker],
            ["powers", formula.powers],
            ["bundle", formula.bundle]
          ];
        case "peer":
          return [["networks", formula.networks]];
        case "handle":
          return [["agent", formula.agent]];
        case "mail-hub":
          return [["store", formula.store]];
        case "message": {
          const messageDeps = [
            ["from", formula.from],
            ["to", formula.to],
            ...(formula.ids ?? []).map(
              (id, i) => (
                /** @type {[string, FormulaIdentifier]} */
                [`ref${i}`, id]
              )
            )
          ];
          if (formula.promiseId) {
            messageDeps.push(["promise", formula.promiseId]);
          }
          if (formula.resolverId) {
            messageDeps.push(["resolver", formula.resolverId]);
          }
          if (formula.valueId) {
            messageDeps.push(["value", formula.valueId]);
          }
          return messageDeps;
        }
        case "promise":
        case "resolver":
          return [["store", formula.store]];
        case "readable-tree":
          return [];
        case "mount":
          return [];
        case "scratch-mount":
          return [];
        case "pet-inspector":
          return [["petStore", formula.petStore]];
        case "directory":
          return [["petStore", formula.petStore]];
        case "synced-pet-store":
          return [
            ["peer", formula.peer],
            ["store", formula.store]
          ];
        case "invitation":
          return [
            ["hostAgent", formula.hostAgent],
            ["hostHandle", formula.hostHandle]
          ];
        default:
          return [];
      }
    };
    const extractDeps = (formula) => extractLabeledDeps(formula).map(([_label, id]) => normalizeId(id));
    const localKeys = /* @__PURE__ */ new Set([localNodeNumber]);
    const isLocalKey = (node) => localKeys.has(node);
    const isLocalId = (id) => {
      const { node } = parseId(id);
      return node === LOCAL_NODE || isLocalKey(node);
    };
    const registerLocalKey = (agentKey) => {
      localKeys.add(agentKey);
    };
    const normalizeId = (id) => {
      const { number, node } = parseId(id);
      if (isLocalKey(node)) {
        return formatId({ number, node: LOCAL_NODE });
      }
      return id;
    };
    const formulaGraph = makeFormulaGraph({ extractDeps, isLocalId });
    formulaGraph.addRoot(knownPeersId);
    formulaGraph.addRoot(leastAuthorityId);
    formulaGraph.addRoot(mainWorkerId);
    formulaGraph.addRoot(endoFormulaId);
    for (const id of Object.values(platformNames)) {
      formulaGraph.addRoot(
        /** @type {FormulaIdentifier} */
        id
      );
    }
    const transientRoots = /* @__PURE__ */ new Set();
    let transientRootsDirty = false;
    const pinTransient = (id) => {
      transientRoots.add(id);
      transientRootsDirty = true;
    };
    const unpinTransient = (id) => {
      if (transientRoots.delete(id)) {
        transientRootsDirty = true;
      }
    };
    const agentIdForHandle = /* @__PURE__ */ new WeakMap();
    const getFormulaForId = async (inputId) => {
      const id = normalizeId(inputId);
      await null;
      let formula = formulaForId.get(id);
      if (formula !== void 0) {
        return formula;
      }
      const { number: fNum } = parseId(id);
      formula = await persistencePowers.readFormula(fNum);
      await withFormulaGraphLock(async () => {
        formulaForId.set(id, formula);
        formulaGraph.onFormulaAdded(id, formula);
      });
      return formula;
    };
    const getTypeForId = async (inputId) => {
      const id = normalizeId(inputId);
      if (parseId(id).node !== LOCAL_NODE) {
        return "remote";
      }
      const { type } = await getFormulaForId(id);
      return type;
    };
    const idForRef = makeWeakMultimap();
    const refForId = /* @__PURE__ */ new Map();
    const getIdForRef = (ref) => idForRef.get(ref);
    const getLocalIdForRef = (value) => {
      if ((typeof value !== "object" || value === null) && typeof value !== "function") {
        return void 0;
      }
      const id = (
        /** @type {FormulaIdentifier | undefined} */
        getIdForRef(
          /** @type {any} */
          value
        )
      );
      return id !== void 0 && isLocalId(id) ? id : void 0;
    };
    const residenceTracker = makeResidenceTracker({
      getLocalIdForRef,
      getFormula: (id) => formulaForId.get(id),
      terminateWorker: (workerId, reason) => {
        const terminate = workerTerminationByNumber.get(workerId);
        if (terminate) {
          terminate(reason).catch(() => {
          });
        }
      }
    });
    const capTpConnectionRegistrar = residenceTracker.register;
    const provide = (id, _expectedType) => (
      /** @type {any} */
      // Behold, unavoidable forward-reference:
      // eslint-disable-next-line no-use-before-define
      provideController(id).value
    );
    const enableFormulaCollection = gcEnabled;
    if (!enableFormulaCollection) {
      console.log("Formula collection disabled (ENDO_GC=0)");
    }
    const dropLiveValue = (id) => {
      controllerForId.delete(id);
      const ref = refForId.get(id);
      if (ref !== void 0) {
        refForId.delete(id);
        idForRef.delete(ref, id);
      }
    };
    const seedFormulaGraphFromPersistence = async () => {
      const formulaNumbers = await persistencePowers.listFormulas();
      const entries7 = await Promise.all(
        formulaNumbers.map(async (formulaNumber) => {
          const formula = await persistencePowers.readFormula(formulaNumber);
          const id = formatId({
            number: formulaNumber,
            node: LOCAL_NODE
          });
          return { id, formula };
        })
      );
      await withFormulaGraphLock(async () => {
        for (const { id, formula } of entries7) {
          if (!formulaForId.has(id)) {
            formulaForId.set(id, formula);
          }
          formulaGraph.onFormulaAdded(id, formula);
        }
      });
      const petStoreTypes = /* @__PURE__ */ new Map([
        ["pet-store", assertPetName],
        ["mailbox-store", assertMailboxStoreName],
        ["known-peers-store", assertValidNumber]
      ]);
      await Promise.all(
        entries7.map(async ({ id, formula }) => {
          const assertValidName = petStoreTypes.get(formula.type);
          if (assertValidName !== void 0) {
            const { number: formulaNumber } = parseId(id);
            const petStore = await petStorePowers.makeIdentifiedPetStore(
              formulaNumber,
              /** @type {'pet-store' | 'mailbox-store' | 'known-peers-store'} */
              formula.type,
              assertValidName
            );
            await petStore.repairIds((storedId) => {
              const { number: storedNumber, node: storedNode } = parseId(storedId);
              if (isLocalKey(storedNode)) {
                return formatId({ number: storedNumber, node: LOCAL_NODE });
              }
              return storedId;
            });
            const controller = makeLocalStoreController(
              /** @type {FormulaIdentifier} */
              id,
              petStore,
              gcHooks
            );
            await controller.seedGcEdges();
            return;
          }
          if (formula.type === "synced-pet-store") {
            const { number: formulaNumber } = parseId(id);
            const syncedStore = await petStorePowers.makeIdentifiedSyncedPetStore(
              formulaNumber,
              localNodeNumber,
              formula.role
            );
            const controller = makeSyncedStoreController(
              /** @type {FormulaIdentifier} */
              id,
              syncedStore,
              gcHooks,
              storeConverters
            );
            await controller.seedGcEdges();
          }
        })
      );
    };
    const collectIfDirty = async () => {
      if (!enableFormulaCollection) {
        return;
      }
      await null;
      await formulaGraphJobs.enqueue(async () => {
        if (!formulaGraph.isDirty() && !transientRootsDirty) {
          return;
        }
        const localIds = new Set(formulaForId.keys());
        const groupMembers = /* @__PURE__ */ new Map();
        for (const id of localIds) {
          const group = formulaGraph.findGroup(id);
          const set = groupMembers.get(group) || /* @__PURE__ */ new Set();
          set.add(id);
          groupMembers.set(group, set);
        }
        const groupDeps = /* @__PURE__ */ new Map();
        const addGroupEdge = (fromGroup, toGroup) => {
          if (fromGroup === toGroup) {
            return;
          }
          const set = groupDeps.get(fromGroup) || /* @__PURE__ */ new Set();
          set.add(toGroup);
          groupDeps.set(fromGroup, set);
        };
        for (const [id, deps] of formulaGraph.formulaDeps.entries()) {
          if (localIds.has(id)) {
            const fromGroup = formulaGraph.findGroup(id);
            for (const dep of deps) {
              if (localIds.has(dep)) {
                addGroupEdge(fromGroup, formulaGraph.findGroup(dep));
              }
            }
          }
        }
        for (const [storeId, ids] of formulaGraph.petStoreEdges.entries()) {
          if (localIds.has(storeId)) {
            const fromGroup = formulaGraph.findGroup(storeId);
            for (const id of ids) {
              if (localIds.has(id)) {
                addGroupEdge(fromGroup, formulaGraph.findGroup(id));
              }
            }
          }
        }
        const refCount = /* @__PURE__ */ new Map();
        for (const group of groupMembers.keys()) {
          refCount.set(group, 0);
        }
        for (const deps of groupDeps.values()) {
          for (const dep of deps) {
            refCount.set(dep, (refCount.get(dep) || 0) + 1);
          }
        }
        const rootGroups = /* @__PURE__ */ new Set();
        for (const rootId of formulaGraph.roots) {
          if (localIds.has(rootId)) {
            rootGroups.add(formulaGraph.findGroup(rootId));
          }
        }
        for (const rootId of transientRoots) {
          if (localIds.has(rootId)) {
            rootGroups.add(formulaGraph.findGroup(rootId));
          }
        }
        const queue = [];
        for (const [group, count] of refCount.entries()) {
          if (count === 0 && !rootGroups.has(group)) {
            queue.push(group);
          }
        }
        const collectedGroups = /* @__PURE__ */ new Set();
        while (queue.length > 0) {
          const group = queue.shift();
          if (group !== void 0 && !collectedGroups.has(group)) {
            collectedGroups.add(group);
            for (const dep of groupDeps.get(group) || []) {
              const nextCount = (refCount.get(dep) || 0) - 1;
              refCount.set(dep, nextCount);
              if (nextCount === 0 && !rootGroups.has(dep)) {
                queue.push(dep);
              }
            }
          }
        }
        if (collectedGroups.size === 0) {
          formulaGraph.clearDirty();
          transientRootsDirty = false;
          return;
        }
        const collectedIds = [];
        for (const group of collectedGroups) {
          const members = groupMembers.get(group);
          if (members !== void 0) {
            for (const id of members) {
              collectedIds.push(id);
            }
          }
        }
        const collectedFormulas = /* @__PURE__ */ new Map();
        for (const id of collectedIds) {
          const formula = formulaForId.get(id);
          if (formula !== void 0) {
            collectedFormulas.set(id, formula);
          }
        }
        const cancelReason = new Error("Collected formula");
        for (const id of collectedIds) {
          logLifecycle(id, "COLLECTED");
        }
        await Promise.allSettled(
          collectedIds.map(async (id) => {
            await null;
            const controller = controllerForId.get(id);
            if (controller) {
              await controller.context.cancel(cancelReason, "!");
            }
          })
        );
        for (const id of collectedIds) {
          dropLiveValue(id);
        }
        residenceTracker.disconnectRetainersHolding(collectedIds);
        for (const id of collectedIds) {
          const formula = collectedFormulas.get(id);
          if (formula !== void 0) {
            formulaForId.delete(id);
            formulaGraph.onFormulaRemoved(id);
            if (formula.type === "pet-store" || formula.type === "mailbox-store" || formula.type === "known-peers-store" || formula.type === "synced-pet-store") {
              formulaGraph.onPetStoreRemoveAll(id);
            }
          }
        }
        await Promise.allSettled(
          collectedIds.map(async (id) => {
            await null;
            await persistencePowers.deleteFormula(parseId(id).number);
          })
        );
        await Promise.allSettled(
          Array.from(collectedFormulas.entries()).map(async ([id, formula]) => {
            await null;
            if (formula.type === "pet-store" || formula.type === "mailbox-store" || formula.type === "known-peers-store") {
              await petStorePowers.deletePetStore(
                parseId(id).number,
                formula.type
              );
            } else if (formula.type === "synced-pet-store") {
              await petStorePowers.deleteSyncedPetStore(parseId(id).number);
            }
          })
        );
        formulaGraph.clearDirty();
        transientRootsDirty = false;
      });
      try {
        const endoBootstrap = await provide(endoFormulaId, "endo");
        await E(endoBootstrap).revivePins();
      } catch {
      }
    };
    const gcHooks = harden_default({
      onPetStoreWrite: (storeId, id) => formulaGraph.onPetStoreWrite(storeId, id),
      onPetStoreRemove: (storeId, id) => formulaGraph.onPetStoreRemove(storeId, id),
      isLocalId,
      withFormulaGraphLock
    });
    const storeConverters = harden_default({
      idFromLocator,
      formatLocator,
      getTypeForId,
      internalizeLocator,
      isLocalKey,
      localNodeNumber
    });
    const controllerCache = /* @__PURE__ */ new Map();
    const provideStoreController = async (storeId) => {
      const cached = controllerCache.get(storeId);
      if (cached !== void 0) {
        return cached;
      }
      const storeType = await getTypeForId(storeId);
      if (storeType === "synced-pet-store") {
        const store2 = (
          /** @type {import('./types.js').SyncedPetStore} */
          await provide(storeId)
        );
        const controller2 = makeSyncedStoreController(
          storeId,
          store2,
          gcHooks,
          storeConverters
        );
        controllerCache.set(storeId, controller2);
        return controller2;
      }
      const store = (
        /** @type {import('./types.js').PetStore} */
        await provide(storeId)
      );
      const controller = makeLocalStoreController(storeId, store, gcHooks);
      controllerCache.set(storeId, controller);
      return controller;
    };
    const provideRemoteControl = makeRemoteControlProvider(localNodeNumber);
    const localGateway = Far("Gateway", {
      /** @param {string} requestedId */
      provide: async (requestedId) => {
        assertValidId(requestedId);
        if (!isLocalId(requestedId)) {
          const { node } = parseId(requestedId);
          throw new Error(
            `Gateway can only provide local values. Got request for node ${q5(
              node
            )}`
          );
        }
        return provide(requestedId);
      }
    });
    const localGreeter = Far("Greeter", {
      /**
       * @param {string} remoteNodeId
       * @param {Promise<EndoGateway>} remoteGateway
       * @param {ERef<(error: Error) => void>} cancelConnection
       * @param {Promise<never>} connectionCancelled
       */
      hello: async (remoteNodeId, remoteGateway, cancelConnection, connectionCancelled) => {
        assertNodeNumber(remoteNodeId);
        console.log(
          `Endo daemon received inbound peer connection from node ${remoteNodeId.slice(0, 8)}`
        );
        const remoteControl = provideRemoteControl(remoteNodeId);
        const wrappedCancel = (error) => E(cancelConnection)(error);
        remoteControl.accept(remoteGateway, wrappedCancel, connectionCancelled);
        return localGateway;
      }
    });
    const makeDaemonFacetForWorker = async (workerId512) => {
      return makeExo(
        `Endo facet for worker ${workerId512}`,
        DaemonFacetForWorkerInterface,
        {}
      );
    };
    const makeIdentifiedWorker = async (workerId512, context, trustedShims = void 0) => {
      const daemonWorkerFacet = makeDaemonFacetForWorker(workerId512);
      const { promise: forceCancelled, reject: forceCancel } = (
        /** @type {PromiseKit<never>} */
        makePromiseKit()
      );
      const { promise: workerCancelled, reject: cancelWorker } = (
        /** @type {PromiseKit<never>} */
        makePromiseKit()
      );
      const { workerTerminated, workerDaemonFacet } = await controlPowers.makeWorker(
        workerId512,
        daemonWorkerFacet,
        workerCancelled,
        Promise.race([forceCancelled, gracePeriodElapsed]),
        capTpConnectionRegistrar,
        trustedShims
      );
      const terminateWorker = async (_reason = void 0) => {
        E.sendOnly(workerDaemonFacet).terminate();
        await Promise.race([
          workerTerminated,
          delay(gracePeriodMs, gracePeriodElapsed).catch(() => {
          })
        ]).catch(() => {
        });
      };
      logLifecycle(context.id, "WORKER_READY");
      workerTerminationByNumber.set(workerId512, terminateWorker);
      workerTerminated.finally(() => {
        workerTerminationByNumber.delete(workerId512);
      });
      const gracefulCancel = async () => {
        cancelWorker(new Error("Worker cancelled"));
        E.sendOnly(workerDaemonFacet).terminate();
        const cancelWorkerGracePeriod = () => {
          throw new Error("Exited gracefully before grace period elapsed");
        };
        const workerGracePeriodCancelled = Promise.race([
          gracePeriodElapsed,
          workerTerminated
        ]).then(cancelWorkerGracePeriod, cancelWorkerGracePeriod);
        await delay(gracePeriodMs, workerGracePeriodCancelled).then(() => {
          throw new Error(
            `Worker termination grace period ${gracePeriodMs}ms elapsed`
          );
        }).catch(forceCancel);
        await workerTerminated;
      };
      context.onCancel(gracefulCancel);
      const worker = makeExo("EndoWorker", WorkerInterface, {});
      workerDaemonFacets.set(worker, workerDaemonFacet);
      return worker;
    };
    const makeReadableBlob = (sha256) => makeExo(
      `Readable file with SHA-256 ${sha256.slice(0, 8)}...`,
      BlobInterface,
      {
        sha256: () => sha256,
        ...contentStore.fetch(sha256),
        help: makeHelp(blobHelp)
      }
    );
    const makeReadableTree = (sha256) => makeExo("ReadableTree", ReadableTreeInterface2, {
      ...snapshotTreeMethods(contentStore, sha256),
      help: makeHelp(readableTreeHelp)
    });
    const makeEval = async (workerId, source, codeNames, ids, context) => {
      context.thisDiesIfThatDies(workerId);
      for (const id of ids) {
        context.thisDiesIfThatDies(id);
      }
      const worker = await provide(workerId, "worker");
      const workerDaemonFacet = workerDaemonFacets.get(worker);
      assert(workerDaemonFacet, `Cannot evaluate using non-worker`);
      const endowmentValues = await Promise.all(ids.map((id) => provide(id)));
      return E(workerDaemonFacet).evaluate(
        source,
        codeNames,
        endowmentValues,
        context.id,
        context.cancelled
      );
    };
    const makeLookup = async (hubId, path, context) => {
      context.thisDiesIfThatDies(hubId);
      const hub = provide(hubId, "hub");
      return E(hub).lookup(path);
    };
    const makeUnconfined = async (workerId, powersId, specifier, env, context) => {
      context.thisDiesIfThatDies(workerId);
      context.thisDiesIfThatDies(powersId);
      const worker = await provide(workerId, "worker");
      const workerDaemonFacet = workerDaemonFacets.get(worker);
      assert(workerDaemonFacet, "Cannot make unconfined plugin with non-worker");
      const powersP = provide(powersId);
      return E(
        /** @type {any} */
        workerDaemonFacet
      ).makeUnconfined(
        specifier,
        // TODO fix type
        /** @type {any} */
        powersP,
        /** @type {any} */
        makeFarContext(context),
        env
      );
    };
    const makeBundle = async (workerId, powersId, bundleId, env, context) => {
      context.thisDiesIfThatDies(workerId);
      context.thisDiesIfThatDies(powersId);
      const worker = await provide(
        /** @type {FormulaIdentifier} */
        workerId,
        "worker"
      );
      const workerDaemonFacet = workerDaemonFacets.get(worker);
      assert(workerDaemonFacet, "Cannot make caplet with non-worker");
      const readableBundleP = provide(
        /** @type {FormulaIdentifier} */
        bundleId,
        "readable-blob"
      );
      const powersP = provide(
        /** @type {FormulaIdentifier} */
        powersId
      );
      return E(
        /** @type {any} */
        workerDaemonFacet
      ).makeBundle(
        readableBundleP,
        // TODO fix type
        /** @type {any} */
        powersP,
        /** @type {any} */
        makeFarContext(context),
        env
      );
    };
    const mustGetIdForRef = (ref) => {
      const id = idForRef.get(ref);
      if (id === void 0) {
        throw makeError(X3`No corresponding formula for ${ref}`);
      }
      return id;
    };
    const mustGetRefForId = (id) => {
      const ref = refForId.get(id);
      if (ref === void 0) {
        if (formulaForId.get(id) !== void 0) {
          throw makeError(X3`Formula has not produced a ref ${id}`);
        }
        throw makeError(X3`Unknown identifier ${id}`);
      }
      return ref;
    };
    const marshaller = makeMarshal(mustGetIdForRef, mustGetRefForId, {
      serializeBodyFormat: "smallcaps"
    });
    const parsePromiseStatusRecord = (record) => {
      if (record && typeof record === "object") {
        const data = (
          /** @type {any} */
          record
        );
        if (data.status === "fulfilled" && typeof data.valueId === "string") {
          return { status: "fulfilled", valueId: data.valueId };
        }
        if (data.status === "rejected" && typeof data.reason === "string") {
          return { status: "rejected", reason: data.reason };
        }
      }
      throw new Error(`Invalid promise status record ${q5(record)}`);
    };
    const formatRejectionReason = (reason) => {
      if (reason instanceof Error) {
        return reason.message;
      }
      return typeof reason === "string" ? reason : String(reason);
    };
    const makePromise = async (storeId, context) => {
      context.thisDiesIfThatDies(storeId);
      const petStore = await provideStoreController(storeId);
      const { promise, resolve, reject } = makePromiseKit();
      let settled = false;
      const settle = (record) => {
        if (settled) {
          return;
        }
        settled = true;
        if (record.status === "fulfilled") {
          resolve(record.valueId);
        } else {
          reject(harden_default(new Error(record.reason)));
        }
      };
      const settleFromStatusId = async (statusId) => {
        await null;
        const recordValue = await provide(
          /** @type {FormulaIdentifier} */
          statusId
        );
        const record = parsePromiseStatusRecord(recordValue);
        settle(record);
      };
      const existingStatusId = petStore.identifyLocal(PROMISE_STATUS_NAME);
      if (existingStatusId !== void 0) {
        settleFromStatusId(existingStatusId).catch((error) => {
          if (!settled) {
            reject(error);
          }
        });
        return promise;
      }
      const iterator = petStore.followNameChanges();
      const closeIterator = async () => {
        await null;
        if (typeof iterator.return === "function") {
          await iterator.return(void 0);
        }
      };
      context.onCancel(() => closeIterator());
      (async () => {
        await null;
        try {
          for await (const change of iterator) {
            if ("add" in change && change.add === PROMISE_STATUS_NAME) {
              const statusId = petStore.identifyLocal(PROMISE_STATUS_NAME);
              if (statusId !== void 0) {
                await settleFromStatusId(statusId);
                break;
              }
            }
          }
        } catch (error) {
          if (!settled) {
            reject(error);
          }
        } finally {
          await closeIterator();
        }
      })().catch((error) => {
        if (!settled) {
          reject(error);
        }
      });
      return promise;
    };
    const makeResolver = async (storeId, context) => {
      context.thisDiesIfThatDies(storeId);
      const petStore = await provideStoreController(storeId);
      const resolverJobs = makeSerialJobs();
      const writeStatus = async (record) => {
        if (petStore.identifyLocal(PROMISE_STATUS_NAME) !== void 0) {
          return;
        }
        const tasks = makeDeferredTasks();
        const hardenedRecord = harden_default(record);
        const { id } = await formulateMarshalValue(
          hardenedRecord,
          tasks,
          pinTransient
        );
        try {
          await petStore.storeIdentifier(PROMISE_STATUS_NAME, id);
        } finally {
          unpinTransient(id);
        }
      };
      return makeExo("EndoResolver", ResponderInterface, {
        resolveWithId: (idOrPromise) => {
          resolverJobs.enqueue(async () => {
            await null;
            if (petStore.identifyLocal(PROMISE_STATUS_NAME) !== void 0) {
              return;
            }
            try {
              const id = await idOrPromise;
              if (typeof id !== "string") {
                throw new TypeError(
                  `Promise resolution must be a formula identifier (${q5(id)})`
                );
              }
              assertValidId(id);
              await petStore.storeIdentifier(RESOLVED_VALUE_NAME, id);
              await writeStatus({ status: "fulfilled", valueId: id });
            } catch (error) {
              const reason = formatRejectionReason(error);
              await writeStatus({ status: "rejected", reason });
            }
          });
        }
      });
    };
    const makeMailHub = async (storeId, context) => {
      context.thisDiesIfThatDies(storeId);
      const mailboxStore = await provideStoreController(storeId);
      const listMessageNames = () => harden_default(
        mailboxStore.list().filter(isMessageNumberName).sort(compareMessageNames)
      );
      const identifyMessage = (name) => isMessageNumberName(name) ? mailboxStore.identifyLocal(
        /** @type {Name} */
        name
      ) : void 0;
      let mailHub;
      const lookup = (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        const [headName, ...tailNames] = namePath;
        if (tailNames.length === 0) {
          const id = identifyMessage(headName);
          if (id === void 0) {
            throw new TypeError(`Unknown message number: ${q5(headName)}`);
          }
          return provide(
            /** @type {FormulaIdentifier} */
            id,
            "message"
          );
        }
        return tailNames.reduce(
          (directory, petName) => E(directory).lookup(petName),
          lookup(headName)
        );
      };
      const maybeLookup = (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        const [headName, ...tailNames] = namePath;
        const id = identifyMessage(headName);
        if (id === void 0) {
          return void 0;
        }
        const value = provide(
          /** @type {FormulaIdentifier} */
          id,
          "message"
        );
        return tailNames.reduce(
          (directory, petName) => E(directory).lookup(petName),
          value
        );
      };
      const lookupTailNameHub = async (petNamePath) => {
        assertNamePath(petNamePath);
        const tailName = petNamePath[petNamePath.length - 1];
        if (petNamePath.length === 1) {
          return { hub: mailHub, name: tailName };
        }
        const prefixPath = (
          /** @type {NamePath} */
          petNamePath.slice(0, -1)
        );
        const hub = (
          /** @type {NameHub} */
          await lookup(prefixPath)
        );
        return { hub, name: tailName };
      };
      const has = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          return identifyMessage(petNamePath[0]) !== void 0;
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).has(name);
      };
      const identify = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          return identifyMessage(petNamePath[0]);
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).identify(name);
      };
      const locate = async (...petNamePath) => {
        assertNames(petNamePath);
        const id = await identify(...petNamePath);
        if (id === void 0) {
          return void 0;
        }
        const formulaType = await getTypeForId(
          /** @type {FormulaIdentifier} */
          id
        );
        return formatLocator(id, formulaType);
      };
      const reverseLocate = async (locator) => {
        const id = idFromLocator(locator);
        return (
          /** @type {Name[]} */
          mailboxStore.reverseIdentify(id).filter(isMessageNumberName)
        );
      };
      const followLocatorNameChanges = async function* followLocatorNameChanges2(locator) {
        const id = idFromLocator(locator);
        const names = mailboxStore.reverseIdentify(id).filter(isMessageNumberName);
        if (names.length === 0) {
          return void 0;
        }
        yield { add: locator, names };
        return void 0;
      };
      const list = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          return listMessageNames();
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).list();
      };
      const listIdentifiers = async (...petNamePath) => {
        assertNames(petNamePath);
        const names = await list(...petNamePath);
        const identities = /* @__PURE__ */ new Set();
        await Promise.all(
          names.map(async (name) => {
            const id = await identify(...petNamePath, name);
            if (id !== void 0) {
              identities.add(id);
            }
          })
        );
        return harden_default(Array.from(identities).sort());
      };
      const listLocators = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          const names = listMessageNames();
          const record = {};
          await Promise.all(
            names.map(async (name) => {
              const locator = await locate(name);
              if (locator !== void 0) {
                record[name] = locator;
              }
            })
          );
          return harden_default(record);
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).listLocators();
      };
      const followNameChanges = async function* followNameChanges2(...petNamePath) {
        await null;
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          for await (const change of mailboxStore.followNameChanges()) {
            if ("add" in change) {
              if (isMessageNumberName(change.add)) {
                yield change;
              }
            } else if (isMessageNumberName(change.remove)) {
              yield change;
            }
          }
          return void 0;
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        yield* await E(hub).followNameChanges();
        return void 0;
      };
      const reverseLookup = (presence) => {
        const id = getIdForRef(presence);
        if (id === void 0) {
          return harden_default([]);
        }
        return harden_default(
          /** @type {Name[]} */
          mailboxStore.reverseIdentify(id).filter(isMessageNumberName)
        );
      };
      const disallowedMutation = async () => {
        throw new Error("Mailbox directory is read-only");
      };
      const notSupported = async () => {
        throw new Error("Text I/O is not supported on mailbox directories");
      };
      mailHub = makeExo("MailHub", DirectoryInterface2, {
        help: makeHelp(directoryHelp),
        has,
        identify,
        locate,
        reverseLocate,
        followLocatorNameChanges: (locator) => makeIteratorRef2(followLocatorNameChanges(locator)),
        list,
        listIdentifiers,
        listLocators,
        followNameChanges: (...petNamePath) => makeIteratorRef2(followNameChanges(...petNamePath)),
        lookup,
        maybeLookup,
        reverseLookup,
        storeIdentifier: disallowedMutation,
        storeLocator: disallowedMutation,
        remove: disallowedMutation,
        move: disallowedMutation,
        copy: disallowedMutation,
        makeDirectory: disallowedMutation,
        readText: notSupported,
        maybeReadText: notSupported,
        writeText: disallowedMutation
      });
      return mailHub;
    };
    const makeMessageHub = async (messageFormula, context) => {
      const formula = messageFormula;
      const {
        messageType,
        messageId,
        replyTo,
        from,
        to,
        date,
        description,
        promiseId,
        resolverId,
        strings,
        names,
        ids,
        source,
        slots,
        codeNames,
        petNamePaths
      } = formula;
      if (typeof messageId !== "string" || typeof from !== "string" || typeof to !== "string" || typeof date !== "string") {
        throw new Error("Message formula is incomplete");
      }
      assertFormulaNumber(messageId);
      if (replyTo !== void 0) {
        assertFormulaNumber(replyTo);
      }
      const idByName = /* @__PURE__ */ new Map();
      const valueByName = /* @__PURE__ */ new Map();
      const orderedNames = [];
      const registerName = (name, id, value) => {
        if (idByName.has(name) || valueByName.has(name)) {
          throw new Error(`Duplicate message name ${q5(name)}`);
        }
        if (id !== void 0) {
          idByName.set(name, id);
          context.thisDiesIfThatDies(id);
        }
        if (value !== void 0) {
          valueByName.set(name, value);
        }
        orderedNames.push(name);
      };
      registerName(MESSAGE_FROM_NAME, from, void 0);
      registerName(MESSAGE_TO_NAME, to, void 0);
      registerName(MESSAGE_DATE_NAME, void 0, date);
      registerName(MESSAGE_TYPE_NAME, void 0, messageType);
      registerName(MESSAGE_ID_NAME, void 0, messageId);
      if (replyTo !== void 0) {
        registerName(MESSAGE_REPLY_TO_NAME, void 0, replyTo);
      }
      if (messageType === "request") {
        if (typeof description !== "string" || promiseId === void 0 || resolverId === void 0) {
          throw new Error("Request message formula is incomplete");
        }
        registerName(MESSAGE_DESCRIPTION_NAME, void 0, description);
        registerName(MESSAGE_PROMISE_NAME, promiseId, void 0);
        registerName(MESSAGE_RESOLVER_NAME, resolverId, void 0);
      } else if (messageType === "package") {
        if (!Array.isArray(strings) || !Array.isArray(names) || !Array.isArray(ids)) {
          throw new Error("Package message formula is incomplete");
        }
        if (names.length !== ids.length) {
          throw new Error(
            `Message must have one formula identifier (${q5(
              ids.length
            )}) for every edge name (${q5(names.length)})`
          );
        }
        registerName(MESSAGE_STRINGS_NAME, void 0, harden_default(strings));
        names.forEach((name, index) => {
          registerName(name, ids[index], void 0);
        });
      } else if (messageType === "form") {
        if (typeof description !== "string") {
          throw new Error("Form message formula is incomplete");
        }
        registerName(MESSAGE_DESCRIPTION_NAME, void 0, description);
      } else if (messageType === "value") {
        const { valueId } = formula;
        if (valueId === void 0) {
          throw new Error("Value message formula is incomplete");
        }
        registerName("@value", valueId, void 0);
      } else if (messageType === "definition") {
        if (typeof source !== "string" || slots === void 0 || promiseId === void 0 || resolverId === void 0) {
          throw new Error("Definition message formula is incomplete");
        }
        registerName("@source", void 0, source);
        registerName("@slots", void 0, slots);
        registerName(MESSAGE_PROMISE_NAME, promiseId, void 0);
        registerName(MESSAGE_RESOLVER_NAME, resolverId, void 0);
      } else if (messageType === "eval-request") {
        if (typeof source !== "string" || promiseId === void 0 || resolverId === void 0) {
          throw new Error("Eval-request message formula is incomplete");
        }
        registerName("@source", void 0, source);
        if (codeNames !== void 0) {
          registerName("@codeNames", void 0, harden_default(codeNames));
        }
        if (petNamePaths !== void 0) {
          registerName("@petNamePaths", void 0, harden_default(petNamePaths));
        }
        registerName(MESSAGE_PROMISE_NAME, promiseId, void 0);
        registerName(MESSAGE_RESOLVER_NAME, resolverId, void 0);
      } else {
        throw new Error(`Unknown message type ${q5(messageType)}`);
      }
      const lookup = (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        const [headName, ...tailNames] = namePath;
        if (tailNames.length === 0) {
          if (idByName.has(headName)) {
            const id = (
              /** @type {FormulaIdentifier} */
              idByName.get(headName)
            );
            if (headName === MESSAGE_FROM_NAME || headName === MESSAGE_TO_NAME) {
              return provide(id, "handle");
            }
            if (headName === MESSAGE_PROMISE_NAME) {
              return provide(id, "promise");
            }
            if (headName === "@result") {
              return Promise.resolve(provide(id, "promise")).then(
                (resolutionId) => {
                  if (typeof resolutionId === "string") {
                    return provide(
                      /** @type {FormulaIdentifier} */
                      resolutionId
                    );
                  }
                  return resolutionId;
                }
              );
            }
            if (headName === MESSAGE_RESOLVER_NAME) {
              return provide(id, "resolver");
            }
            return provide(id);
          }
          if (valueByName.has(headName)) {
            return Promise.resolve(valueByName.get(headName));
          }
          throw new TypeError(`Unknown message name: ${q5(headName)}`);
        }
        return tailNames.reduce(
          (directory, petName) => E(directory).lookup(petName),
          lookup(headName)
        );
      };
      const maybeLookup = (petNameOrPath) => {
        const namePath = namePathFrom(petNameOrPath);
        const [headName, ...tailNames] = namePath;
        if (tailNames.length === 0) {
          if (!idByName.has(headName) && !valueByName.has(headName)) {
            return void 0;
          }
        }
        return lookup(petNameOrPath);
      };
      let messageHub;
      const lookupTailNameHub = async (petNamePath) => {
        assertNamePath(petNamePath);
        const tailName = petNamePath[petNamePath.length - 1];
        if (petNamePath.length === 1) {
          return { hub: messageHub, name: tailName };
        }
        const prefixPath = (
          /** @type {NamePath} */
          petNamePath.slice(0, -1)
        );
        const hub = (
          /** @type {NameHub} */
          await lookup(prefixPath)
        );
        return { hub, name: tailName };
      };
      const has = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          return idByName.has(petNamePath[0]) || valueByName.has(petNamePath[0]);
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).has(name);
      };
      const identify = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 1) {
          return idByName.get(petNamePath[0]);
        }
        const { hub, name } = await lookupTailNameHub(
          /** @type {NamePath} */
          petNamePath
        );
        return E(hub).identify(name);
      };
      const locate = async (...petNamePath) => {
        assertNames(petNamePath);
        const id = await identify(...petNamePath);
        if (id === void 0) {
          return void 0;
        }
        const formulaType = await getTypeForId(
          /** @type {FormulaIdentifier} */
          id
        );
        return formatLocator(id, formulaType);
      };
      const reverseLocate = async (locator) => {
        const id = idFromLocator(locator);
        return harden_default(
          /** @type {Name[]} */
          orderedNames.filter((name) => idByName.get(name) === id)
        );
      };
      const followLocatorNameChanges = async function* followLocatorNameChanges2(locator) {
        const id = idFromLocator(locator);
        const locatorNames = orderedNames.filter(
          (name) => idByName.get(name) === id
        );
        if (locatorNames.length === 0) {
          return void 0;
        }
        yield { add: locator, names: (
          /** @type {Name[]} */
          locatorNames
        ) };
        return void 0;
      };
      const list = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          return harden_default(
            /** @type {Name[]} */
            [...orderedNames]
          );
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).list();
      };
      const listIdentifiers = async (...petNamePath) => {
        assertNames(petNamePath);
        const listedNames = await list(...petNamePath);
        const identities = /* @__PURE__ */ new Set();
        await Promise.all(
          listedNames.map(async (name) => {
            const id = await identify(...petNamePath, name);
            if (id !== void 0) {
              identities.add(id);
            }
          })
        );
        return harden_default(Array.from(identities).sort());
      };
      const listLocators = async (...petNamePath) => {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          const record = {};
          await Promise.all(
            orderedNames.map(async (name) => {
              const locator = await locate(name);
              if (locator !== void 0) {
                record[name] = locator;
              }
            })
          );
          return harden_default(record);
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        return E(hub).listLocators();
      };
      const followNameChanges = async function* followNameChanges2(...petNamePath) {
        assertNames(petNamePath);
        if (petNamePath.length === 0) {
          for (const name of orderedNames) {
            const id = idByName.get(name);
            if (id !== void 0) {
              yield { add: (
                /** @type {Name} */
                name
              ), value: parseId(id) };
            }
          }
          return void 0;
        }
        const hub = (
          /** @type {NameHub} */
          await lookup(petNamePath)
        );
        yield* await E(hub).followNameChanges();
        return void 0;
      };
      const reverseLookup = (presence) => {
        const id = getIdForRef(presence);
        if (id === void 0) {
          return harden_default([]);
        }
        return harden_default(
          /** @type {Name[]} */
          orderedNames.filter((name) => idByName.get(name) === id)
        );
      };
      const disallowedMutation = async () => {
        throw new Error("Message directory is read-only");
      };
      const notSupported = async () => {
        throw new Error("Text I/O is not supported on message directories");
      };
      messageHub = makeExo("MessageHub", DirectoryInterface2, {
        help: makeHelp(directoryHelp),
        has,
        identify,
        locate,
        reverseLocate,
        followLocatorNameChanges: (locator) => makeIteratorRef2(followLocatorNameChanges(locator)),
        list,
        listIdentifiers,
        listLocators,
        followNameChanges: (...petNamePath) => makeIteratorRef2(followNameChanges(...petNamePath)),
        lookup,
        maybeLookup,
        reverseLookup,
        storeIdentifier: disallowedMutation,
        storeLocator: disallowedMutation,
        remove: disallowedMutation,
        move: disallowedMutation,
        copy: disallowedMutation,
        makeDirectory: disallowedMutation,
        readText: notSupported,
        maybeReadText: notSupported,
        writeText: disallowedMutation
      });
      return messageHub;
    };
    const makers = {
      marshal: async ({ body, slots }) => {
        await Promise.all(slots.map((id) => provide(id)));
        return marshaller.fromCapData({ body, slots });
      },
      eval: ({ worker, source, names, values: values4 }, context) => makeEval(worker, source, names, values4, context),
      keypair: ({ publicKey }) => harden_default({ publicKey }),
      "readable-blob": ({ content }) => makeReadableBlob(content),
      "readable-tree": ({ content }) => makeReadableTree(content),
      mount: async ({ path: mountPath, readOnly }) => {
        const pathExists = await filePowers.exists(mountPath);
        if (!pathExists) {
          throw new Error(`Mount path does not exist: ${q5(mountPath)}`);
        }
        const isDir = await filePowers.isDirectory(mountPath);
        if (!isDir) {
          throw new Error(`Mount path is not a directory: ${q5(mountPath)}`);
        }
        return makeMount({ rootPath: mountPath, readOnly, filePowers });
      },
      "scratch-mount": async ({ readOnly }, _context, _id, formulaNumber) => {
        const rootPath = filePowers.joinPath(
          persistencePowers.statePath,
          "mounts",
          /** @type {string} */
          formulaNumber
        );
        await filePowers.makePath(rootPath);
        return makeMount({ rootPath, readOnly, filePowers });
      },
      lookup: ({ hub, path }, context) => makeLookup(
        hub,
        /** @type {import('./types.js').NamePath} */
        path,
        context
      ),
      worker: (formula, context, _id, formulaNumber) => makeIdentifiedWorker(formulaNumber, context, formula.trustedShims),
      "make-unconfined": ({ worker: workerId, powers: powersId, specifier, env = {} }, context) => makeUnconfined(workerId, powersId, specifier, env, context),
      "make-bundle": ({ worker: workerId, powers: powersId, bundle: bundleId, env = {} }, context) => makeBundle(workerId, powersId, bundleId, env, context),
      host: async (formula, context, id) => {
        const {
          hostHandle: hostHandleId,
          handle: handleId,
          keypair: keypairId,
          petStore: petStoreId,
          mailboxStore: mailboxStoreId,
          mailHub: mailHubId,
          inspector: inspectorId,
          worker: workerId,
          endo: endoId,
          networks: networksId,
          pins: pinsId
        } = formula;
        if (mailHubId === void 0) {
          throw new Error("Host formula missing mail hub");
        }
        const keypairFormula = await getFormulaForId(keypairId);
        const agentNodeNumber = (
          /** @type {NodeNumber} */
          keypairFormula.publicKey
        );
        registerLocalKey(agentNodeNumber);
        const agentPrivateKey = fromHex(
          /** @type {string} */
          keypairFormula.privateKey
        );
        const agentSignBytes = (message) => ed25519Sign(agentPrivateKey, message);
        const agent = await makeHost(
          id,
          handleId,
          hostHandleId,
          keypairId,
          agentNodeNumber,
          agentSignBytes,
          petStoreId,
          mailboxStoreId,
          mailHubId,
          inspectorId,
          workerId,
          endoId,
          networksId,
          pinsId,
          leastAuthorityId,
          platformNames,
          context
        );
        const handle = (
          /** @type {any} */
          agent.handle()
        );
        agentIdForHandle.set(handle, id);
        return agent;
      },
      guest: async (formula, context, id) => {
        const {
          handle: handleId,
          keypair: keypairId,
          hostAgent: hostAgentId,
          hostHandle: hostHandleId,
          petStore: petStoreId,
          mailboxStore: mailboxStoreId,
          mailHub: mailHubId,
          worker: workerId,
          networks: networksDirectoryId
        } = formula;
        if (mailHubId === void 0) {
          throw new Error("Guest formula missing mail hub");
        }
        const keypairFormula = await getFormulaForId(keypairId);
        const agentNodeNumber = (
          /** @type {NodeNumber} */
          keypairFormula.publicKey
        );
        registerLocalKey(agentNodeNumber);
        const agent = await makeGuest(
          id,
          handleId,
          keypairId,
          agentNodeNumber,
          hostAgentId,
          hostHandleId,
          petStoreId,
          mailboxStoreId,
          mailHubId,
          workerId,
          networksDirectoryId,
          context
        );
        const handle = (
          /** @type {any} */
          agent.handle()
        );
        agentIdForHandle.set(handle, id);
        return agent;
      },
      handle: async ({ agent: agentId }, _context, id) => {
        const agent = await provide(agentId, "agent");
        const handle = agent.handle();
        agentIdForHandle.set(handle, agentId);
        return handle;
      },
      endo: async ({
        host: hostId,
        networks: networksId,
        pins: pinsId,
        peers: peersId
      }) => {
        const help = makeHelp(endoHelp);
        const endoBootstrap = makeExo("Endo", EndoInterface, {
          help,
          ping: async () => "pong",
          terminate: async () => {
            cancel(new Error("Termination requested"));
          },
          host: () => provide(hostId, "host"),
          leastAuthority: () => provide(leastAuthorityId, "guest"),
          greeter: async () => localGreeter,
          gateway: async () => localGateway,
          nodeId: () => localNodeNumber,
          sign: async (hexBytes) => toHex(signBytes(fromHex(hexBytes))),
          reviveNetworks: async () => {
            const networksDirectory = await provide(networksId, "directory");
            const networkIds = await networksDirectory.listIdentifiers();
            await Promise.allSettled(
              networkIds.map(
                (id) => provide(
                  /** @type {FormulaIdentifier} */
                  id
                )
              )
            );
          },
          revivePins: async () => {
            const pinsDirectory = await provide(pinsId, "directory");
            const pinIds = await pinsDirectory.listIdentifiers();
            for (const id of pinIds) {
              logLifecycle(
                /** @type {FormulaIdentifier} */
                id,
                "REVIVE_PIN"
              );
            }
            await Promise.allSettled(
              pinIds.map((id) => provide(
                /** @type {FormulaIdentifier} */
                id
              ))
            );
          },
          addPeerInfo: async (peerInfo) => {
            const knownPeers = (
              /** @type {KnownPeersStore} */
              /** @type {unknown} */
              await provideStoreController(peersId)
            );
            const { node: nodeNumber, addresses } = peerInfo;
            assertNodeNumber(nodeNumber);
            if (knownPeers.has(nodeNumber)) {
              const existingPeerId = knownPeers.identifyLocal(nodeNumber);
              if (existingPeerId !== void 0) {
                const existingFormulaId = (
                  /** @type {FormulaIdentifier} */
                  existingPeerId
                );
                const existingFormula = await getFormulaForId(existingFormulaId);
                if (existingFormula.type === "peer" && JSON.stringify(existingFormula.addresses) !== JSON.stringify(addresses)) {
                  console.log(
                    `addPeerInfo: replacing stale peer for node ${nodeNumber.slice(0, 16)}... (old: ${existingFormula.addresses.length} addr, new: ${addresses.length} addr)`
                  );
                  console.log(
                    `addPeerInfo:   old addresses=${JSON.stringify(existingFormula.addresses)} new addresses=${JSON.stringify(addresses)}`
                  );
                  await cancelValue(
                    existingFormulaId,
                    new Error("Peer addresses updated")
                  );
                  await knownPeers.remove(
                    /** @type {PetName} */
                    /** @type {unknown} */
                    nodeNumber
                  );
                  const { id: peerId2 } = (
                    // eslint-disable-next-line no-use-before-define
                    await formulatePeer(networksId, nodeNumber, addresses)
                  );
                  await knownPeers.storeIdentifier(nodeNumber, peerId2);
                  return;
                }
              }
              return;
            }
            console.log(
              `addPeerInfo: new peer for node ${nodeNumber.slice(0, 16)}... with ${addresses.length} address(es)`
            );
            console.log(`addPeerInfo:   addresses=${JSON.stringify(addresses)}`);
            const { id: peerId } = (
              // eslint-disable-next-line no-use-before-define
              await formulatePeer(networksId, nodeNumber, addresses)
            );
            await knownPeers.storeIdentifier(nodeNumber, peerId);
          },
          listKnownPeers: async () => {
            const knownPeers = (
              /** @type {KnownPeersStore} */
              /** @type {unknown} */
              await provideStoreController(peersId)
            );
            const connectionStates = provideRemoteControl.getConnectionStates();
            const nodeNumbers = knownPeers.list();
            const peers = [];
            for (const nodeNumber of nodeNumbers) {
              const peerId = knownPeers.identifyLocal(
                /** @type {NodeNumber} */
                /** @type {unknown} */
                nodeNumber
              );
              if (peerId !== void 0) {
                const formula = await getFormulaForId(
                  /** @type {FormulaIdentifier} */
                  peerId
                );
                if (formula.type === "peer") {
                  const nodeId = (
                    /** @type {PeerFormula} */
                    formula.node
                  );
                  peers.push(
                    harden_default({
                      node: nodeId,
                      addresses: (
                        /** @type {PeerFormula} */
                        formula.addresses
                      ),
                      connectionState: connectionStates[nodeId] || "start"
                    })
                  );
                }
              }
            }
            return harden_default(peers);
          },
          followPeerChanges: async () => {
            const knownPeers = (
              /** @type {KnownPeersStore} */
              /** @type {unknown} */
              await provideStoreController(peersId)
            );
            return knownPeers.followNameChanges();
          }
        });
        return endoBootstrap;
      },
      "loopback-network": () => makeLoopbackNetwork(Promise.resolve(localGateway)),
      "least-authority": () => {
        const disallowedFn = async () => {
          throw new Error("not allowed");
        };
        const disallowedSyncFn = () => {
          throw new Error("not allowed");
        };
        return (
          /** @type {FarRef<EndoGuest>} */
          /** @type {unknown} */
          makeExo("EndoGuest", GuestInterface, {
            help: makeHelp(guestHelp),
            has: disallowedFn,
            identify: disallowedFn,
            reverseIdentify: disallowedSyncFn,
            locate: disallowedFn,
            reverseLocate: disallowedFn,
            followLocatorNameChanges: disallowedFn,
            list: disallowedFn,
            listIdentifiers: disallowedFn,
            listLocators: disallowedFn,
            followNameChanges: disallowedFn,
            lookup: disallowedFn,
            maybeLookup: disallowedSyncFn,
            lookupById: disallowedFn,
            reverseLookup: disallowedFn,
            storeIdentifier: disallowedFn,
            storeLocator: disallowedFn,
            remove: disallowedFn,
            move: disallowedFn,
            copy: disallowedFn,
            makeDirectory: disallowedFn,
            readText: disallowedFn,
            maybeReadText: disallowedFn,
            writeText: disallowedFn,
            handle: disallowedSyncFn,
            listMessages: disallowedFn,
            followMessages: disallowedFn,
            resolve: disallowedFn,
            reject: disallowedFn,
            adopt: disallowedFn,
            dismiss: disallowedFn,
            dismissAll: disallowedFn,
            reply: disallowedFn,
            request: disallowedFn,
            send: disallowedFn,
            requestEvaluation: disallowedFn,
            evaluate: disallowedFn,
            define: disallowedFn,
            form: disallowedFn,
            storeBlob: disallowedFn,
            storeValue: disallowedFn,
            submit: disallowedFn,
            sendValue: disallowedFn,
            deliver: disallowedSyncFn
          })
        );
      },
      "pet-store": async (_formula, _context, _id, formulaNumber) => {
        await null;
        return petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          "pet-store",
          assertPetName
        );
      },
      "mailbox-store": async (_formula, _context, _id, formulaNumber) => {
        await null;
        return petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          "mailbox-store",
          assertMailboxStoreName
        );
      },
      "mail-hub": ({ store: storeId }, context) => makeMailHub(storeId, context),
      message: (formula, context) => makeMessageHub(formula, context),
      promise: ({ store: storeId }, context) => makePromise(storeId, context),
      resolver: ({ store: storeId }, context) => makeResolver(storeId, context),
      "synced-pet-store": async (formula, context, _id, formulaNumber) => {
        await null;
        const store = await petStorePowers.makeIdentifiedSyncedPetStore(
          formulaNumber,
          localNodeNumber,
          formula.role
        );
        const placeholderNumber = "0".repeat(64);
        if (formula.remoteStoreNumber !== placeholderNumber) {
          const peerFormula = (
            /** @type {PeerFormula} */
            await getFormulaForId(formula.peer)
          );
          const remoteStoreId = formatId({
            number: (
              /** @type {FormulaNumber} */
              formula.remoteStoreNumber
            ),
            node: (
              /** @type {NodeNumber} */
              peerFormula.node
            )
          });
          const runSyncLoop = async () => {
            let interval = 5e3;
            const maxInterval = 6e4;
            while (true) {
              try {
                const remoteStore = (
                  /** @type {import('./types.js').SyncedPetStore} */
                  await provide(remoteStoreId)
                );
                const localState = store.getState();
                const localClock = store.getLocalClock();
                const remoteState = await E(remoteStore).getState();
                const remoteClock = await E(remoteStore).getLocalClock();
                await store.mergeRemoteState(remoteState, remoteClock);
                await E(remoteStore).mergeRemoteState(localState, localClock);
                await store.acknowledgeRemoteClock(remoteClock);
                await E(remoteStore).acknowledgeRemoteClock(localClock);
                await store.pruneTombstones();
                await E(remoteStore).pruneTombstones();
                interval = 5e3;
              } catch {
                interval = Math.min(interval * 2, maxInterval);
              }
              try {
                await delay(interval, context.cancelled);
              } catch {
                break;
              }
            }
          };
          runSyncLoop();
        }
        return store;
      },
      "known-peers-store": async (_formula, _context, _id, formulaNumber) => {
        await null;
        return petStorePowers.makeIdentifiedPetStore(
          formulaNumber,
          "known-peers-store",
          assertValidNumber
        );
      },
      "pet-inspector": ({ petStore: petStoreId }) => (
        // Behold, unavoidable forward-reference:
        // eslint-disable-next-line no-use-before-define
        makePetStoreInspector(petStoreId)
      ),
      directory: ({ petStore: petStoreId }, context) => {
        return makeIdentifiedDirectory({
          petStoreId,
          context,
          agentNodeNumber: localNodeNumber,
          isLocalKey
        });
      },
      peer: ({ networks: networksId, node: nodeId, addresses: addressesId }, context) => (
        // Behold, forward reference:
        // eslint-disable-next-line no-use-before-define
        makePeer(networksId, nodeId, addressesId, context)
      ),
      invitation: ({ hostAgent: hostAgentId, hostHandle: hostHandleId, guestName }, _context, id) => (
        // Behold, forward reference:
        // eslint-disable-next-line no-use-before-define
        makeInvitation(
          id,
          hostAgentId,
          hostHandleId,
          /** @type {import('./types.js').PetName} */
          guestName
        )
      ),
      timer: async ({ intervalMs, label: timerLabel }, context) => {
        const interval = Number(intervalMs) || 6e4;
        let tickCount = 0;
        const subscribers = [];
        const runTimer = async () => {
          while (true) {
            try {
              await delay(interval, context.cancelled);
            } catch {
              break;
            }
            tickCount += 1;
            const tick = harden_default({
              tick: tickCount,
              label: timerLabel || "timer",
              timestamp: (/* @__PURE__ */ new Date()).toISOString()
            });
            for (const sub of subscribers) {
              try {
                await E(sub.callback).onTick(tick);
              } catch (err) {
                console.error(
                  `[timer] subscriber error:`,
                  /** @type {Error} */
                  err.message
                );
              }
            }
          }
        };
        runTimer();
        return Far("Timer", {
          __getMethodNames__: () => harden_default([
            "__getMethodNames__",
            "subscribe",
            "getLabel",
            "getInterval",
            "help"
          ]),
          subscribe: (callback) => {
            subscribers.push({ callback, context: "" });
          },
          getLabel: () => timerLabel || "timer",
          getInterval: () => interval,
          help: () => `Timer "${timerLabel || "timer"}" firing every ${interval}ms. Ticks: ${tickCount}`
        });
      },
      channel: async (formula, context, id) => {
        const {
          handle: handleId,
          creatorAgent: creatorAgentId,
          messageStore: messageStoreId,
          memberStore: memberStoreId,
          proposedName: channelProposedName
        } = formula;
        return makeChannelInstance(
          id,
          handleId,
          creatorAgentId,
          messageStoreId,
          memberStoreId,
          channelProposedName,
          context
        );
      }
    };
    const evaluateFormula = async (id, formulaNumber, formula, context) => {
      await null;
      if (Object.hasOwn(makers, formula.type)) {
        const make = makers[formula.type];
        const value = await /** @type {unknown} */
        make(formula, context, id, formulaNumber);
        if (typeof value === "object" && value !== null) {
          idForRef.add(value, id);
          refForId.set(id, value);
        }
        return value;
      } else {
        throw new TypeError(`Invalid formula: ${q5(formula)}`);
      }
    };
    const evaluateFormulaForId = async (id, context) => {
      const { number: formulaNumber, node: formulaNode } = parseId(id);
      const isRemote = formulaNode !== LOCAL_NODE;
      if (isRemote) {
        const peerId = await getPeerIdForNodeIdentifier(formulaNode);
        context.thisDiesIfThatDies(peerId);
        const peer = provide(peerId, "peer");
        return E(peer).provide(id);
      }
      const formula = await getFormulaForId(id);
      logLifecycle(id, "REINCARNATE");
      assertValidFormulaType(formula.type);
      return evaluateFormula(id, formulaNumber, formula, context);
    };
    const formulate = async (formulaNumber, formula) => {
      const id = formatId({
        number: formulaNumber,
        node: LOCAL_NODE
      });
      await persistencePowers.writeFormula(formulaNumber, formula);
      await withFormulaGraphLock(async () => {
        formulaForId.has(id) && assert.Fail`Formula already exists for id ${id}`;
        formulaForId.set(id, formula);
        formulaGraph.onFormulaAdded(id, formula);
      });
      logLifecycle(id, "FORMULATE");
      const { promise, resolve } = (
        /** @type {PromiseKit<unknown>} */
        makePromiseKit()
      );
      const context = makeContext(id);
      promise.catch(context.cancel);
      const controller = harden_default({
        context,
        value: promise
      });
      controllerForId.set(id, controller);
      const valuePromise = evaluateFormula(id, formulaNumber, formula, context);
      resolve(valuePromise);
      return harden_default({
        id,
        value: controller.value
      });
    };
    const provideController = (inputId) => {
      const id = normalizeId(inputId);
      const existingController = controllerForId.get(id);
      if (existingController !== void 0) {
        return existingController;
      }
      const { promise, resolve } = (
        /** @type {PromiseKit<unknown>} */
        makePromiseKit()
      );
      const context = makeContext(id);
      promise.catch(context.cancel);
      const newController = harden_default({
        context,
        value: promise
      });
      controllerForId.set(id, newController);
      resolve(evaluateFormulaForId(id, context));
      return newController;
    };
    const getPeerIdForNodeIdentifier = async (nodeNumber) => {
      if (nodeNumber === localNodeNumber) {
        throw new Error(`Cannot get peer formula identifier for self`);
      }
      const knownPeers = (
        /** @type {KnownPeersStore} */
        /** @type {unknown} */
        await provideStoreController(knownPeersId)
      );
      const peerId = knownPeers.identifyLocal(nodeNumber);
      if (peerId === void 0) {
        throw new Error(`No peer found for node identifier ${q5(nodeNumber)}.`);
      }
      parseId(peerId);
      return (
        /** @type {FormulaIdentifier} */
        peerId
      );
    };
    const cancelValue = async (id, reason) => {
      await formulaGraphJobs.enqueue();
      const controller = provideController(id);
      logLifecycle(id, "CANCEL_REQUEST", reason?.message);
      return controller.context.cancel(reason);
    };
    const formulateReadableBlob = async (readerRef, deferredTasks) => {
      return (
        /** @type {FormulateResult<FarRef<EndoReadable>>} */
        withFormulaGraphLock(async () => {
          await null;
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const contentSha256 = await contentStore.store(
            makeRefReader2(readerRef)
          );
          await deferredTasks.execute({
            readableBlobId: formatId({
              number: formulaNumber,
              node: LOCAL_NODE
            })
          });
          const formula = {
            type: "readable-blob",
            content: contentSha256
          };
          return formulate(formulaNumber, formula);
        })
      );
    };
    const formulateMount = async (mountPath, readOnly, deferredTasks) => {
      return (
        /** @type {FormulateResult<unknown>} */
        withFormulaGraphLock(async () => {
          await null;
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          await deferredTasks.execute({
            mountId: formatId({
              number: formulaNumber,
              node: LOCAL_NODE
            })
          });
          const formula = harden_default({
            type: "mount",
            path: mountPath,
            readOnly
          });
          return formulate(formulaNumber, formula);
        })
      );
    };
    const formulateScratchMount = async (readOnly, deferredTasks) => {
      return (
        /** @type {FormulateResult<unknown>} */
        withFormulaGraphLock(async () => {
          await null;
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          await deferredTasks.execute({
            scratchMountId: formatId({
              number: formulaNumber,
              node: LOCAL_NODE
            })
          });
          const formula = harden_default({
            type: "scratch-mount",
            readOnly
          });
          return formulate(formulaNumber, formula);
        })
      );
    };
    const checkinTree2 = async (remoteTree, deferredTasks) => {
      return (
        /** @type {FormulateResult<unknown>} */
        withFormulaGraphLock(async () => {
          await null;
          const { sha256: treeSha256 } = await checkinTree(
            remoteTree,
            contentStore
          );
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          await deferredTasks.execute({
            readableTreeId: formatId({
              number: formulaNumber,
              node: LOCAL_NODE
            })
          });
          const formula = {
            type: "readable-tree",
            content: treeSha256
          };
          return formulate(formulaNumber, formula);
        })
      );
    };
    const formulateInvitation = async (hostAgentId, hostHandleId, guestName, deferredTasks) => {
      return (
        /** @type {FormulateResult<Invitation>} */
        withFormulaGraphLock(async () => {
          const invitationNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const invitationId = formatId({
            number: invitationNumber,
            node: LOCAL_NODE
          });
          await deferredTasks.execute({
            invitationId
          });
          const formula = {
            type: "invitation",
            hostAgent: hostAgentId,
            hostHandle: hostHandleId,
            guestName
          };
          return formulate(invitationNumber, formula);
        })
      );
    };
    const formulateChannel = async (creatorAgentId, handleId, channelProposedName, deferredTasks) => {
      return (
        /** @type {FormulateResult<import('./types.js').EndoChannel>} */
        withFormulaGraphLock(async () => {
          const channelNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const messageStoreNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const memberStoreNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          await formulateNumberedPetStore(messageStoreNumber);
          await formulateNumberedPetStore(memberStoreNumber);
          const messageStoreId = formatId({
            number: messageStoreNumber,
            node: LOCAL_NODE
          });
          const memberStoreId = formatId({
            number: memberStoreNumber,
            node: LOCAL_NODE
          });
          const channelId = formatId({
            number: channelNumber,
            node: LOCAL_NODE
          });
          await deferredTasks.execute({
            channelId
          });
          const formula = {
            type: "channel",
            handle: handleId,
            creatorAgent: creatorAgentId,
            messageStore: messageStoreId,
            memberStore: memberStoreId,
            proposedName: channelProposedName
          };
          return formulate(channelNumber, formula);
        })
      );
    };
    const formulateTimer = async (intervalMs, label, deferredTasks) => {
      return withFormulaGraphLock(async () => {
        const timerNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        const timerId = formatId({
          number: timerNumber,
          node: LOCAL_NODE
        });
        await deferredTasks.execute({ timerId });
        const formula = harden_default({
          type: "timer",
          intervalMs,
          label
        });
        return formulate(timerNumber, formula);
      });
    };
    const formulateNumberedHandle = async (formulaNumber, agentId) => {
      const formula = {
        type: "handle",
        agent: agentId
      };
      await persistencePowers.writeFormula(formulaNumber, formula);
      const id = formatId({
        number: formulaNumber,
        node: LOCAL_NODE
      });
      await withFormulaGraphLock(async () => {
        formulaForId.set(id, formula);
        formulaGraph.onFormulaAdded(id, formula);
      });
      return id;
    };
    const formulateNumberedPetStore = async (formulaNumber) => {
      const formula = {
        type: "pet-store"
      };
      return (
        /** @type {FormulateResult<PetStore>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateNumberedMailboxStore = async (formulaNumber) => {
      const formula = {
        type: "mailbox-store"
      };
      return (
        /** @type {FormulateResult<PetStore>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateNumberedMailHub = async (formulaNumber, mailboxStoreId) => {
      const formula = {
        type: "mail-hub",
        store: mailboxStoreId
      };
      return (
        /** @type {FormulateResult<NameHub>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateDirectory = async () => {
      return (
        /** @type {FormulateResult<EndoDirectory>} */
        withFormulaGraphLock(async () => {
          const { id: petStoreId } = await formulateNumberedPetStore(
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const formula = {
            type: "directory",
            petStore: petStoreId
          };
          const result = await formulate(formulaNumber, formula);
          pinTransient(result.id);
          return result;
        })
      );
    };
    const formulateDirectoryForStore = async (storeId) => {
      return (
        /** @type {FormulateResult<EndoDirectory>} */
        withFormulaGraphLock(async () => {
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const formula = {
            type: "directory",
            petStore: storeId
          };
          const result = await formulate(formulaNumber, formula);
          pinTransient(result.id);
          return result;
        })
      );
    };
    const formulateSyncedPetStore = async (peerId, role, remoteStoreNumber, storeId) => {
      const formulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const formula = {
        type: "synced-pet-store",
        peer: peerId,
        role,
        remoteStoreNumber,
        store: storeId
      };
      return (
        /** @type {FormulateResult<import('./types.js').SyncedPetStore>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateNumberedWorker = (formulaNumber, trustedShims = void 0) => {
      const formula = {
        type: "worker",
        ...trustedShims && trustedShims.length > 0 ? { trustedShims } : void 0
      };
      return (
        /** @type {FormulateResult<EndoWorker>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateWorker = async (deferredTasks, trustedShims = void 0) => {
      return withFormulaGraphLock(async () => {
        const formulaNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        await deferredTasks.execute({
          workerId: formatId({
            number: formulaNumber,
            node: LOCAL_NODE
          })
        });
        return formulateNumberedWorker(formulaNumber, trustedShims);
      });
    };
    const formulateKeypair = async () => {
      const keypair = await generateEd25519Keypair();
      const publicKeyHex = toHex(keypair.publicKey);
      const privateKeyHex = toHex(keypair.privateKey);
      const keypairFormulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const formula = {
        type: "keypair",
        publicKey: publicKeyHex,
        privateKey: privateKeyHex
      };
      const { id: keypairId } = await formulate(keypairFormulaNumber, formula);
      return { keypairId };
    };
    const formulateHostDependencies = async (specifiedIdentifiers) => {
      const { specifiedWorkerId, ...remainingSpecifiedIdentifiers } = specifiedIdentifiers;
      const pinned = [];
      const pin = (id) => {
        pinTransient(id);
        pinned.push(id);
        return id;
      };
      await null;
      const storeId = pin(
        (await formulateNumberedPetStore(
          /** @type {FormulaNumber} */
          await randomHex256()
        )).id
      );
      const mailboxStoreId = pin(
        (await formulateNumberedMailboxStore(
          /** @type {FormulaNumber} */
          await randomHex256()
        )).id
      );
      const mailHubId = pin(
        (await formulateNumberedMailHub(
          /** @type {FormulaNumber} */
          await randomHex256(),
          mailboxStoreId
        )).id
      );
      const hostFormulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const hostId = formatId({
        number: hostFormulaNumber,
        node: LOCAL_NODE
      });
      const handleId = pin(
        await formulateNumberedHandle(
          /** @type {FormulaNumber} */
          await randomHex256(),
          hostId
        )
      );
      const { keypairId } = await formulateKeypair();
      pin(keypairId);
      const inspectorId = pin(
        (await formulateNumberedPetInspector(
          /** @type {FormulaNumber} */
          await randomHex256(),
          storeId
        )).id
      );
      const workerId = pin(await provideWorkerId(specifiedWorkerId));
      return harden_default({
        ...remainingSpecifiedIdentifiers,
        hostFormulaNumber,
        hostId,
        handleId,
        keypairId,
        hostHandleId: remainingSpecifiedIdentifiers.hostHandleId ?? handleId,
        storeId,
        mailboxStoreId,
        mailHubId,
        inspectorId,
        workerId,
        pinned
      });
    };
    const formulateNumberedHost = (identifiers) => {
      const formula = {
        type: "host",
        hostHandle: identifiers.hostHandleId,
        handle: identifiers.handleId,
        keypair: identifiers.keypairId,
        petStore: identifiers.storeId,
        mailboxStore: identifiers.mailboxStoreId,
        mailHub: identifiers.mailHubId,
        inspector: identifiers.inspectorId,
        worker: identifiers.workerId,
        endo: identifiers.endoId,
        networks: identifiers.networksDirectoryId,
        pins: identifiers.pinsDirectoryId
      };
      return (
        /** @type {FormulateResult<EndoHost>} */
        formulate(identifiers.hostFormulaNumber, formula)
      );
    };
    const formulateHost = async (endoId, networksDirectoryId, pinsDirectoryId, deferredTasks, specifiedWorkerId, hostHandleId) => {
      return withFormulaGraphLock(async () => {
        const identifiers = await formulateHostDependencies({
          endoId,
          networksDirectoryId,
          pinsDirectoryId,
          specifiedWorkerId,
          hostHandleId
        });
        await deferredTasks.execute({
          agentId: identifiers.hostId,
          handleId: identifiers.handleId
        });
        const result = formulateNumberedHost(identifiers);
        for (const id of identifiers.pinned) {
          unpinTransient(id);
        }
        return result;
      });
    };
    const formulateGuestDependencies = async (hostAgentId, hostHandleId) => {
      const pinned = [];
      const pin = (id) => {
        pinTransient(id);
        pinned.push(id);
        return id;
      };
      const guestFormulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const guestId = formatId({
        number: guestFormulaNumber,
        node: LOCAL_NODE
      });
      const handleId = pin(
        await formulateNumberedHandle(
          /** @type {FormulaNumber} */
          await randomHex256(),
          guestId
        )
      );
      const mailboxStoreId = pin(
        (await formulateNumberedMailboxStore(
          /** @type {FormulaNumber} */
          await randomHex256()
        )).id
      );
      const mailHubId = pin(
        (await formulateNumberedMailHub(
          /** @type {FormulaNumber} */
          await randomHex256(),
          mailboxStoreId
        )).id
      );
      const { keypairId } = await formulateKeypair();
      pin(keypairId);
      const storeId = pin(
        (await formulateNumberedPetStore(
          /** @type {FormulaNumber} */
          await randomHex256()
        )).id
      );
      const workerId = pin(
        (await formulateNumberedWorker(
          /** @type {FormulaNumber} */
          await randomHex256()
        )).id
      );
      const networksDirectoryId = pin((await formulateDirectory()).id);
      return harden_default({
        guestFormulaNumber,
        guestId,
        handleId,
        keypairId,
        hostAgentId,
        hostHandleId,
        storeId,
        mailboxStoreId,
        mailHubId,
        workerId,
        networksDirectoryId,
        pinned
      });
    };
    const formulateNumberedGuest = (identifiers) => {
      const formula = {
        type: "guest",
        handle: identifiers.handleId,
        keypair: identifiers.keypairId,
        hostHandle: identifiers.hostHandleId,
        hostAgent: identifiers.hostAgentId,
        petStore: identifiers.storeId,
        mailboxStore: identifiers.mailboxStoreId,
        mailHub: identifiers.mailHubId,
        worker: identifiers.workerId,
        networks: identifiers.networksDirectoryId
      };
      return (
        /** @type {FormulateResult<EndoGuest>} */
        formulate(identifiers.guestFormulaNumber, formula)
      );
    };
    const formulateGuest = async (hostAgentId, hostHandleId, deferredTasks) => {
      return withFormulaGraphLock(async () => {
        const identifiers = await formulateGuestDependencies(
          hostAgentId,
          hostHandleId
        );
        await deferredTasks.execute({
          agentId: identifiers.guestId,
          handleId: identifiers.handleId
        });
        const result = formulateNumberedGuest(identifiers);
        for (const id of identifiers.pinned) {
          unpinTransient(id);
        }
        return result;
      });
    };
    const provideWorkerId = async (specifiedWorkerId, trustedShims = void 0) => {
      await null;
      if (typeof specifiedWorkerId === "string") {
        return specifiedWorkerId;
      }
      const workerFormulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const workerFormulation = await formulateNumberedWorker(
        workerFormulaNumber,
        trustedShims
      );
      return workerFormulation.id;
    };
    async function formulateMarshalValue(value, deferredTasks, pin) {
      return (
        /** @type {FormulateResult<void>} */
        withFormulaGraphLock(async () => {
          const ownFormulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const ownId = formatId({
            number: ownFormulaNumber,
            node: LOCAL_NODE
          });
          if (pin) {
            pin(ownId);
          }
          const identifiers = harden_default({
            marshalId: ownId,
            marshalFormulaNumber: ownFormulaNumber
          });
          await deferredTasks.execute(identifiers);
          const { body, slots } = marshaller.toCapData(value);
          const formula = {
            type: "marshal",
            body,
            slots
          };
          return formulate(ownFormulaNumber, formula);
        })
      );
    }
    const formulatePromise = async (pin) => {
      return withFormulaGraphLock(async () => {
        const storeFormulaNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        const promiseFormulaNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        const resolverFormulaNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        const { id: storeId } = await formulateNumberedPetStore(storeFormulaNumber);
        const promiseFormula = {
          type: "promise",
          store: storeId
        };
        const resolverFormula = {
          type: "resolver",
          store: storeId
        };
        const { id: promiseId } = await formulate(
          promiseFormulaNumber,
          promiseFormula
        );
        if (pin) {
          pin(promiseId);
        }
        const { id: resolverId } = await formulate(
          resolverFormulaNumber,
          resolverFormula
        );
        if (pin) {
          pin(resolverId);
        }
        return harden_default({ promiseId, resolverId });
      });
    };
    const formulateMessage = async (messageFormula, pin) => {
      return withFormulaGraphLock(async () => {
        const formulaNumber = (
          /** @type {FormulaNumber} */
          await randomHex256()
        );
        if (pin) {
          const messageId = formatId({
            number: formulaNumber,
            node: LOCAL_NODE
          });
          pin(messageId);
        }
        return (
          /** @type {FormulateResult<NameHub>} */
          formulate(formulaNumber, messageFormula)
        );
      });
    };
    const formulateEval = async (nameHubId, source, codeNames, endowmentIdsOrPaths, deferredTasks, specifiedWorkerId, pin) => {
      return (
        /** @type {FormulateResult<unknown>} */
        withFormulaGraphLock(async () => {
          const ownFormulaNumber = (
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const ownId = formatId({
            number: ownFormulaNumber,
            node: LOCAL_NODE
          });
          if (pin) {
            pin(ownId);
          }
          const identifiers = harden_default({
            workerId: await provideWorkerId(specifiedWorkerId),
            endowmentIds: await Promise.all(
              endowmentIdsOrPaths.map(async (formulaIdOrPath) => {
                if (typeof formulaIdOrPath === "string") {
                  return formulaIdOrPath;
                }
                await null;
                return (
                  /* eslint-disable no-use-before-define */
                  (await formulateNumberedLookup(
                    /** @type {FormulaNumber} */
                    await randomHex256(),
                    nameHubId,
                    /** @type {NamePath} */
                    formulaIdOrPath
                  )).id
                );
              })
            ),
            evalId: ownId,
            evalFormulaNumber: ownFormulaNumber
          });
          await deferredTasks.execute(identifiers);
          const formula = {
            type: "eval",
            worker: identifiers.workerId,
            source,
            names: codeNames,
            values: identifiers.endowmentIds
          };
          return formulate(identifiers.evalFormulaNumber, formula);
        })
      );
    };
    const formulateNumberedLookup = (formulaNumber, hubId, petNamePath) => {
      const formula = {
        type: "lookup",
        hub: hubId,
        path: petNamePath
      };
      return (
        /** @type {FormulateResult<EndoWorker>} */
        formulate(formulaNumber, formula)
      );
    };
    const providePowersId = async (hostAgentId, hostHandleId, specifiedPowersId) => {
      await null;
      if (typeof specifiedPowersId === "string") {
        return specifiedPowersId;
      }
      const guestFormulationData = await formulateGuestDependencies(
        hostAgentId,
        hostHandleId
      );
      const guestFormulation = await formulateNumberedGuest(guestFormulationData);
      for (const id of guestFormulationData.pinned) {
        unpinTransient(id);
      }
      return guestFormulation.id;
    };
    const formulateCapletDependencies = async (hostAgentId, hostHandleId, deferredTasks, specifiedWorkerId, specifiedPowersId, trustedShims = void 0) => {
      const ownFormulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const identifiers = harden_default({
        powersId: await providePowersId(
          hostAgentId,
          hostHandleId,
          specifiedPowersId
        ),
        capletId: formatId({
          number: ownFormulaNumber,
          node: LOCAL_NODE
        }),
        capletFormulaNumber: ownFormulaNumber,
        workerId: await provideWorkerId(specifiedWorkerId, trustedShims)
      });
      await deferredTasks.execute(identifiers);
      return identifiers;
    };
    const formulateUnconfined = async (hostAgentId, hostHandleId, specifier, deferredTasks, specifiedWorkerId, specifiedPowersId, env = {}, trustedShims = void 0) => {
      return withFormulaGraphLock(async () => {
        const { powersId, capletFormulaNumber, workerId } = await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims
        );
        const formula = {
          type: "make-unconfined",
          worker: workerId,
          powers: powersId,
          specifier,
          env
        };
        return formulate(capletFormulaNumber, formula);
      });
    };
    const formulateBundle = async (hostAgentId, hostHandleId, bundleId, deferredTasks, specifiedWorkerId, specifiedPowersId, env = {}, trustedShims = void 0) => {
      return withFormulaGraphLock(async () => {
        const { powersId, capletFormulaNumber, workerId } = await formulateCapletDependencies(
          hostAgentId,
          hostHandleId,
          deferredTasks,
          specifiedWorkerId,
          specifiedPowersId,
          trustedShims
        );
        const formula = {
          type: "make-bundle",
          worker: workerId,
          powers: powersId,
          bundle: bundleId,
          env
        };
        return formulate(capletFormulaNumber, formula);
      });
    };
    const formulateNumberedPetInspector = (formulaNumber, petStoreId) => {
      const formula = {
        type: "pet-inspector",
        petStore: petStoreId
      };
      return (
        /** @type {FormulateResult<EndoInspector>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulatePeer = async (networksDirectoryId, nodeNumber, addresses) => {
      const formulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const formula = {
        type: "peer",
        networks: networksDirectoryId,
        node: nodeNumber,
        addresses
      };
      return (
        /** @type {FormulateResult<EndoPeer>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateLoopbackNetwork = async () => {
      const formulaNumber = (
        /** @type {FormulaNumber} */
        await randomHex256()
      );
      const formula = {
        type: "loopback-network"
      };
      return (
        /** @type {FormulateResult<EndoNetwork>} */
        formulate(formulaNumber, formula)
      );
    };
    const formulateNetworksDirectory = async () => {
      const { id, value } = await formulateDirectory();
      const { id: loopbackNetworkId } = await formulateLoopbackNetwork();
      const loopbackType = await getTypeForId(loopbackNetworkId);
      const loopbackLocator = externalizeId(
        loopbackNetworkId,
        loopbackType,
        localNodeNumber
      );
      await E(value).storeLocator(
        /** @type {NamePath} */
        ["loop"],
        loopbackLocator
      );
      return { id, value };
    };
    const formulateEndo = async (specifiedFormulaNumber) => {
      return (
        /** @type {FormulateResult<FarRef<EndoBootstrap>>} */
        withFormulaGraphLock(async () => {
          const formulaNumber = (
            /** @type {FormulaNumber} */
            await (specifiedFormulaNumber ?? randomHex256())
          );
          const endoId = formatId({
            number: formulaNumber,
            node: LOCAL_NODE
          });
          const { id: defaultHostWorkerId } = await formulateNumberedWorker(
            /** @type {FormulaNumber} */
            await randomHex256()
          );
          const { id: networksDirectoryId } = await formulateNetworksDirectory();
          const { id: pinsDirectoryId } = await formulateDirectory();
          const { id: defaultHostId } = await formulateNumberedHost(
            await formulateHostDependencies({
              endoId,
              networksDirectoryId,
              pinsDirectoryId,
              specifiedWorkerId: defaultHostWorkerId
            })
          );
          const formula = {
            type: "endo",
            networks: networksDirectoryId,
            pins: pinsDirectoryId,
            peers: knownPeersId,
            host: defaultHostId,
            leastAuthority: leastAuthorityId
          };
          const result = await formulate(formulaNumber, formula);
          formulaGraph.addRoot(result.id);
          return result;
        })
      );
    };
    const getAllNetworks = async (networksDirectoryId) => {
      const networksDirectory = await provide(networksDirectoryId, "directory");
      const networkIds = await networksDirectory.listIdentifiers();
      const readyNetworks = networkIds.map((id) => (
        /** @type {FormulaIdentifier} */
        id
      )).filter((id) => refForId.has(id)).map((id) => (
        /** @type {EndoNetwork} */
        refForId.get(id)
      ));
      return readyNetworks;
    };
    const getAllNetworkAddresses = async (networksDirectoryId) => {
      const networksDirectory = await provide(networksDirectoryId, "directory");
      const networkIds = await networksDirectory.listIdentifiers();
      const readyNetworks = networkIds.map((id) => (
        /** @type {FormulaIdentifier} */
        id
      )).filter((id) => refForId.has(id)).map((id) => (
        /** @type {EndoNetwork} */
        refForId.get(id)
      ));
      const addresses = (await Promise.all(
        readyNetworks.map(async (network) => {
          return E(network).addresses();
        })
      )).flat();
      return addresses;
    };
    const makePeer = async (networksDirectoryId, nodeId, addresses, context) => {
      console.log(
        `Endo daemon dialing peer node ${nodeId.slice(0, 8)} at ${JSON.stringify(addresses)}`
      );
      const remoteControl = provideRemoteControl(nodeId);
      return remoteControl.connect(
        async () => {
          const networks = await getAllNetworks(networksDirectoryId);
          console.log(
            `Endo daemon makePeer ${nodeId.slice(0, 8)}: evaluating ${addresses.length} address(es) across ${networks.length} network service(s)`
          );
          let addressIndex = 0;
          for (const address of addresses) {
            addressIndex += 1;
            const { protocol } = new URL(address);
            console.log(
              `Endo daemon makePeer ${nodeId.slice(0, 8)}: address ${addressIndex}/${addresses.length} protocol=${protocol} value=${address}`
            );
            let networkIndex = 0;
            for (const network of networks) {
              networkIndex += 1;
              const supported = await E(network).supports(protocol);
              console.log(
                `Endo daemon makePeer ${nodeId.slice(0, 8)}: network ${networkIndex}/${networks.length} supports(${protocol}) -> ${supported}`
              );
              if (supported) {
                const attemptStartedAt = Date.now();
                console.log(
                  `Endo daemon makePeer ${nodeId.slice(0, 8)}: dialing with network ${networkIndex}/${networks.length}`
                );
                try {
                  const remoteGateway = await E(network).connect(
                    address,
                    makeFarContext(context)
                  );
                  console.log(
                    `Endo daemon makePeer ${nodeId.slice(0, 8)}: dial succeeded in ${Date.now() - attemptStartedAt}ms`
                  );
                  return remoteGateway;
                } catch (error) {
                  console.log(
                    `Endo daemon makePeer ${nodeId.slice(0, 8)}: dial failed in ${Date.now() - attemptStartedAt}ms: ${/** @type {Error} */
                    error.message}`
                  );
                  throw error;
                }
              }
            }
          }
          throw new Error("Cannot connect to peer: no supported addresses");
        },
        context.cancel,
        context.cancelled,
        () => {
          console.log(
            `Endo daemon peer node ${nodeId.slice(0, 8)} connection disposed`
          );
          dropLiveValue(context.id);
        }
      );
    };
    const makeInvitation = async (id, hostAgentId, hostHandleId, guestName) => {
      const hostAgent = (
        /** @type {EndoHost} */
        await provide(hostAgentId)
      );
      const locate = async () => {
        const { node, addresses } = await hostAgent.getPeerInfo();
        const { number: hostHandleNumber } = parseId(hostHandleId);
        const { number } = parseId(id);
        const url = new URL("endo://");
        url.hostname = node;
        url.searchParams.set("id", number);
        url.searchParams.set("type", "invitation");
        url.searchParams.set("from", hostHandleNumber);
        for (const address of addresses) {
          url.searchParams.append("at", address);
        }
        return url.href;
      };
      const accept = async (guestHandleLocator, hostNameFromGuest) => {
        const url = new URL(guestHandleLocator);
        const guestHandleNumber = url.searchParams.get("id");
        const addresses = url.searchParams.getAll("at");
        const guestNodeNumber = url.hostname;
        if (!guestHandleNumber) {
          throw makeError('Handle locator must have an "id" parameter');
        }
        assertNodeNumber(guestNodeNumber);
        assertFormulaNumber(guestHandleNumber);
        const guestHandleId = formatId({
          node: guestNodeNumber,
          number: guestHandleNumber
        });
        const peerInfo = {
          node: guestNodeNumber,
          addresses
        };
        await hostAgent.addPeerInfo(peerInfo);
        await withFormulaGraphLock();
        const controller = provideController(id);
        await controller.context.cancel(new Error("Invitation accepted"));
        const peerId = await getPeerIdForNodeIdentifier(
          /** @type {NodeNumber} */
          guestNodeNumber
        );
        const { id: syncedStoreId, value: syncedStoreValue } = await formulateSyncedPetStore(
          peerId,
          "grantor",
          // Placeholder: the guest will create its own store and we
          // don't know the number yet. The guest sends back its store
          // number on the next sync.
          /** @type {FormulaNumber} */
          "0".repeat(64),
          peerId
          // store dependency (peer keeps alive)
        );
        const guestHandleLocatorStr = formatLocator(guestHandleId, "remote");
        await E(syncedStoreValue).storeLocator(
          /** @type {PetName} */
          guestName,
          guestHandleLocatorStr
        );
        if (hostNameFromGuest) {
          const { node: hostNodeNumber } = await hostAgent.getPeerInfo();
          const { number: hostHandleNumber } = parseId(hostHandleId);
          const hostHandleExternalId = formatId({
            number: hostHandleNumber,
            node: (
              /** @type {NodeNumber} */
              hostNodeNumber
            )
          });
          const hostHandleLocatorStr = formatLocator(
            hostHandleExternalId,
            "handle"
          );
          await E(syncedStoreValue).storeLocator(
            /** @type {PetName} */
            hostNameFromGuest,
            hostHandleLocatorStr
          );
        }
        const { id: syncedDirectoryId } = await formulateDirectoryForStore(syncedStoreId);
        await E(hostAgent).storeIdentifier(
          /** @type {NamePath} */
          [guestName],
          syncedDirectoryId
        );
        const { number: syncedStoreNumber } = parseId(syncedStoreId);
        return harden_default({ syncedStoreNumber });
      };
      return makeExo("Invitation", InvitationInterface, { accept, locate });
    };
    const makeContext = makeContextMaker({
      controllerForId,
      provideController,
      getFormulaType: (id) => formulaForId.get(id)?.type
    });
    const { makeIdentifiedDirectory, makeDirectoryNode } = makeDirectoryMaker({
      provide,
      provideStoreController,
      getIdForRef,
      getTypeForId,
      formulateDirectory,
      formulateReadableBlob,
      pinTransient,
      unpinTransient
    });
    const makeMailbox = makeMailboxMaker({
      provide,
      formulateMarshalValue,
      formulatePromise,
      formulateMessage,
      getFormulaForId,
      getTypeForId,
      randomHex256,
      pinTransient,
      unpinTransient
    });
    const persistValue = async (value) => {
      const tasks = makeDeferredTasks();
      const { id } = await formulateMarshalValue(value, tasks, pinTransient);
      return id;
    };
    const makeChannelInstance = makeChannelMaker({
      provide,
      provideStoreController,
      persistValue,
      randomHex256
    });
    const makeGuest = makeGuestMaker({
      provide,
      provideStoreController,
      formulateEval,
      formulateReadableBlob,
      formulateMarshalValue,
      getFormulaForId,
      getAllNetworkAddresses,
      makeMailbox,
      makeDirectoryNode,
      isLocalKey,
      collectIfDirty,
      pinTransient,
      unpinTransient
    });
    const getAgentIdForHandleId = async (handleId) => {
      const handle = await provide(handleId, "handle");
      const agentId = agentIdForHandle.get(handle);
      if (agentId === void 0) {
        throw makeError(X3`No agent found for handle ${q5(handleId)}`);
      }
      return agentId;
    };
    const getFormulaGraphSnapshot = async (seedIds) => {
      const visited = /* @__PURE__ */ new Set();
      const queue = [...seedIds.filter(isLocalId)];
      while (queue.length > 0) {
        const id = (
          /** @type {FormulaIdentifier} */
          queue.shift()
        );
        if (!visited.has(id)) {
          visited.add(id);
          const deps = formulaGraph.formulaDeps.get(id);
          if (deps) {
            for (const dep of deps) {
              if (!visited.has(dep)) {
                queue.push(dep);
              }
            }
          }
        }
      }
      const snapshotNodes = [];
      const graphEdges = [];
      for (const id of visited) {
        const formula = formulaForId.get(id);
        snapshotNodes.push({ id, type: formula ? formula.type : "unknown" });
        if (formula) {
          for (const [label, dep] of extractLabeledDeps(formula)) {
            if (dep && visited.has(dep)) {
              graphEdges.push({ sourceId: id, targetId: dep, label });
            }
          }
        }
      }
      return harden_default({ nodes: snapshotNodes, edges: graphEdges });
    };
    const makeHost = makeHostMaker({
      provide,
      provideStoreController,
      cancelValue,
      formulateWorker,
      formulateHost,
      formulateGuest,
      formulateMarshalValue,
      formulateEval,
      formulateUnconfined,
      formulateBundle,
      formulateReadableBlob,
      checkinTree: checkinTree2,
      formulateMount,
      formulateScratchMount,
      formulateInvitation,
      formulateSyncedPetStore,
      formulateDirectoryForStore,
      getPeerIdForNodeIdentifier,
      getAllNetworkAddresses,
      getTypeForId,
      getFormulaForId,
      formulateChannel,
      formulateTimer,
      makeMailbox,
      makeDirectoryNode,
      localNodeNumber,
      isLocalKey,
      getAgentIdForHandleId,
      collectIfDirty,
      pinTransient,
      unpinTransient,
      getFormulaGraphSnapshot
    });
    const makePetStoreInspector = async (petStoreId) => {
      const petStore = await provideStoreController(petStoreId);
      const lookup = async (petNameOrPath) => {
        let petName;
        if (Array.isArray(petNameOrPath)) {
          if (petNameOrPath.length !== 1) {
            throw Error(
              "PetStoreInspector.lookup(path) requires path length of 1"
            );
          }
          petName = petNameOrPath[0];
        } else {
          petName = petNameOrPath;
        }
        assertName(petName);
        const id = (
          /** @type {FormulaIdentifier | undefined} */
          petStore.identifyLocal(petName)
        );
        if (id === void 0) {
          throw new Error(`Unknown pet name ${petName}`);
        }
        const { number: formulaNumber } = parseId(id);
        const formula = await getFormulaForId(id);
        if (!["eval", "lookup", "make-unconfined", "make-bundle", "guest"].includes(
          formula.type
        )) {
          return makeInspector(formula.type, formulaNumber, harden_default({}));
        }
        if (formula.type === "eval") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              endowments: Object.fromEntries(
                formula.names.map((name, index) => {
                  return [name, provide(formula.values[index])];
                })
              ),
              source: formula.source,
              worker: provide(formula.worker, "worker")
            })
          );
        } else if (formula.type === "lookup") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              hub: provide(formula.hub, "hub"),
              path: formula.path
            })
          );
        } else if (formula.type === "guest") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              hostAgent: provide(formula.hostAgent, "host"),
              hostHandle: provide(formula.hostHandle, "handle")
            })
          );
        } else if (formula.type === "make-bundle") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              bundle: provide(formula.bundle, "readable-blob"),
              powers: provide(formula.powers),
              worker: provide(formula.worker, "worker")
            })
          );
        } else if (formula.type === "make-unconfined") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              powers: provide(formula.powers),
              specifier: formula.type,
              worker: provide(formula.worker, "worker")
            })
          );
        } else if (formula.type === "peer") {
          return makeInspector(
            formula.type,
            formulaNumber,
            harden_default({
              NODE: formula.node,
              ADDRESSES: formula.addresses
            })
          );
        }
        return makeInspector(formula.type, formulaNumber, harden_default({}));
      };
      const list = () => petStore.list();
      const info = makeExo("EndoInspectorHub", InspectorHubInterface, {
        lookup,
        list
      });
      return info;
    };
    await seedFormulaGraphFromPersistence();
    if (typeof process !== "undefined" && process.env.ENDO_FORMULA_GRAPH) {
      console.log("Formula graph after persistence seed:");
      for (const [id, formula] of formulaForId.entries()) {
        const deps = formulaGraph.formulaDeps.get(id);
        const depList = deps ? [...deps].map((d) => d.slice(0, 12)).join(", ") : "none";
        const isRoot = formulaGraph.roots.has(id);
        console.log(
          `  ${id.slice(0, 12)} ${formula.type}${isRoot ? " [ROOT]" : ""} deps=[${depList}]`
        );
      }
    }
    return {
      formulateEndo,
      provide,
      nodeNumber: localNodeNumber,
      capTpConnectionRegistrar
    };
  };
  var provideEndoBootstrap = async (powers, { cancel, gracePeriodMs, gracePeriodElapsed, specials, gcEnabled }) => {
    const { persistence: persistencePowers } = powers;
    const { rootNonce: endoFormulaNumber, isNewlyCreated } = await persistencePowers.provideRootNonce();
    const { keypair: rootKeypair } = await persistencePowers.provideRootKeypair();
    const localNodeNumber = (
      /** @type {NodeNumber} */
      toHex(rootKeypair.publicKey)
    );
    const daemonCore = await makeDaemonCore(powers, endoFormulaNumber, {
      cancel,
      gracePeriodMs,
      gracePeriodElapsed,
      specials,
      localNodeNumber,
      signBytes: rootKeypair.sign,
      gcEnabled
    });
    const { capTpConnectionRegistrar } = daemonCore;
    const isInitialized = !isNewlyCreated;
    if (isInitialized) {
      const endoId = formatId({
        number: endoFormulaNumber,
        node: daemonCore.nodeNumber
      });
      const endoBootstrap = (
        /** @type {FarRef<EndoBootstrap>} */
        await daemonCore.provide(endoId)
      );
      return { endoBootstrap, capTpConnectionRegistrar };
    } else {
      const { value: endoBootstrap } = await daemonCore.formulateEndo(endoFormulaNumber);
      return { endoBootstrap, capTpConnectionRegistrar };
    }
  };
  var makeDaemon = async (powers, daemonLabel, cancel, cancelled, specials = {}, options = {}) => {
    const { gcEnabled } = options;
    const { promise: gracePeriodCancelled, reject: cancelGracePeriod } = (
      /** @type {PromiseKit<never>} */
      makePromiseKit()
    );
    const gracePeriodMs = 2e3;
    const gracePeriodElapsed = cancelled.catch(async (error) => {
      await delay(gracePeriodMs, gracePeriodCancelled);
      console.log(
        `Endo daemon grace period ${gracePeriodMs}ms elapsed for ${daemonLabel}`
      );
      throw error;
    });
    const { endoBootstrap, capTpConnectionRegistrar } = await provideEndoBootstrap(powers, {
      cancel,
      gracePeriodMs,
      gracePeriodElapsed,
      specials,
      gcEnabled
    });
    await Promise.allSettled([
      E(endoBootstrap).reviveNetworks(),
      E(endoBootstrap).revivePins()
    ]);
    return { endoBootstrap, cancelGracePeriod, capTpConnectionRegistrar };
  };
  return __toCommonJS(sel4_entry_exports);
})();
