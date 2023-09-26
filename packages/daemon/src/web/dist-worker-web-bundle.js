'use strict';
(() => {
  const functors = [
// === functors[0] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /* global process */
globalThis.process=  {
  // version is less than 10.12.0 for fs.mkdir recursive polyfill
  version: '0.0.0',
  env: {},
  cwd: ()=>  '/',
  // ignore handlers
  on: (event, handler)=>  {
    console.warn( `something attempted to set event "${event}" on process`,handler);
   },
  once: (event, handler)=>  {
    console.warn( `something attempted to set event "${event}" on process`,handler);
   }};
})()
,
// === functors[1] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /* global globalThis */
/* eslint-disable no-restricted-globals */

/**
 * commons.js
 * Declare shorthand functions. Sharing these declarations across modules
 * improves on consistency and minification. Unused declarations are
 * dropped by the tree shaking process.
 *
 * We capture these, not just for brevity, but for security. If any code
 * modifies Object to change what 'assign' points to, the Compartment shim
 * would be corrupted.
 */

// We cannot use globalThis as the local name since it would capture the
// lexical name.
const universalThis=  globalThis;$h‍_once.universalThis(universalThis);


const        {
  Array,
  Date,
  FinalizationRegistry,
  Float32Array,
  JSON,
  Map,
  Math,
  Number,
  Object,
  Promise,
  Proxy,
  Reflect,
  RegExp: FERAL_REG_EXP,
  Set,
  String,
  Symbol,
  WeakMap,
  WeakSet}=
    globalThis;$h‍_once.Array(Array);$h‍_once.Date(Date);$h‍_once.FinalizationRegistry(FinalizationRegistry);$h‍_once.Float32Array(Float32Array);$h‍_once.JSON(JSON);$h‍_once.Map(Map);$h‍_once.Math(Math);$h‍_once.Number(Number);$h‍_once.Object(Object);$h‍_once.Promise(Promise);$h‍_once.Proxy(Proxy);$h‍_once.Reflect(Reflect);$h‍_once.FERAL_REG_EXP(FERAL_REG_EXP);$h‍_once.Set(Set);$h‍_once.String(String);$h‍_once.Symbol(Symbol);$h‍_once.WeakMap(WeakMap);$h‍_once.WeakSet(WeakSet);

const        {
  // The feral Error constructor is safe for internal use, but must not be
  // revealed to post-lockdown code in any compartment including the start
  // compartment since in V8 at least it bears stack inspection capabilities.
  Error: FERAL_ERROR,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError}=
    globalThis;$h‍_once.FERAL_ERROR(FERAL_ERROR);$h‍_once.RangeError(RangeError);$h‍_once.ReferenceError(ReferenceError);$h‍_once.SyntaxError(SyntaxError);$h‍_once.TypeError(TypeError);

const        {
  assign,
  create,
  defineProperties,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  getOwnPropertyNames,
  getPrototypeOf,
  is,
  isFrozen,
  isSealed,
  isExtensible,
  keys,
  prototype: objectPrototype,
  seal,
  preventExtensions,
  setPrototypeOf,
  values,
  fromEntries}=
    Object;$h‍_once.assign(assign);$h‍_once.create(create);$h‍_once.defineProperties(defineProperties);$h‍_once.entries(entries);$h‍_once.freeze(freeze);$h‍_once.getOwnPropertyDescriptor(getOwnPropertyDescriptor);$h‍_once.getOwnPropertyDescriptors(getOwnPropertyDescriptors);$h‍_once.getOwnPropertyNames(getOwnPropertyNames);$h‍_once.getPrototypeOf(getPrototypeOf);$h‍_once.is(is);$h‍_once.isFrozen(isFrozen);$h‍_once.isSealed(isSealed);$h‍_once.isExtensible(isExtensible);$h‍_once.keys(keys);$h‍_once.objectPrototype(objectPrototype);$h‍_once.seal(seal);$h‍_once.preventExtensions(preventExtensions);$h‍_once.setPrototypeOf(setPrototypeOf);$h‍_once.values(values);$h‍_once.fromEntries(fromEntries);

const        {
  species: speciesSymbol,
  toStringTag: toStringTagSymbol,
  iterator: iteratorSymbol,
  matchAll: matchAllSymbol,
  unscopables: unscopablesSymbol,
  keyFor: symbolKeyFor,
  for: symbolFor}=
    Symbol;$h‍_once.speciesSymbol(speciesSymbol);$h‍_once.toStringTagSymbol(toStringTagSymbol);$h‍_once.iteratorSymbol(iteratorSymbol);$h‍_once.matchAllSymbol(matchAllSymbol);$h‍_once.unscopablesSymbol(unscopablesSymbol);$h‍_once.symbolKeyFor(symbolKeyFor);$h‍_once.symbolFor(symbolFor);

const        { isInteger}=   Number;$h‍_once.isInteger(isInteger);

const        { stringify: stringifyJson}=   JSON;

// Needed only for the Safari bug workaround below
$h‍_once.stringifyJson(stringifyJson);const{defineProperty:originalDefineProperty}=Object;

const        defineProperty=  (object, prop, descriptor)=>  {
  // We used to do the following, until we had to reopen Safari bug
  // https://bugs.webkit.org/show_bug.cgi?id=222538#c17
  // Once this is fixed, we may restore it.
  // // Object.defineProperty is allowed to fail silently so we use
  // // Object.defineProperties instead.
  // return defineProperties(object, { [prop]: descriptor });

  // Instead, to workaround the Safari bug
  const result=  originalDefineProperty(object, prop, descriptor);
  if( result!==  object) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DEFINE_PROPERTY_FAILED_SILENTLY.md
    throw TypeError(
       `Please report that the original defineProperty silently failed to set ${stringifyJson(
        String(prop))
        }. (SES_DEFINE_PROPERTY_FAILED_SILENTLY)`);

   }
  return result;
 };$h‍_once.defineProperty(defineProperty);

const        {
  apply,
  construct,
  get: reflectGet,
  getOwnPropertyDescriptor: reflectGetOwnPropertyDescriptor,
  has: reflectHas,
  isExtensible: reflectIsExtensible,
  ownKeys,
  preventExtensions: reflectPreventExtensions,
  set: reflectSet}=
    Reflect;$h‍_once.apply(apply);$h‍_once.construct(construct);$h‍_once.reflectGet(reflectGet);$h‍_once.reflectGetOwnPropertyDescriptor(reflectGetOwnPropertyDescriptor);$h‍_once.reflectHas(reflectHas);$h‍_once.reflectIsExtensible(reflectIsExtensible);$h‍_once.ownKeys(ownKeys);$h‍_once.reflectPreventExtensions(reflectPreventExtensions);$h‍_once.reflectSet(reflectSet);

const        { isArray, prototype: arrayPrototype}=   Array;$h‍_once.isArray(isArray);$h‍_once.arrayPrototype(arrayPrototype);
const        { prototype: mapPrototype}=   Map;$h‍_once.mapPrototype(mapPrototype);
const        { revocable: proxyRevocable}=   Proxy;$h‍_once.proxyRevocable(proxyRevocable);
const        { prototype: regexpPrototype}=   RegExp;$h‍_once.regexpPrototype(regexpPrototype);
const        { prototype: setPrototype}=   Set;$h‍_once.setPrototype(setPrototype);
const        { prototype: stringPrototype}=   String;$h‍_once.stringPrototype(stringPrototype);
const        { prototype: weakmapPrototype}=   WeakMap;$h‍_once.weakmapPrototype(weakmapPrototype);
const        { prototype: weaksetPrototype}=   WeakSet;$h‍_once.weaksetPrototype(weaksetPrototype);
const        { prototype: functionPrototype}=   Function;$h‍_once.functionPrototype(functionPrototype);
const        { prototype: promisePrototype}=   Promise;$h‍_once.promisePrototype(promisePrototype);

const        typedArrayPrototype=  getPrototypeOf(Uint8Array.prototype);$h‍_once.typedArrayPrototype(typedArrayPrototype);

const { bind}=   functionPrototype;

/**
 * uncurryThis()
 * Equivalent of: fn => (thisArg, ...args) => apply(fn, thisArg, args)
 *
 * See those reference for a complete explanation:
 * http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 * which only lives at
 * http://web.archive.org/web/20160805225710/http://wiki.ecmascript.org/doku.php?id=conventions:safe_meta_programming
 *
 * @type {<F extends (this: any, ...args: any[]) => any>(fn: F) => ((thisArg: ThisParameterType<F>, ...args: Parameters<F>) => ReturnType<F>)}
 */
const        uncurryThis=  bind.bind(bind.call); // eslint-disable-line @endo/no-polymorphic-call
$h‍_once.uncurryThis(uncurryThis);
const        objectHasOwnProperty=  uncurryThis(objectPrototype.hasOwnProperty);
//
$h‍_once.objectHasOwnProperty(objectHasOwnProperty);const arrayFilter=uncurryThis(arrayPrototype.filter);$h‍_once.arrayFilter(arrayFilter);
const        arrayForEach=  uncurryThis(arrayPrototype.forEach);$h‍_once.arrayForEach(arrayForEach);
const        arrayIncludes=  uncurryThis(arrayPrototype.includes);$h‍_once.arrayIncludes(arrayIncludes);
const        arrayJoin=  uncurryThis(arrayPrototype.join);
/** @type {<T, U>(thisArg: readonly T[], callbackfn: (value: T, index: number, array: T[]) => U, cbThisArg?: any) => U[]} */$h‍_once.arrayJoin(arrayJoin);
const        arrayMap=  /** @type {any} */  uncurryThis(arrayPrototype.map);$h‍_once.arrayMap(arrayMap);
const        arrayPop=  uncurryThis(arrayPrototype.pop);
/** @type {<T>(thisArg: T[], ...items: T[]) => number} */$h‍_once.arrayPop(arrayPop);
const        arrayPush=  uncurryThis(arrayPrototype.push);$h‍_once.arrayPush(arrayPush);
const        arraySlice=  uncurryThis(arrayPrototype.slice);$h‍_once.arraySlice(arraySlice);
const        arraySome=  uncurryThis(arrayPrototype.some);$h‍_once.arraySome(arraySome);
const        arraySort=  uncurryThis(arrayPrototype.sort);$h‍_once.arraySort(arraySort);
const        iterateArray=  uncurryThis(arrayPrototype[iteratorSymbol]);
//
$h‍_once.iterateArray(iterateArray);const mapSet=uncurryThis(mapPrototype.set);$h‍_once.mapSet(mapSet);
const        mapGet=  uncurryThis(mapPrototype.get);$h‍_once.mapGet(mapGet);
const        mapHas=  uncurryThis(mapPrototype.has);$h‍_once.mapHas(mapHas);
const        mapDelete=  uncurryThis(mapPrototype.delete);$h‍_once.mapDelete(mapDelete);
const        mapEntries=  uncurryThis(mapPrototype.entries);$h‍_once.mapEntries(mapEntries);
const        iterateMap=  uncurryThis(mapPrototype[iteratorSymbol]);
//
$h‍_once.iterateMap(iterateMap);const setAdd=uncurryThis(setPrototype.add);$h‍_once.setAdd(setAdd);
const        setDelete=  uncurryThis(setPrototype.delete);$h‍_once.setDelete(setDelete);
const        setForEach=  uncurryThis(setPrototype.forEach);$h‍_once.setForEach(setForEach);
const        setHas=  uncurryThis(setPrototype.has);$h‍_once.setHas(setHas);
const        iterateSet=  uncurryThis(setPrototype[iteratorSymbol]);
//
$h‍_once.iterateSet(iterateSet);const regexpTest=uncurryThis(regexpPrototype.test);$h‍_once.regexpTest(regexpTest);
const        regexpExec=  uncurryThis(regexpPrototype.exec);$h‍_once.regexpExec(regexpExec);
const        matchAllRegExp=  uncurryThis(regexpPrototype[matchAllSymbol]);
//
$h‍_once.matchAllRegExp(matchAllRegExp);const stringEndsWith=uncurryThis(stringPrototype.endsWith);$h‍_once.stringEndsWith(stringEndsWith);
const        stringIncludes=  uncurryThis(stringPrototype.includes);$h‍_once.stringIncludes(stringIncludes);
const        stringIndexOf=  uncurryThis(stringPrototype.indexOf);$h‍_once.stringIndexOf(stringIndexOf);
const        stringMatch=  uncurryThis(stringPrototype.match);
/**
 * @type { &
 *   ((thisArg: string, searchValue: { [Symbol.replace](string: string, replaceValue: string): string; }, replaceValue: string) => string) &
 *   ((thisArg: string, searchValue: { [Symbol.replace](string: string, replacer: (substring: string, ...args: any[]) => string): string; }, replacer: (substring: string, ...args: any[]) => string) => string)
 * }
 */$h‍_once.stringMatch(stringMatch);
const        stringReplace=  /** @type {any} */
  uncurryThis(stringPrototype.replace);$h‍_once.stringReplace(stringReplace);

const        stringSearch=  uncurryThis(stringPrototype.search);$h‍_once.stringSearch(stringSearch);
const        stringSlice=  uncurryThis(stringPrototype.slice);
/** @type {(thisArg: string, splitter: string | RegExp | { [Symbol.split](string: string, limit?: number): string[]; }, limit?: number) => string[]} */$h‍_once.stringSlice(stringSlice);
const        stringSplit=  uncurryThis(stringPrototype.split);$h‍_once.stringSplit(stringSplit);
const        stringStartsWith=  uncurryThis(stringPrototype.startsWith);$h‍_once.stringStartsWith(stringStartsWith);
const        iterateString=  uncurryThis(stringPrototype[iteratorSymbol]);
//
$h‍_once.iterateString(iterateString);const weakmapDelete=uncurryThis(weakmapPrototype.delete);
/** @type {<K extends {}, V>(thisArg: WeakMap<K, V>, ...args: Parameters<WeakMap<K,V>['get']>) => ReturnType<WeakMap<K,V>['get']>} */$h‍_once.weakmapDelete(weakmapDelete);
const        weakmapGet=  uncurryThis(weakmapPrototype.get);$h‍_once.weakmapGet(weakmapGet);
const        weakmapHas=  uncurryThis(weakmapPrototype.has);$h‍_once.weakmapHas(weakmapHas);
const        weakmapSet=  uncurryThis(weakmapPrototype.set);
//
$h‍_once.weakmapSet(weakmapSet);const weaksetAdd=uncurryThis(weaksetPrototype.add);$h‍_once.weaksetAdd(weaksetAdd);
const        weaksetHas=  uncurryThis(weaksetPrototype.has);
//
$h‍_once.weaksetHas(weaksetHas);const functionToString=uncurryThis(functionPrototype.toString);
//
$h‍_once.functionToString(functionToString);const{all}=Promise;
const        promiseAll=  (promises)=>apply(all, Promise, [promises]);$h‍_once.promiseAll(promiseAll);
const        promiseCatch=  uncurryThis(promisePrototype.catch);
/** @type {<T, TResult1 = T, TResult2 = never>(thisArg: T, onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null) => Promise<TResult1 | TResult2>} */$h‍_once.promiseCatch(promiseCatch);
const        promiseThen=  /** @type {any} */
  uncurryThis(promisePrototype.then);

//
$h‍_once.promiseThen(promiseThen);const finalizationRegistryRegister=
  FinalizationRegistry&&  uncurryThis(FinalizationRegistry.prototype.register);$h‍_once.finalizationRegistryRegister(finalizationRegistryRegister);
const        finalizationRegistryUnregister=
  FinalizationRegistry&&
  uncurryThis(FinalizationRegistry.prototype.unregister);

/**
 * getConstructorOf()
 * Return the constructor from an instance.
 *
 * @param {Function} fn
 */$h‍_once.finalizationRegistryUnregister(finalizationRegistryUnregister);
const        getConstructorOf=  (fn)=>
  reflectGet(getPrototypeOf(fn), 'constructor');

/**
 * immutableObject
 * An immutable (frozen) empty object that is safe to share.
 */$h‍_once.getConstructorOf(getConstructorOf);
const        immutableObject=  freeze(create(null));

/**
 * isObject tests whether a value is an object.
 * Today, this is equivalent to:
 *
 *   const isObject = value => {
 *     if (value === null) return false;
 *     const type = typeof value;
 *     return type === 'object' || type === 'function';
 *   };
 *
 * But this is not safe in the face of possible evolution of the language, for
 * example new types or semantics of records and tuples.
 * We use this implementation despite the unnecessary allocation implied by
 * attempting to box a primitive.
 *
 * @param {any} value
 */$h‍_once.immutableObject(immutableObject);
const        isObject=  (value)=>Object(value)===  value;

/**
 * isError tests whether an object inherits from the intrinsic
 * `Error.prototype`.
 * We capture the original error constructor as FERAL_ERROR to provide a clear
 * signal for reviewers that we are handling an object with excess authority,
 * like stack trace inspection, that we are carefully hiding from client code.
 * Checking instanceof happens to be safe, but to avoid uttering FERAL_ERROR
 * for such a trivial case outside commons.js, we provide a utility function.
 *
 * @param {any} value
 */$h‍_once.isObject(isObject);
const        isError=  (value)=>value instanceof FERAL_ERROR;

// The original unsafe untamed eval function, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
// eslint-disable-next-line no-eval
$h‍_once.isError(isError);const FERAL_EVAL=eval;

// The original unsafe untamed Function constructor, which must not escape.
// Sample at module initialization time, which is before lockdown can
// repair it.  Use it only to build powerless abstractions.
$h‍_once.FERAL_EVAL(FERAL_EVAL);const FERAL_FUNCTION=Function;$h‍_once.FERAL_FUNCTION(FERAL_FUNCTION);

const        noEvalEvaluate=  ()=>  {
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_EVAL.md
  throw TypeError('Cannot eval with evalTaming set to "noEval" (SES_NO_EVAL)');
 };$h‍_once.noEvalEvaluate(noEvalEvaluate);
})()
,
// === functors[2] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]]]]]);   

/** getThis returns globalThis in sloppy mode or undefined in strict mode. */
function getThis() {
  return this;
 }

if( getThis()) {
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_SLOPPY.md
  throw TypeError( `SES failed to initialize, sloppy mode (SES_NO_SLOPPY)`);
 }
})()
,
// === functors[3] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   // @ts-check

// `@endo/env-options` needs to be imported quite early, and so should
// avoid importing from ses or anything that depends on ses.

// /////////////////////////////////////////////////////////////////////////////
// Prelude of cheap good - enough imitations of things we'd use or
// do differently if we could depend on ses

const { freeze}=   Object;
const { apply}=   Reflect;

// Should be equivalent to the one in ses' commons.js even though it
// uses the other technique.
const uncurryThis=
  (fn)=>
  (receiver, ...args)=>
    apply(fn, receiver, args);
const arrayPush=  uncurryThis(Array.prototype.push);

const q=  JSON.stringify;

const Fail=  (literals, ...args)=>  {
  let msg=  literals[0];
  for( let i=  0; i<  args.length; i+=  1) {
    msg=   `${msg}${args[i]}${literals[i+ 1] }`;
   }
  throw Error(msg);
 };

// end prelude
// /////////////////////////////////////////////////////////////////////////////

/**
 * `makeEnvironmentCaptor` provides a mechanism for getting environment
 * variables, if they are needed, and a way to catalog the names of all
 * the environment variables that were captured.
 *
 * @param {object} aGlobal
 */
const        makeEnvironmentCaptor=  (aGlobal)=>{
  const capturedEnvironmentOptionNames=  [];

  /**
   * Gets an environment option by name and returns the option value or the
   * given default.
   *
   * @param {string} optionName
   * @param {string} defaultSetting
   * @returns {string}
   */
  const getEnvironmentOption=  (optionName, defaultSetting)=>  {
    // eslint-disable-next-line @endo/no-polymorphic-call
    typeof optionName===  'string'||
      Fail `Environment option name ${q(optionName)} must be a string.`;
    // eslint-disable-next-line @endo/no-polymorphic-call
    typeof defaultSetting===  'string'||
      Fail `Environment option default setting ${q(
        defaultSetting)
        } must be a string.`;

    /** @type {string} */
    let setting=  defaultSetting;
    const globalProcess=  aGlobal.process;
    if( globalProcess&&  typeof globalProcess===  'object') {
      const globalEnv=  globalProcess.env;
      if( globalEnv&&  typeof globalEnv===  'object') {
        if( optionName in globalEnv) {
          arrayPush(capturedEnvironmentOptionNames, optionName);
          const optionValue=  globalEnv[optionName];
          // eslint-disable-next-line @endo/no-polymorphic-call
          typeof optionValue===  'string'||
            Fail `Environment option named ${q(
              optionName)
              }, if present, must have a corresponding string value, got ${q(
              optionValue)
              }`;
          setting=  optionValue;
         }
       }
     }
    return setting;
   };
  freeze(getEnvironmentOption);

  const getCapturedEnvironmentOptionNames=  ()=>  {
    return freeze([...capturedEnvironmentOptionNames]);
   };
  freeze(getCapturedEnvironmentOptionNames);

  return freeze({ getEnvironmentOption, getCapturedEnvironmentOptionNames});
 };$h‍_once.makeEnvironmentCaptor(makeEnvironmentCaptor);
freeze(makeEnvironmentCaptor);
})()
,
// === functors[4] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./src/env-options.js", []]]);   
})()
,
// === functors[5] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Set,String,isArray,arrayJoin,arraySlice,arraySort,arrayMap,keys,fromEntries,freeze,is,isError,setAdd,setHas,stringIncludes,stringStartsWith,stringifyJson,toStringTagSymbol;$h‍_imports([["../commons.js", [["Set", [$h‍_a => (Set = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["isArray", [$h‍_a => (isArray = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["arraySlice", [$h‍_a => (arraySlice = $h‍_a)]],["arraySort", [$h‍_a => (arraySort = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["keys", [$h‍_a => (keys = $h‍_a)]],["fromEntries", [$h‍_a => (fromEntries = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["is", [$h‍_a => (is = $h‍_a)]],["isError", [$h‍_a => (isError = $h‍_a)]],["setAdd", [$h‍_a => (setAdd = $h‍_a)]],["setHas", [$h‍_a => (setHas = $h‍_a)]],["stringIncludes", [$h‍_a => (stringIncludes = $h‍_a)]],["stringStartsWith", [$h‍_a => (stringStartsWith = $h‍_a)]],["stringifyJson", [$h‍_a => (stringifyJson = $h‍_a)]],["toStringTagSymbol", [$h‍_a => (toStringTagSymbol = $h‍_a)]]]]]);   






















/**
 * Joins English terms with commas and an optional conjunction.
 *
 * @param {(string | StringablePayload)[]} terms
 * @param {"and" | "or"} conjunction
 */
const        enJoin=  (terms, conjunction)=>  {
  if( terms.length===  0) {
    return '(none)';
   }else if( terms.length===  1) {
    return terms[0];
   }else if( terms.length===  2) {
    const [first, second]=  terms;
    return  `${first} ${conjunction} ${second}`;
   }else {
    return  `${arrayJoin(arraySlice(terms,0, -1), ', ') }, ${conjunction} ${
      terms[terms.length-  1]
     }`;
   }
 };

/**
 * Prepend the correct indefinite article onto a noun, typically a typeof
 * result, e.g., "an object" vs. "a number"
 *
 * @param {string} str The noun to prepend
 * @returns {string} The noun prepended with a/an
 */$h‍_once.enJoin(enJoin);
const an=  (str)=>{
  str=   `${str}`;
  if( str.length>=  1&&  stringIncludes('aeiouAEIOU', str[0])) {
    return  `an ${str}`;
   }
  return  `a ${str}`;
 };$h‍_once.an(an);
freeze(an);


/**
 * Like `JSON.stringify` but does not blow up if given a cycle or a bigint.
 * This is not
 * intended to be a serialization to support any useful unserialization,
 * or any programmatic use of the resulting string. The string is intended
 * *only* for showing a human under benign conditions, in order to be
 * informative enough for some
 * logging purposes. As such, this `bestEffortStringify` has an
 * imprecise specification and may change over time.
 *
 * The current `bestEffortStringify` possibly emits too many "seen"
 * markings: Not only for cycles, but also for repeated subtrees by
 * object identity.
 *
 * As a best effort only for diagnostic interpretation by humans,
 * `bestEffortStringify` also turns various cases that normal
 * `JSON.stringify` skips or errors on, like `undefined` or bigints,
 * into strings that convey their meaning. To distinguish this from
 * strings in the input, these synthesized strings always begin and
 * end with square brackets. To distinguish those strings from an
 * input string with square brackets, and input string that starts
 * with an open square bracket `[` is itself placed in square brackets.
 *
 * @param {any} payload
 * @param {(string|number)=} spaces
 * @returns {string}
 */
const bestEffortStringify=  (payload, spaces=  undefined)=>  {
  const seenSet=  new Set();
  const replacer=  (_, val)=>  {
    switch( typeof val){
      case 'object': {
        if( val===  null) {
          return null;
         }
        if( setHas(seenSet, val)) {
          return '[Seen]';
         }
        setAdd(seenSet, val);
        if( isError(val)) {
          return  `[${val.name}: ${val.message}]`;
         }
        if( toStringTagSymbol in val) {
          // For the built-ins that have or inherit a `Symbol.toStringTag`-named
          // property, most of them inherit the default `toString` method,
          // which will print in a similar manner: `"[object Foo]"` vs
          // `"[Foo]"`. The exceptions are
          //    * `Symbol.prototype`, `BigInt.prototype`, `String.prototype`
          //      which don't matter to us since we handle primitives
          //      separately and we don't care about primitive wrapper objects.
          //    * TODO
          //      `Date.prototype`, `TypedArray.prototype`.
          //      Hmmm, we probably should make special cases for these. We're
          //      not using these yet, so it's not urgent. But others will run
          //      into these.
          //
          // Once #2018 is closed, the only objects in our code that have or
          // inherit a `Symbol.toStringTag`-named property are remotables
          // or their remote presences.
          // This printing will do a good job for these without
          // violating abstraction layering. This behavior makes sense
          // purely in terms of JavaScript concepts. That's some of the
          // motivation for choosing that representation of remotables
          // and their remote presences in the first place.
          return  `[${val[toStringTagSymbol]}]`;
         }
        if( isArray(val)) {
          return val;
         }
        const names=  keys(val);
        if( names.length<  2) {
          return val;
         }
        let sorted=  true;
        for( let i=  1; i<  names.length; i+=  1) {
          if( names[i-  1]>=  names[i]) {
            sorted=  false;
            break;
           }
         }
        if( sorted) {
          return val;
         }
        arraySort(names);
        const entries=  arrayMap(names, (name)=>[name, val[name]]);
        return fromEntries(entries);
       }
      case 'function': {
        return  `[Function ${val.name|| '<anon>' }]`;
       }
      case 'string': {
        if( stringStartsWith(val, '[')) {
          return  `[${val}]`;
         }
        return val;
       }
      case 'undefined':
      case 'symbol': {
        return  `[${String(val)}]`;
       }
      case 'bigint': {
        return  `[${val}n]`;
       }
      case 'number': {
        if( is(val, NaN)) {
          return '[NaN]';
         }else if( val===  Infinity) {
          return '[Infinity]';
         }else if( val===  -Infinity) {
          return '[-Infinity]';
         }
        return val;
       }
      default: {
        return val;
       }}

   };
  try {
    return stringifyJson(payload, replacer, spaces);
   }catch( _err) {
    // Don't do anything more fancy here if there is any
    // chance that might throw, unless you surround that
    // with another try-catch-recovery. For example,
    // the caught thing might be a proxy or other exotic
    // object rather than an error. The proxy might throw
    // whenever it is possible for it to.
    return '[Something that failed to stringify]';
   }
 };$h‍_once.bestEffortStringify(bestEffortStringify);
freeze(bestEffortStringify);
})()
,
// === functors[6] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   // @ts-check

/**
 * @callback BaseAssert
 * The `assert` function itself.
 *
 * @param {*} flag The truthy/falsy value
 * @param {Details=} optDetails The details to throw
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {asserts flag}
 */

/**
 * @typedef {object} AssertMakeErrorOptions
 * @property {string=} errorName
 */

/**
 * @callback AssertMakeError
 *
 * The `assert.error` method, recording details for the console.
 *
 * The optional `optDetails` can be a string.
 * @param {Details=} optDetails The details of what was asserted
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @param {AssertMakeErrorOptions=} options
 * @returns {Error}
 */

/**
 * @callback AssertFail
 *
 * The `assert.fail` method.
 *
 * Fail an assertion, recording full details to the console and
 * raising an exception with a message in which `details` substitution values
 * have been redacted.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 * @param {Details=} optDetails The details of what was asserted
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {never}
 */

/**
 * @callback AssertEqual
 * The `assert.equal` method
 *
 * Assert that two values must be `Object.is`.
 * @param {*} actual The value we received
 * @param {*} expected What we wanted
 * @param {Details=} optDetails The details to throw
 * @param {ErrorConstructor=} ErrorConstructor An optional alternate error
 * constructor to use.
 * @returns {void}
 */

// Type all the overloads of the assertTypeof function.
// There may eventually be a better way to do this, but
// thems the breaks with Typescript 4.0.
/**
 * @callback AssertTypeofBigint
 * @param {any} specimen
 * @param {'bigint'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is bigint}
 */

/**
 * @callback AssertTypeofBoolean
 * @param {any} specimen
 * @param {'boolean'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is boolean}
 */

/**
 * @callback AssertTypeofFunction
 * @param {any} specimen
 * @param {'function'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is Function}
 */

/**
 * @callback AssertTypeofNumber
 * @param {any} specimen
 * @param {'number'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is number}
 */

/**
 * @callback AssertTypeofObject
 * @param {any} specimen
 * @param {'object'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is Record<any, any> | null}
 */

/**
 * @callback AssertTypeofString
 * @param {any} specimen
 * @param {'string'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is string}
 */

/**
 * @callback AssertTypeofSymbol
 * @param {any} specimen
 * @param {'symbol'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is symbol}
 */

/**
 * @callback AssertTypeofUndefined
 * @param {any} specimen
 * @param {'undefined'} typename
 * @param {Details=} optDetails
 * @returns {asserts specimen is undefined}
 */

/**
 * The `assert.typeof` method
 *
 * @typedef {AssertTypeofBigint & AssertTypeofBoolean & AssertTypeofFunction & AssertTypeofNumber & AssertTypeofObject & AssertTypeofString & AssertTypeofSymbol & AssertTypeofUndefined} AssertTypeof
 */

/**
 * @callback AssertString
 * The `assert.string` method.
 *
 * `assert.string(v)` is equivalent to `assert.typeof(v, 'string')`. We
 * special case this one because it is the most frequently used.
 *
 * Assert an expected typeof result.
 * @param {any} specimen The value to get the typeof
 * @param {Details=} optDetails The details to throw
 * @returns {asserts specimen is string}
 */

/**
 * @callback AssertNote
 * The `assert.note` method.
 *
 * Annotate an error with details, potentially to be used by an
 * augmented console such as the causal console of `console.js`, to
 * provide extra information associated with logged errors.
 *
 * @param {Error} error
 * @param {Details} detailsNote
 * @returns {void}
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {{}} DetailsToken
 * A call to the `details` template literal makes and returns a fresh details
 * token, which is a frozen empty object associated with the arguments of that
 * `details` template literal expression.
 */

/**
 * @typedef {string | DetailsToken} Details
 * Either a plain string, or made by the `details` template literal tag.
 */

/**
 * @typedef {object} StringablePayload
 * Holds the payload passed to quote so that its printed form is visible.
 * @property {() => string} toString How to print the payload
 */

/**
 * To "declassify" and quote a substitution value used in a
 * ``` details`...` ``` template literal, enclose that substitution expression
 * in a call to `quote`. This makes the value appear quoted
 * (as if with `JSON.stringify`) in the message of the thrown error. The
 * payload itself is still passed unquoted to the console as it would be
 * without `quote`.
 *
 * For example, the following will reveal the expected sky color, but not the
 * actual incorrect sky color, in the thrown error's message:
 * ```js
 * sky.color === expectedColor || Fail`${sky.color} should be ${quote(expectedColor)}`;
 * ```
 *
 * // TODO Update SES-shim to new convention, where `details` is
 * // renamed to `X` rather than `d`.
 * The normal convention is to locally rename `details` to `d` and `quote` to `q`
 * like `const { details: d, quote: q } = assert;`, so the above example would then be
 * ```js
 * sky.color === expectedColor || Fail`${sky.color} should be ${q(expectedColor)}`;
 * ```
 *
 * @callback AssertQuote
 * @param {*} payload What to declassify
 * @param {(string|number)=} spaces
 * @returns {StringablePayload} The declassified payload
 */

/**
 * @callback Raise
 *
 * To make an `assert` which terminates some larger unit of computation
 * like a transaction, vat, or process, call `makeAssert` with a `Raise`
 * callback, where that callback actually performs that larger termination.
 * If possible, the callback should also report its `reason` parameter as
 * the alleged reason for the termination.
 *
 * @param {Error} reason
 */

/**
 * @callback MakeAssert
 *
 * Makes and returns an `assert` function object that shares the bookkeeping
 * state defined by this module with other `assert` function objects made by
 * `makeAssert`. This state is per-module-instance and is exposed by the
 * `loggedErrorHandler` above. We refer to `assert` as a "function object"
 * because it can be called directly as a function, but also has methods that
 * can be called.
 *
 * If `optRaise` is provided, the returned `assert` function object will call
 * `optRaise(reason)` before throwing the error. This enables `optRaise` to
 * engage in even more violent termination behavior, like terminating the vat,
 * that prevents execution from reaching the following throw. However, if
 * `optRaise` returns normally, which would be unusual, the throw following
 * `optRaise(reason)` would still happen.
 *
 * @param {Raise=} optRaise
 * @param {boolean=} unredacted
 * @returns {Assert}
 */

/**
 * @typedef {(template: TemplateStringsArray | string[], ...args: any) => DetailsToken} DetailsTag
 *
 * Use the `details` function as a template literal tag to create
 * informative error messages. The assertion functions take such messages
 * as optional arguments:
 * ```js
 * assert(sky.isBlue(), details`${sky.color} should be "blue"`);
 * ```
 * // TODO Update SES-shim to new convention, where `details` is
 * // renamed to `X` rather than `d`.
 * or following the normal convention to locally rename `details` to `d`
 * and `quote` to `q` like `const { details: d, quote: q } = assert;`:
 * ```js
 * assert(sky.isBlue(), d`${sky.color} should be "blue"`);
 * ```
 * However, note that in most cases it is preferable to instead use the `Fail`
 * template literal tag (which has the same input signature as `details`
 * but automatically creates and throws an error):
 * ```js
 * sky.isBlue() || Fail`${sky.color} should be "blue"`;
 * ```
 *
 * The details template tag returns a `DetailsToken` object that can print
 * itself with the formatted message in two ways.
 * It will report full details to the console, but
 * mask embedded substitution values with their typeof information in the thrown error
 * to prevent revealing secrets up the exceptional path. In the example
 * above, the thrown error may reveal only that `sky.color` is a string,
 * whereas the same diagnostic printed to the console reveals that the
 * sky was green. This masking can be disabled for an individual substitution value
 * using `quote`.
 *
 * The `raw` property of an input template array is ignored, so a simple
 * array of strings may be provided directly.
 */

/**
 * @typedef {(template: TemplateStringsArray | string[], ...args: any) => never} FailTag
 *
 * Use the `Fail` function as a template literal tag to efficiently
 * create and throw a `details`-style error only when a condition is not satisfied.
 * ```js
 * condition || Fail`...complaint...`;
 * ```
 * This avoids the overhead of creating usually-unnecessary errors like
 * ```js
 * assert(condition, details`...complaint...`);
 * ```
 * while improving readability over alternatives like
 * ```js
 * condition || assert.fail(details`...complaint...`);
 * ```
 *
 * However, due to current weakness in TypeScript, static reasoning
 * is less powerful with the `||` patterns than with an `assert` call.
 * Until/unless https://github.com/microsoft/TypeScript/issues/51426 is fixed,
 * for `||`-style assertions where this loss of static reasoning is a problem,
 * instead express the assertion as
 * ```js
 *   if (!condition) {
 *     Fail`...complaint...`;
 *   }
 * ```
 * or, if needed,
 * ```js
 *   if (!condition) {
 *     // `throw` is noop since `Fail` throws, but it improves static analysis
 *     throw Fail`...complaint...`;
 *   }
 * ```
 */

/**
 * assert that expr is truthy, with an optional details to describe
 * the assertion. It is a tagged template literal like
 * ```js
 * assert(expr, details`....`);`
 * ```
 *
 * The literal portions of the template are assumed non-sensitive, as
 * are the `typeof` types of the substitution values. These are
 * assembled into the thrown error message. The actual contents of the
 * substitution values are assumed sensitive, to be revealed to
 * the console only. We assume only the virtual platform's owner can read
 * what is written to the console, where the owner is in a privileged
 * position over computation running on that platform.
 *
 * The optional `optDetails` can be a string for backwards compatibility
 * with the nodejs assertion library.
 *
 * @typedef { BaseAssert & {
 *   typeof: AssertTypeof,
 *   error: AssertMakeError,
 *   fail: AssertFail,
 *   equal: AssertEqual,
 *   string: AssertString,
 *   note: AssertNote,
 *   details: DetailsTag,
 *   Fail: FailTag,
 *   quote: AssertQuote,
 *   bare: AssertQuote,
 *   makeAssert: MakeAssert,
 * } } Assert
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {object} VirtualConsole
 * @property {Console['debug']} debug
 * @property {Console['log']} log
 * @property {Console['info']} info
 * @property {Console['warn']} warn
 * @property {Console['error']} error
 *
 * @property {Console['trace']} trace
 * @property {Console['dirxml']} dirxml
 * @property {Console['group']} group
 * @property {Console['groupCollapsed']} groupCollapsed
 *
 * @property {Console['assert']} assert
 * @property {Console['timeLog']} timeLog
 *
 * @property {Console['clear']} clear
 * @property {Console['count']} count
 * @property {Console['countReset']} countReset
 * @property {Console['dir']} dir
 * @property {Console['groupEnd']} groupEnd
 *
 * @property {Console['table']} table
 * @property {Console['time']} time
 * @property {Console['timeEnd']} timeEnd
 * @property {Console['timeStamp']} timeStamp
 */

/* This is deliberately *not* JSDoc, it is a regular comment.
 *
 * TODO: We'd like to add the following properties to the above
 * VirtualConsole, but they currently cause conflicts where
 * some Typescript implementations don't have these properties
 * on the Console type.
 *
 * @property {Console['profile']} profile
 * @property {Console['profileEnd']} profileEnd
 */

/**
 * @typedef {'debug' | 'log' | 'info' | 'warn' | 'error'} LogSeverity
 */

/**
 * @typedef ConsoleFilter
 * @property {(severity: LogSeverity) => boolean} canLog
 */

/**
 * @callback FilterConsole
 * @param {VirtualConsole} baseConsole
 * @param {ConsoleFilter} filter
 * @param {string=} topic
 * @returns {VirtualConsole}
 */
})()
,
// === functors[7] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   // @ts-check

/**
 * @typedef {readonly any[]} LogArgs
 *
 * This is an array suitable to be used as arguments of a console
 * level message *after* the format string argument. It is the result of
 * a `details` template string and consists of alternating literal strings
 * and substitution values, starting with a literal string. At least that
 * first literal string is always present.
 */

/**
 * @callback NoteCallback
 *
 * @param {Error} error
 * @param {LogArgs} noteLogArgs
 * @returns {void}
 */

/**
 * @callback GetStackString
 * @param {Error} error
 * @returns {string=}
 */

/**
 * @typedef {object} LoggedErrorHandler
 *
 * Used to parameterize `makeCausalConsole` to give it access to potentially
 * hidden information to augment the logging of errors.
 *
 * @property {GetStackString} getStackString
 * @property {(error: Error) => string} tagError
 * @property {() => void} resetErrorTagNum for debugging purposes only
 * @property {(error: Error) => (LogArgs | undefined)} getMessageLogArgs
 * @property {(error: Error) => (LogArgs | undefined)} takeMessageLogArgs
 * @property {(error: Error, callback?: NoteCallback) => LogArgs[] } takeNoteLogArgsArray
 */

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {readonly [string, ...any[]]} LogRecord
 */

/**
 * @typedef {object} LoggingConsoleKit
 * @property {VirtualConsole} loggingConsole
 * @property {() => readonly LogRecord[]} takeLog
 */

/**
 * @typedef {object} MakeLoggingConsoleKitOptions
 * @property {boolean=} shouldResetForDebugging
 */

/**
 * @callback MakeLoggingConsoleKit
 *
 * A logging console just accumulates the contents of all whitelisted calls,
 * making them available to callers of `takeLog()`. Calling `takeLog()`
 * consumes these, so later calls to `takeLog()` will only provide a log of
 * calls that have happened since then.
 *
 * @param {LoggedErrorHandler} loggedErrorHandler
 * @param {MakeLoggingConsoleKitOptions=} options
 * @returns {LoggingConsoleKit}
 */

/**
 * @typedef {{ NOTE: 'ERROR_NOTE:', MESSAGE: 'ERROR_MESSAGE:' }} ErrorInfo
 */

/**
 * @typedef {ErrorInfo[keyof ErrorInfo]} ErrorInfoKind
 */

/**
 * @callback MakeCausalConsole
 *
 * Makes a causal console wrapper of a `baseConsole`, where the causal console
 * calls methods of the `loggedErrorHandler` to customize how it handles logged
 * errors.
 *
 * @param {VirtualConsole} baseConsole
 * @param {LoggedErrorHandler} loggedErrorHandler
 * @returns {VirtualConsole}
 */
})()
,
// === functors[8] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./internal-types.js", []]]);   





const { freeze}=   Object;
const { isSafeInteger}=   Number;

/**
 * @template Data
 * @typedef {object} DoublyLinkedCell
 * A cell of a doubly-linked ring, i.e., a doubly-linked circular list.
 * DoublyLinkedCells are not frozen, and so should be closely encapsulated by
 * any abstraction that uses them.
 * @property {DoublyLinkedCell<Data>} next
 * @property {DoublyLinkedCell<Data>} prev
 * @property {Data} data
 */

/**
 * Makes a new self-linked cell. There are two reasons to do so:
 *    * To make the head sigil of a new initially-empty doubly-linked ring.
 *    * To make a non-sigil cell to be `spliceAfter`ed.
 *
 * @template Data
 * @param {Data} data
 * @returns {DoublyLinkedCell<Data>}
 */
const makeSelfCell=  (data)=>{
  /** @type {Partial<DoublyLinkedCell<Data>>} */
  const incompleteCell=  {
    next: undefined,
    prev: undefined,
    data};

  const selfCell=  /** @type {DoublyLinkedCell<Data>} */  incompleteCell;
  selfCell.next=  selfCell;
  selfCell.prev=  selfCell;
  // Not frozen!
  return selfCell;
 };

/**
 * Splices a self-linked non-sigil cell into a ring after `prev`.
 * `prev` could be the head sigil, or it could be some other non-sigil
 * cell within a ring.
 *
 * @template Data
 * @param {DoublyLinkedCell<Data>} prev
 * @param {DoublyLinkedCell<Data>} selfCell
 */
const spliceAfter=  (prev, selfCell)=>  {
  if( prev===  selfCell) {
    throw TypeError('Cannot splice a cell into itself');
   }
  if( selfCell.next!==  selfCell||  selfCell.prev!==  selfCell) {
    throw TypeError('Expected self-linked cell');
   }
  const cell=  selfCell;
  // rename variable cause it isn't self-linked after this point.

  const next=  prev.next;
  cell.prev=  prev;
  cell.next=  next;
  prev.next=  cell;
  next.prev=  cell;
  // Not frozen!
  return cell;
 };

/**
 * @template Data
 * @param {DoublyLinkedCell<Data>} cell
 * No-op if the cell is self-linked.
 */
const spliceOut=  (cell)=>{
  const { prev, next}=   cell;
  prev.next=  next;
  next.prev=  prev;
  cell.prev=  cell;
  cell.next=  cell;
 };

/**
 * The LRUCacheMap is used within the implementation of `assert` and so
 * at a layer below SES or harden. Thus, we give it a `WeakMap`-like interface
 * rather than a `WeakMapStore`-like interface. To work before `lockdown`,
 * the implementation must use `freeze` manually, but still exhaustively.
 *
 * It implements the WeakMap interface, and holds its keys weakly.  Cached
 * values are only held while the key is held by the user and the key/value
 * bookkeeping cell has not been pushed off the end of the cache by `budget`
 * number of more recently referenced cells.  If the key is dropped by the user,
 * the value will no longer be held by the cache, but the bookkeeping cell
 * itself will stay in memory.
 *
 * @template {{}} K
 * @template {unknown} V
 * @param {number} keysBudget
 * @returns {WeakMap<K,V>}
 */
const        makeLRUCacheMap=  (keysBudget)=>{
  if( !isSafeInteger(keysBudget)||  keysBudget<  0) {
    throw TypeError('keysBudget must be a safe non-negative integer number');
   }
  /** @typedef {DoublyLinkedCell<WeakMap<K, V> | undefined>} LRUCacheCell */
  /** @type {WeakMap<K, LRUCacheCell>} */
  const keyToCell=  new WeakMap();
  let size=  0; // `size` must remain <= `keysBudget`
  // As a sigil, `head` uniquely is not in the `keyToCell` map.
  /** @type {LRUCacheCell} */
  const head=  makeSelfCell(undefined);

  const touchCell=  (key)=>{
    const cell=  keyToCell.get(key);
    if( cell===  undefined||  cell.data===  undefined) {
      // Either the key was GCed, or the cell was condemned.
      return undefined;
     }
    // Becomes most recently used
    spliceOut(cell);
    spliceAfter(head, cell);
    return cell;
   };

  /**
   * @param {K} key
   */
  const has=  (key)=>touchCell(key)!==  undefined;
  freeze(has);

  /**
   * @param {K} key
   */
  // UNTIL https://github.com/endojs/endo/issues/1514
  // Prefer: const get = key => touchCell(key)?.data?.get(key);
  const get=  (key)=>{
    const cell=  touchCell(key);
    return cell&&  cell.data&&  cell.data.get(key);
   };
  freeze(get);

  /**
   * @param {K} key
   * @param {V} value
   */
  const set=  (key, value)=>  {
    if( keysBudget<  1) {
      // eslint-disable-next-line no-use-before-define
      return lruCacheMap; // Implements WeakMap.set
     }

    let cell=  touchCell(key);
    if( cell===  undefined) {
      cell=  makeSelfCell(undefined);
      spliceAfter(head, cell); // start most recently used
     }
    if( !cell.data) {
      // Either a fresh cell or a reused condemned cell.
      size+=  1;
      // Add its data.
      cell.data=  new WeakMap();
      // Advertise the cell for this key.
      keyToCell.set(key, cell);
      while( size>  keysBudget) {
        const condemned=  head.prev;
        spliceOut(condemned); // Drop least recently used
        condemned.data=  undefined;
        size-=  1;
       }
     }

    // Update the data.
    cell.data.set(key, value);

    // eslint-disable-next-line no-use-before-define
    return lruCacheMap; // Implements WeakMap.set
   };
  freeze(set);

  // "delete" is a keyword.
  /**
   * @param {K} key
   */
  const deleteIt=  (key)=>{
    const cell=  keyToCell.get(key);
    if( cell===  undefined) {
      return false;
     }
    spliceOut(cell);
    keyToCell.delete(key);
    if( cell.data===  undefined) {
      // Already condemned.
      return false;
     }

    cell.data=  undefined;
    size-=  1;
    return true;
   };
  freeze(deleteIt);

  const lruCacheMap=  freeze({
    has,
    get,
    set,
    delete: deleteIt,
    [Symbol.toStringTag]: 'LRUCacheMap'});

  return lruCacheMap;
 };$h‍_once.makeLRUCacheMap(makeLRUCacheMap);
freeze(makeLRUCacheMap);

const defaultLoggedErrorsBudget=  1000;
const defaultArgsPerErrorBudget=  100;

/**
 * @param {number} [errorsBudget]
 * @param {number} [argsPerErrorBudget]
 */
const        makeNoteLogArgsArrayKit=  (
  errorsBudget=  defaultLoggedErrorsBudget,
  argsPerErrorBudget=  defaultArgsPerErrorBudget)=>
     {
  if( !isSafeInteger(argsPerErrorBudget)||  argsPerErrorBudget<  1) {
    throw TypeError(
      'argsPerErrorBudget must be a safe positive integer number');

   }

  /**
   * @type {WeakMap<Error, LogArgs[]>}
   *
   * Maps from an error to an array of log args, where each log args is
   * remembered as an annotation on that error. This can be used, for example,
   * to keep track of additional causes of the error. The elements of any
   * log args may include errors which are associated with further annotations.
   * An augmented console, like the causal console of `console.js`, could
   * then retrieve the graph of such annotations.
   */
  const noteLogArgsArrayMap=  makeLRUCacheMap(errorsBudget);

  /**
   * @param {Error} error
   * @param {LogArgs} logArgs
   */
  const addLogArgs=  (error, logArgs)=>  {
    const logArgsArray=  noteLogArgsArrayMap.get(error);
    if( logArgsArray!==  undefined) {
      if( logArgsArray.length>=  argsPerErrorBudget) {
        logArgsArray.shift();
       }
      logArgsArray.push(logArgs);
     }else {
      noteLogArgsArrayMap.set(error, [logArgs]);
     }
   };
  freeze(addLogArgs);

  /**
   * @param {Error} error
   * @returns {LogArgs[] | undefined}
   */
  const takeLogArgsArray=  (error)=>{
    const result=  noteLogArgsArrayMap.get(error);
    noteLogArgsArrayMap.delete(error);
    return result;
   };
  freeze(takeLogArgsArray);

  return freeze({
    addLogArgs,
    takeLogArgsArray});

 };$h‍_once.makeNoteLogArgsArrayKit(makeNoteLogArgsArrayKit);
freeze(makeNoteLogArgsArrayKit);
})()
,
// === functors[9] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let RangeError,TypeError,WeakMap,arrayJoin,arrayMap,arrayPop,arrayPush,assign,freeze,globalThis,is,isError,regexpTest,stringIndexOf,stringReplace,stringSlice,stringStartsWith,weakmapDelete,weakmapGet,weakmapHas,weakmapSet,an,bestEffortStringify,makeNoteLogArgsArrayKit;$h‍_imports([["../commons.js", [["RangeError", [$h‍_a => (RangeError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["WeakMap", [$h‍_a => (WeakMap = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["arrayPop", [$h‍_a => (arrayPop = $h‍_a)]],["arrayPush", [$h‍_a => (arrayPush = $h‍_a)]],["assign", [$h‍_a => (assign = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["is", [$h‍_a => (is = $h‍_a)]],["isError", [$h‍_a => (isError = $h‍_a)]],["regexpTest", [$h‍_a => (regexpTest = $h‍_a)]],["stringIndexOf", [$h‍_a => (stringIndexOf = $h‍_a)]],["stringReplace", [$h‍_a => (stringReplace = $h‍_a)]],["stringSlice", [$h‍_a => (stringSlice = $h‍_a)]],["stringStartsWith", [$h‍_a => (stringStartsWith = $h‍_a)]],["weakmapDelete", [$h‍_a => (weakmapDelete = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["weakmapHas", [$h‍_a => (weakmapHas = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]]]],["./stringify-utils.js", [["an", [$h‍_a => (an = $h‍_a)]],["bestEffortStringify", [$h‍_a => (bestEffortStringify = $h‍_a)]]]],["./types.js", []],["./internal-types.js", []],["./note-log-args.js", [["makeNoteLogArgsArrayKit", [$h‍_a => (makeNoteLogArgsArrayKit = $h‍_a)]]]]]);   








































// For our internal debugging purposes, uncomment
// const internalDebugConsole = console;

// /////////////////////////////////////////////////////////////////////////////

/** @type {WeakMap<StringablePayload, any>} */
const declassifiers=  new WeakMap();

/** @type {AssertQuote} */
const quote=  (payload, spaces=  undefined)=>  {
  const result=  freeze({
    toString: freeze(()=>  bestEffortStringify(payload, spaces))});

  weakmapSet(declassifiers, result, payload);
  return result;
 };
freeze(quote);

const canBeBare=  freeze(/^[\w:-]( ?[\w:-])*$/);

/**
 * Embed a string directly into error details without wrapping punctuation.
 * To avoid injection attacks that exploit quoting confusion, this must NEVER
 * be used with data that is possibly attacker-controlled.
 * As a further safeguard, we fall back to quoting any input that is not a
 * string of sufficiently word-like parts separated by isolated spaces (rather
 * than throwing an exception, which could hide the original problem for which
 * explanatory details are being constructed---i.e., ``` assert.details`...` ```
 * should never be the source of a new exception, nor should an attempt to
 * render its output, although we _could_ instead decide to handle the latter
 * by inline replacement similar to that of `bestEffortStringify` for producing
 * rendered messages like `(an object) was tagged "[Unsafe bare string]"`).
 *
 * @type {AssertQuote}
 */
const bare=  (payload, spaces=  undefined)=>  {
  if( typeof payload!==  'string'||  !regexpTest(canBeBare, payload)) {
    return quote(payload, spaces);
   }
  const result=  freeze({
    toString: freeze(()=>  payload)});

  weakmapSet(declassifiers, result, payload);
  return result;
 };
freeze(bare);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {object} HiddenDetails
 *
 * Captures the arguments passed to the `details` template string tag.
 *
 * @property {TemplateStringsArray | string[]} template
 * @property {any[]} args
 */

/**
 * @type {WeakMap<DetailsToken, HiddenDetails>}
 *
 * Maps from a details token which a `details` template literal returned
 * to a record of the contents of that template literal expression.
 */
const hiddenDetailsMap=  new WeakMap();

/**
 * @param {HiddenDetails} hiddenDetails
 * @returns {string}
 */
const getMessageString=  ({ template, args})=>   {
  const parts=  [template[0]];
  for( let i=  0; i<  args.length; i+=  1) {
    const arg=  args[i];
    let argStr;
    if( weakmapHas(declassifiers, arg)) {
      argStr=   `${arg}`;
     }else if( isError(arg)) {
      argStr=   `(${an(arg.name)})`;
     }else {
      argStr=   `(${an(typeof arg)})`;
     }
    arrayPush(parts, argStr, template[i+  1]);
   }
  return arrayJoin(parts, '');
 };

/**
 * Give detailsTokens a toString behavior. To minimize the overhead of
 * creating new detailsTokens, we do this with an
 * inherited `this` sensitive `toString` method, even though we normally
 * avoid `this` sensitivity. To protect the method from inappropriate
 * `this` application, it does something interesting only for objects
 * registered in `redactedDetails`, which should be exactly the detailsTokens.
 *
 * The printing behavior must not reveal anything redacted, so we just use
 * the same `getMessageString` we use to construct the redacted message
 * string for a thrown assertion error.
 */
const DetailsTokenProto=  freeze({
  toString() {
    const hiddenDetails=  weakmapGet(hiddenDetailsMap, this);
    if( hiddenDetails===  undefined) {
      return '[Not a DetailsToken]';
     }
    return getMessageString(hiddenDetails);
   }});

freeze(DetailsTokenProto.toString);

/**
 * Normally this is the function exported as `assert.details` and often
 * spelled `d`. However, if the `{errorTaming: 'unsafe'}` option is given to
 * `lockdown`, then `unredactedDetails` is used instead.
 *
 * There are some unconditional uses of `redactedDetails` in this module. All
 * of them should be uses where the template literal has no redacted
 * substitution values. In those cases, the two are equivalent.
 *
 * @type {DetailsTag}
 */
const redactedDetails=  (template, ...args)=>  {
  // Keep in mind that the vast majority of calls to `details` creates
  // a details token that is never used, so this path must remain as fast as
  // possible. Hence we store what we've got with little processing, postponing
  // all the work to happen only if needed, for example, if an assertion fails.
  const detailsToken=  freeze({ __proto__: DetailsTokenProto});
  weakmapSet(hiddenDetailsMap, detailsToken, { template, args});
  return detailsToken;
 };
freeze(redactedDetails);

/**
 * `unredactedDetails` is like `details` except that it does not redact
 * anything. It acts like `details` would act if all substitution values
 * were wrapped with the `quote` function above (the function normally
 * spelled `q`). If the `{errorTaming: 'unsafe'}` option is given to
 * `lockdown`, then the lockdown-shim arranges for the global `assert` to be
 * one whose `details` property is `unredactedDetails`.
 * This setting optimizes the debugging and testing experience at the price
 * of safety. `unredactedDetails` also sacrifices the speed of `details`,
 * which is usually fine in debugging and testing.
 *
 * @type {DetailsTag}
 */
const unredactedDetails=  (template, ...args)=>  {
  args=  arrayMap(args, (arg)=>
    weakmapHas(declassifiers, arg)?  arg:  quote(arg));

  return redactedDetails(template, ...args);
 };$h‍_once.unredactedDetails(unredactedDetails);
freeze(unredactedDetails);


/**
 * @param {HiddenDetails} hiddenDetails
 * @returns {LogArgs}
 */
const getLogArgs=  ({ template, args})=>   {
  const logArgs=  [template[0]];
  for( let i=  0; i<  args.length; i+=  1) {
    let arg=  args[i];
    if( weakmapHas(declassifiers, arg)) {
      arg=  weakmapGet(declassifiers, arg);
     }
    // Remove the extra spaces (since console.error puts them
    // between each cause).
    const priorWithoutSpace=  stringReplace(arrayPop(logArgs)||  '', / $/, '');
    if( priorWithoutSpace!==  '') {
      arrayPush(logArgs, priorWithoutSpace);
     }
    const nextWithoutSpace=  stringReplace(template[i+  1], /^ /, '');
    arrayPush(logArgs, arg, nextWithoutSpace);
   }
  if( logArgs[logArgs.length-  1]===  '') {
    arrayPop(logArgs);
   }
  return logArgs;
 };

/**
 * @type {WeakMap<Error, LogArgs>}
 *
 * Maps from an error object to the log args that are a more informative
 * alternative message for that error. When logging the error, these
 * log args should be preferred to `error.message`.
 */
const hiddenMessageLogArgs=  new WeakMap();

// So each error tag will be unique.
let errorTagNum=  0;

/**
 * @type {WeakMap<Error, string>}
 */
const errorTags=  new WeakMap();

/**
 * @param {Error} err
 * @param {string=} optErrorName
 * @returns {string}
 */
const tagError=  (err, optErrorName=  err.name)=>  {
  let errorTag=  weakmapGet(errorTags, err);
  if( errorTag!==  undefined) {
    return errorTag;
   }
  errorTagNum+=  1;
  errorTag=   `${optErrorName}#${errorTagNum}`;
  weakmapSet(errorTags, err, errorTag);
  return errorTag;
 };

/**
 * @type {AssertMakeError}
 */
const makeError=  (
  optDetails=  redactedDetails `Assert failed`,
  ErrorConstructor=  globalThis.Error,
  { errorName=  undefined}=   {})=>
     {
  if( typeof optDetails===  'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    optDetails=  redactedDetails([optDetails]);
   }
  const hiddenDetails=  weakmapGet(hiddenDetailsMap, optDetails);
  if( hiddenDetails===  undefined) {
    throw TypeError( `unrecognized details ${quote(optDetails)}`);
   }
  const messageString=  getMessageString(hiddenDetails);
  const error=  new ErrorConstructor(messageString);
  weakmapSet(hiddenMessageLogArgs, error, getLogArgs(hiddenDetails));
  if( errorName!==  undefined) {
    tagError(error, errorName);
   }
  // The next line is a particularly fruitful place to put a breakpoint.
  return error;
 };
freeze(makeError);

// /////////////////////////////////////////////////////////////////////////////

const { addLogArgs, takeLogArgsArray}=   makeNoteLogArgsArrayKit();

/**
 * @type {WeakMap<Error, NoteCallback[]>}
 *
 * An augmented console will normally only take the hidden noteArgs array once,
 * when it logs the error being annotated. Once that happens, further
 * annotations of that error should go to the console immediately. We arrange
 * that by accepting a note-callback function from the console as an optional
 * part of that taking operation. Normally there will only be at most one
 * callback per error, but that depends on console behavior which we should not
 * assume. We make this an array of callbacks so multiple registrations
 * are independent.
 */
const hiddenNoteCallbackArrays=  new WeakMap();

/** @type {AssertNote} */
const note=  (error, detailsNote)=>  {
  if( typeof detailsNote===  'string') {
    // If it is a string, use it as the literal part of the template so
    // it doesn't get quoted.
    detailsNote=  redactedDetails([detailsNote]);
   }
  const hiddenDetails=  weakmapGet(hiddenDetailsMap, detailsNote);
  if( hiddenDetails===  undefined) {
    throw TypeError( `unrecognized details ${quote(detailsNote)}`);
   }
  const logArgs=  getLogArgs(hiddenDetails);
  const callbacks=  weakmapGet(hiddenNoteCallbackArrays, error);
  if( callbacks!==  undefined) {
    for( const callback of callbacks) {
      callback(error, logArgs);
     }
   }else {
    addLogArgs(error, logArgs);
   }
 };
freeze(note);

/**
 * The unprivileged form that just uses the de facto `error.stack` property.
 * The start compartment normally has a privileged `globalThis.getStackString`
 * which should be preferred if present.
 *
 * @param {Error} error
 * @returns {string}
 */
const defaultGetStackString=  (error)=>{
  if( !('stack'in  error)) {
    return '';
   }
  const stackString=   `${error.stack}`;
  const pos=  stringIndexOf(stackString, '\n');
  if( stringStartsWith(stackString, ' ')||  pos===  -1) {
    return stackString;
   }
  return stringSlice(stackString, pos+  1); // exclude the initial newline
 };

/** @type {LoggedErrorHandler} */
const loggedErrorHandler=  {
  getStackString: globalThis.getStackString||  defaultGetStackString,
  tagError: (error)=>tagError(error),
  resetErrorTagNum: ()=>  {
    errorTagNum=  0;
   },
  getMessageLogArgs: (error)=>weakmapGet(hiddenMessageLogArgs, error),
  takeMessageLogArgs: (error)=>{
    const result=  weakmapGet(hiddenMessageLogArgs, error);
    weakmapDelete(hiddenMessageLogArgs, error);
    return result;
   },
  takeNoteLogArgsArray: (error, callback)=>  {
    const result=  takeLogArgsArray(error);
    if( callback!==  undefined) {
      const callbacks=  weakmapGet(hiddenNoteCallbackArrays, error);
      if( callbacks) {
        arrayPush(callbacks, callback);
       }else {
        weakmapSet(hiddenNoteCallbackArrays, error, [callback]);
       }
     }
    return result||  [];
   }};$h‍_once.loggedErrorHandler(loggedErrorHandler);

freeze(loggedErrorHandler);


// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {MakeAssert}
 */
const makeAssert=  (optRaise=  undefined, unredacted=  false)=>  {
  const details=  unredacted?  unredactedDetails:  redactedDetails;
  const assertFailedDetails=  details `Check failed`;

  /** @type {AssertFail} */
  const fail=  (
    optDetails=  assertFailedDetails,
    ErrorConstructor=  globalThis.Error)=>
       {
    const reason=  makeError(optDetails, ErrorConstructor);
    if( optRaise!==  undefined) {
      optRaise(reason);
     }
    throw reason;
   };
  freeze(fail);

  /** @type {FailTag} */
  const Fail=  (template, ...args)=>  fail(details(template, ...args));

  // Don't freeze or export `baseAssert` until we add methods.
  // TODO If I change this from a `function` function to an arrow
  // function, I seem to get type errors from TypeScript. Why?
  /** @type {BaseAssert} */
  function baseAssert(
    flag,
    optDetails=  undefined,
    ErrorConstructor=  undefined)
    {
    flag||  fail(optDetails, ErrorConstructor);
   }

  /** @type {AssertEqual} */
  const equal=  (
    actual,
    expected,
    optDetails=  undefined,
    ErrorConstructor=  undefined)=>
       {
    is(actual, expected)||
      fail(
        optDetails||  details `Expected ${actual} is same as ${expected}`,
        ErrorConstructor||  RangeError);

   };
  freeze(equal);

  /** @type {AssertTypeof} */
  const assertTypeof=  (specimen, typename, optDetails)=>  {
    // This will safely fall through if typename is not a string,
    // which is what we want.
    // eslint-disable-next-line valid-typeof
    if( typeof specimen===  typename) {
      return;
     }
    typeof typename===  'string'||  Fail `${quote(typename)} must be a string`;

    if( optDetails===  undefined) {
      // Embed the type phrase without quotes.
      const typeWithDeterminer=  an(typename);
      optDetails=  details `${specimen} must be ${bare(typeWithDeterminer)}`;
     }
    fail(optDetails, TypeError);
   };
  freeze(assertTypeof);

  /** @type {AssertString} */
  const assertString=  (specimen, optDetails=  undefined)=>
    assertTypeof(specimen, 'string', optDetails);

  // Note that "assert === baseAssert"
  /** @type {Assert} */
  const assert=  assign(baseAssert, {
    error: makeError,
    fail,
    equal,
    typeof: assertTypeof,
    string: assertString,
    note,
    details,
    Fail,
    quote,
    bare,
    makeAssert});

  return freeze(assert);
 };$h‍_once.makeAssert(makeAssert);
freeze(makeAssert);


/** @type {Assert} */
const assert=  makeAssert();$h‍_once.assert(assert);
})()
,
// === functors[10] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Set,String,TypeError,WeakMap,WeakSet,globalThis,apply,arrayForEach,defineProperty,freeze,getOwnPropertyDescriptor,getOwnPropertyDescriptors,getPrototypeOf,isInteger,isObject,objectHasOwnProperty,ownKeys,preventExtensions,setAdd,setForEach,setHas,toStringTagSymbol,typedArrayPrototype,weakmapGet,weakmapSet,weaksetAdd,weaksetHas,assert;$h‍_imports([["./commons.js", [["Set", [$h‍_a => (Set = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["WeakMap", [$h‍_a => (WeakMap = $h‍_a)]],["WeakSet", [$h‍_a => (WeakSet = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["apply", [$h‍_a => (apply = $h‍_a)]],["arrayForEach", [$h‍_a => (arrayForEach = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["getPrototypeOf", [$h‍_a => (getPrototypeOf = $h‍_a)]],["isInteger", [$h‍_a => (isInteger = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["ownKeys", [$h‍_a => (ownKeys = $h‍_a)]],["preventExtensions", [$h‍_a => (preventExtensions = $h‍_a)]],["setAdd", [$h‍_a => (setAdd = $h‍_a)]],["setForEach", [$h‍_a => (setForEach = $h‍_a)]],["setHas", [$h‍_a => (setHas = $h‍_a)]],["toStringTagSymbol", [$h‍_a => (toStringTagSymbol = $h‍_a)]],["typedArrayPrototype", [$h‍_a => (typedArrayPrototype = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]],["weaksetAdd", [$h‍_a => (weaksetAdd = $h‍_a)]],["weaksetHas", [$h‍_a => (weaksetHas = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   





















































/**
 * @typedef {import('../types.js').Harden} Harden
 */

// Obtain the string tag accessor of of TypedArray so we can indirectly use the
// TypedArray brand check it employs.
const typedArrayToStringTag=  getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol);

assert(typedArrayToStringTag);
const getTypedArrayToStringTag=  typedArrayToStringTag.get;
assert(getTypedArrayToStringTag);

// Exported for tests.
/**
 * Duplicates packages/marshal/src/helpers/passStyle-helpers.js to avoid a dependency.
 *
 * @param {unknown} object
 */
const        isTypedArray=  (object)=>{
  // The object must pass a brand check or toStringTag will return undefined.
  const tag=  apply(getTypedArrayToStringTag, object, []);
  return tag!==  undefined;
 };

/**
 * Tests if a property key is an integer-valued canonical numeric index.
 * https://tc39.es/ecma262/#sec-canonicalnumericindexstring
 *
 * @param {string | symbol} propertyKey
 */$h‍_once.isTypedArray(isTypedArray);
const isCanonicalIntegerIndexString=  (propertyKey)=>{
  const n=  +String(propertyKey);
  return isInteger(n)&&  String(n)===  propertyKey;
 };

/**
 * @template T
 * @param {ArrayLike<T>} array
 */
const freezeTypedArray=  (array)=>{
  preventExtensions(array);

  // Downgrade writable expandos to readonly, even if non-configurable.
  // We get each descriptor individually rather than using
  // getOwnPropertyDescriptors in order to fail safe when encountering
  // an obscure GraalJS issue where getOwnPropertyDescriptor returns
  // undefined for a property that does exist.
  arrayForEach(ownKeys(array), (/** @type {string | symbol} */ name)=>  {
    const desc=  getOwnPropertyDescriptor(array, name);
    assert(desc);
    // TypedArrays are integer-indexed exotic objects, which define special
    // treatment for property names in canonical numeric form:
    // integers in range are permanently writable and non-configurable.
    // https://tc39.es/ecma262/#sec-integer-indexed-exotic-objects
    //
    // This is analogous to the data of a hardened Map or Set,
    // so we carve out this exceptional behavior but make all other
    // properties non-configurable.
    if( !isCanonicalIntegerIndexString(name)) {
      defineProperty(array, name, {
        ...desc,
        writable: false,
        configurable: false});

     }
   });
 };

/**
 * Create a `harden` function.
 *
 * @returns {Harden}
 */
const        makeHardener=  ()=>  {
  // Use a native hardener if possible.
  if( typeof globalThis.harden===  'function') {
    const safeHarden=  globalThis.harden;
    return safeHarden;
   }

  const hardened=  new WeakSet();

  const { harden}=   {
    /**
     * @template T
     * @param {T} root
     * @returns {T}
     */
    harden(root) {
      const toFreeze=  new Set();
      const paths=  new WeakMap();

      // If val is something we should be freezing but aren't yet,
      // add it to toFreeze.
      /**
       * @param {any} val
       * @param {string} [path]
       */
      function enqueue(val, path=  undefined) {
        if( !isObject(val)) {
          // ignore primitives
          return;
         }
        const type=  typeof val;
        if( type!==  'object'&&  type!==  'function') {
          // future proof: break until someone figures out what it should do
          throw TypeError( `Unexpected typeof: ${type}`);
         }
        if( weaksetHas(hardened, val)||  setHas(toFreeze, val)) {
          // Ignore if this is an exit, or we've already visited it
          return;
         }
        // console.warn(`adding ${val} to toFreeze`, val);
        setAdd(toFreeze, val);
        weakmapSet(paths, val, path);
       }

      /**
       * @param {any} obj
       */
      function freezeAndTraverse(obj) {
        // Now freeze the object to ensure reactive
        // objects such as proxies won't add properties
        // during traversal, before they get frozen.

        // Object are verified before being enqueued,
        // therefore this is a valid candidate.
        // Throws if this fails (strict mode).
        // Also throws if the object is an ArrayBuffer or any TypedArray.
        if( isTypedArray(obj)) {
          freezeTypedArray(obj);
         }else {
          freeze(obj);
         }

        // we rely upon certain commitments of Object.freeze and proxies here

        // get stable/immutable outbound links before a Proxy has a chance to do
        // something sneaky.
        const path=  weakmapGet(paths, obj)||  'unknown';
        const descs=  getOwnPropertyDescriptors(obj);
        const proto=  getPrototypeOf(obj);
        enqueue(proto,  `${path}.__proto__`);

        arrayForEach(ownKeys(descs), (/** @type {string | symbol} */ name)=>  {
          const pathname=   `${path}.${String(name)}`;
          // The 'name' may be a symbol, and TypeScript doesn't like us to
          // index arbitrary symbols on objects, so we pretend they're just
          // strings.
          const desc=  descs[/** @type {string} */  name];
          // getOwnPropertyDescriptors is guaranteed to return well-formed
          // descriptors, but they still inherit from Object.prototype. If
          // someone has poisoned Object.prototype to add 'value' or 'get'
          // properties, then a simple 'if ("value" in desc)' or 'desc.value'
          // test could be confused. We use hasOwnProperty to be sure about
          // whether 'value' is present or not, which tells us for sure that
          // this is a data property.
          if( objectHasOwnProperty(desc, 'value')) {
            enqueue(desc.value,  `${pathname}`);
           }else {
            enqueue(desc.get,  `${pathname}(get)`);
            enqueue(desc.set,  `${pathname}(set)`);
           }
         });
       }

      function dequeue() {
        // New values added before forEach() has finished will be visited.
        setForEach(toFreeze, freezeAndTraverse);
       }

      /** @param {any} value */
      function markHardened(value) {
        weaksetAdd(hardened, value);
       }

      function commit() {
        setForEach(toFreeze, markHardened);
       }

      enqueue(root);
      dequeue();
      // console.warn("toFreeze set:", toFreeze);
      commit();

      return root;
     }};


  return harden;
 };$h‍_once.makeHardener(makeHardener);
})()
,
// === functors[11] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /* eslint-disable no-restricted-globals */
/**
 * @file Exports {@code whitelist}, a recursively defined
 * JSON record enumerating all intrinsics and their properties
 * according to ECMA specs.
 *
 * @author JF Paradis
 * @author Mark S. Miller
 */

/* eslint max-lines: 0 */

/**
 * constantProperties
 * non-configurable, non-writable data properties of all global objects.
 * Must be powerless.
 * Maps from property name to the actual value
 */
const        constantProperties=  {
  // *** Value Properties of the Global Object

  Infinity,
  NaN,
  undefined};


/**
 * universalPropertyNames
 * Properties of all global objects.
 * Must be powerless.
 * Maps from property name to the intrinsic name in the whitelist.
 */$h‍_once.constantProperties(constantProperties);
const        universalPropertyNames=  {
  // *** Function Properties of the Global Object

  isFinite: 'isFinite',
  isNaN: 'isNaN',
  parseFloat: 'parseFloat',
  parseInt: 'parseInt',

  decodeURI: 'decodeURI',
  decodeURIComponent: 'decodeURIComponent',
  encodeURI: 'encodeURI',
  encodeURIComponent: 'encodeURIComponent',

  // *** Constructor Properties of the Global Object

  Array: 'Array',
  ArrayBuffer: 'ArrayBuffer',
  BigInt: 'BigInt',
  BigInt64Array: 'BigInt64Array',
  BigUint64Array: 'BigUint64Array',
  Boolean: 'Boolean',
  DataView: 'DataView',
  EvalError: 'EvalError',
  Float32Array: 'Float32Array',
  Float64Array: 'Float64Array',
  Int8Array: 'Int8Array',
  Int16Array: 'Int16Array',
  Int32Array: 'Int32Array',
  Map: 'Map',
  Number: 'Number',
  Object: 'Object',
  Promise: 'Promise',
  Proxy: 'Proxy',
  RangeError: 'RangeError',
  ReferenceError: 'ReferenceError',
  Set: 'Set',
  String: 'String',
  SyntaxError: 'SyntaxError',
  TypeError: 'TypeError',
  Uint8Array: 'Uint8Array',
  Uint8ClampedArray: 'Uint8ClampedArray',
  Uint16Array: 'Uint16Array',
  Uint32Array: 'Uint32Array',
  URIError: 'URIError',
  WeakMap: 'WeakMap',
  WeakSet: 'WeakSet',
  // https://github.com/tc39/proposal-iterator-helpers
  Iterator: 'Iterator',
  // https://github.com/tc39/proposal-async-iterator-helpers
  AsyncIterator: 'AsyncIterator',

  // *** Other Properties of the Global Object

  JSON: 'JSON',
  Reflect: 'Reflect',

  // *** Annex B

  escape: 'escape',
  unescape: 'unescape',

  // ESNext

  lockdown: 'lockdown',
  harden: 'harden',
  HandledPromise: 'HandledPromise'  // TODO: Until Promise.delegate (see below).
};

/**
 * initialGlobalPropertyNames
 * Those found only on the initial global, i.e., the global of the
 * start compartment, as well as any compartments created before lockdown.
 * These may provide much of the power provided by the original.
 * Maps from property name to the intrinsic name in the whitelist.
 */$h‍_once.universalPropertyNames(universalPropertyNames);
const        initialGlobalPropertyNames=  {
  // *** Constructor Properties of the Global Object

  Date: '%InitialDate%',
  Error: '%InitialError%',
  RegExp: '%InitialRegExp%',

  // Omit `Symbol`, because we want the original to appear on the
  // start compartment without passing through the whitelist mechanism, since
  // we want to preserve all its properties, even if we never heard of them.
  // Symbol: '%InitialSymbol%',

  // *** Other Properties of the Global Object

  Math: '%InitialMath%',

  // ESNext

  // From Error-stack proposal
  // Only on initial global. No corresponding
  // powerless form for other globals.
  getStackString: '%InitialGetStackString%'

  // TODO https://github.com/Agoric/SES-shim/issues/551
  // Need initial WeakRef and FinalizationGroup in
  // start compartment only.
};

/**
 * sharedGlobalPropertyNames
 * Those found only on the globals of new compartments created after lockdown,
 * which must therefore be powerless.
 * Maps from property name to the intrinsic name in the whitelist.
 */$h‍_once.initialGlobalPropertyNames(initialGlobalPropertyNames);
const        sharedGlobalPropertyNames=  {
  // *** Constructor Properties of the Global Object

  Date: '%SharedDate%',
  Error: '%SharedError%',
  RegExp: '%SharedRegExp%',
  Symbol: '%SharedSymbol%',

  // *** Other Properties of the Global Object

  Math: '%SharedMath%'};


/**
 * uniqueGlobalPropertyNames
 * Those made separately for each global, including the initial global
 * of the start compartment.
 * Maps from property name to the intrinsic name in the whitelist
 * (which is currently always the same).
 */$h‍_once.sharedGlobalPropertyNames(sharedGlobalPropertyNames);
const        uniqueGlobalPropertyNames=  {
  // *** Value Properties of the Global Object

  globalThis: '%UniqueGlobalThis%',

  // *** Function Properties of the Global Object

  eval: '%UniqueEval%',

  // *** Constructor Properties of the Global Object

  Function: '%UniqueFunction%',

  // *** Other Properties of the Global Object

  // ESNext

  Compartment: '%UniqueCompartment%'
  // According to current agreements, eventually the Realm constructor too.
  // 'Realm',
};

// All the "subclasses" of Error. These are collectively represented in the
// ECMAScript spec by the meta variable NativeError.
// TODO Add AggregateError https://github.com/Agoric/SES-shim/issues/550
$h‍_once.uniqueGlobalPropertyNames(uniqueGlobalPropertyNames);const NativeErrors=[
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError];


/**
 * <p>Each JSON record enumerates the disposition of the properties on
 *    some corresponding intrinsic object.
 *
 * <p>All records are made of key-value pairs where the key
 *    is the property to process, and the value is the associated
 *    dispositions a.k.a. the "permit". Those permits can be:
 * <ul>
 * <li>The boolean value "false", in which case this property is
 *     blacklisted and simply removed. Properties not mentioned
 *     are also considered blacklisted and are removed.
 * <li>A string value equal to a primitive ("number", "string", etc),
 *     in which case the property is whitelisted if its value property
 *     is typeof the given type. For example, {@code "Infinity"} leads to
 *     "number" and property values that fail {@code typeof "number"}.
 *     are removed.
 * <li>A string value equal to an intinsic name ("ObjectPrototype",
 *     "Array", etc), in which case the property whitelisted if its
 *     value property is equal to the value of the corresponfing
 *     intrinsics. For example, {@code Map.prototype} leads to
 *     "MapPrototype" and the property is removed if its value is
 *     not equal to %MapPrototype%
 * <li>Another record, in which case this property is simply
 *     whitelisted and that next record represents the disposition of
 *     the object which is its value. For example, {@code "Object"}
 *     leads to another record explaining what properties {@code
 *     "Object"} may have and how each such property should be treated.
 *
 * <p>Notes:
 * <li>"[[Proto]]" is used to refer to the "[[Prototype]]" internal
 *     slot, which says which object this object inherits from.
 * <li>"--proto--" is used to refer to the "__proto__" property name,
 *     which is the name of an accessor property on Object.prototype.
 *     In practice, it is used to access the [[Proto]] internal slot,
 *     but is distinct from the internal slot itself. We use
 *     "--proto--" rather than "__proto__" below because "__proto__"
 *     in an object literal is special syntax rather than a normal
 *     property definition.
 * <li>"ObjectPrototype" is the default "[[Proto]]" (when not specified).
 * <li>Constants "fn" and "getter" are used to keep the structure DRY.
 * <li>Symbol properties are listed as follow:
 *     <li>Well-known symbols use the "@@name" form.
 *     <li>Registered symbols use the "RegisteredSymbol(key)" form.
 *     <li>Unique symbols use the "UniqueSymbol(description)" form.
 */

// Function Instances
$h‍_once.NativeErrors(NativeErrors);const FunctionInstance={
  '[[Proto]]': '%FunctionPrototype%',
  length: 'number',
  name: 'string'
  // Do not specify "prototype" here, since only Function instances that can
  // be used as a constructor have a prototype property. For constructors,
  // since prototype properties are instance-specific, we define it there.
};

// AsyncFunction Instances
$h‍_once.FunctionInstance(FunctionInstance);const AsyncFunctionInstance={
  // This property is not mentioned in ECMA 262, but is present in V8 and
  // necessary for lockdown to succeed.
  '[[Proto]]': '%AsyncFunctionPrototype%'};


// Aliases
$h‍_once.AsyncFunctionInstance(AsyncFunctionInstance);const fn=FunctionInstance;
const asyncFn=  AsyncFunctionInstance;

const getter=  {
  get: fn,
  set: 'undefined'};


// Possible but not encountered in the specs
// export const setter = {
//   get: 'undefined',
//   set: fn,
// };

const accessor=  {
  get: fn,
  set: fn};


const        isAccessorPermit=  (permit)=>{
  return permit===  getter||  permit===  accessor;
 };

// NativeError Object Structure
$h‍_once.isAccessorPermit(isAccessorPermit);function NativeError(prototype){
  return {
    // Properties of the NativeError Constructors
    '[[Proto]]': '%SharedError%',

    // NativeError.prototype
    prototype};

 }

function NativeErrorPrototype(constructor) {
  return {
    // Properties of the NativeError Prototype Objects
    '[[Proto]]': '%ErrorPrototype%',
    constructor,
    message: 'string',
    name: 'string',
    // Redundantly present only on v8. Safe to remove.
    toString: false,
    // Superfluously present in some versions of V8.
    // https://github.com/tc39/notes/blob/master/meetings/2021-10/oct-26.md#:~:text=However%2C%20Chrome%2093,and%20node%2016.11.
    cause: false};

 }

// The TypedArray Constructors
function TypedArray(prototype) {
  return {
    // Properties of the TypedArray Constructors
    '[[Proto]]': '%TypedArray%',
    BYTES_PER_ELEMENT: 'number',
    prototype};

 }

function TypedArrayPrototype(constructor) {
  return {
    // Properties of the TypedArray Prototype Objects
    '[[Proto]]': '%TypedArrayPrototype%',
    BYTES_PER_ELEMENT: 'number',
    constructor};

 }

// Without Math.random
const CommonMath=  {
  E: 'number',
  LN10: 'number',
  LN2: 'number',
  LOG10E: 'number',
  LOG2E: 'number',
  PI: 'number',
  SQRT1_2: 'number',
  SQRT2: 'number',
  '@@toStringTag': 'string',
  abs: fn,
  acos: fn,
  acosh: fn,
  asin: fn,
  asinh: fn,
  atan: fn,
  atanh: fn,
  atan2: fn,
  cbrt: fn,
  ceil: fn,
  clz32: fn,
  cos: fn,
  cosh: fn,
  exp: fn,
  expm1: fn,
  floor: fn,
  fround: fn,
  hypot: fn,
  imul: fn,
  log: fn,
  log1p: fn,
  log10: fn,
  log2: fn,
  max: fn,
  min: fn,
  pow: fn,
  round: fn,
  sign: fn,
  sin: fn,
  sinh: fn,
  sqrt: fn,
  tan: fn,
  tanh: fn,
  trunc: fn,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  idiv: false,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  idivmod: false,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  imod: false,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  imuldiv: false,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  irem: false,
  // See https://github.com/Moddable-OpenSource/moddable/issues/523
  mod: false};


const        permitted=  {
  // ECMA https://tc39.es/ecma262

  // The intrinsics object has no prototype to avoid conflicts.
  '[[Proto]]': null,

  // %ThrowTypeError%
  '%ThrowTypeError%': fn,

  // *** The Global Object

  // *** Value Properties of the Global Object
  Infinity: 'number',
  NaN: 'number',
  undefined: 'undefined',

  // *** Function Properties of the Global Object

  // eval
  '%UniqueEval%': fn,
  isFinite: fn,
  isNaN: fn,
  parseFloat: fn,
  parseInt: fn,
  decodeURI: fn,
  decodeURIComponent: fn,
  encodeURI: fn,
  encodeURIComponent: fn,

  // *** Fundamental Objects

  Object: {
    // Properties of the Object Constructor
    '[[Proto]]': '%FunctionPrototype%',
    assign: fn,
    create: fn,
    defineProperties: fn,
    defineProperty: fn,
    entries: fn,
    freeze: fn,
    fromEntries: fn,
    getOwnPropertyDescriptor: fn,
    getOwnPropertyDescriptors: fn,
    getOwnPropertyNames: fn,
    getOwnPropertySymbols: fn,
    getPrototypeOf: fn,
    hasOwn: fn,
    is: fn,
    isExtensible: fn,
    isFrozen: fn,
    isSealed: fn,
    keys: fn,
    preventExtensions: fn,
    prototype: '%ObjectPrototype%',
    seal: fn,
    setPrototypeOf: fn,
    values: fn,
    // https://github.com/tc39/proposal-array-grouping
    groupBy: fn},


  '%ObjectPrototype%': {
    // Properties of the Object Prototype Object
    '[[Proto]]': null,
    constructor: 'Object',
    hasOwnProperty: fn,
    isPrototypeOf: fn,
    propertyIsEnumerable: fn,
    toLocaleString: fn,
    toString: fn,
    valueOf: fn,

    // Annex B: Additional Properties of the Object.prototype Object

    // See note in header about the difference between [[Proto]] and --proto--
    // special notations.
    '--proto--': accessor,
    __defineGetter__: fn,
    __defineSetter__: fn,
    __lookupGetter__: fn,
    __lookupSetter__: fn},


  '%UniqueFunction%': {
    // Properties of the Function Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%FunctionPrototype%'},


  '%InertFunction%': {
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%FunctionPrototype%'},


  '%FunctionPrototype%': {
    apply: fn,
    bind: fn,
    call: fn,
    constructor: '%InertFunction%',
    toString: fn,
    '@@hasInstance': fn,
    // proposed but not yet std. To be removed if there
    caller: false,
    // proposed but not yet std. To be removed if there
    arguments: false},


  Boolean: {
    // Properties of the Boolean Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%BooleanPrototype%'},


  '%BooleanPrototype%': {
    constructor: 'Boolean',
    toString: fn,
    valueOf: fn},


  '%SharedSymbol%': {
    // Properties of the Symbol Constructor
    '[[Proto]]': '%FunctionPrototype%',
    asyncDispose: 'symbol',
    asyncIterator: 'symbol',
    dispose: 'symbol',
    for: fn,
    hasInstance: 'symbol',
    isConcatSpreadable: 'symbol',
    iterator: 'symbol',
    keyFor: fn,
    match: 'symbol',
    matchAll: 'symbol',
    prototype: '%SymbolPrototype%',
    replace: 'symbol',
    search: 'symbol',
    species: 'symbol',
    split: 'symbol',
    toPrimitive: 'symbol',
    toStringTag: 'symbol',
    unscopables: 'symbol',
    // Seen at core-js https://github.com/zloirock/core-js#ecmascript-symbol
    useSimple: false,
    // Seen at core-js https://github.com/zloirock/core-js#ecmascript-symbol
    useSetter: false},


  '%SymbolPrototype%': {
    // Properties of the Symbol Prototype Object
    constructor: '%SharedSymbol%',
    description: getter,
    toString: fn,
    valueOf: fn,
    '@@toPrimitive': fn,
    '@@toStringTag': 'string'},


  '%InitialError%': {
    // Properties of the Error Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%ErrorPrototype%',
    // Non standard, v8 only, used by tap
    captureStackTrace: fn,
    // Non standard, v8 only, used by tap, tamed to accessor
    stackTraceLimit: accessor,
    // Non standard, v8 only, used by several, tamed to accessor
    prepareStackTrace: accessor},


  '%SharedError%': {
    // Properties of the Error Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%ErrorPrototype%',
    // Non standard, v8 only, used by tap
    captureStackTrace: fn,
    // Non standard, v8 only, used by tap, tamed to accessor
    stackTraceLimit: accessor,
    // Non standard, v8 only, used by several, tamed to accessor
    prepareStackTrace: accessor},


  '%ErrorPrototype%': {
    constructor: '%SharedError%',
    message: 'string',
    name: 'string',
    toString: fn,
    // proposed de-facto, assumed TODO
    // Seen on FF Nightly 88.0a1
    at: false,
    // Seen on FF and XS
    stack: accessor,
    // Superfluously present in some versions of V8.
    // https://github.com/tc39/notes/blob/master/meetings/2021-10/oct-26.md#:~:text=However%2C%20Chrome%2093,and%20node%2016.11.
    cause: false},


  // NativeError

  EvalError: NativeError('%EvalErrorPrototype%'),
  RangeError: NativeError('%RangeErrorPrototype%'),
  ReferenceError: NativeError('%ReferenceErrorPrototype%'),
  SyntaxError: NativeError('%SyntaxErrorPrototype%'),
  TypeError: NativeError('%TypeErrorPrototype%'),
  URIError: NativeError('%URIErrorPrototype%'),

  '%EvalErrorPrototype%': NativeErrorPrototype('EvalError'),
  '%RangeErrorPrototype%': NativeErrorPrototype('RangeError'),
  '%ReferenceErrorPrototype%': NativeErrorPrototype('ReferenceError'),
  '%SyntaxErrorPrototype%': NativeErrorPrototype('SyntaxError'),
  '%TypeErrorPrototype%': NativeErrorPrototype('TypeError'),
  '%URIErrorPrototype%': NativeErrorPrototype('URIError'),

  // *** Numbers and Dates

  Number: {
    // Properties of the Number Constructor
    '[[Proto]]': '%FunctionPrototype%',
    EPSILON: 'number',
    isFinite: fn,
    isInteger: fn,
    isNaN: fn,
    isSafeInteger: fn,
    MAX_SAFE_INTEGER: 'number',
    MAX_VALUE: 'number',
    MIN_SAFE_INTEGER: 'number',
    MIN_VALUE: 'number',
    NaN: 'number',
    NEGATIVE_INFINITY: 'number',
    parseFloat: fn,
    parseInt: fn,
    POSITIVE_INFINITY: 'number',
    prototype: '%NumberPrototype%'},


  '%NumberPrototype%': {
    // Properties of the Number Prototype Object
    constructor: 'Number',
    toExponential: fn,
    toFixed: fn,
    toLocaleString: fn,
    toPrecision: fn,
    toString: fn,
    valueOf: fn},


  BigInt: {
    // Properties of the BigInt Constructor
    '[[Proto]]': '%FunctionPrototype%',
    asIntN: fn,
    asUintN: fn,
    prototype: '%BigIntPrototype%',
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    bitLength: false,
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    fromArrayBuffer: false},


  '%BigIntPrototype%': {
    constructor: 'BigInt',
    toLocaleString: fn,
    toString: fn,
    valueOf: fn,
    '@@toStringTag': 'string'},


  '%InitialMath%': {
    ...CommonMath,
    // `%InitialMath%.random()` has the standard unsafe behavior
    random: fn},


  '%SharedMath%': {
    ...CommonMath,
    // `%SharedMath%.random()` is tamed to always throw
    random: fn},


  '%InitialDate%': {
    // Properties of the Date Constructor
    '[[Proto]]': '%FunctionPrototype%',
    now: fn,
    parse: fn,
    prototype: '%DatePrototype%',
    UTC: fn},


  '%SharedDate%': {
    // Properties of the Date Constructor
    '[[Proto]]': '%FunctionPrototype%',
    // `%SharedDate%.now()` is tamed to always throw
    now: fn,
    parse: fn,
    prototype: '%DatePrototype%',
    UTC: fn},


  '%DatePrototype%': {
    constructor: '%SharedDate%',
    getDate: fn,
    getDay: fn,
    getFullYear: fn,
    getHours: fn,
    getMilliseconds: fn,
    getMinutes: fn,
    getMonth: fn,
    getSeconds: fn,
    getTime: fn,
    getTimezoneOffset: fn,
    getUTCDate: fn,
    getUTCDay: fn,
    getUTCFullYear: fn,
    getUTCHours: fn,
    getUTCMilliseconds: fn,
    getUTCMinutes: fn,
    getUTCMonth: fn,
    getUTCSeconds: fn,
    setDate: fn,
    setFullYear: fn,
    setHours: fn,
    setMilliseconds: fn,
    setMinutes: fn,
    setMonth: fn,
    setSeconds: fn,
    setTime: fn,
    setUTCDate: fn,
    setUTCFullYear: fn,
    setUTCHours: fn,
    setUTCMilliseconds: fn,
    setUTCMinutes: fn,
    setUTCMonth: fn,
    setUTCSeconds: fn,
    toDateString: fn,
    toISOString: fn,
    toJSON: fn,
    toLocaleDateString: fn,
    toLocaleString: fn,
    toLocaleTimeString: fn,
    toString: fn,
    toTimeString: fn,
    toUTCString: fn,
    valueOf: fn,
    '@@toPrimitive': fn,

    // Annex B: Additional Properties of the Date.prototype Object
    getYear: fn,
    setYear: fn,
    toGMTString: fn},


  // Text Processing

  String: {
    // Properties of the String Constructor
    '[[Proto]]': '%FunctionPrototype%',
    fromCharCode: fn,
    fromCodePoint: fn,
    prototype: '%StringPrototype%',
    raw: fn,
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    fromArrayBuffer: false},


  '%StringPrototype%': {
    // Properties of the String Prototype Object
    length: 'number',
    at: fn,
    charAt: fn,
    charCodeAt: fn,
    codePointAt: fn,
    concat: fn,
    constructor: 'String',
    endsWith: fn,
    includes: fn,
    indexOf: fn,
    lastIndexOf: fn,
    localeCompare: fn,
    match: fn,
    matchAll: fn,
    normalize: fn,
    padEnd: fn,
    padStart: fn,
    repeat: fn,
    replace: fn,
    replaceAll: fn, // ES2021
    search: fn,
    slice: fn,
    split: fn,
    startsWith: fn,
    substring: fn,
    toLocaleLowerCase: fn,
    toLocaleUpperCase: fn,
    toLowerCase: fn,
    toString: fn,
    toUpperCase: fn,
    trim: fn,
    trimEnd: fn,
    trimStart: fn,
    valueOf: fn,
    '@@iterator': fn,

    // Annex B: Additional Properties of the String.prototype Object
    substr: fn,
    anchor: fn,
    big: fn,
    blink: fn,
    bold: fn,
    fixed: fn,
    fontcolor: fn,
    fontsize: fn,
    italics: fn,
    link: fn,
    small: fn,
    strike: fn,
    sub: fn,
    sup: fn,
    trimLeft: fn,
    trimRight: fn,
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    compare: false,
    // https://github.com/tc39/proposal-is-usv-string
    isWellFormed: fn,
    toWellFormed: fn,
    unicodeSets: fn},


  '%StringIteratorPrototype%': {
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    '@@toStringTag': 'string'},


  '%InitialRegExp%': {
    // Properties of the RegExp Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%RegExpPrototype%',
    '@@species': getter,

    // The https://github.com/tc39/proposal-regexp-legacy-features
    // are all optional, unsafe, and omitted
    input: false,
    $_: false,
    lastMatch: false,
    '$&': false,
    lastParen: false,
    '$+': false,
    leftContext: false,
    '$`': false,
    rightContext: false,
    "$'": false,
    $1: false,
    $2: false,
    $3: false,
    $4: false,
    $5: false,
    $6: false,
    $7: false,
    $8: false,
    $9: false},


  '%SharedRegExp%': {
    // Properties of the RegExp Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%RegExpPrototype%',
    '@@species': getter},


  '%RegExpPrototype%': {
    // Properties of the RegExp Prototype Object
    constructor: '%SharedRegExp%',
    exec: fn,
    dotAll: getter,
    flags: getter,
    global: getter,
    hasIndices: getter,
    ignoreCase: getter,
    '@@match': fn,
    '@@matchAll': fn,
    multiline: getter,
    '@@replace': fn,
    '@@search': fn,
    source: getter,
    '@@split': fn,
    sticky: getter,
    test: fn,
    toString: fn,
    unicode: getter,
    unicodeSets: getter,

    // Annex B: Additional Properties of the RegExp.prototype Object
    compile: false  // UNSAFE and suppressed.
},

  '%RegExpStringIteratorPrototype%': {
    // The %RegExpStringIteratorPrototype% Object
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    '@@toStringTag': 'string'},


  // Indexed Collections

  Array: {
    // Properties of the Array Constructor
    '[[Proto]]': '%FunctionPrototype%',
    from: fn,
    isArray: fn,
    of: fn,
    prototype: '%ArrayPrototype%',
    '@@species': getter,

    // Stage 3:
    // https://tc39.es/proposal-relative-indexing-method/
    at: fn,
    // https://tc39.es/proposal-array-from-async/
    fromAsync: fn},


  '%ArrayPrototype%': {
    // Properties of the Array Prototype Object
    at: fn,
    length: 'number',
    concat: fn,
    constructor: 'Array',
    copyWithin: fn,
    entries: fn,
    every: fn,
    fill: fn,
    filter: fn,
    find: fn,
    findIndex: fn,
    flat: fn,
    flatMap: fn,
    forEach: fn,
    includes: fn,
    indexOf: fn,
    join: fn,
    keys: fn,
    lastIndexOf: fn,
    map: fn,
    pop: fn,
    push: fn,
    reduce: fn,
    reduceRight: fn,
    reverse: fn,
    shift: fn,
    slice: fn,
    some: fn,
    sort: fn,
    splice: fn,
    toLocaleString: fn,
    toString: fn,
    unshift: fn,
    values: fn,
    '@@iterator': fn,
    '@@unscopables': {
      '[[Proto]]': null,
      copyWithin: 'boolean',
      entries: 'boolean',
      fill: 'boolean',
      find: 'boolean',
      findIndex: 'boolean',
      flat: 'boolean',
      flatMap: 'boolean',
      includes: 'boolean',
      keys: 'boolean',
      values: 'boolean',
      // Failed tc39 proposal
      // Seen on FF Nightly 88.0a1
      at: 'boolean',
      // See https://github.com/tc39/proposal-array-find-from-last
      findLast: 'boolean',
      findLastIndex: 'boolean',
      // https://github.com/tc39/proposal-change-array-by-copy
      toReversed: 'boolean',
      toSorted: 'boolean',
      toSpliced: 'boolean',
      with: 'boolean',
      // https://github.com/tc39/proposal-array-grouping
      group: 'boolean',
      groupToMap: 'boolean',
      groupBy: 'boolean'},

    // See https://github.com/tc39/proposal-array-find-from-last
    findLast: fn,
    findLastIndex: fn,
    // https://github.com/tc39/proposal-change-array-by-copy
    toReversed: fn,
    toSorted: fn,
    toSpliced: fn,
    with: fn,
    // https://github.com/tc39/proposal-array-grouping
    group: fn, // Not in proposal? Where?
    groupToMap: fn, // Not in proposal? Where?
    groupBy: fn},


  '%ArrayIteratorPrototype%': {
    // The %ArrayIteratorPrototype% Object
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    '@@toStringTag': 'string'},


  // *** TypedArray Objects

  '%TypedArray%': {
    // Properties of the %TypedArray% Intrinsic Object
    '[[Proto]]': '%FunctionPrototype%',
    from: fn,
    of: fn,
    prototype: '%TypedArrayPrototype%',
    '@@species': getter},


  '%TypedArrayPrototype%': {
    at: fn,
    buffer: getter,
    byteLength: getter,
    byteOffset: getter,
    constructor: '%TypedArray%',
    copyWithin: fn,
    entries: fn,
    every: fn,
    fill: fn,
    filter: fn,
    find: fn,
    findIndex: fn,
    forEach: fn,
    includes: fn,
    indexOf: fn,
    join: fn,
    keys: fn,
    lastIndexOf: fn,
    length: getter,
    map: fn,
    reduce: fn,
    reduceRight: fn,
    reverse: fn,
    set: fn,
    slice: fn,
    some: fn,
    sort: fn,
    subarray: fn,
    toLocaleString: fn,
    toString: fn,
    values: fn,
    '@@iterator': fn,
    '@@toStringTag': getter,
    // See https://github.com/tc39/proposal-array-find-from-last
    findLast: fn,
    findLastIndex: fn,
    // https://github.com/tc39/proposal-change-array-by-copy
    toReversed: fn,
    toSorted: fn,
    with: fn},


  // The TypedArray Constructors

  BigInt64Array: TypedArray('%BigInt64ArrayPrototype%'),
  BigUint64Array: TypedArray('%BigUint64ArrayPrototype%'),
  Float32Array: TypedArray('%Float32ArrayPrototype%'),
  Float64Array: TypedArray('%Float64ArrayPrototype%'),
  Int16Array: TypedArray('%Int16ArrayPrototype%'),
  Int32Array: TypedArray('%Int32ArrayPrototype%'),
  Int8Array: TypedArray('%Int8ArrayPrototype%'),
  Uint16Array: TypedArray('%Uint16ArrayPrototype%'),
  Uint32Array: TypedArray('%Uint32ArrayPrototype%'),
  Uint8Array: TypedArray('%Uint8ArrayPrototype%'),
  Uint8ClampedArray: TypedArray('%Uint8ClampedArrayPrototype%'),

  '%BigInt64ArrayPrototype%': TypedArrayPrototype('BigInt64Array'),
  '%BigUint64ArrayPrototype%': TypedArrayPrototype('BigUint64Array'),
  '%Float32ArrayPrototype%': TypedArrayPrototype('Float32Array'),
  '%Float64ArrayPrototype%': TypedArrayPrototype('Float64Array'),
  '%Int16ArrayPrototype%': TypedArrayPrototype('Int16Array'),
  '%Int32ArrayPrototype%': TypedArrayPrototype('Int32Array'),
  '%Int8ArrayPrototype%': TypedArrayPrototype('Int8Array'),
  '%Uint16ArrayPrototype%': TypedArrayPrototype('Uint16Array'),
  '%Uint32ArrayPrototype%': TypedArrayPrototype('Uint32Array'),
  '%Uint8ArrayPrototype%': TypedArrayPrototype('Uint8Array'),
  '%Uint8ClampedArrayPrototype%': TypedArrayPrototype('Uint8ClampedArray'),

  // *** Keyed Collections

  Map: {
    // Properties of the Map Constructor
    '[[Proto]]': '%FunctionPrototype%',
    '@@species': getter,
    prototype: '%MapPrototype%',
    // https://github.com/tc39/proposal-array-grouping
    groupBy: fn},


  '%MapPrototype%': {
    clear: fn,
    constructor: 'Map',
    delete: fn,
    entries: fn,
    forEach: fn,
    get: fn,
    has: fn,
    keys: fn,
    set: fn,
    size: getter,
    values: fn,
    '@@iterator': fn,
    '@@toStringTag': 'string'},


  '%MapIteratorPrototype%': {
    // The %MapIteratorPrototype% Object
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    '@@toStringTag': 'string'},


  Set: {
    // Properties of the Set Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%SetPrototype%',
    '@@species': getter},


  '%SetPrototype%': {
    add: fn,
    clear: fn,
    constructor: 'Set',
    delete: fn,
    entries: fn,
    forEach: fn,
    has: fn,
    keys: fn,
    size: getter,
    values: fn,
    '@@iterator': fn,
    '@@toStringTag': 'string'},


  '%SetIteratorPrototype%': {
    // The %SetIteratorPrototype% Object
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    '@@toStringTag': 'string'},


  WeakMap: {
    // Properties of the WeakMap Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%WeakMapPrototype%'},


  '%WeakMapPrototype%': {
    constructor: 'WeakMap',
    delete: fn,
    get: fn,
    has: fn,
    set: fn,
    '@@toStringTag': 'string'},


  WeakSet: {
    // Properties of the WeakSet Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%WeakSetPrototype%'},


  '%WeakSetPrototype%': {
    add: fn,
    constructor: 'WeakSet',
    delete: fn,
    has: fn,
    '@@toStringTag': 'string'},


  // *** Structured Data

  ArrayBuffer: {
    // Properties of the ArrayBuffer Constructor
    '[[Proto]]': '%FunctionPrototype%',
    isView: fn,
    prototype: '%ArrayBufferPrototype%',
    '@@species': getter,
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    fromString: false,
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    fromBigInt: false},


  '%ArrayBufferPrototype%': {
    byteLength: getter,
    constructor: 'ArrayBuffer',
    slice: fn,
    '@@toStringTag': 'string',
    // See https://github.com/Moddable-OpenSource/moddable/issues/523
    concat: false,
    // See https://github.com/tc39/proposal-resizablearraybuffer
    transfer: fn,
    resize: fn,
    resizable: getter,
    maxByteLength: getter,
    // https://github.com/tc39/proposal-arraybuffer-transfer
    transferToFixedLength: fn,
    detached: getter},


  // SharedArrayBuffer Objects
  SharedArrayBuffer: false, // UNSAFE and purposely suppressed.
  '%SharedArrayBufferPrototype%': false, // UNSAFE and purposely suppressed.

  DataView: {
    // Properties of the DataView Constructor
    '[[Proto]]': '%FunctionPrototype%',
    BYTES_PER_ELEMENT: 'number', // Non std but undeletable on Safari.
    prototype: '%DataViewPrototype%'},


  '%DataViewPrototype%': {
    buffer: getter,
    byteLength: getter,
    byteOffset: getter,
    constructor: 'DataView',
    getBigInt64: fn,
    getBigUint64: fn,
    getFloat32: fn,
    getFloat64: fn,
    getInt8: fn,
    getInt16: fn,
    getInt32: fn,
    getUint8: fn,
    getUint16: fn,
    getUint32: fn,
    setBigInt64: fn,
    setBigUint64: fn,
    setFloat32: fn,
    setFloat64: fn,
    setInt8: fn,
    setInt16: fn,
    setInt32: fn,
    setUint8: fn,
    setUint16: fn,
    setUint32: fn,
    '@@toStringTag': 'string'},


  // Atomics
  Atomics: false, // UNSAFE and suppressed.

  JSON: {
    parse: fn,
    stringify: fn,
    '@@toStringTag': 'string',
    // https://github.com/tc39/proposal-json-parse-with-source/
    rawJSON: fn,
    isRawJSON: fn},


  // *** Control Abstraction Objects

  // https://github.com/tc39/proposal-iterator-helpers
  Iterator: {
    // Properties of the Iterator Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%IteratorPrototype%',
    from: fn},


  '%IteratorPrototype%': {
    // The %IteratorPrototype% Object
    '@@iterator': fn,
    // https://github.com/tc39/proposal-iterator-helpers
    constructor: 'Iterator',
    map: fn,
    filter: fn,
    take: fn,
    drop: fn,
    flatMap: fn,
    reduce: fn,
    toArray: fn,
    forEach: fn,
    some: fn,
    every: fn,
    find: fn,
    '@@toStringTag': 'string',
    // https://github.com/tc39/proposal-async-iterator-helpers
    toAsync: fn},


  // https://github.com/tc39/proposal-iterator-helpers
  '%WrapForValidIteratorPrototype%': {
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    return: fn},


  // https://github.com/tc39/proposal-iterator-helpers
  '%IteratorHelperPrototype%': {
    '[[Proto]]': '%IteratorPrototype%',
    next: fn,
    return: fn,
    '@@toStringTag': 'string'},


  // https://github.com/tc39/proposal-async-iterator-helpers
  AsyncIterator: {
    // Properties of the Iterator Constructor
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%AsyncIteratorPrototype%',
    from: fn},


  '%AsyncIteratorPrototype%': {
    // The %AsyncIteratorPrototype% Object
    '@@asyncIterator': fn,
    // https://github.com/tc39/proposal-async-iterator-helpers
    constructor: 'AsyncIterator',
    map: fn,
    filter: fn,
    take: fn,
    drop: fn,
    flatMap: fn,
    reduce: fn,
    toArray: fn,
    forEach: fn,
    some: fn,
    every: fn,
    find: fn,
    '@@toStringTag': 'string'},


  // https://github.com/tc39/proposal-async-iterator-helpers
  '%WrapForValidAsyncIteratorPrototype%': {
    '[[Proto]]': '%AsyncIteratorPrototype%',
    next: fn,
    return: fn},


  // https://github.com/tc39/proposal-async-iterator-helpers
  '%AsyncIteratorHelperPrototype%': {
    '[[Proto]]': '%AsyncIteratorPrototype%',
    next: fn,
    return: fn,
    '@@toStringTag': 'string'},


  '%InertGeneratorFunction%': {
    // Properties of the GeneratorFunction Constructor
    '[[Proto]]': '%InertFunction%',
    prototype: '%Generator%'},


  '%Generator%': {
    // Properties of the GeneratorFunction Prototype Object
    '[[Proto]]': '%FunctionPrototype%',
    constructor: '%InertGeneratorFunction%',
    prototype: '%GeneratorPrototype%',
    '@@toStringTag': 'string'},


  '%InertAsyncGeneratorFunction%': {
    // Properties of the AsyncGeneratorFunction Constructor
    '[[Proto]]': '%InertFunction%',
    prototype: '%AsyncGenerator%'},


  '%AsyncGenerator%': {
    // Properties of the AsyncGeneratorFunction Prototype Object
    '[[Proto]]': '%FunctionPrototype%',
    constructor: '%InertAsyncGeneratorFunction%',
    prototype: '%AsyncGeneratorPrototype%',
    // length prop added here for React Native jsc-android
    // https://github.com/endojs/endo/issues/660
    // https://github.com/react-native-community/jsc-android-buildscripts/issues/181
    length: 'number',
    '@@toStringTag': 'string'},


  '%GeneratorPrototype%': {
    // Properties of the Generator Prototype Object
    '[[Proto]]': '%IteratorPrototype%',
    constructor: '%Generator%',
    next: fn,
    return: fn,
    throw: fn,
    '@@toStringTag': 'string'},


  '%AsyncGeneratorPrototype%': {
    // Properties of the AsyncGenerator Prototype Object
    '[[Proto]]': '%AsyncIteratorPrototype%',
    constructor: '%AsyncGenerator%',
    next: fn,
    return: fn,
    throw: fn,
    '@@toStringTag': 'string'},


  // TODO: To be replaced with Promise.delegate
  //
  // The HandledPromise global variable shimmed by `@agoric/eventual-send/shim`
  // implements an initial version of the eventual send specification at:
  // https://github.com/tc39/proposal-eventual-send
  //
  // We will likely change this to add a property to Promise called
  // Promise.delegate and put static methods on it, which will necessitate
  // another whitelist change to update to the current proposed standard.
  HandledPromise: {
    '[[Proto]]': 'Promise',
    applyFunction: fn,
    applyFunctionSendOnly: fn,
    applyMethod: fn,
    applyMethodSendOnly: fn,
    get: fn,
    getSendOnly: fn,
    prototype: '%PromisePrototype%',
    resolve: fn},


  Promise: {
    // Properties of the Promise Constructor
    '[[Proto]]': '%FunctionPrototype%',
    all: fn,
    allSettled: fn,
    // To transition from `false` to `fn` once we also have `AggregateError`
    // TODO https://github.com/Agoric/SES-shim/issues/550
    any: false, // ES2021
    prototype: '%PromisePrototype%',
    race: fn,
    reject: fn,
    resolve: fn,
    '@@species': getter},


  '%PromisePrototype%': {
    // Properties of the Promise Prototype Object
    catch: fn,
    constructor: 'Promise',
    finally: fn,
    then: fn,
    '@@toStringTag': 'string',
    // Non-standard, used in node to prevent async_hooks from breaking
    'UniqueSymbol(async_id_symbol)': accessor,
    'UniqueSymbol(trigger_async_id_symbol)': accessor,
    'UniqueSymbol(destroyed)': accessor},


  '%InertAsyncFunction%': {
    // Properties of the AsyncFunction Constructor
    '[[Proto]]': '%InertFunction%',
    prototype: '%AsyncFunctionPrototype%'},


  '%AsyncFunctionPrototype%': {
    // Properties of the AsyncFunction Prototype Object
    '[[Proto]]': '%FunctionPrototype%',
    constructor: '%InertAsyncFunction%',
    // length prop added here for React Native jsc-android
    // https://github.com/endojs/endo/issues/660
    // https://github.com/react-native-community/jsc-android-buildscripts/issues/181
    length: 'number',
    '@@toStringTag': 'string'},


  // Reflection

  Reflect: {
    // The Reflect Object
    // Not a function object.
    apply: fn,
    construct: fn,
    defineProperty: fn,
    deleteProperty: fn,
    get: fn,
    getOwnPropertyDescriptor: fn,
    getPrototypeOf: fn,
    has: fn,
    isExtensible: fn,
    ownKeys: fn,
    preventExtensions: fn,
    set: fn,
    setPrototypeOf: fn,
    '@@toStringTag': 'string'},


  Proxy: {
    // Properties of the Proxy Constructor
    '[[Proto]]': '%FunctionPrototype%',
    revocable: fn},


  // Appendix B

  // Annex B: Additional Properties of the Global Object

  escape: fn,
  unescape: fn,

  // Proposed

  '%UniqueCompartment%': {
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%CompartmentPrototype%',
    toString: fn},


  '%InertCompartment%': {
    '[[Proto]]': '%FunctionPrototype%',
    prototype: '%CompartmentPrototype%',
    toString: fn},


  '%CompartmentPrototype%': {
    constructor: '%InertCompartment%',
    evaluate: fn,
    globalThis: getter,
    name: getter,
    // Should this be proposed?
    toString: fn,
    import: asyncFn,
    load: asyncFn,
    importNow: fn,
    module: fn},


  lockdown: fn,
  harden: { ...fn, isFake: 'boolean'},

  '%InitialGetStackString%': fn};$h‍_once.permitted(permitted);
})()
,
// === functors[12] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,WeakSet,arrayFilter,create,defineProperty,entries,freeze,getOwnPropertyDescriptor,getOwnPropertyDescriptors,globalThis,is,isObject,objectHasOwnProperty,values,weaksetHas,constantProperties,sharedGlobalPropertyNames,universalPropertyNames,permitted;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["WeakSet", [$h‍_a => (WeakSet = $h‍_a)]],["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["is", [$h‍_a => (is = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["values", [$h‍_a => (values = $h‍_a)]],["weaksetHas", [$h‍_a => (weaksetHas = $h‍_a)]]]],["./permits.js", [["constantProperties", [$h‍_a => (constantProperties = $h‍_a)]],["sharedGlobalPropertyNames", [$h‍_a => (sharedGlobalPropertyNames = $h‍_a)]],["universalPropertyNames", [$h‍_a => (universalPropertyNames = $h‍_a)]],["permitted", [$h‍_a => (permitted = $h‍_a)]]]]]);   
























const isFunction=  (obj)=>typeof obj===  'function';

// Like defineProperty, but throws if it would modify an existing property.
// We use this to ensure that two conflicting attempts to define the same
// property throws, causing SES initialization to fail. Otherwise, a
// conflict between, for example, two of SES's internal whitelists might
// get masked as one overwrites the other. Accordingly, the thrown error
// complains of a "Conflicting definition".
function initProperty(obj, name, desc) {
  if( objectHasOwnProperty(obj, name)) {
    const preDesc=  getOwnPropertyDescriptor(obj, name);
    if(
      !preDesc||
      !is(preDesc.value, desc.value)||
      preDesc.get!==  desc.get||
      preDesc.set!==  desc.set||
      preDesc.writable!==  desc.writable||
      preDesc.enumerable!==  desc.enumerable||
      preDesc.configurable!==  desc.configurable)
      {
      throw TypeError( `Conflicting definitions of ${name}`);
     }
   }
  defineProperty(obj, name, desc);
 }

// Like defineProperties, but throws if it would modify an existing property.
// This ensures that the intrinsics added to the intrinsics collector object
// graph do not overlap.
function initProperties(obj, descs) {
  for( const [name, desc]of  entries(descs)) {
    initProperty(obj, name, desc);
   }
 }

// sampleGlobals creates an intrinsics object, suitable for
// interinsicsCollector.addIntrinsics, from the named properties of a global
// object.
function sampleGlobals(globalObject, newPropertyNames) {
  const newIntrinsics=  { __proto__: null};
  for( const [globalName, intrinsicName]of  entries(newPropertyNames)) {
    if( objectHasOwnProperty(globalObject, globalName)) {
      newIntrinsics[intrinsicName]=  globalObject[globalName];
     }
   }
  return newIntrinsics;
 }

const        makeIntrinsicsCollector=  ()=>  {
  /** @type {Record<any, any>} */
  const intrinsics=  create(null);
  let pseudoNatives;

  const addIntrinsics=  (newIntrinsics)=>{
    initProperties(intrinsics, getOwnPropertyDescriptors(newIntrinsics));
   };
  freeze(addIntrinsics);

  // For each intrinsic, if it has a `.prototype` property, use the
  // whitelist to find out the intrinsic name for that prototype and add it
  // to the intrinsics.
  const completePrototypes=  ()=>  {
    for( const [name, intrinsic]of  entries(intrinsics)) {
      if( !isObject(intrinsic)) {
        // eslint-disable-next-line no-continue
        continue;
       }
      if( !objectHasOwnProperty(intrinsic, 'prototype')) {
        // eslint-disable-next-line no-continue
        continue;
       }
      const permit=  permitted[name];
      if( typeof permit!==  'object') {
        throw TypeError( `Expected permit object at whitelist.${name}`);
       }
      const namePrototype=  permit.prototype;
      if( !namePrototype) {
        throw TypeError( `${name}.prototype property not whitelisted`);
       }
      if(
        typeof namePrototype!==  'string'||
        !objectHasOwnProperty(permitted, namePrototype))
        {
        throw TypeError( `Unrecognized ${name}.prototype whitelist entry`);
       }
      const intrinsicPrototype=  intrinsic.prototype;
      if( objectHasOwnProperty(intrinsics, namePrototype)) {
        if( intrinsics[namePrototype]!==  intrinsicPrototype) {
          throw TypeError( `Conflicting bindings of ${namePrototype}`);
         }
        // eslint-disable-next-line no-continue
        continue;
       }
      intrinsics[namePrototype]=  intrinsicPrototype;
     }
   };
  freeze(completePrototypes);

  const finalIntrinsics=  ()=>  {
    freeze(intrinsics);
    pseudoNatives=  new WeakSet(arrayFilter(values(intrinsics), isFunction));
    return intrinsics;
   };
  freeze(finalIntrinsics);

  const isPseudoNative=  (obj)=>{
    if( !pseudoNatives) {
      throw TypeError(
        'isPseudoNative can only be called after finalIntrinsics');

     }
    return weaksetHas(pseudoNatives, obj);
   };
  freeze(isPseudoNative);

  const intrinsicsCollector=  {
    addIntrinsics,
    completePrototypes,
    finalIntrinsics,
    isPseudoNative};

  freeze(intrinsicsCollector);

  addIntrinsics(constantProperties);
  addIntrinsics(sampleGlobals(globalThis, universalPropertyNames));

  return intrinsicsCollector;
 };

/**
 * getGlobalIntrinsics()
 * Doesn't tame, delete, or modify anything. Samples globalObject to create an
 * intrinsics record containing only the whitelisted global variables, listed
 * by the intrinsic names appropriate for new globals, i.e., the globals of
 * newly constructed compartments.
 *
 * WARNING:
 * If run before lockdown, the returned intrinsics record will carry the
 * *original* unsafe (feral, untamed) bindings of these global variables.
 *
 * @param {object} globalObject
 */$h‍_once.makeIntrinsicsCollector(makeIntrinsicsCollector);
const        getGlobalIntrinsics=  (globalObject)=>{
  const { addIntrinsics, finalIntrinsics}=   makeIntrinsicsCollector();

  addIntrinsics(sampleGlobals(globalObject, sharedGlobalPropertyNames));

  return finalIntrinsics();
 };$h‍_once.getGlobalIntrinsics(getGlobalIntrinsics);
})()
,
// === functors[13] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let permitted,FunctionInstance,isAccessorPermit,Map,String,Symbol,TypeError,arrayFilter,arrayIncludes,arrayMap,entries,getOwnPropertyDescriptor,getPrototypeOf,isObject,mapGet,objectHasOwnProperty,ownKeys,symbolKeyFor;$h‍_imports([["./permits.js", [["permitted", [$h‍_a => (permitted = $h‍_a)]],["FunctionInstance", [$h‍_a => (FunctionInstance = $h‍_a)]],["isAccessorPermit", [$h‍_a => (isAccessorPermit = $h‍_a)]]]],["./commons.js", [["Map", [$h‍_a => (Map = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["Symbol", [$h‍_a => (Symbol = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["arrayIncludes", [$h‍_a => (arrayIncludes = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getPrototypeOf", [$h‍_a => (getPrototypeOf = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["ownKeys", [$h‍_a => (ownKeys = $h‍_a)]],["symbolKeyFor", [$h‍_a => (symbolKeyFor = $h‍_a)]]]]]);   































































/**
 * whitelistIntrinsics()
 * Removes all non-allowed properties found by recursively and
 * reflectively walking own property chains.
 *
 * @param {object} intrinsics
 * @param {(object) => void} markVirtualizedNativeFunction
 */
function                whitelistIntrinsics(
  intrinsics,
  markVirtualizedNativeFunction)
  {
  // These primitives are allowed allowed for permits.
  const primitives=  ['undefined', 'boolean', 'number', 'string', 'symbol'];

  // These symbols are allowed as well-known symbols
  const wellKnownSymbolNames=  new Map(
    Symbol?
        arrayMap(
          arrayFilter(
            entries(permitted['%SharedSymbol%']),
            ([name, permit])=>
              permit===  'symbol'&&  typeof Symbol[name]===  'symbol'),

          ([name])=>  [Symbol[name],  `@@${name}`]):

        []);


  /**
   * asStringPropertyName()
   *
   * @param {string} path
   * @param {string | symbol} prop
   */
  function asStringPropertyName(path, prop) {
    if( typeof prop===  'string') {
      return prop;
     }

    const wellKnownSymbol=  mapGet(wellKnownSymbolNames, prop);

    if( typeof prop===  'symbol') {
      if( wellKnownSymbol) {
        return wellKnownSymbol;
       }else {
        const registeredKey=  symbolKeyFor(prop);
        if( registeredKey!==  undefined) {
          return  `RegisteredSymbol(${registeredKey})`;
         }else {
          return  `Unique${String(prop)}`;
         }
       }
     }

    throw TypeError( `Unexpected property name type ${path} ${prop}`);
   }

  /*
   * visitPrototype()
   * Validate the object's [[prototype]] against a permit.
   */
  function visitPrototype(path, obj, protoName) {
    if( !isObject(obj)) {
      throw TypeError( `Object expected: ${path}, ${obj}, ${protoName}`);
     }
    const proto=  getPrototypeOf(obj);

    // Null prototype.
    if( proto===  null&&  protoName===  null) {
      return;
     }

    // Assert: protoName, if provided, is a string.
    if( protoName!==  undefined&&  typeof protoName!==  'string') {
      throw TypeError( `Malformed whitelist permit ${path}.__proto__`);
     }

    // If permit not specified, default to Object.prototype.
    if( proto===  intrinsics[protoName||  '%ObjectPrototype%']) {
      return;
     }

    // We can't clean [[prototype]], therefore abort.
    throw TypeError( `Unexpected intrinsic ${path}.__proto__ at ${protoName}`);
   }

  /*
   * isAllowedPropertyValue()
   * Whitelist a single property value against a permit.
   */
  function isAllowedPropertyValue(path, value, prop, permit) {
    if( typeof permit===  'object') {
      // eslint-disable-next-line no-use-before-define
      visitProperties(path, value, permit);
      // The property is allowed.
      return true;
     }

    if( permit===  false) {
      // A boolan 'false' permit specifies the removal of a property.
      // We require a more specific permit instead of allowing 'true'.
      return false;
     }

    if( typeof permit===  'string') {
      // A string permit can have one of two meanings:

      if( prop===  'prototype'||  prop===  'constructor') {
        // For prototype and constructor value properties, the permit
        // is the name of an intrinsic.
        // Assumption: prototype and constructor cannot be primitives.
        // Assert: the permit is the name of an intrinsic.
        // Assert: the property value is equal to that intrinsic.

        if( objectHasOwnProperty(intrinsics, permit)) {
          if( value!==  intrinsics[permit]) {
            throw TypeError( `Does not match whitelist ${path}`);
           }
          return true;
         }
       }else {
        // For all other properties, the permit is the name of a primitive.
        // Assert: the permit is the name of a primitive.
        // Assert: the property value type is equal to that primitive.

        // eslint-disable-next-line no-lonely-if
        if( arrayIncludes(primitives, permit)) {
          // eslint-disable-next-line valid-typeof
          if( typeof value!==  permit) {
            throw TypeError(
               `At ${path} expected ${permit} not ${typeof value}`);

           }
          return true;
         }
       }
     }

    throw TypeError( `Unexpected whitelist permit ${permit} at ${path}`);
   }

  /*
   * isAllowedProperty()
   * Check whether a single property is allowed.
   */
  function isAllowedProperty(path, obj, prop, permit) {
    const desc=  getOwnPropertyDescriptor(obj, prop);
    if( !desc) {
      throw TypeError( `Property ${prop} not found at ${path}`);
     }

    // Is this a value property?
    if( objectHasOwnProperty(desc, 'value')) {
      if( isAccessorPermit(permit)) {
        throw TypeError( `Accessor expected at ${path}`);
       }
      return isAllowedPropertyValue(path, desc.value, prop, permit);
     }
    if( !isAccessorPermit(permit)) {
      throw TypeError( `Accessor not expected at ${path}`);
     }
    return(
      isAllowedPropertyValue( `${path}<get>`,desc.get, prop, permit.get)&&
      isAllowedPropertyValue( `${path}<set>`,desc.set, prop, permit.set));

   }

  /*
   * getSubPermit()
   */
  function getSubPermit(obj, permit, prop) {
    const permitProp=  prop===  '__proto__'?  '--proto--':  prop;
    if( objectHasOwnProperty(permit, permitProp)) {
      return permit[permitProp];
     }

    if( typeof obj===  'function') {
      if( objectHasOwnProperty(FunctionInstance, permitProp)) {
        return FunctionInstance[permitProp];
       }
     }

    return undefined;
   }

  /*
   * visitProperties()
   * Visit all properties for a permit.
   */
  function visitProperties(path, obj, permit) {
    if( obj===  undefined||  obj===  null) {
      return;
     }

    const protoName=  permit['[[Proto]]'];
    visitPrototype(path, obj, protoName);

    if( typeof obj===  'function') {
      markVirtualizedNativeFunction(obj);
     }

    for( const prop of ownKeys(obj)) {
      const propString=  asStringPropertyName(path, prop);
      const subPath=   `${path}.${propString}`;
      const subPermit=  getSubPermit(obj, permit, propString);

      if( !subPermit||  !isAllowedProperty(subPath, obj, prop, subPermit)) {
        // Either the object lacks a permit or the object doesn't match the
        // permit.
        // If the permit is specifically false, not merely undefined,
        // this is a property we expect to see because we know it exists in
        // some environments and we have expressly decided to exclude it.
        // Any other disallowed property is one we have not audited and we log
        // that we are removing it so we know to look into it, as happens when
        // the language evolves new features to existing intrinsics.
        if( subPermit!==  false) {
          // This call to `console.warn` is intentional. It is not a vestige of
          // a debugging attempt. See the comment at top of file for an
          // explanation.
          // eslint-disable-next-line @endo/no-polymorphic-call
          console.warn( `Removing ${subPath}`);
         }
        try {
          delete obj[prop];
         }catch( err) {
          if( prop in obj) {
            if( typeof obj===  'function'&&  prop===  'prototype') {
              obj.prototype=  undefined;
              if( obj.prototype===  undefined) {
                // eslint-disable-next-line @endo/no-polymorphic-call
                console.warn( `Tolerating undeletable ${subPath} === undefined`);
                // eslint-disable-next-line no-continue
                continue;
               }
             }
            // eslint-disable-next-line @endo/no-polymorphic-call
            console.error( `failed to delete ${subPath}`,err);
           }else {
            // eslint-disable-next-line @endo/no-polymorphic-call
            console.error( `deleting ${subPath} threw`,err);
           }
          throw err;
         }
       }
     }
   }

  // Start path with 'intrinsics' to clarify that properties are not
  // removed from the global object by the whitelisting operation.
  visitProperties('intrinsics', intrinsics, permitted);
 }$h‍_once.default(     whitelistIntrinsics);
})()
,
// === functors[14] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_FUNCTION,SyntaxError,TypeError,defineProperties,getPrototypeOf,setPrototypeOf,freeze;$h‍_imports([["./commons.js", [["FERAL_FUNCTION", [$h‍_a => (FERAL_FUNCTION = $h‍_a)]],["SyntaxError", [$h‍_a => (SyntaxError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["getPrototypeOf", [$h‍_a => (getPrototypeOf = $h‍_a)]],["setPrototypeOf", [$h‍_a => (setPrototypeOf = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]]]]]);   









// This module replaces the original `Function` constructor, and the original
// `%GeneratorFunction%`, `%AsyncFunction%` and `%AsyncGeneratorFunction%`,
// with safe replacements that throw if invoked.
//
// These are all reachable via syntax, so it isn't sufficient to just
// replace global properties with safe versions. Our main goal is to prevent
// access to the `Function` constructor through these starting points.
//
// After modules block is done, the originals must no longer be reachable,
// unless a copy has been made, and functions can only be created by syntax
// (using eval) or by invoking a previously saved reference to the originals.
//
// Typically, this module will not be used directly, but via the
// [lockdown - shim] which handles all necessary repairs and taming in SES.
//
// Relation to ECMA specifications
//
// The taming of constructors really wants to be part of the standard, because
// new constructors may be added in the future, reachable from syntax, and this
// list must be updated to match.
//
// In addition, the standard needs to define four new intrinsics for the safe
// replacement functions. See [./permits-intrinsics.js].
//
// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js

/**
 * tameFunctionConstructors()
 * This block replaces the original Function constructor, and the original
 * %GeneratorFunction% %AsyncFunction% and %AsyncGeneratorFunction%, with
 * safe replacements that throw if invoked.
 */
function                tameFunctionConstructors() {
  try {
    // Verify that the method is not callable.
    // eslint-disable-next-line @endo/no-polymorphic-call
    FERAL_FUNCTION.prototype.constructor('return 1');
   }catch( ignore) {
    // Throws, no need to patch.
    return freeze({});
   }

  const newIntrinsics=  {};

  /*
   * The process to repair constructors:
   * 1. Create an instance of the function by evaluating syntax
   * 2. Obtain the prototype from the instance
   * 3. Create a substitute tamed constructor
   * 4. Replace the original constructor with the tamed constructor
   * 5. Replace tamed constructor prototype property with the original one
   * 6. Replace its [[Prototype]] slot with the tamed constructor of Function
   */
  function repairFunction(name, intrinsicName, declaration) {
    let FunctionInstance;
    try {
      // eslint-disable-next-line no-eval, no-restricted-globals
      FunctionInstance=  (0, eval)(declaration);
     }catch( e) {
      if( e instanceof SyntaxError) {
        // Prevent failure on platforms where async and/or generators
        // are not supported.
        return;
       }
      // Re-throw
      throw e;
     }
    const FunctionPrototype=  getPrototypeOf(FunctionInstance);

    // Prevents the evaluation of source when calling constructor on the
    // prototype of functions.
    // eslint-disable-next-line func-names
    const InertConstructor=  function()  {
      throw TypeError(
        'Function.prototype.constructor is not a valid constructor.');

     };
    defineProperties(InertConstructor, {
      prototype: { value: FunctionPrototype},
      name: {
        value: name,
        writable: false,
        enumerable: false,
        configurable: true}});



    defineProperties(FunctionPrototype, {
      constructor: { value: InertConstructor}});


    // Reconstructs the inheritance among the new tamed constructors
    // to mirror the original specified in normal JS.
    if( InertConstructor!==  FERAL_FUNCTION.prototype.constructor) {
      setPrototypeOf(InertConstructor, FERAL_FUNCTION.prototype.constructor);
     }

    newIntrinsics[intrinsicName]=  InertConstructor;
   }

  // Here, the order of operation is important: Function needs to be repaired
  // first since the other repaired constructors need to inherit from the
  // tamed Function function constructor.

  repairFunction('Function', '%InertFunction%', '(function(){})');
  repairFunction(
    'GeneratorFunction',
    '%InertGeneratorFunction%',
    '(function*(){})');

  repairFunction(
    'AsyncFunction',
    '%InertAsyncFunction%',
    '(async function(){})');

  repairFunction(
    'AsyncGeneratorFunction',
    '%InertAsyncGeneratorFunction%',
    '(async function*(){})');


  return newIntrinsics;
 }$h‍_once.default(     tameFunctionConstructors);
})()
,
// === functors[15] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Date,TypeError,apply,construct,defineProperties;$h‍_imports([["./commons.js", [["Date", [$h‍_a => (Date = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["apply", [$h‍_a => (apply = $h‍_a)]],["construct", [$h‍_a => (construct = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]]]]]);   









function                tameDateConstructor(dateTaming=  'safe') {
  if( dateTaming!==  'safe'&&  dateTaming!==  'unsafe') {
    throw TypeError( `unrecognized dateTaming ${dateTaming}`);
   }
  const OriginalDate=  Date;
  const DatePrototype=  OriginalDate.prototype;

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods=  {
    /**
     * `%SharedDate%.now()` throw a `TypeError` starting with "secure mode".
     * See https://github.com/endojs/endo/issues/910#issuecomment-1581855420
     */
    now() {
      throw TypeError('secure mode Calling %SharedDate%.now() throws');
     }};


  /**
   * Tame the Date constructor.
   * See https://github.com/endojs/endo/issues/910#issuecomment-1581855420
   *
   * Common behavior
   *   * `new Date(x)` coerces x into a number and then returns a Date
   *     for that number of millis since the epoch
   *   * `new Date(NaN)` returns a Date object which stringifies to
   *     'Invalid Date'
   *   * `new Date(undefined)` returns a Date object which stringifies to
   *     'Invalid Date'
   *
   * OriginalDate (normal standard) behavior preserved by
   * `%InitialDate%`.
   *   * `Date(anything)` gives a string with the current time
   *   * `new Date()` returns the current time, as a Date object
   *
   * `%SharedDate%` behavior
   *   * `Date(anything)` throws a TypeError starting with "secure mode"
   *   * `new Date()` throws a TypeError starting with "secure mode"
   *
   * @param {{powers?: string}} [opts]
   */
  const makeDateConstructor=  ({ powers=  'none'}=   {})=>  {
    let ResultDate;
    if( powers===  'original') {
      // eslint-disable-next-line no-shadow
      ResultDate=  function Date(...rest) {
        if( new.target===  undefined) {
          return apply(OriginalDate, undefined, rest);
         }
        return construct(OriginalDate, rest, new.target);
       };
     }else {
      // eslint-disable-next-line no-shadow
      ResultDate=  function Date(...rest) {
        if( new.target===  undefined) {
          throw TypeError(
            'secure mode Calling %SharedDate% constructor as a function throws');

         }
        if( rest.length===  0) {
          throw TypeError(
            'secure mode Calling new %SharedDate%() with no arguments throws');

         }
        return construct(OriginalDate, rest, new.target);
       };
     }

    defineProperties(ResultDate, {
      length: { value: 7},
      prototype: {
        value: DatePrototype,
        writable: false,
        enumerable: false,
        configurable: false},

      parse: {
        value: OriginalDate.parse,
        writable: true,
        enumerable: false,
        configurable: true},

      UTC: {
        value: OriginalDate.UTC,
        writable: true,
        enumerable: false,
        configurable: true}});


    return ResultDate;
   };
  const InitialDate=  makeDateConstructor({ powers: 'original'});
  const SharedDate=  makeDateConstructor({ powers: 'none'});

  defineProperties(InitialDate, {
    now: {
      value: OriginalDate.now,
      writable: true,
      enumerable: false,
      configurable: true}});


  defineProperties(SharedDate, {
    now: {
      value: tamedMethods.now,
      writable: true,
      enumerable: false,
      configurable: true}});



  defineProperties(DatePrototype, {
    constructor: { value: SharedDate}});


  return {
    '%InitialDate%': InitialDate,
    '%SharedDate%': SharedDate};

 }$h‍_once.default(     tameDateConstructor);
})()
,
// === functors[16] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Math,TypeError,create,getOwnPropertyDescriptors,objectPrototype;$h‍_imports([["./commons.js", [["Math", [$h‍_a => (Math = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["objectPrototype", [$h‍_a => (objectPrototype = $h‍_a)]]]]]);   







function                tameMathObject(mathTaming=  'safe') {
  if( mathTaming!==  'safe'&&  mathTaming!==  'unsafe') {
    throw TypeError( `unrecognized mathTaming ${mathTaming}`);
   }
  const originalMath=  Math;
  const initialMath=  originalMath; // to follow the naming pattern

  const { random: _, ...otherDescriptors}=
    getOwnPropertyDescriptors(originalMath);

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods=  {
    /**
     * `%SharedMath%.random()` throws a TypeError starting with "secure mode".
     * See https://github.com/endojs/endo/issues/910#issuecomment-1581855420
     */
    random() {
      throw TypeError('secure mode %SharedMath%.random() throws');
     }};


  const sharedMath=  create(objectPrototype, {
    ...otherDescriptors,
    random: {
      value: tamedMethods.random,
      writable: true,
      enumerable: false,
      configurable: true}});



  return {
    '%InitialMath%': initialMath,
    '%SharedMath%': sharedMath};

 }$h‍_once.default(     tameMathObject);
})()
,
// === functors[17] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_REG_EXP,TypeError,construct,defineProperties,getOwnPropertyDescriptor,speciesSymbol;$h‍_imports([["./commons.js", [["FERAL_REG_EXP", [$h‍_a => (FERAL_REG_EXP = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["construct", [$h‍_a => (construct = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["speciesSymbol", [$h‍_a => (speciesSymbol = $h‍_a)]]]]]);   








function                tameRegExpConstructor(regExpTaming=  'safe') {
  if( regExpTaming!==  'safe'&&  regExpTaming!==  'unsafe') {
    throw TypeError( `unrecognized regExpTaming ${regExpTaming}`);
   }
  const RegExpPrototype=  FERAL_REG_EXP.prototype;

  const makeRegExpConstructor=  (_=  {})=>  {
    // RegExp has non-writable static properties we need to omit.
    /**
     * @param  {Parameters<typeof FERAL_REG_EXP>} rest
     */
    const ResultRegExp=  function RegExp(...rest) {
      if( new.target===  undefined) {
        return FERAL_REG_EXP(...rest);
       }
      return construct(FERAL_REG_EXP, rest, new.target);
     };

    const speciesDesc=  getOwnPropertyDescriptor(FERAL_REG_EXP, speciesSymbol);
    if( !speciesDesc) {
      throw TypeError('no RegExp[Symbol.species] descriptor');
     }

    defineProperties(ResultRegExp, {
      length: { value: 2},
      prototype: {
        value: RegExpPrototype,
        writable: false,
        enumerable: false,
        configurable: false},

      [speciesSymbol]: speciesDesc});

    return ResultRegExp;
   };

  const InitialRegExp=  makeRegExpConstructor();
  const SharedRegExp=  makeRegExpConstructor();

  if( regExpTaming!==  'unsafe') {
    // @ts-expect-error Deleted properties must be optional
    delete RegExpPrototype.compile;
   }
  defineProperties(RegExpPrototype, {
    constructor: { value: SharedRegExp}});


  return {
    '%InitialRegExp%': InitialRegExp,
    '%SharedRegExp%': SharedRegExp};

 }$h‍_once.default(     tameRegExpConstructor);
})()
,
// === functors[18] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /**
 * @file Exports {@code enablements}, a recursively defined
 * JSON record defining the optimum set of intrinsics properties
 * that need to be "repaired" before hardening is applied on
 * enviromments subject to the override mistake.
 *
 * @author JF Paradis
 * @author Mark S. Miller
 */

/**
 * <p>Because "repairing" replaces data properties with accessors, every
 * time a repaired property is accessed, the associated getter is invoked,
 * which degrades the runtime performance of all code executing in the
 * repaired enviromment, compared to the non-repaired case. In order
 * to maintain performance, we only repair the properties of objects
 * for which hardening causes a breakage of their normal intended usage.
 *
 * There are three unwanted cases:
 * <ul>
 * <li>Overriding properties on objects typically used as records,
 *     namely {@code "Object"} and {@code "Array"}. In the case of arrays,
 *     the situation is unintentional, a given program might not be aware
 *     that non-numerical properties are stored on the underlying object
 *     instance, not on the array. When an object is typically used as a
 *     map, we repair all of its prototype properties.
 * <li>Overriding properties on objects that provide defaults on their
 *     prototype and that programs typically set using an assignment, such as
 *     {@code "Error.prototype.message"} and {@code "Function.prototype.name"}
 *     (both default to "").
 * <li>Setting-up a prototype chain, where a constructor is set to extend
 *     another one. This is typically set by assignment, for example
 *     {@code "Child.prototype.constructor = Child"}, instead of invoking
 *     Object.defineProperty();
 *
 * <p>Each JSON record enumerates the disposition of the properties on
 * some corresponding intrinsic object.
 *
 * <p>For each such record, the values associated with its property
 * names can be:
 * <ul>
 * <li>true, in which case this property is simply repaired. The
 *     value associated with that property is not traversed. For
 *     example, {@code "Function.prototype.name"} leads to true,
 *     meaning that the {@code "name"} property of {@code
 *     "Function.prototype"} should be repaired (which is needed
 *     when inheriting from @code{Function} and setting the subclass's
 *     {@code "prototype.name"} property). If the property is
 *     already an accessor property, it is not repaired (because
 *     accessors are not subject to the override mistake).
 * <li>"*", in which case this property is not repaired but the
 *     value associated with that property are traversed and repaired.
 * <li>Another record, in which case this property is not repaired
 *     and that next record represents the disposition of the object
 *     which is its value. For example,{@code "FunctionPrototype"}
 *     leads to another record explaining which properties {@code
 *     Function.prototype} need to be repaired.
 */

/**
 * Minimal enablements when all the code is modern and known not to
 * step into the override mistake, except for the following pervasive
 * cases.
 */
const        minEnablements=  {
  '%ObjectPrototype%': {
    toString: true},


  '%FunctionPrototype%': {
    toString: true  // set by "rollup"
},

  '%ErrorPrototype%': {
    name: true  // set by "precond", "ava", "node-fetch"
}};


/**
 * Moderate enablements are usually good enough for legacy compat.
 */$h‍_once.minEnablements(minEnablements);
const        moderateEnablements=  {
  '%ObjectPrototype%': {
    toString: true,
    valueOf: true},


  '%ArrayPrototype%': {
    toString: true,
    push: true  // set by "Google Analytics"
},

  // Function.prototype has no 'prototype' property to enable.
  // Function instances have their own 'name' and 'length' properties
  // which are configurable and non-writable. Thus, they are already
  // non-assignable anyway.
  '%FunctionPrototype%': {
    constructor: true, // set by "regenerator-runtime"
    bind: true, // set by "underscore", "express"
    toString: true  // set by "rollup"
},

  '%ErrorPrototype%': {
    constructor: true, // set by "fast-json-patch", "node-fetch"
    message: true,
    name: true, // set by "precond", "ava", "node-fetch", "node 14"
    toString: true  // set by "bluebird"
},

  '%TypeErrorPrototype%': {
    constructor: true, // set by "readable-stream"
    message: true, // set by "tape"
    name: true  // set by "readable-stream", "node 14"
},

  '%SyntaxErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
    name: true  // set by "node 14"
},

  '%RangeErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
    name: true  // set by "node 14"
},

  '%URIErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
    name: true  // set by "node 14"
},

  '%EvalErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
    name: true  // set by "node 14"
},

  '%ReferenceErrorPrototype%': {
    message: true, // to match TypeErrorPrototype.message
    name: true  // set by "node 14"
},

  '%PromisePrototype%': {
    constructor: true  // set by "core-js"
},

  '%TypedArrayPrototype%': '*', // set by https://github.com/feross/buffer

  '%Generator%': {
    constructor: true,
    name: true,
    toString: true},


  '%IteratorPrototype%': {
    toString: true}};



/**
 * The 'severe' enablement are needed because of issues tracked at
 * https://github.com/endojs/endo/issues/576
 *
 * They are like the `moderate` enablements except for the entries below.
 */$h‍_once.moderateEnablements(moderateEnablements);
const        severeEnablements=  {
  ...moderateEnablements,

  /**
   * Rollup (as used at least by vega) and webpack
   * (as used at least by regenerator) both turn exports into assignments
   * to a big `exports` object that inherits directly from
   * `Object.prototype`. Some of the exported names we've seen include
   * `hasOwnProperty`, `constructor`, and `toString`. But the strategy used
   * by rollup and webpack potentionally turns any exported name
   * into an assignment rejected by the override mistake. That's why
   * the `severe` enablements takes the extreme step of enabling
   * everything on `Object.prototype`.
   *
   * In addition, code doing inheritance manually will often override
   * the `constructor` property on the new prototype by assignment. We've
   * seen this several times.
   *
   * The cost of enabling all these is that they create a miserable debugging
   * experience specifically on Node.
   * https://github.com/Agoric/agoric-sdk/issues/2324
   * explains how it confused the Node console.
   *
   * (TODO Reexamine the vscode situation. I think it may have improved
   * since the following paragraph was written.)
   *
   * The vscode debugger's object inspector shows the own data properties of
   * an object, which is typically what you want, but also shows both getter
   * and setter for every accessor property whether inherited or own.
   * With the `'*'` setting here, all the properties inherited from
   * `Object.prototype` are accessors, creating an unusable display as seen
   * at As explained at
   * https://github.com/endojs/endo/blob/master/packages/ses/lockdown-options.md#overridetaming-options
   * Open the triangles at the bottom of that section.
   */
  '%ObjectPrototype%': '*',

  /**
   * The widely used Buffer defined at https://github.com/feross/buffer
   * on initialization, manually creates the equivalent of a subclass of
   * `TypedArray`, which it then initializes by assignment. These assignments
   * include enough of the `TypeArray` methods that here, the `severe`
   * enablements just enable them all.
   */
  '%TypedArrayPrototype%': '*',

  /**
   * Needed to work with Immer before https://github.com/immerjs/immer/pull/914
   * is accepted.
   */
  '%MapPrototype%': '*',

  /**
   * Needed to work with Immer before https://github.com/immerjs/immer/pull/914
   * is accepted.
   */
  '%SetPrototype%': '*'};$h‍_once.severeEnablements(severeEnablements);
})()
,
// === functors[19] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Set,String,TypeError,arrayForEach,defineProperty,getOwnPropertyDescriptor,getOwnPropertyDescriptors,getOwnPropertyNames,isObject,objectHasOwnProperty,ownKeys,setHas,minEnablements,moderateEnablements,severeEnablements;$h‍_imports([["./commons.js", [["Set", [$h‍_a => (Set = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["arrayForEach", [$h‍_a => (arrayForEach = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["getOwnPropertyNames", [$h‍_a => (getOwnPropertyNames = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["ownKeys", [$h‍_a => (ownKeys = $h‍_a)]],["setHas", [$h‍_a => (setHas = $h‍_a)]]]],["./enablements.js", [["minEnablements", [$h‍_a => (minEnablements = $h‍_a)]],["moderateEnablements", [$h‍_a => (moderateEnablements = $h‍_a)]],["severeEnablements", [$h‍_a => (severeEnablements = $h‍_a)]]]]]);   

























/**
 * For a special set of properties defined in the `enablement` whitelist,
 * `enablePropertyOverrides` ensures that the effect of freezing does not
 * suppress the ability to override these properties on derived objects by
 * simple assignment.
 *
 * Because of lack of sufficient foresight at the time, ES5 unfortunately
 * specified that a simple assignment to a non-existent property must fail if
 * it would override an non-writable data property of the same name in the
 * shadow of the prototype chain. In retrospect, this was a mistake, the
 * so-called "override mistake". But it is now too late and we must live with
 * the consequences.
 *
 * As a result, simply freezing an object to make it tamper proof has the
 * unfortunate side effect of breaking previously correct code that is
 * considered to have followed JS best practices, if this previous code used
 * assignment to override.
 *
 * For the enabled properties, `enablePropertyOverrides` effectively shims what
 * the assignment behavior would have been in the absence of the override
 * mistake. However, the shim produces an imperfect emulation. It shims the
 * behavior by turning these data properties into accessor properties, where
 * the accessor's getter and setter provide the desired behavior. For
 * non-reflective operations, the illusion is perfect. However, reflective
 * operations like `getOwnPropertyDescriptor` see the descriptor of an accessor
 * property rather than the descriptor of a data property. At the time of this
 * writing, this is the best we know how to do.
 *
 * To the getter of the accessor we add a property named
 * `'originalValue'` whose value is, as it says, the value that the
 * data property had before being converted to an accessor property. We add
 * this extra property to the getter for two reason:
 *
 * The harden algorithm walks the own properties reflectively, i.e., with
 * `getOwnPropertyDescriptor` semantics, rather than `[[Get]]` semantics. When
 * it sees an accessor property, it does not invoke the getter. Rather, it
 * proceeds to walk both the getter and setter as part of its transitive
 * traversal. Without this extra property, `enablePropertyOverrides` would have
 * hidden the original data property value from `harden`, which would be bad.
 * Instead, by exposing that value in an own data property on the getter,
 * `harden` finds and walks it anyway.
 *
 * We enable a form of cooperative emulation, giving reflective code an
 * opportunity to cooperate in upholding the illusion. When such cooperative
 * reflective code sees an accessor property, where the accessor's getter
 * has an `originalValue` property, it knows that the getter is
 * alleging that it is the result of the `enablePropertyOverrides` conversion
 * pattern, so it can decide to cooperatively "pretend" that it sees a data
 * property with that value.
 *
 * @param {Record<string, any>} intrinsics
 * @param {'min' | 'moderate' | 'severe'} overrideTaming
 * @param {Iterable<string | symbol>} [overrideDebug]
 */
function                enablePropertyOverrides(
  intrinsics,
  overrideTaming,
  overrideDebug=  [])
  {
  const debugProperties=  new Set(overrideDebug);
  function enable(path, obj, prop, desc) {
    if( 'value'in  desc&&  desc.configurable) {
      const { value}=   desc;

      function getter() {
        return value;
       }
      defineProperty(getter, 'originalValue', {
        value,
        writable: false,
        enumerable: false,
        configurable: false});


      const isDebug=  setHas(debugProperties, prop);

      function setter(newValue) {
        if( obj===  this) {
          throw TypeError(
             `Cannot assign to read only property '${String(
              prop)
              }' of '${path}'`);

         }
        if( objectHasOwnProperty(this, prop)) {
          this[prop]=  newValue;
         }else {
          if( isDebug) {
            // eslint-disable-next-line @endo/no-polymorphic-call
            console.error(TypeError( `Override property ${prop}`));
           }
          defineProperty(this, prop, {
            value: newValue,
            writable: true,
            enumerable: true,
            configurable: true});

         }
       }

      defineProperty(obj, prop, {
        get: getter,
        set: setter,
        enumerable: desc.enumerable,
        configurable: desc.configurable});

     }
   }

  function enableProperty(path, obj, prop) {
    const desc=  getOwnPropertyDescriptor(obj, prop);
    if( !desc) {
      return;
     }
    enable(path, obj, prop, desc);
   }

  function enableAllProperties(path, obj) {
    const descs=  getOwnPropertyDescriptors(obj);
    if( !descs) {
      return;
     }
    // TypeScript does not allow symbols to be used as indexes because it
    // cannot recokon types of symbolized properties.
    // @ts-ignore
    arrayForEach(ownKeys(descs), (prop)=>enable(path, obj, prop, descs[prop]));
   }

  function enableProperties(path, obj, plan) {
    for( const prop of getOwnPropertyNames(plan)) {
      const desc=  getOwnPropertyDescriptor(obj, prop);
      if( !desc||  desc.get||  desc.set) {
        // No not a value property, nothing to do.
        // eslint-disable-next-line no-continue
        continue;
       }

      // Plan has no symbol keys and we use getOwnPropertyNames()
      // so `prop` cannot only be a string, not a symbol. We coerce it in place
      // with `String(..)` anyway just as good hygiene, since these paths are just
      // for diagnostic purposes.
      const subPath=   `${path}.${String(prop)}`;
      const subPlan=  plan[prop];

      if( subPlan===  true) {
        enableProperty(subPath, obj, prop);
       }else if( subPlan===  '*') {
        enableAllProperties(subPath, desc.value);
       }else if( isObject(subPlan)) {
        enableProperties(subPath, desc.value, subPlan);
       }else {
        throw TypeError( `Unexpected override enablement plan ${subPath}`);
       }
     }
   }

  let plan;
  switch( overrideTaming){
    case 'min': {
      plan=  minEnablements;
      break;
     }
    case 'moderate': {
      plan=  moderateEnablements;
      break;
     }
    case 'severe': {
      plan=  severeEnablements;
      break;
     }
    default: {
      throw TypeError( `unrecognized overrideTaming ${overrideTaming}`);
     }}


  // Do the repair.
  enableProperties('root', intrinsics, plan);
 }$h‍_once.default(     enablePropertyOverrides);
})()
,
// === functors[20] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Number,String,TypeError,defineProperty,getOwnPropertyNames,isObject,regexpExec,assert;$h‍_imports([["./commons.js", [["Number", [$h‍_a => (Number = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["getOwnPropertyNames", [$h‍_a => (getOwnPropertyNames = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["regexpExec", [$h‍_a => (regexpExec = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   










const { Fail, quote: q}=   assert;

const localePattern=  /^(\w*[a-z])Locale([A-Z]\w*)$/;

// Use concise methods to obtain named functions without constructor
// behavior or `.prototype` property.
const tamedMethods=  {
  // See https://tc39.es/ecma262/#sec-string.prototype.localecompare
  localeCompare(arg) {
    if( this===  null||  this===  undefined) {
      throw TypeError(
        'Cannot localeCompare with null or undefined "this" value');

     }
    const s=   `${this}`;
    const that=   `${arg}`;
    if( s<  that) {
      return -1;
     }
    if( s>  that) {
      return 1;
     }
    s===  that||  Fail `expected ${q(s)} and ${q(that)} to compare`;
    return 0;
   },

  toString() {
    return  `${this}`;
   }};


const nonLocaleCompare=  tamedMethods.localeCompare;
const numberToString=  tamedMethods.toString;

function                tameLocaleMethods(intrinsics, localeTaming=  'safe') {
  if( localeTaming!==  'safe'&&  localeTaming!==  'unsafe') {
    throw TypeError( `unrecognized localeTaming ${localeTaming}`);
   }
  if( localeTaming===  'unsafe') {
    return;
   }

  defineProperty(String.prototype, 'localeCompare', {
    value: nonLocaleCompare});


  for( const intrinsicName of getOwnPropertyNames(intrinsics)) {
    const intrinsic=  intrinsics[intrinsicName];
    if( isObject(intrinsic)) {
      for( const methodName of getOwnPropertyNames(intrinsic)) {
        const match=  regexpExec(localePattern, methodName);
        if( match) {
          typeof intrinsic[methodName]===  'function'||
            Fail `expected ${q(methodName)} to be a function`;
          const nonLocaleMethodName=   `${match[1]}${match[2]}`;
          const method=  intrinsic[nonLocaleMethodName];
          typeof method===  'function'||
            Fail `function ${q(nonLocaleMethodName)} not found`;
          defineProperty(intrinsic, methodName, { value: method});
         }
       }
     }
   }

  // Numbers are special because toString accepts a radix instead of ignoring
  // all of the arguments that we would otherwise forward.
  defineProperty(Number.prototype, 'toLocaleString', {
    value: numberToString});

 }$h‍_once.default(     tameLocaleMethods);
})()
,
// === functors[21] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /**
 * makeEvalFunction()
 * A safe version of the native eval function which relies on
 * the safety of safeEvaluate for confinement.
 *
 * @param {Function} safeEvaluate
 */
const        makeEvalFunction=  (safeEvaluate)=>{
  // We use the the concise method syntax to create an eval without a
  // [[Construct]] behavior (such that the invocation "new eval()" throws
  // TypeError: eval is not a constructor"), but which still accepts a
  // 'this' binding.
  const newEval=  {
    eval(source) {
      if( typeof source!==  'string') {
        // As per the runtime semantic of PerformEval [ECMAScript 18.2.1.1]:
        // If Type(source) is not String, return source.
        // TODO Recent proposals from Mike Samuel may change this non-string
        // rule. Track.
        return source;
       }
      return safeEvaluate(source);
     }}.
    eval;

  return newEval;
 };$h‍_once.makeEvalFunction(makeEvalFunction);
})()
,
// === functors[22] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_FUNCTION,arrayJoin,arrayPop,defineProperties,getPrototypeOf,assert;$h‍_imports([["./commons.js", [["FERAL_FUNCTION", [$h‍_a => (FERAL_FUNCTION = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["arrayPop", [$h‍_a => (arrayPop = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["getPrototypeOf", [$h‍_a => (getPrototypeOf = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   








const { Fail}=   assert;

/*
 * makeFunctionConstructor()
 * A safe version of the native Function which relies on
 * the safety of safeEvaluate for confinement.
 */
const        makeFunctionConstructor=  (safeEvaluate)=>{
  // Define an unused parameter to ensure Function.length === 1
  const newFunction=  function Function(_body) {
    // Sanitize all parameters at the entry point.
    // eslint-disable-next-line prefer-rest-params
    const bodyText=   `${arrayPop(arguments)|| '' }`;
    // eslint-disable-next-line prefer-rest-params
    const parameters=   `${arrayJoin(arguments,',') }`;

    // Are parameters and bodyText valid code, or is someone
    // attempting an injection attack? This will throw a SyntaxError if:
    // - parameters doesn't parse as parameters
    // - bodyText doesn't parse as a function body
    // - either contain a call to super() or references a super property.
    //
    // It seems that XS may still be vulnerable to the attack explained at
    // https://github.com/tc39/ecma262/pull/2374#issuecomment-813769710
    // where `new Function('/*', '*/ ) {')` would incorrectly validate.
    // Before we worried about this, we check the parameters and bodyText
    // together in one call
    // ```js
    // new FERAL_FUNCTION(parameters, bodyTest);
    // ```
    // However, this check is vulnerable to that bug. Aside from that case,
    // all engines do seem to validate the parameters, taken by themselves,
    // correctly. And all engines do seem to validate the bodyText, taken
    // by itself correctly. So with the following two checks, SES builds a
    // correct safe `Function` constructor by composing two calls to an
    // original unsafe `Function` constructor that may suffer from this bug
    // but is otherwise correctly validating.
    //
    // eslint-disable-next-line no-new
    new FERAL_FUNCTION(parameters, '');
    // eslint-disable-next-line no-new
    new FERAL_FUNCTION(bodyText);

    // Safe to be combined. Defeat potential trailing comments.
    // TODO: since we create an anonymous function, the 'this' value
    // isn't bound to the global object as per specs, but set as undefined.
    const src=   `(function anonymous(${parameters}\n) {\n${bodyText}\n})`;
    return safeEvaluate(src);
   };

  defineProperties(newFunction, {
    // Ensure that any function created in any evaluator in a realm is an
    // instance of Function in any evaluator of the same realm.
    prototype: {
      value: FERAL_FUNCTION.prototype,
      writable: false,
      enumerable: false,
      configurable: false}});



  // Assert identity of Function.__proto__ accross all compartments
  getPrototypeOf(FERAL_FUNCTION)===  FERAL_FUNCTION.prototype||
    Fail `Function prototype is the same accross compartments`;
  getPrototypeOf(newFunction)===  FERAL_FUNCTION.prototype||
    Fail `Function constructor prototype is the same accross compartments`;

  return newFunction;
 };$h‍_once.makeFunctionConstructor(makeFunctionConstructor);
})()
,
// === functors[23] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,assign,create,defineProperty,entries,freeze,objectHasOwnProperty,unscopablesSymbol,makeEvalFunction,makeFunctionConstructor,constantProperties,universalPropertyNames;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["assign", [$h‍_a => (assign = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["unscopablesSymbol", [$h‍_a => (unscopablesSymbol = $h‍_a)]]]],["./make-eval-function.js", [["makeEvalFunction", [$h‍_a => (makeEvalFunction = $h‍_a)]]]],["./make-function-constructor.js", [["makeFunctionConstructor", [$h‍_a => (makeFunctionConstructor = $h‍_a)]]]],["./permits.js", [["constantProperties", [$h‍_a => (constantProperties = $h‍_a)]],["universalPropertyNames", [$h‍_a => (universalPropertyNames = $h‍_a)]]]]]);   













/**
 * The host's ordinary global object is not provided by a `with` block, so
 * assigning to Symbol.unscopables has no effect.
 * Since this shim uses `with` blocks to create a confined lexical scope for
 * guest programs, we cannot emulate the proper behavior.
 * With this shim, assigning Symbol.unscopables causes the given lexical
 * names to fall through to the terminal scope proxy.
 * But, we can install this setter to prevent a program from proceding on
 * this false assumption.
 *
 * @param {object} globalObject
 */
const        setGlobalObjectSymbolUnscopables=  (globalObject)=>{
  defineProperty(
    globalObject,
    unscopablesSymbol,
    freeze(
      assign(create(null), {
        set: freeze(()=>  {
          throw TypeError(
             `Cannot set Symbol.unscopables of a Compartment's globalThis`);

         }),
        enumerable: false,
        configurable: false})));



 };

/**
 * setGlobalObjectConstantProperties()
 * Initializes a new global object using a process similar to ECMA specifications
 * (SetDefaultGlobalBindings). This process is split between this function and
 * `setGlobalObjectMutableProperties`.
 *
 * @param {object} globalObject
 */$h‍_once.setGlobalObjectSymbolUnscopables(setGlobalObjectSymbolUnscopables);
const        setGlobalObjectConstantProperties=  (globalObject)=>{
  for( const [name, constant]of  entries(constantProperties)) {
    defineProperty(globalObject, name, {
      value: constant,
      writable: false,
      enumerable: false,
      configurable: false});

   }
 };

/**
 * setGlobalObjectMutableProperties()
 * Create new global object using a process similar to ECMA specifications
 * (portions of SetRealmGlobalObject and SetDefaultGlobalBindings).
 * `newGlobalPropertyNames` should be either `initialGlobalPropertyNames` or
 * `sharedGlobalPropertyNames`.
 *
 * @param {object} globalObject
 * @param {object} param1
 * @param {object} param1.intrinsics
 * @param {object} param1.newGlobalPropertyNames
 * @param {Function} param1.makeCompartmentConstructor
 * @param {(object) => void} param1.markVirtualizedNativeFunction
 */$h‍_once.setGlobalObjectConstantProperties(setGlobalObjectConstantProperties);
const        setGlobalObjectMutableProperties=  (
  globalObject,
  {
    intrinsics,
    newGlobalPropertyNames,
    makeCompartmentConstructor,
    markVirtualizedNativeFunction})=>

     {
  for( const [name, intrinsicName]of  entries(universalPropertyNames)) {
    if( objectHasOwnProperty(intrinsics, intrinsicName)) {
      defineProperty(globalObject, name, {
        value: intrinsics[intrinsicName],
        writable: true,
        enumerable: false,
        configurable: true});

     }
   }

  for( const [name, intrinsicName]of  entries(newGlobalPropertyNames)) {
    if( objectHasOwnProperty(intrinsics, intrinsicName)) {
      defineProperty(globalObject, name, {
        value: intrinsics[intrinsicName],
        writable: true,
        enumerable: false,
        configurable: true});

     }
   }

  const perCompartmentGlobals=  {
    globalThis: globalObject};


  perCompartmentGlobals.Compartment=  makeCompartmentConstructor(
    makeCompartmentConstructor,
    intrinsics,
    markVirtualizedNativeFunction);


  // TODO These should still be tamed according to the whitelist before
  // being made available.
  for( const [name, value]of  entries(perCompartmentGlobals)) {
    defineProperty(globalObject, name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true});

    if( typeof value===  'function') {
      markVirtualizedNativeFunction(value);
     }
   }
 };

/**
 * setGlobalObjectEvaluators()
 * Set the eval and the Function evaluator on the global object with given evalTaming policy.
 *
 * @param {object} globalObject
 * @param {Function} evaluator
 * @param {(object) => void} markVirtualizedNativeFunction
 */$h‍_once.setGlobalObjectMutableProperties(setGlobalObjectMutableProperties);
const        setGlobalObjectEvaluators=  (
  globalObject,
  evaluator,
  markVirtualizedNativeFunction)=>
     {
  {
    const f=  makeEvalFunction(evaluator);
    markVirtualizedNativeFunction(f);
    defineProperty(globalObject, 'eval', {
      value: f,
      writable: true,
      enumerable: false,
      configurable: true});

   }
  {
    const f=  makeFunctionConstructor(evaluator);
    markVirtualizedNativeFunction(f);
    defineProperty(globalObject, 'Function', {
      value: f,
      writable: true,
      enumerable: false,
      configurable: true});

   }
 };$h‍_once.setGlobalObjectEvaluators(setGlobalObjectEvaluators);
})()
,
// === functors[24] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Proxy,String,TypeError,ReferenceError,create,freeze,getOwnPropertyDescriptors,globalThis,immutableObject,assert;$h‍_imports([["./commons.js", [["Proxy", [$h‍_a => (Proxy = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["ReferenceError", [$h‍_a => (ReferenceError = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["immutableObject", [$h‍_a => (immutableObject = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   












const { Fail, quote: q}=   assert;

/**
 * alwaysThrowHandler
 * This is an object that throws if any property is called. It's used as
 * a proxy handler which throws on any trap called.
 * It's made from a proxy with a get trap that throws. It's safe to
 * create one and share it between all Proxy handlers.
 */
const        alwaysThrowHandler=  new Proxy(
  immutableObject,
  freeze({
    get(_shadow, prop) {
      Fail `Please report unexpected scope handler trap: ${q(String(prop))}`;
     }}));



/*
 * scopeProxyHandlerProperties
 * scopeTerminatorHandler manages a strictScopeTerminator Proxy which serves as
 * the final scope boundary that will always return "undefined" in order
 * to prevent access to "start compartment globals".
 */$h‍_once.alwaysThrowHandler(alwaysThrowHandler);
const scopeProxyHandlerProperties=  {
  get(_shadow, _prop) {
    return undefined;
   },

  set(_shadow, prop, _value) {
    // We should only hit this if the has() hook returned true matches the v8
    // ReferenceError message "Uncaught ReferenceError: xyz is not defined"
    throw ReferenceError( `${String(prop)} is not defined`);
   },

  has(_shadow, prop) {
    // we must at least return true for all properties on the realm globalThis
    return prop in globalThis;
   },

  // note: this is likely a bug of safari
  // https://bugs.webkit.org/show_bug.cgi?id=195534
  getPrototypeOf(_shadow) {
    return null;
   },

  // See https://github.com/endojs/endo/issues/1510
  // TODO: report as bug to v8 or Chrome, and record issue link here.
  getOwnPropertyDescriptor(_shadow, prop) {
    // Coerce with `String` in case prop is a symbol.
    const quotedProp=  q(String(prop));
    // eslint-disable-next-line @endo/no-polymorphic-call
    console.warn(
       `getOwnPropertyDescriptor trap on scopeTerminatorHandler for ${quotedProp}`,
      TypeError().stack);

    return undefined;
   },

  // See https://github.com/endojs/endo/issues/1490
  // TODO Report bug to JSC or Safari
  ownKeys(_shadow) {
    return [];
   }};


// The scope handler's prototype is a proxy that throws if any trap other
// than get/set/has are run (like getOwnPropertyDescriptors, apply,
// getPrototypeOf).
const        strictScopeTerminatorHandler=  freeze(
  create(
    alwaysThrowHandler,
    getOwnPropertyDescriptors(scopeProxyHandlerProperties)));$h‍_once.strictScopeTerminatorHandler(strictScopeTerminatorHandler);



const        strictScopeTerminator=  new Proxy(
  immutableObject,
  strictScopeTerminatorHandler);$h‍_once.strictScopeTerminator(strictScopeTerminator);
})()
,
// === functors[25] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Proxy,create,freeze,getOwnPropertyDescriptors,immutableObject,reflectSet,strictScopeTerminatorHandler,alwaysThrowHandler;$h‍_imports([["./commons.js", [["Proxy", [$h‍_a => (Proxy = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["immutableObject", [$h‍_a => (immutableObject = $h‍_a)]],["reflectSet", [$h‍_a => (reflectSet = $h‍_a)]]]],["./strict-scope-terminator.js", [["strictScopeTerminatorHandler", [$h‍_a => (strictScopeTerminatorHandler = $h‍_a)]],["alwaysThrowHandler", [$h‍_a => (alwaysThrowHandler = $h‍_a)]]]]]);   












/*
 * createSloppyGlobalsScopeTerminator()
 * strictScopeTerminatorHandler manages a scopeTerminator Proxy which serves as
 * the final scope boundary that will always return "undefined" in order
 * to prevent access to "start compartment globals". When "sloppyGlobalsMode"
 * is true, the Proxy will perform sets on the "globalObject".
 */
const        createSloppyGlobalsScopeTerminator=  (globalObject)=>{
  const scopeProxyHandlerProperties=  {
    // inherit scopeTerminator behavior
    ...strictScopeTerminatorHandler,

    // Redirect set properties to the globalObject.
    set(_shadow, prop, value) {
      return reflectSet(globalObject, prop, value);
     },

    // Always claim to have a potential property in order to be the recipient of a set
    has(_shadow, _prop) {
      return true;
     }};


  // The scope handler's prototype is a proxy that throws if any trap other
  // than get/set/has are run (like getOwnPropertyDescriptors, apply,
  // getPrototypeOf).
  const sloppyGlobalsScopeTerminatorHandler=  freeze(
    create(
      alwaysThrowHandler,
      getOwnPropertyDescriptors(scopeProxyHandlerProperties)));



  const sloppyGlobalsScopeTerminator=  new Proxy(
    immutableObject,
    sloppyGlobalsScopeTerminatorHandler);


  return sloppyGlobalsScopeTerminator;
 };$h‍_once.createSloppyGlobalsScopeTerminator(createSloppyGlobalsScopeTerminator);
freeze(createSloppyGlobalsScopeTerminator);
})()
,
// === functors[26] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_EVAL,create,defineProperties,freeze,assert;$h‍_imports([["./commons.js", [["FERAL_EVAL", [$h‍_a => (FERAL_EVAL = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   



const { Fail}=   assert;

// We attempt to frustrate stack bumping attacks on the safe evaluator
// (`make-safe-evaluator.js`).
// A stack bumping attack forces an API call to throw a stack overflow
// `RangeError` at an inopportune time.
// The attacker arranges for the stack to be sufficiently deep that the API
// consumes exactly enough stack frames to throw an exception.
//
// For the safe evaluator, an exception thrown between adding and then deleting
// `eval` on `evalScope` could leak the real `eval` to an attacker's lexical
// scope.
// This would be sufficiently disastrous that we guard against it twice.
// First, we delete `eval` from `evalScope` immediately before rendering it to
// the guest program's lexical scope.
//
// If the attacker manages to arrange for `eval` to throw an exception after we
// call `allowNextEvalToBeUnsafe` but before the guest program accesses `eval`,
// it would be able to access `eval` once more in its own code.
// Although they could do no harm with a direct `eval`, they would be able to
// escape to the true global scope with an indirect `eval`.
//
//   prepareStack(depth, () => {
//     (eval)('');
//   });
//   const unsafeEval = (eval);
//   const safeEval = (eval);
//   const realGlobal = unsafeEval('globalThis');
//
// To protect against that case, we also delete `eval` from the `evalScope` in
// a `finally` block surrounding the call to the safe evaluator.
// The only way to reach this case is if `eval` remains on `evalScope` due to
// an attack, so we assume that attack would have have invalided our isolation
// and revoke all future access to the evaluator.
//
// To defeat a stack bumping attack, we must use fewer stack frames to recover
// in that `finally` block than we used in the `try` block.
// We have no reliable guarantees about how many stack frames a block of
// JavaScript will consume.
// Function inlining, tail-call optimization, variations in the size of a stack
// frame, and block scopes may affect the depth of the stack.
// The only number of acceptable stack frames to use in the finally block is
// zero.
// We only use property assignment and deletion in the safe evaluator's
// `finally` block.
// We use `delete evalScope.eval` to withhold the evaluator.
// We assign an envelope object over `evalScopeKit.revoked` to revoke the
// evaluator.
//
// This is why we supply a meaningfully named function for
// `allowNextEvalToBeUnsafe` but do not provide a corresponding
// `revokeAccessToUnsafeEval` or even simply `revoke`.
// These recovery routines are expressed inline in the safe evaluator.

const        makeEvalScopeKit=  ()=>  {
  const evalScope=  create(null);
  const oneTimeEvalProperties=  freeze({
    eval: {
      get() {
        delete evalScope.eval;
        return FERAL_EVAL;
       },
      enumerable: false,
      configurable: true}});



  const evalScopeKit=  {
    evalScope,
    allowNextEvalToBeUnsafe() {
      const { revoked}=   evalScopeKit;
      if( revoked!==  null) {
        Fail `a handler did not reset allowNextEvalToBeUnsafe ${revoked.err}`;
       }
      // Allow next reference to eval produce the unsafe FERAL_EVAL.
      // We avoid defineProperty because it consumes an extra stack frame taming
      // its return value.
      defineProperties(evalScope, oneTimeEvalProperties);
     },
    /** @type {null | { err: any }} */
    revoked: null};


  return evalScopeKit;
 };$h‍_once.makeEvalScopeKit(makeEvalScopeKit);
})()
,
// === functors[27] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_REG_EXP,regexpExec,stringSlice;$h‍_imports([["./commons.js", [["FERAL_REG_EXP", [$h‍_a => (FERAL_REG_EXP = $h‍_a)]],["regexpExec", [$h‍_a => (regexpExec = $h‍_a)]],["stringSlice", [$h‍_a => (stringSlice = $h‍_a)]]]]]);   

// Captures a key and value of the form #key=value or @key=value
const sourceMetaEntryRegExp=
  '\\s*[@#]\\s*([a-zA-Z][a-zA-Z0-9]*)\\s*=\\s*([^\\s\\*]*)';
// Captures either a one-line or multi-line comment containing
// one #key=value or @key=value.
// Produces two pairs of capture groups, but the initial two may be undefined.
// On account of the mechanics of regular expressions, scanning from the end
// does not allow us to capture every pair, so getSourceURL must capture and
// trim until there are no matching comments.
const sourceMetaEntriesRegExp=  new FERAL_REG_EXP(
   `(?:\\s*//${sourceMetaEntryRegExp}|/\\*${sourceMetaEntryRegExp}\\s*\\*/)\\s*$`);


/**
 * @param {string} src
 */
const        getSourceURL=  (src)=>{
  let sourceURL=  '<unknown>';

  // Our regular expression matches the last one or two comments with key value
  // pairs at the end of the source, avoiding a scan over the entire length of
  // the string, but at the expense of being able to capture all the (key,
  // value) pair meta comments at the end of the source, which may include
  // sourceMapURL in addition to sourceURL.
  // So, we sublimate the comments out of the source until no source or no
  // comments remain.
  while( src.length>  0) {
    const match=  regexpExec(sourceMetaEntriesRegExp, src);
    if( match===  null) {
      break;
     }
    src=  stringSlice(src, 0, src.length-  match[0].length);

    // We skip $0 since it contains the entire match.
    // The match contains four capture groups,
    // two (key, value) pairs, the first of which
    // may be undefined.
    // On the off-chance someone put two sourceURL comments in their code with
    // different commenting conventions, the latter has precedence.
    if( match[3]===  'sourceURL') {
      sourceURL=  match[4];
     }else if( match[1]===  'sourceURL') {
      sourceURL=  match[2];
     }
   }

  return sourceURL;
 };$h‍_once.getSourceURL(getSourceURL);
})()
,
// === functors[28] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_REG_EXP,SyntaxError,stringReplace,stringSearch,stringSlice,stringSplit,freeze,getSourceURL;$h‍_imports([["./commons.js", [["FERAL_REG_EXP", [$h‍_a => (FERAL_REG_EXP = $h‍_a)]],["SyntaxError", [$h‍_a => (SyntaxError = $h‍_a)]],["stringReplace", [$h‍_a => (stringReplace = $h‍_a)]],["stringSearch", [$h‍_a => (stringSearch = $h‍_a)]],["stringSlice", [$h‍_a => (stringSlice = $h‍_a)]],["stringSplit", [$h‍_a => (stringSplit = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]]]],["./get-source-url.js", [["getSourceURL", [$h‍_a => (getSourceURL = $h‍_a)]]]]]);   












/**
 * Find the first occurence of the given pattern and return
 * the location as the approximate line number.
 *
 * @param {string} src
 * @param {RegExp} pattern
 * @returns {number}
 */
function getLineNumber(src, pattern) {
  const index=  stringSearch(src, pattern);
  if( index<  0) {
    return -1;
   }

  // The importPattern incidentally captures an initial \n in
  // an attempt to reject a . prefix, so we need to offset
  // the line number in that case.
  const adjustment=  src[index]===  '\n'?  1:  0;

  return stringSplit(stringSlice(src, 0, index), '\n').length+  adjustment;
 }

// /////////////////////////////////////////////////////////////////////////////

const htmlCommentPattern=  new FERAL_REG_EXP( `(?:${'<'}!--|--${'>'})`,'g');

/**
 * Conservatively reject the source text if it may contain text that some
 * JavaScript parsers may treat as an html-like comment. To reject without
 * parsing, `rejectHtmlComments` will also reject some other text as well.
 *
 * https://www.ecma-international.org/ecma-262/9.0/index.html#sec-html-like-comments
 * explains that JavaScript parsers may or may not recognize html
 * comment tokens "<" immediately followed by "!--" and "--"
 * immediately followed by ">" in non-module source text, and treat
 * them as a kind of line comment. Since otherwise both of these can
 * appear in normal JavaScript source code as a sequence of operators,
 * we have the terrifying possibility of the same source code parsing
 * one way on one correct JavaScript implementation, and another way
 * on another.
 *
 * This shim takes the conservative strategy of just rejecting source
 * text that contains these strings anywhere. Note that this very
 * source file is written strangely to avoid mentioning these
 * character strings explicitly.
 *
 * We do not write the regexp in a straightforward way, so that an
 * apparennt html comment does not appear in this file. Thus, we avoid
 * rejection by the overly eager rejectDangerousSources.
 *
 * @param {string} src
 * @returns {string}
 */
const        rejectHtmlComments=  (src)=>{
  const lineNumber=  getLineNumber(src, htmlCommentPattern);
  if( lineNumber<  0) {
    return src;
   }
  const name=  getSourceURL(src);
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_HTML_COMMENT_REJECTED.md
  throw SyntaxError(
     `Possible HTML comment rejected at ${name}:${lineNumber}. (SES_HTML_COMMENT_REJECTED)`);

 };

/**
 * An optional transform to place ahead of `rejectHtmlComments` to evade *that*
 * rejection. However, it may change the meaning of the program.
 *
 * This evasion replaces each alleged html comment with the space-separated
 * JavaScript operator sequence that it may mean, assuming that it appears
 * outside of a comment or literal string, in source code where the JS
 * parser makes no special case for html comments (like module source code).
 * In that case, this evasion preserves the meaning of the program, though it
 * does change the souce column numbers on each effected line.
 *
 * If the html comment appeared in a literal (a string literal, regexp literal,
 * or a template literal), then this evasion will change the meaning of the
 * program by changing the text of that literal.
 *
 * If the html comment appeared in a JavaScript comment, then this evasion does
 * not change the meaning of the program because it only changes the contents of
 * those comments.
 *
 * @param {string} src
 * @returns {string}
 */$h‍_once.rejectHtmlComments(rejectHtmlComments);
const        evadeHtmlCommentTest=  (src)=>{
  const replaceFn=  (match)=> match[0]===  '<'?  '< ! --':  '-- >';
  return stringReplace(src, htmlCommentPattern, replaceFn);
 };

// /////////////////////////////////////////////////////////////////////////////
$h‍_once.evadeHtmlCommentTest(evadeHtmlCommentTest);
const importPattern=  new FERAL_REG_EXP(
  '(^|[^.]|\\.\\.\\.)\\bimport(\\s*(?:\\(|/[/*]))',
  'g');


/**
 * Conservatively reject the source text if it may contain a dynamic
 * import expression. To reject without parsing, `rejectImportExpressions` will
 * also reject some other text as well.
 *
 * The proposed dynamic import expression is the only syntax currently
 * proposed, that can appear in non-module JavaScript code, that
 * enables direct access to the outside world that cannot be
 * suppressed or intercepted without parsing and rewriting. Instead,
 * this shim conservatively rejects any source text that seems to
 * contain such an expression. To do this safely without parsing, we
 * must also reject some valid programs, i.e., those containing
 * apparent import expressions in literal strings or comments.
 *
 * The current conservative rule looks for the identifier "import"
 * followed by either an open paren or something that looks like the
 * beginning of a comment. We assume that we do not need to worry
 * about html comment syntax because that was already rejected by
 * rejectHtmlComments.
 *
 * this \s *must* match all kinds of syntax-defined whitespace. If e.g.
 * U+2028 (LINE SEPARATOR) or U+2029 (PARAGRAPH SEPARATOR) is treated as
 * whitespace by the parser, but not matched by /\s/, then this would admit
 * an attack like: import\u2028('power.js') . We're trying to distinguish
 * something like that from something like importnotreally('power.js') which
 * is perfectly safe.
 *
 * @param {string} src
 * @returns {string}
 */
const        rejectImportExpressions=  (src)=>{
  const lineNumber=  getLineNumber(src, importPattern);
  if( lineNumber<  0) {
    return src;
   }
  const name=  getSourceURL(src);
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_IMPORT_REJECTED.md
  throw SyntaxError(
     `Possible import expression rejected at ${name}:${lineNumber}. (SES_IMPORT_REJECTED)`);

 };

/**
 * An optional transform to place ahead of `rejectImportExpressions` to evade
 * *that* rejection. However, it may change the meaning of the program.
 *
 * This evasion replaces each suspicious `import` identifier with `__import__`.
 * If the alleged import expression appears in a JavaScript comment, this
 * evasion will not change the meaning of the program. If it appears in a
 * literal (string literal, regexp literal, or a template literal), then this
 * evasion will change the contents of that literal. If it appears as code
 * where it would be parsed as an expression, then it might or might not change
 * the meaning of the program, depending on the binding, if any, of the lexical
 * variable `__import__`.
 *
 * @param {string} src
 * @returns {string}
 */$h‍_once.rejectImportExpressions(rejectImportExpressions);
const        evadeImportExpressionTest=  (src)=>{
  const replaceFn=  (_, p1, p2)=>   `${p1}__import__${p2}`;
  return stringReplace(src, importPattern, replaceFn);
 };

// /////////////////////////////////////////////////////////////////////////////
$h‍_once.evadeImportExpressionTest(evadeImportExpressionTest);
const someDirectEvalPattern=  new FERAL_REG_EXP(
  '(^|[^.])\\beval(\\s*\\()',
  'g');


/**
 * Heuristically reject some text that seems to contain a direct eval
 * expression, with both false positives and false negavives. To reject without
 * parsing, `rejectSomeDirectEvalExpressions` may will also reject some other
 * text as well. It may also accept source text that contains a direct eval
 * written oddly, such as `(eval)(src)`. This false negative is not a security
 * vulnerability. Rather it is a compat hazard because it will execute as
 * an indirect eval under the SES-shim but as a direct eval on platforms that
 * support SES directly (like XS).
 *
 * The shim cannot correctly emulate a direct eval as explained at
 * https://github.com/Agoric/realms-shim/issues/12
 * If we did not reject direct eval syntax, we would
 * accidentally evaluate these with an emulation of indirect eval. To
 * prevent future compatibility problems, in shifting from use of the
 * shim to genuine platform support for the proposal, we should
 * instead statically reject code that seems to contain a direct eval
 * expression.
 *
 * As with the dynamic import expression, to avoid a full parse, we do
 * this approximately with a regexp, that will also reject strings
 * that appear safely in comments or strings. Unlike dynamic import,
 * if we miss some, this only creates future compat problems, not
 * security problems. Thus, we are only trying to catch innocent
 * occurrences, not malicious one. In particular, `(eval)(...)` is
 * direct eval syntax that would not be caught by the following regexp.
 *
 * Exported for unit tests.
 *
 * @param {string} src
 * @returns {string}
 */
const        rejectSomeDirectEvalExpressions=  (src)=>{
  const lineNumber=  getLineNumber(src, someDirectEvalPattern);
  if( lineNumber<  0) {
    return src;
   }
  const name=  getSourceURL(src);
  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_EVAL_REJECTED.md
  throw SyntaxError(
     `Possible direct eval expression rejected at ${name}:${lineNumber}. (SES_EVAL_REJECTED)`);

 };

// /////////////////////////////////////////////////////////////////////////////

/**
 * A transform that bundles together the transforms that must unconditionally
 * happen last in order to ensure safe evaluation without parsing.
 *
 * @param {string} source
 * @returns {string}
 */$h‍_once.rejectSomeDirectEvalExpressions(rejectSomeDirectEvalExpressions);
const        mandatoryTransforms=  (source)=>{
  source=  rejectHtmlComments(source);
  source=  rejectImportExpressions(source);
  return source;
 };

/**
 * Starting with `source`, apply each transform to the result of the
 * previous one, returning the result of the last transformation.
 *
 * @param {string} source
 * @param {((str: string) => string)[]} transforms
 * @returns {string}
 */$h‍_once.mandatoryTransforms(mandatoryTransforms);
const        applyTransforms=  (source, transforms)=>  {
  for( const transform of transforms) {
    source=  transform(source);
   }
  return source;
 };

// export all as a frozen object
$h‍_once.applyTransforms(applyTransforms);const transforms=freeze({
  rejectHtmlComments: freeze(rejectHtmlComments),
  evadeHtmlCommentTest: freeze(evadeHtmlCommentTest),
  rejectImportExpressions: freeze(rejectImportExpressions),
  evadeImportExpressionTest: freeze(evadeImportExpressionTest),
  rejectSomeDirectEvalExpressions: freeze(rejectSomeDirectEvalExpressions),
  mandatoryTransforms: freeze(mandatoryTransforms),
  applyTransforms: freeze(applyTransforms)});$h‍_once.transforms(transforms);
})()
,
// === functors[29] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let arrayFilter,arrayIncludes,getOwnPropertyDescriptor,getOwnPropertyNames,objectHasOwnProperty,regexpTest;$h‍_imports([["./commons.js", [["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["arrayIncludes", [$h‍_a => (arrayIncludes = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getOwnPropertyNames", [$h‍_a => (getOwnPropertyNames = $h‍_a)]],["objectHasOwnProperty", [$h‍_a => (objectHasOwnProperty = $h‍_a)]],["regexpTest", [$h‍_a => (regexpTest = $h‍_a)]]]]]);   








/**
 * keywords
 * In JavaScript you cannot use these reserved words as variables.
 * See 11.6.1 Identifier Names
 */
const keywords=  [
  // 11.6.2.1 Keywords
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',

  // Also reserved when parsing strict mode code
  'let',
  'static',

  // 11.6.2.2 Future Reserved Words
  'enum',

  // Also reserved when parsing strict mode code
  'implements',
  'package',
  'protected',
  'interface',
  'private',
  'public',

  // Reserved but not mentioned in specs
  'await',

  'null',
  'true',
  'false',

  'this',
  'arguments'];


/**
 * identifierPattern
 * Simplified validation of identifier names: may only contain alphanumeric
 * characters (or "$" or "_"), and may not start with a digit. This is safe
 * and does not reduces the compatibility of the shim. The motivation for
 * this limitation was to decrease the complexity of the implementation,
 * and to maintain a resonable level of performance.
 * Note: \w is equivalent [a-zA-Z_0-9]
 * See 11.6.1 Identifier Names
 */
const identifierPattern=  /^[a-zA-Z_$][\w$]*$/;

/**
 * isValidIdentifierName()
 * What variable names might it bring into scope? These include all
 * property names which can be variable names, including the names
 * of inherited properties. It excludes symbols and names which are
 * keywords. We drop symbols safely. Currently, this shim refuses
 * service if any of the names are keywords or keyword-like. This is
 * safe and only prevent performance optimization.
 *
 * @param {string} name
 */
const        isValidIdentifierName=  (name)=>{
  // Ensure we have a valid identifier. We use regexpTest rather than
  // /../.test() to guard against the case where RegExp has been poisoned.
  return(
    name!==  'eval'&&
    !arrayIncludes(keywords, name)&&
    regexpTest(identifierPattern, name));

 };

/*
 * isImmutableDataProperty
 */$h‍_once.isValidIdentifierName(isValidIdentifierName);

function isImmutableDataProperty(obj, name) {
  const desc=  getOwnPropertyDescriptor(obj, name);
  return(
    desc&&
    //
    // The getters will not have .writable, don't let the falsyness of
    // 'undefined' trick us: test with === false, not ! . However descriptors
    // inherit from the (potentially poisoned) global object, so we might see
    // extra properties which weren't really there. Accessor properties have
    // 'get/set/enumerable/configurable', while data properties have
    // 'value/writable/enumerable/configurable'.
    desc.configurable===  false&&
    desc.writable===  false&&
    //
    // Checks for data properties because they're the only ones we can
    // optimize (accessors are most likely non-constant). Descriptors can't
    // can't have accessors and value properties at the same time, therefore
    // this check is sufficient. Using explicit own property deal with the
    // case where Object.prototype has been poisoned.
    objectHasOwnProperty(desc, 'value'));

 }

/**
 * getScopeConstants()
 * What variable names might it bring into scope? These include all
 * property names which can be variable names, including the names
 * of inherited properties. It excludes symbols and names which are
 * keywords. We drop symbols safely. Currently, this shim refuses
 * service if any of the names are keywords or keyword-like. This is
 * safe and only prevent performance optimization.
 *
 * @param {object} globalObject
 * @param {object} moduleLexicals
 */
const        getScopeConstants=  (globalObject, moduleLexicals=  {})=>  {
  // getOwnPropertyNames() does ignore Symbols so we don't need to
  // filter them out.
  const globalObjectNames=  getOwnPropertyNames(globalObject);
  const moduleLexicalNames=  getOwnPropertyNames(moduleLexicals);

  // Collect all valid & immutable identifiers from the endowments.
  const moduleLexicalConstants=  arrayFilter(
    moduleLexicalNames,
    (name)=>
      isValidIdentifierName(name)&&
      isImmutableDataProperty(moduleLexicals, name));


  // Collect all valid & immutable identifiers from the global that
  // are also not present in the endowments (immutable or not).
  const globalObjectConstants=  arrayFilter(
    globalObjectNames,
    (name)=>
      // Can't define a constant: it would prevent a
      // lookup on the endowments.
      !arrayIncludes(moduleLexicalNames, name)&&
      isValidIdentifierName(name)&&
      isImmutableDataProperty(globalObject, name));


  return {
    globalObjectConstants,
    moduleLexicalConstants};

 };$h‍_once.getScopeConstants(getScopeConstants);
})()
,
// === functors[30] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_FUNCTION,arrayJoin,apply,getScopeConstants;$h‍_imports([["./commons.js", [["FERAL_FUNCTION", [$h‍_a => (FERAL_FUNCTION = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["apply", [$h‍_a => (apply = $h‍_a)]]]],["./scope-constants.js", [["getScopeConstants", [$h‍_a => (getScopeConstants = $h‍_a)]]]]]);   




/**
 * buildOptimizer()
 * Given an array of identifiers, the optimizer returns a `const` declaration
 * destructuring `this.${name}`.
 *
 * @param {Array<string>} constants
 * @param {string} name
 */
function buildOptimizer(constants, name) {
  // No need to build an optimizer when there are no constants.
  if( constants.length===  0) return '';
  // Use 'this' to avoid going through the scope proxy, which is unnecessary
  // since the optimizer only needs references to the safe global.
  // Destructure the constants from the target scope object.
  return  `const {${arrayJoin(constants,',') }} = this.${name};`;
 }

/**
 * makeEvaluate()
 * Create an 'evaluate' function with the correct optimizer inserted.
 *
 * @param {object} context
 * @param {object} context.evalScope
 * @param {object} context.moduleLexicals
 * @param {object} context.globalObject
 * @param {object} context.scopeTerminator
 */
const        makeEvaluate=  (context)=>{
  const { globalObjectConstants, moduleLexicalConstants}=   getScopeConstants(
    context.globalObject,
    context.moduleLexicals);

  const globalObjectOptimizer=  buildOptimizer(
    globalObjectConstants,
    'globalObject');

  const moduleLexicalOptimizer=  buildOptimizer(
    moduleLexicalConstants,
    'moduleLexicals');


  // Create a function in sloppy mode, so that we can use 'with'. It returns
  // a function in strict mode that evaluates the provided code using direct
  // eval, and thus in strict mode in the same scope. We must be very careful
  // to not create new names in this scope

  // 1: we use multiple nested 'with' to catch all free variable names. The
  // `this` value of the outer sloppy function holds the different scope
  // layers, from inner to outer:
  //    a) `evalScope` which must release the `FERAL_EVAL` as 'eval' once for
  //       every invocation of the inner `evaluate` function in order to
  //       trigger direct eval. The direct eval semantics is what allows the
  //       evaluated code to lookup free variable names on the other scope
  //       objects and not in global scope.
  //    b) `moduleLexicals` which provide a way to introduce free variables
  //       that are not available on the globalObject.
  //    c) `globalObject` is the global scope object of the evaluator, aka the
  //       Compartment's `globalThis`.
  //    d) `scopeTerminator` is a proxy object which prevents free variable
  //       lookups to escape to the start compartment's global object.
  // 2: `optimizer`s catch constant variable names for speed.
  // 3: The inner strict `evaluate` function should be passed two parameters:
  //    a) its arguments[0] is the source to be directly evaluated.
  //    b) its 'this' is the this binding seen by the code being
  //       directly evaluated (the globalObject).

  // Notes:
  // - The `optimizer` strings only lookup values on the `globalObject` and
  //   `moduleLexicals` objects by construct. Keywords like 'function' are
  //   reserved and cannot be used as a variable, so they are excluded from the
  //   optimizer. Furthermore to prevent shadowing 'eval', while a valid
  //   identifier, that name is also explicitly excluded.
  // - when 'eval' is looked up in the `evalScope`, the powerful unsafe eval
  //   intrinsic is returned after automatically removing it from the
  //   `evalScope`. Any further reference to 'eval' in the evaluate string will
  //   get the tamed evaluator from the `globalObject`, if any.

  // TODO https://github.com/endojs/endo/issues/816
  // The optimizer currently runs under sloppy mode, and although we doubt that
  // there is any vulnerability introduced just by running the optimizer
  // sloppy, we are much more confident in the semantics of strict mode.
  // The `evaluate` function can be and is reused across multiple evaluations.
  // Since the optimizer should not be re-evaluated every time, it cannot be
  // inside the `evaluate` closure. While we could potentially nest an
  // intermediate layer of `() => {'use strict'; ${optimizers}; ...`, it
  // doesn't seem worth the overhead and complexity.
  const evaluateFactory=  FERAL_FUNCTION( `
    with (this.scopeTerminator) {
      with (this.globalObject) {
        with (this.moduleLexicals) {
          with (this.evalScope) {
            ${globalObjectOptimizer }
            ${moduleLexicalOptimizer }
            return function() {
              'use strict';
              return eval(arguments[0]);
            };
          }
        }
      }
    }
  `);

  return apply(evaluateFactory, context, []);
 };$h‍_once.makeEvaluate(makeEvaluate);
})()
,
// === functors[31] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let apply,freeze,strictScopeTerminator,createSloppyGlobalsScopeTerminator,makeEvalScopeKit,applyTransforms,mandatoryTransforms,makeEvaluate,assert;$h‍_imports([["./commons.js", [["apply", [$h‍_a => (apply = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]]]],["./strict-scope-terminator.js", [["strictScopeTerminator", [$h‍_a => (strictScopeTerminator = $h‍_a)]]]],["./sloppy-globals-scope-terminator.js", [["createSloppyGlobalsScopeTerminator", [$h‍_a => (createSloppyGlobalsScopeTerminator = $h‍_a)]]]],["./eval-scope.js", [["makeEvalScopeKit", [$h‍_a => (makeEvalScopeKit = $h‍_a)]]]],["./transforms.js", [["applyTransforms", [$h‍_a => (applyTransforms = $h‍_a)]],["mandatoryTransforms", [$h‍_a => (mandatoryTransforms = $h‍_a)]]]],["./make-evaluate.js", [["makeEvaluate", [$h‍_a => (makeEvaluate = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   










const { Fail}=   assert;

/**
 * makeSafeEvaluator()
 * Build the low-level operation used by all evaluators:
 * eval(), Function(), Compartment.prototype.evaluate().
 *
 * @param {object} options
 * @param {object} options.globalObject
 * @param {object} [options.moduleLexicals]
 * @param {Array<import('./lockdown.js').Transform>} [options.globalTransforms]
 * @param {boolean} [options.sloppyGlobalsMode]
 */
const        makeSafeEvaluator=  ({
  globalObject,
  moduleLexicals=  {},
  globalTransforms=  [],
  sloppyGlobalsMode=  false})=>
      {
  const scopeTerminator=  sloppyGlobalsMode?
      createSloppyGlobalsScopeTerminator(globalObject):
      strictScopeTerminator;
  const evalScopeKit=  makeEvalScopeKit();
  const { evalScope}=   evalScopeKit;

  const evaluateContext=  freeze({
    evalScope,
    moduleLexicals,
    globalObject,
    scopeTerminator});


  // Defer creating the actual evaluator to first use.
  // Creating a compartment should be possible in no-eval environments
  // It also allows more global constants to be captured by the optimizer
  let evaluate;
  const provideEvaluate=  ()=>  {
    if( !evaluate) {
      evaluate=  makeEvaluate(evaluateContext);
     }
   };

  /**
   * @param {string} source
   * @param {object} [options]
   * @param {Array<import('./lockdown.js').Transform>} [options.localTransforms]
   */
  const safeEvaluate=  (source, options)=>  {
    const { localTransforms=  []}=   options||  {};
    provideEvaluate();

    // Execute the mandatory transforms last to ensure that any rewritten code
    // meets those mandatory requirements.
    source=  applyTransforms(source, [
      ...localTransforms,
      ...globalTransforms,
      mandatoryTransforms]);


    let err;
    try {
      // Allow next reference to eval produce the unsafe FERAL_EVAL.
      // eslint-disable-next-line @endo/no-polymorphic-call
      evalScopeKit.allowNextEvalToBeUnsafe();

      // Ensure that "this" resolves to the safe global.
      return apply(evaluate, globalObject, [source]);
     }catch( e) {
      // stash the child-code error in hopes of debugging the internal failure
      err=  e;
      throw e;
     }finally {
      const unsafeEvalWasStillExposed=( 'eval'in  evalScope);
      delete evalScope.eval;
      if( unsafeEvalWasStillExposed) {
        // Barring a defect in the SES shim, the evalScope should allow the
        // powerful, unsafe  `eval` to be used by `evaluate` exactly once, as the
        // very first name that it attempts to access from the lexical scope.
        // A defect in the SES shim could throw an exception after we set
        // `evalScope.eval` and before `evaluate` calls `eval` internally.
        // If we get here, SES is very broken.
        // This condition is one where this vat is now hopelessly confused, and
        // the vat as a whole should be aborted.
        // No further code should run.
        // All immediately reachable state should be abandoned.
        // However, that is not yet possible, so we at least prevent further
        // variable resolution via the scopeHandler, and throw an error with
        // diagnostic info including the thrown error if any from evaluating the
        // source code.
        evalScopeKit.revoked=  { err};
        // TODO A GOOD PLACE TO PANIC(), i.e., kill the vat incarnation.
        // See https://github.com/Agoric/SES-shim/issues/490
        Fail `handler did not reset allowNextEvalToBeUnsafe ${err}`;
       }
     }
   };

  return { safeEvaluate};
 };$h‍_once.makeSafeEvaluator(makeSafeEvaluator);
})()
,
// === functors[32] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let WeakSet,defineProperty,freeze,functionPrototype,functionToString,stringEndsWith,weaksetAdd,weaksetHas;$h‍_imports([["./commons.js", [["WeakSet", [$h‍_a => (WeakSet = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["functionPrototype", [$h‍_a => (functionPrototype = $h‍_a)]],["functionToString", [$h‍_a => (functionToString = $h‍_a)]],["stringEndsWith", [$h‍_a => (stringEndsWith = $h‍_a)]],["weaksetAdd", [$h‍_a => (weaksetAdd = $h‍_a)]],["weaksetHas", [$h‍_a => (weaksetHas = $h‍_a)]]]]]);   










const nativeSuffix=  ') { [native code] }';

// Note: Top level mutable state. Does not make anything worse, since the
// patching of `Function.prototype.toString` is also globally stateful. We
// use this top level state so that multiple calls to `tameFunctionToString` are
// idempotent, rather than creating redundant indirections.
let markVirtualizedNativeFunction;

/**
 * Replace `Function.prototype.toString` with one that recognizes
 * shimmed functions as honorary native functions.
 */
const        tameFunctionToString=  ()=>  {
  if( markVirtualizedNativeFunction===  undefined) {
    const virtualizedNativeFunctions=  new WeakSet();

    const tamingMethods=  {
      toString() {
        const str=  functionToString(this);
        if(
          stringEndsWith(str, nativeSuffix)||
          !weaksetHas(virtualizedNativeFunctions, this))
          {
          return str;
         }
        return  `function ${this.name}() { [native code] }`;
       }};


    defineProperty(functionPrototype, 'toString', {
      value: tamingMethods.toString});


    markVirtualizedNativeFunction=  freeze((func)=>
      weaksetAdd(virtualizedNativeFunctions, func));

   }
  return markVirtualizedNativeFunction;
 };$h‍_once.tameFunctionToString(tameFunctionToString);
})()
,
// === functors[33] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,globalThis,getOwnPropertyDescriptor,defineProperty;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]]]]]);Object.defineProperty(tameDomains, 'name', {value: "tameDomains"});$h‍_once.tameDomains(tameDomains);   








function        tameDomains(domainTaming=  'safe') {
  if( domainTaming!==  'safe'&&  domainTaming!==  'unsafe') {
    throw TypeError( `unrecognized domainTaming ${domainTaming}`);
   }

  if( domainTaming===  'unsafe') {
    return;
   }

  // Protect against the hazard presented by Node.js domains.
  if( typeof globalThis.process===  'object'&&  globalThis.process!==  null) {
    // Check whether domains were initialized.
    const domainDescriptor=  getOwnPropertyDescriptor(
      globalThis.process,
      'domain');

    if( domainDescriptor!==  undefined&&  domainDescriptor.get!==  undefined) {
      // The domain descriptor on Node.js initially has value: null, which
      // becomes a get, set pair after domains initialize.
      // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_NO_DOMAINS.md
      throw TypeError(
         `SES failed to lockdown, Node.js domains have been initialized (SES_NO_DOMAINS)`);

     }
    // Prevent domains from initializing.
    // This is clunky because the exception thrown from the domains package does
    // not direct the user's gaze toward a knowledge base about the problem.
    // The domain module merely throws an exception when it attempts to define
    // the domain property of the process global during its initialization.
    // We have no better recourse because Node.js uses defineProperty too.
    defineProperty(globalThis.process, 'domain', {
      value: null,
      configurable: false,
      writable: false,
      enumerable: false});

   }
 }
})()
,
// === functors[34] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let WeakSet,arrayFilter,arrayMap,arrayPush,defineProperty,freeze,fromEntries,isError,stringEndsWith,weaksetAdd,weaksetHas;$h‍_imports([["../commons.js", [["WeakSet", [$h‍_a => (WeakSet = $h‍_a)]],["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["arrayPush", [$h‍_a => (arrayPush = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["fromEntries", [$h‍_a => (fromEntries = $h‍_a)]],["isError", [$h‍_a => (isError = $h‍_a)]],["stringEndsWith", [$h‍_a => (stringEndsWith = $h‍_a)]],["weaksetAdd", [$h‍_a => (weaksetAdd = $h‍_a)]],["weaksetHas", [$h‍_a => (weaksetHas = $h‍_a)]]]],["./types.js", []],["./internal-types.js", []]]);   






















// For our internal debugging purposes, uncomment
// const internalDebugConsole = console;

// The whitelists of console methods, from:
// Whatwg "living standard" https://console.spec.whatwg.org/
// Node https://nodejs.org/dist/latest-v14.x/docs/api/console.html
// MDN https://developer.mozilla.org/en-US/docs/Web/API/Console_API
// TypeScript https://openstapps.gitlab.io/projectmanagement/interfaces/_node_modules__types_node_globals_d_.console.html
// Chrome https://developers.google.com/web/tools/chrome-devtools/console/api

// All console level methods have parameters (fmt?, ...args)
// where the argument sequence `fmt?, ...args` formats args according to
// fmt if fmt is a format string. Otherwise, it just renders them all as values
// separated by spaces.
// https://console.spec.whatwg.org/#formatter
// https://nodejs.org/docs/latest/api/util.html#util_util_format_format_args

// For the causal console, all occurrences of `fmt, ...args` or `...args` by
// itself must check for the presence of an error to ask the
// `loggedErrorHandler` to handle.
// In theory we should do a deep inspection to detect for example an array
// containing an error. We currently do not detect these and may never.

/** @typedef {keyof VirtualConsole | 'profile' | 'profileEnd'} ConsoleProps */

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const consoleLevelMethods=  freeze([
  ['debug', 'debug'], // (fmt?, ...args) verbose level on Chrome
  ['log', 'log'], // (fmt?, ...args) info level on Chrome
  ['info', 'info'], // (fmt?, ...args)
  ['warn', 'warn'], // (fmt?, ...args)
  ['error', 'error'], // (fmt?, ...args)

  ['trace', 'log'], // (fmt?, ...args)
  ['dirxml', 'log'], // (fmt?, ...args)
  ['group', 'log'], // (fmt?, ...args)
  ['groupCollapsed', 'log']  // (fmt?, ...args)
]);

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const consoleOtherMethods=  freeze([
  ['assert', 'error'], // (value, fmt?, ...args)
  ['timeLog', 'log'], // (label?, ...args) no fmt string

  // Insensitive to whether any argument is an error. All arguments can pass
  // thru to baseConsole as is.
  ['clear', undefined], // ()
  ['count', 'info'], // (label?)
  ['countReset', undefined], // (label?)
  ['dir', 'log'], // (item, options?)
  ['groupEnd', 'log'], // ()
  // In theory tabular data may be or contain an error. However, we currently
  // do not detect these and may never.
  ['table', 'log'], // (tabularData, properties?)
  ['time', 'info'], // (label?)
  ['timeEnd', 'info'], // (label?)

  // Node Inspector only, MDN, and TypeScript, but not whatwg
  ['profile', undefined], // (label?)
  ['profileEnd', undefined], // (label?)
  ['timeStamp', undefined]  // (label?)
]);

/** @type {readonly [ConsoleProps, LogSeverity | undefined][]} */
const        consoleWhitelist=  freeze([
  ...consoleLevelMethods,
  ...consoleOtherMethods]);


/**
 * consoleOmittedProperties is currently unused. I record and maintain it here
 * with the intention that it be treated like the `false` entries in the main
 * SES whitelist: that seeing these on the original console is expected, but
 * seeing anything else that's outside the whitelist is surprising and should
 * provide a diagnostic.
 *
 * const consoleOmittedProperties = freeze([
 *   'memory', // Chrome
 *   'exception', // FF, MDN
 *   '_ignoreErrors', // Node
 *   '_stderr', // Node
 *   '_stderrErrorHandler', // Node
 *   '_stdout', // Node
 *   '_stdoutErrorHandler', // Node
 *   '_times', // Node
 *   'context', // Chrome, Node
 *   'record', // Safari
 *   'recordEnd', // Safari
 *
 *   'screenshot', // Safari
 *   // Symbols
 *   '@@toStringTag', // Chrome: "Object", Safari: "Console"
 *   // A variety of other symbols also seen on Node
 * ]);
 */

// /////////////////////////////////////////////////////////////////////////////

/** @type {MakeLoggingConsoleKit} */$h‍_once.consoleWhitelist(consoleWhitelist);
const makeLoggingConsoleKit=  (
  loggedErrorHandler,
  { shouldResetForDebugging=  false}=   {})=>
     {
  if( shouldResetForDebugging) {
    // eslint-disable-next-line @endo/no-polymorphic-call
    loggedErrorHandler.resetErrorTagNum();
   }

  // Not frozen!
  let logArray=  [];

  const loggingConsole=  fromEntries(
    arrayMap(consoleWhitelist, ([name, _])=>  {
      // Use an arrow function so that it doesn't come with its own name in
      // its printed form. Instead, we're hoping that tooling uses only
      // the `.name` property set below.
      /**
       * @param {...any} args
       */
      const method=  (...args)=>  {
        arrayPush(logArray, [name, ...args]);
       };
      defineProperty(method, 'name', { value: name});
      return [name, freeze(method)];
     }));

  freeze(loggingConsole);

  const takeLog=  ()=>  {
    const result=  freeze(logArray);
    logArray=  [];
    return result;
   };
  freeze(takeLog);

  const typedLoggingConsole=  /** @type {VirtualConsole} */  loggingConsole;

  return freeze({ loggingConsole: typedLoggingConsole, takeLog});
 };$h‍_once.makeLoggingConsoleKit(makeLoggingConsoleKit);
freeze(makeLoggingConsoleKit);


// /////////////////////////////////////////////////////////////////////////////

/** @type {ErrorInfo} */
const ErrorInfo=  {
  NOTE: 'ERROR_NOTE:',
  MESSAGE: 'ERROR_MESSAGE:'};

freeze(ErrorInfo);

/** @type {MakeCausalConsole} */
const makeCausalConsole=  (baseConsole, loggedErrorHandler)=>  {
  const { getStackString, tagError, takeMessageLogArgs, takeNoteLogArgsArray}=
    loggedErrorHandler;

  /**
   * @param {ReadonlyArray<any>} logArgs
   * @param {Array<any>} subErrorsSink
   * @returns {any}
   */
  const extractErrorArgs=  (logArgs, subErrorsSink)=>  {
    const argTags=  arrayMap(logArgs, (arg)=>{
      if( isError(arg)) {
        arrayPush(subErrorsSink, arg);
        return  `(${tagError(arg)})`;
       }
      return arg;
     });
    return argTags;
   };

  /**
   * @param {LogSeverity} severity
   * @param {Error} error
   * @param {ErrorInfoKind} kind
   * @param {readonly any[]} logArgs
   * @param {Array<Error>} subErrorsSink
   */
  const logErrorInfo=  (severity, error, kind, logArgs, subErrorsSink)=>  {
    const errorTag=  tagError(error);
    const errorName=
      kind===  ErrorInfo.MESSAGE?   `${errorTag}:`:  `${errorTag} ${kind}`;
    const argTags=  extractErrorArgs(logArgs, subErrorsSink);
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole[severity](errorName, ...argTags);
   };

  /**
   * Logs the `subErrors` within a group name mentioning `optTag`.
   *
   * @param {LogSeverity} severity
   * @param {Error[]} subErrors
   * @param {string | undefined} optTag
   * @returns {void}
   */
  const logSubErrors=  (severity, subErrors, optTag=  undefined)=>  {
    if( subErrors.length===  0) {
      return;
     }
    if( subErrors.length===  1&&  optTag===  undefined) {
      // eslint-disable-next-line no-use-before-define
      logError(severity, subErrors[0]);
      return;
     }
    let label;
    if( subErrors.length===  1) {
      label=   `Nested error`;
     }else {
      label=   `Nested ${subErrors.length} errors`;
     }
    if( optTag!==  undefined) {
      label=   `${label} under ${optTag}`;
     }
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole.group(label);
    try {
      for( const subError of subErrors) {
        // eslint-disable-next-line no-use-before-define
        logError(severity, subError);
       }
     }finally {
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole.groupEnd();
     }
   };

  const errorsLogged=  new WeakSet();

  /** @type {(severity: LogSeverity) => NoteCallback} */
  const makeNoteCallback=  (severity)=>(error, noteLogArgs)=>  {
    const subErrors=  [];
    // Annotation arrived after the error has already been logged,
    // so just log the annotation immediately, rather than remembering it.
    logErrorInfo(severity, error, ErrorInfo.NOTE, noteLogArgs, subErrors);
    logSubErrors(severity, subErrors, tagError(error));
   };

  /**
   * @param {LogSeverity} severity
   * @param {Error} error
   */
  const logError=  (severity, error)=>  {
    if( weaksetHas(errorsLogged, error)) {
      return;
     }
    const errorTag=  tagError(error);
    weaksetAdd(errorsLogged, error);
    const subErrors=  [];
    const messageLogArgs=  takeMessageLogArgs(error);
    const noteLogArgsArray=  takeNoteLogArgsArray(
      error,
      makeNoteCallback(severity));

    // Show the error's most informative error message
    if( messageLogArgs===  undefined) {
      // If there is no message log args, then just show the message that
      // the error itself carries.
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole[severity]( `${errorTag}:`,error.message);
     }else {
      // If there is one, we take it to be strictly more informative than the
      // message string carried by the error, so show it *instead*.
      logErrorInfo(
        severity,
        error,
        ErrorInfo.MESSAGE,
        messageLogArgs,
        subErrors);

     }
    // After the message but before any other annotations, show the stack.
    let stackString=  getStackString(error);
    if(
      typeof stackString===  'string'&&
      stackString.length>=  1&&
      !stringEndsWith(stackString, '\n'))
      {
      stackString+=  '\n';
     }
    // eslint-disable-next-line @endo/no-polymorphic-call
    baseConsole[severity](stackString);
    // Show the other annotations on error
    for( const noteLogArgs of noteLogArgsArray) {
      logErrorInfo(severity, error, ErrorInfo.NOTE, noteLogArgs, subErrors);
     }
    // explain all the errors seen in the messages already emitted.
    logSubErrors(severity, subErrors, errorTag);
   };

  const levelMethods=  arrayMap(consoleLevelMethods, ([level, _])=>  {
    /**
     * @param {...any} logArgs
     */
    const levelMethod=  (...logArgs)=>  {
      const subErrors=  [];
      const argTags=  extractErrorArgs(logArgs, subErrors);
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole[level](...argTags);
      // @ts-expect-error ConsoleProp vs LogSeverity mismatch
      logSubErrors(level, subErrors);
     };
    defineProperty(levelMethod, 'name', { value: level});
    return [level, freeze(levelMethod)];
   });
  const otherMethodNames=  arrayFilter(
    consoleOtherMethods,
    ([name, _])=>  name in baseConsole);

  const otherMethods=  arrayMap(otherMethodNames, ([name, _])=>  {
    /**
     * @param {...any} args
     */
    const otherMethod=  (...args)=>  {
      // @ts-ignore
      // eslint-disable-next-line @endo/no-polymorphic-call
      baseConsole[name](...args);
      return undefined;
     };
    defineProperty(otherMethod, 'name', { value: name});
    return [name, freeze(otherMethod)];
   });

  const causalConsole=  fromEntries([...levelMethods, ...otherMethods]);
  return (/** @type {VirtualConsole} */ freeze(causalConsole));
 };$h‍_once.makeCausalConsole(makeCausalConsole);
freeze(makeCausalConsole);


// /////////////////////////////////////////////////////////////////////////////

/** @type {FilterConsole} */
const filterConsole=  (baseConsole, filter, _topic=  undefined)=>  {
  // TODO do something with optional topic string
  const whitelist=  arrayFilter(
    consoleWhitelist,
    ([name, _])=>  name in baseConsole);

  const methods=  arrayMap(whitelist, ([name, severity])=>  {
    /**
     * @param {...any} args
     */
    const method=  (...args)=>  {
      // eslint-disable-next-line @endo/no-polymorphic-call
      if( severity===  undefined||  filter.canLog(severity)) {
        // @ts-ignore
        // eslint-disable-next-line @endo/no-polymorphic-call
        baseConsole[name](...args);
       }
     };
    return [name, freeze(method)];
   });
  const filteringConsole=  fromEntries(methods);
  return (/** @type {VirtualConsole} */ freeze(filteringConsole));
 };$h‍_once.filterConsole(filterConsole);
freeze(filterConsole);
})()
,
// === functors[35] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FinalizationRegistry,Map,mapGet,mapDelete,WeakMap,mapSet,finalizationRegistryRegister,weakmapSet,weakmapGet,mapEntries,mapHas;$h‍_imports([["../commons.js", [["FinalizationRegistry", [$h‍_a => (FinalizationRegistry = $h‍_a)]],["Map", [$h‍_a => (Map = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["mapDelete", [$h‍_a => (mapDelete = $h‍_a)]],["WeakMap", [$h‍_a => (WeakMap = $h‍_a)]],["mapSet", [$h‍_a => (mapSet = $h‍_a)]],["finalizationRegistryRegister", [$h‍_a => (finalizationRegistryRegister = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["mapEntries", [$h‍_a => (mapEntries = $h‍_a)]],["mapHas", [$h‍_a => (mapHas = $h‍_a)]]]]]);   














/**
 * Create rejection-tracking machinery compatible with Node.js and browsers.
 *
 * Note that modern browsers *prevent* access to the 'unhandledrejection' and
 * 'rejectionhandled' events needed:
 * - in cross-origin mode, like when served from file://
 * - in the browser console (interactively typed-in code)
 * - in the debugger
 *
 * Then, they just look like: `Uncaught (in promise) Error: ...` and don't
 * implement the machinery.
 *
 * The solution is to serve your web page from an http:// or https:// web server
 * and execute actual code.
 *
 * @param {(reason: unknown) => void} reportReason report the reason for an
 * unhandled rejection.
 */
const        makeRejectionHandlers=  (reportReason)=>{
  if( FinalizationRegistry===  undefined) {
    return undefined;
   }

  /** @typedef {number} ReasonId */
  let lastReasonId=  0;

  /** @type {Map<ReasonId, unknown>} */
  const idToReason=  new Map();

  /** @type {(() => void) | undefined} */
  let cancelChecking;

  const removeReasonId=  (reasonId)=>{
    mapDelete(idToReason, reasonId);
    if( cancelChecking&&  idToReason.size===  0) {
      // No more unhandled rejections to check, just cancel the check.
      cancelChecking();
      cancelChecking=  undefined;
     }
   };

  /** @type {WeakMap<Promise, ReasonId>} */
  const promiseToReasonId=  new WeakMap();

  /**
   * Clean up and report the reason for a GCed unhandled rejection.
   *
   * @param {ReasonId} heldReasonId
   */
  const finalizeDroppedPromise=  (heldReasonId)=>{
    if( mapHas(idToReason, heldReasonId)) {
      const reason=  mapGet(idToReason, heldReasonId);
      removeReasonId(heldReasonId);
      reportReason(reason);
     }
   };

  /** @type {FinalizationRegistry<ReasonId>} */
  const promiseToReason=  new FinalizationRegistry(finalizeDroppedPromise);

  /**
   * Track a rejected promise and its corresponding reason if there is no
   * rejection handler synchronously attached.
   *
   * @param {unknown} reason
   * @param {Promise} pr
   */
  const unhandledRejectionHandler=  (reason, pr)=>  {
    lastReasonId+=  1;
    const reasonId=  lastReasonId;

    // Update bookkeeping.
    mapSet(idToReason, reasonId, reason);
    weakmapSet(promiseToReasonId, pr, reasonId);
    finalizationRegistryRegister(promiseToReason, pr, reasonId, pr);
   };

  /**
   * Deal with the addition of a handler to a previously rejected promise.
   *
   * Just remove it from our list.  Let the FinalizationRegistry or
   * processTermination report any GCed unhandled rejected promises.
   *
   * @param {Promise} pr
   */
  const rejectionHandledHandler=  (pr)=>{
    const reasonId=  weakmapGet(promiseToReasonId, pr);
    removeReasonId(reasonId);
   };

  /**
   * Report all the unhandled rejections, now that we are abruptly terminating
   * the agent cluster.
   */
  const processTerminationHandler=  ()=>  {
    for( const [reasonId, reason]of  mapEntries(idToReason)) {
      removeReasonId(reasonId);
      reportReason(reason);
     }
   };

  return {
    rejectionHandledHandler,
    unhandledRejectionHandler,
    processTerminationHandler};

 };$h‍_once.makeRejectionHandlers(makeRejectionHandlers);
})()
,
// === functors[36] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,globalThis,defaultHandler,makeCausalConsole,makeRejectionHandlers;$h‍_imports([["../commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]]]],["./assert.js", [["loggedErrorHandler", [$h‍_a => (defaultHandler = $h‍_a)]]]],["./console.js", [["makeCausalConsole", [$h‍_a => (makeCausalConsole = $h‍_a)]]]],["./unhandled-rejection.js", [["makeRejectionHandlers", [$h‍_a => (makeRejectionHandlers = $h‍_a)]]]],["./types.js", []],["./internal-types.js", []]]);   








// eslint-disable-next-line no-restricted-globals
const originalConsole=  console;

/**
 * Wrap console unless suppressed.
 * At the moment, the console is considered a host power in the start
 * compartment, and not a primordial. Hence it is absent from the whilelist
 * and bypasses the intrinsicsCollector.
 *
 * @param {"safe" | "unsafe"} consoleTaming
 * @param {"platform" | "exit" | "abort" | "report" | "none"} [errorTrapping]
 * @param {"report" | "none"} [unhandledRejectionTrapping]
 * @param {GetStackString=} optGetStackString
 */
const        tameConsole=  (
  consoleTaming=  'safe',
  errorTrapping=  'platform',
  unhandledRejectionTrapping=  'report',
  optGetStackString=  undefined)=>
     {
  if( consoleTaming!==  'safe'&&  consoleTaming!==  'unsafe') {
    throw TypeError( `unrecognized consoleTaming ${consoleTaming}`);
   }

  let loggedErrorHandler;
  if( optGetStackString===  undefined) {
    loggedErrorHandler=  defaultHandler;
   }else {
    loggedErrorHandler=  {
      ...defaultHandler,
      getStackString: optGetStackString};

   }
  const ourConsole=
    consoleTaming===  'unsafe'?
        originalConsole:
        makeCausalConsole(originalConsole, loggedErrorHandler);

  // Attach platform-specific error traps such that any error that gets thrown
  // at top-of-turn (the bottom of stack) will get logged by our causal
  // console, revealing the diagnostic information associated with the error,
  // including the stack from when the error was created.

  // In the following Node.js and web browser cases, `process` and `window` are
  // spelled as `globalThis` properties to avoid the overweaning gaze of
  // Parcel, which dutifully installs an unnecessary `process` shim if we ever
  // utter that. That unnecessary shim forces the whole bundle into sloppy mode,
  // which in turn breaks SES's strict mode invariant.

  // Disable the polymorphic check for the rest of this file.  It's too noisy
  // when dealing with platform APIs.
  /* eslint-disable @endo/no-polymorphic-call */

  // Node.js
  if( errorTrapping!==  'none'&&  globalThis.process!==  undefined) {
    globalThis.process.on('uncaughtException', (error)=>{
      // causalConsole is born frozen so not vulnerable to method tampering.
      ourConsole.error(error);
      if( errorTrapping===  'platform'||  errorTrapping===  'exit') {
        globalThis.process.exit(globalThis.process.exitCode||  -1);
       }else if( errorTrapping===  'abort') {
        globalThis.process.abort();
       }
     });
   }

  if(
    unhandledRejectionTrapping!==  'none'&&
    globalThis.process!==  undefined)
    {
    const handleRejection=  (reason)=>{
      // 'platform' and 'report' just log the reason.
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
     };
    // Maybe track unhandled promise rejections.
    const h=  makeRejectionHandlers(handleRejection);
    if( h) {
      // Rejection handlers are supported.
      globalThis.process.on('unhandledRejection', h.unhandledRejectionHandler);
      globalThis.process.on('rejectionHandled', h.rejectionHandledHandler);
      globalThis.process.on('exit', h.processTerminationHandler);
     }
   }

  // Browser
  if(
    errorTrapping!==  'none'&&
    globalThis.window!==  undefined&&
    globalThis.window.addEventListener!==  undefined)
    {
    globalThis.window.addEventListener('error', (event)=>{
      event.preventDefault();
      // 'platform' and 'report' just log the reason.
      ourConsole.error(event.error);
      if( errorTrapping===  'exit'||  errorTrapping===  'abort') {
        globalThis.window.location.href=   `about:blank`;
       }
     });
   }

  if(
    unhandledRejectionTrapping!==  'none'&&
    globalThis.window!==  undefined&&
    globalThis.window.addEventListener!==  undefined)
    {
    const handleRejection=  (reason)=>{
      ourConsole.error('SES_UNHANDLED_REJECTION:', reason);
     };

    const h=  makeRejectionHandlers(handleRejection);
    if( h) {
      // Rejection handlers are supported.
      globalThis.window.addEventListener('unhandledrejection', (event)=>{
        event.preventDefault();
        h.unhandledRejectionHandler(event.reason, event.promise);
       });

      globalThis.window.addEventListener('rejectionhandled', (event)=>{
        event.preventDefault();
        h.rejectionHandledHandler(event.promise);
       });

      globalThis.window.addEventListener('beforeunload', (_event)=>{
        h.processTerminationHandler();
       });
     }
   }
  /* eslint-enable @endo/no-polymorphic-call */

  return { console: ourConsole};
 };$h‍_once.tameConsole(tameConsole);
})()
,
// === functors[37] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let WeakMap,WeakSet,apply,arrayFilter,arrayJoin,arrayMap,arraySlice,create,defineProperties,fromEntries,reflectSet,regexpExec,regexpTest,weakmapGet,weakmapSet,weaksetAdd,weaksetHas;$h‍_imports([["../commons.js", [["WeakMap", [$h‍_a => (WeakMap = $h‍_a)]],["WeakSet", [$h‍_a => (WeakSet = $h‍_a)]],["apply", [$h‍_a => (apply = $h‍_a)]],["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["arraySlice", [$h‍_a => (arraySlice = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["fromEntries", [$h‍_a => (fromEntries = $h‍_a)]],["reflectSet", [$h‍_a => (reflectSet = $h‍_a)]],["regexpExec", [$h‍_a => (regexpExec = $h‍_a)]],["regexpTest", [$h‍_a => (regexpTest = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]],["weaksetAdd", [$h‍_a => (weaksetAdd = $h‍_a)]],["weaksetHas", [$h‍_a => (weaksetHas = $h‍_a)]]]]]);   



















// Whitelist names from https://v8.dev/docs/stack-trace-api
// Whitelisting only the names used by error-stack-shim/src/v8StackFrames
// callSiteToFrame to shim the error stack proposal.
const safeV8CallSiteMethodNames=  [
  // suppress 'getThis' definitely
  'getTypeName',
  // suppress 'getFunction' definitely
  'getFunctionName',
  'getMethodName',
  'getFileName',
  'getLineNumber',
  'getColumnNumber',
  'getEvalOrigin',
  'isToplevel',
  'isEval',
  'isNative',
  'isConstructor',
  'isAsync',
  // suppress 'isPromiseAll' for now
  // suppress 'getPromiseIndex' for now

  // Additional names found by experiment, absent from
  // https://v8.dev/docs/stack-trace-api
  'getPosition',
  'getScriptNameOrSourceURL',

  'toString'  // TODO replace to use only whitelisted info
];

// TODO this is a ridiculously expensive way to attenuate callsites.
// Before that matters, we should switch to a reasonable representation.
const safeV8CallSiteFacet=  (callSite)=>{
  const methodEntry=  (name)=>{
    const method=  callSite[name];
    return [name, ()=>  apply(method, callSite, [])];
   };
  const o=  fromEntries(arrayMap(safeV8CallSiteMethodNames, methodEntry));
  return create(o, {});
 };

const safeV8SST=  (sst)=>arrayMap(sst, safeV8CallSiteFacet);

// If it has `/node_modules/` anywhere in it, on Node it is likely
// to be a dependent package of the current package, and so to
// be an infrastructure frame to be dropped from concise stack traces.
const FILENAME_NODE_DEPENDENTS_CENSOR=  /\/node_modules\//;

// If it begins with `internal/` or `node:internal` then it is likely
// part of the node infrustructre itself, to be dropped from concise
// stack traces.
const FILENAME_NODE_INTERNALS_CENSOR=  /^(?:node:)?internal\//;

// Frames within the `assert.js` package should be dropped from
// concise stack traces, as these are just steps towards creating the
// error object in question.
const FILENAME_ASSERT_CENSOR=  /\/packages\/ses\/src\/error\/assert.js$/;

// Frames within the `eventual-send` shim should be dropped so that concise
// deep stacks omit the internals of the eventual-sending mechanism causing
// asynchronous messages to be sent.
// Note that the eventual-send package will move from agoric-sdk to
// Endo, so this rule will be of general interest.
const FILENAME_EVENTUAL_SEND_CENSOR=  /\/packages\/eventual-send\/src\//;

// Any stack frame whose `fileName` matches any of these censor patterns
// will be omitted from concise stacks.
// TODO Enable users to configure FILENAME_CENSORS via `lockdown` options.
const FILENAME_CENSORS=  [
  FILENAME_NODE_DEPENDENTS_CENSOR,
  FILENAME_NODE_INTERNALS_CENSOR,
  FILENAME_ASSERT_CENSOR,
  FILENAME_EVENTUAL_SEND_CENSOR];


// Should a stack frame with this as its fileName be included in a concise
// stack trace?
// Exported only so it can be unit tested.
// TODO Move so that it applies not just to v8.
const        filterFileName=  (fileName)=>{
  if( !fileName) {
    // Stack frames with no fileName should appear in concise stack traces.
    return true;
   }
  for( const filter of FILENAME_CENSORS) {
    if( regexpTest(filter, fileName)) {
      return false;
     }
   }
  return true;
 };

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix, ending in a `/.../` should get dropped.
// Anything to the left of the likely path text is kept.
// Everything to the right of `/.../` is kept. Thus
// `'Object.bar (/vat-v1/.../eventual-send/test/test-deep-send.js:13:21)'`
// simplifies to
// `'Object.bar (eventual-send/test/test-deep-send.js:13:21)'`.
//
// See thread starting at
// https://github.com/Agoric/agoric-sdk/issues/2326#issuecomment-773020389
$h‍_once.filterFileName(filterFileName);const CALLSITE_ELLIPSES_PATTERN=/^((?:.*[( ])?)[:/\w_-]*\/\.\.\.\/(.+)$/;

// The ad-hoc rule of the current pattern is that any likely-file-path or
// likely url-path prefix, ending in a `/` and prior to `package/` should get
// dropped.
// Anything to the left of the likely path prefix text is kept. `package/` and
// everything to its right is kept. Thus
// `'Object.bar (/Users/markmiller/src/ongithub/agoric/agoric-sdk/packages/eventual-send/test/test-deep-send.js:13:21)'`
// simplifies to
// `'Object.bar (packages/eventual-send/test/test-deep-send.js:13:21)'`.
// Note that `/packages/` is a convention for monorepos encouraged by
// lerna.
const CALLSITE_PACKAGES_PATTERN=  /^((?:.*[( ])?)[:/\w_-]*\/(packages\/.+)$/;

// The use of these callSite patterns below assumes that any match will bind
// capture groups containing the parts of the original string we want
// to keep. The parts outside those capture groups will be dropped from concise
// stacks.
// TODO Enable users to configure CALLSITE_PATTERNS via `lockdown` options.
const CALLSITE_PATTERNS=  [
  CALLSITE_ELLIPSES_PATTERN,
  CALLSITE_PACKAGES_PATTERN];


// For a stack frame that should be included in a concise stack trace, if
// `callSiteString` is the original stringified stack frame, return the
// possibly-shorter stringified stack frame that should be shown instead.
// Exported only so it can be unit tested.
// TODO Move so that it applies not just to v8.
const        shortenCallSiteString=  (callSiteString)=>{
  for( const filter of CALLSITE_PATTERNS) {
    const match=  regexpExec(filter, callSiteString);
    if( match) {
      return arrayJoin(arraySlice(match, 1), '');
     }
   }
  return callSiteString;
 };$h‍_once.shortenCallSiteString(shortenCallSiteString);

const        tameV8ErrorConstructor=  (
  OriginalError,
  InitialError,
  errorTaming,
  stackFiltering)=>
     {
  // TODO: Proper CallSite types
  /** @typedef {{}} CallSite */

  const originalCaptureStackTrace=  OriginalError.captureStackTrace;

  // const callSiteFilter = _callSite => true;
  const callSiteFilter=  (callSite)=>{
    if( stackFiltering===  'verbose') {
      return true;
     }
    // eslint-disable-next-line @endo/no-polymorphic-call
    return filterFileName(callSite.getFileName());
   };

  const callSiteStringifier=  (callSite)=>{
    let callSiteString=   `${callSite}`;
    if( stackFiltering===  'concise') {
      callSiteString=  shortenCallSiteString(callSiteString);
     }
    return  `\n  at ${callSiteString}`;
   };

  const stackStringFromSST=  (_error, sst)=>
    arrayJoin(
      arrayMap(arrayFilter(sst, callSiteFilter), callSiteStringifier),
      '');


  /**
   * @typedef {object} StructuredStackInfo
   * @property {CallSite[]} callSites
   * @property {undefined} [stackString]
   */

  /**
   * @typedef {object} ParsedStackInfo
   * @property {undefined} [callSites]
   * @property {string} stackString
   */

  // Mapping from error instance to the stack for that instance.
  // The stack info is either the structured stack trace
  // or the generated tamed stack string
  /** @type {WeakMap<Error, ParsedStackInfo | StructuredStackInfo>} */
  const stackInfos=  new WeakMap();

  // Use concise methods to obtain named functions without constructors.
  const tamedMethods=  {
    // The optional `optFn` argument is for cutting off the bottom of
    // the stack --- for capturing the stack only above the topmost
    // call to that function. Since this isn't the "real" captureStackTrace
    // but instead calls the real one, if no other cutoff is provided,
    // we cut this one off.
    captureStackTrace(error, optFn=  tamedMethods.captureStackTrace) {
      if( typeof originalCaptureStackTrace===  'function') {
        // OriginalError.captureStackTrace is only on v8
        apply(originalCaptureStackTrace, OriginalError, [error, optFn]);
        return;
       }
      reflectSet(error, 'stack', '');
     },
    // Shim of proposed special power, to reside by default only
    // in the start compartment, for getting the stack traceback
    // string associated with an error.
    // See https://tc39.es/proposal-error-stacks/
    getStackString(error) {
      let stackInfo=  weakmapGet(stackInfos, error);

      if( stackInfo===  undefined) {
        // The following will call `prepareStackTrace()` synchronously
        // which will populate stackInfos
        // eslint-disable-next-line no-void
        void error.stack;
        stackInfo=  weakmapGet(stackInfos, error);
        if( !stackInfo) {
          stackInfo=  { stackString: ''};
          weakmapSet(stackInfos, error, stackInfo);
         }
       }

      // prepareStackTrace() may generate the stackString
      // if errorTaming === 'unsafe'

      if( stackInfo.stackString!==  undefined) {
        return stackInfo.stackString;
       }

      const stackString=  stackStringFromSST(error, stackInfo.callSites);
      weakmapSet(stackInfos, error, { stackString});

      return stackString;
     },
    prepareStackTrace(error, sst) {
      if( errorTaming===  'unsafe') {
        const stackString=  stackStringFromSST(error, sst);
        weakmapSet(stackInfos, error, { stackString});
        return  `${error}${stackString}`;
       }else {
        weakmapSet(stackInfos, error, { callSites: sst});
        return '';
       }
     }};


  // A prepareFn is a prepareStackTrace function.
  // An sst is a `structuredStackTrace`, which is an array of
  // callsites.
  // A user prepareFn is a prepareFn defined by a client of this API,
  // and provided by assigning to `Error.prepareStackTrace`.
  // A user prepareFn should only receive an attenuated sst, which
  // is an array of attenuated callsites.
  // A system prepareFn is the prepareFn created by this module to
  // be installed on the real `Error` constructor, to receive
  // an original sst, i.e., an array of unattenuated callsites.
  // An input prepareFn is a function the user assigns to
  // `Error.prepareStackTrace`, which might be a user prepareFn or
  // a system prepareFn previously obtained by reading
  // `Error.prepareStackTrace`.

  const defaultPrepareFn=  tamedMethods.prepareStackTrace;

  OriginalError.prepareStackTrace=  defaultPrepareFn;

  // A weakset branding some functions as system prepareFns, all of which
  // must be defined by this module, since they can receive an
  // unattenuated sst.
  const systemPrepareFnSet=  new WeakSet([defaultPrepareFn]);

  const systemPrepareFnFor=  (inputPrepareFn)=>{
    if( weaksetHas(systemPrepareFnSet, inputPrepareFn)) {
      return inputPrepareFn;
     }
    // Use concise methods to obtain named functions without constructors.
    const systemMethods=  {
      prepareStackTrace(error, sst) {
        weakmapSet(stackInfos, error, { callSites: sst});
        return inputPrepareFn(error, safeV8SST(sst));
       }};

    weaksetAdd(systemPrepareFnSet, systemMethods.prepareStackTrace);
    return systemMethods.prepareStackTrace;
   };

  // Note `stackTraceLimit` accessor already defined by
  // tame-error-constructor.js
  defineProperties(InitialError, {
    captureStackTrace: {
      value: tamedMethods.captureStackTrace,
      writable: true,
      enumerable: false,
      configurable: true},

    prepareStackTrace: {
      get() {
        return OriginalError.prepareStackTrace;
       },
      set(inputPrepareStackTraceFn) {
        if( typeof inputPrepareStackTraceFn===  'function') {
          const systemPrepareFn=  systemPrepareFnFor(inputPrepareStackTraceFn);
          OriginalError.prepareStackTrace=  systemPrepareFn;
         }else {
          OriginalError.prepareStackTrace=  defaultPrepareFn;
         }
       },
      enumerable: false,
      configurable: true}});



  return tamedMethods.getStackString;
 };$h‍_once.tameV8ErrorConstructor(tameV8ErrorConstructor);
})()
,
// === functors[38] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_ERROR,TypeError,apply,construct,defineProperties,setPrototypeOf,getOwnPropertyDescriptor,defineProperty,NativeErrors,tameV8ErrorConstructor;$h‍_imports([["../commons.js", [["FERAL_ERROR", [$h‍_a => (FERAL_ERROR = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["apply", [$h‍_a => (apply = $h‍_a)]],["construct", [$h‍_a => (construct = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["setPrototypeOf", [$h‍_a => (setPrototypeOf = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]]]],["../permits.js", [["NativeErrors", [$h‍_a => (NativeErrors = $h‍_a)]]]],["./tame-v8-error-constructor.js", [["tameV8ErrorConstructor", [$h‍_a => (tameV8ErrorConstructor = $h‍_a)]]]]]);   












// Present on at least FF and XS. Proposed by Error-proposal. The original
// is dangerous, so tameErrorConstructor replaces it with a safe one.
// We grab the original here before it gets replaced.
const stackDesc=  getOwnPropertyDescriptor(FERAL_ERROR.prototype, 'stack');
const stackGetter=  stackDesc&&  stackDesc.get;

// Use concise methods to obtain named functions without constructors.
const tamedMethods=  {
  getStackString(error) {
    if( typeof stackGetter===  'function') {
      return apply(stackGetter, error, []);
     }else if( 'stack'in  error) {
      // The fallback is to just use the de facto `error.stack` if present
      return  `${error.stack}`;
     }
    return '';
   }};


function                tameErrorConstructor(
  errorTaming=  'safe',
  stackFiltering=  'concise')
  {
  if( errorTaming!==  'safe'&&  errorTaming!==  'unsafe') {
    throw TypeError( `unrecognized errorTaming ${errorTaming}`);
   }
  if( stackFiltering!==  'concise'&&  stackFiltering!==  'verbose') {
    throw TypeError( `unrecognized stackFiltering ${stackFiltering}`);
   }
  const ErrorPrototype=  FERAL_ERROR.prototype;

  const platform=
    typeof FERAL_ERROR.captureStackTrace===  'function'?  'v8':  'unknown';
  const { captureStackTrace: originalCaptureStackTrace}=   FERAL_ERROR;

  const makeErrorConstructor=  (_=  {})=>  {
    // eslint-disable-next-line no-shadow
    const ResultError=  function Error(...rest) {
      let error;
      if( new.target===  undefined) {
        error=  apply(FERAL_ERROR, this, rest);
       }else {
        error=  construct(FERAL_ERROR, rest, new.target);
       }
      if( platform===  'v8') {
        // TODO Likely expensive!
        apply(originalCaptureStackTrace, FERAL_ERROR, [error, ResultError]);
       }
      return error;
     };
    defineProperties(ResultError, {
      length: { value: 1},
      prototype: {
        value: ErrorPrototype,
        writable: false,
        enumerable: false,
        configurable: false}});


    return ResultError;
   };
  const InitialError=  makeErrorConstructor({ powers: 'original'});
  const SharedError=  makeErrorConstructor({ powers: 'none'});
  defineProperties(ErrorPrototype, {
    constructor: { value: SharedError}});


  for( const NativeError of NativeErrors) {
    setPrototypeOf(NativeError, SharedError);
   }

  // https://v8.dev/docs/stack-trace-api#compatibility advises that
  // programmers can "always" set `Error.stackTraceLimit`
  // even on non-v8 platforms. On non-v8
  // it will have no effect, but this advice only makes sense
  // if the assignment itself does not fail, which it would
  // if `Error` were naively frozen. Hence, we add setters that
  // accept but ignore the assignment on non-v8 platforms.
  defineProperties(InitialError, {
    stackTraceLimit: {
      get() {
        if( typeof FERAL_ERROR.stackTraceLimit===  'number') {
          // FERAL_ERROR.stackTraceLimit is only on v8
          return FERAL_ERROR.stackTraceLimit;
         }
        return undefined;
       },
      set(newLimit) {
        if( typeof newLimit!==  'number') {
          // silently do nothing. This behavior doesn't precisely
          // emulate v8 edge-case behavior. But given the purpose
          // of this emulation, having edge cases err towards
          // harmless seems the safer option.
          return;
         }
        if( typeof FERAL_ERROR.stackTraceLimit===  'number') {
          // FERAL_ERROR.stackTraceLimit is only on v8
          FERAL_ERROR.stackTraceLimit=  newLimit;
          // We place the useless return on the next line to ensure
          // that anything we place after the if in the future only
          // happens if the then-case does not.
          // eslint-disable-next-line no-useless-return
          return;
         }
       },
      // WTF on v8 stackTraceLimit is enumerable
      enumerable: false,
      configurable: true}});



  // The default SharedError much be completely powerless even on v8,
  // so the lenient `stackTraceLimit` accessor does nothing on all
  // platforms.
  defineProperties(SharedError, {
    stackTraceLimit: {
      get() {
        return undefined;
       },
      set(_newLimit) {
        // do nothing
       },
      enumerable: false,
      configurable: true}});



  if( platform===  'v8') {
    // `SharedError.prepareStackTrace`, if it exists, must also be
    // powerless. However, from what we've heard, depd expects to be able to
    // assign to it without the assignment throwing. It is normally a function
    // that returns a stack string to be magically added to error objects.
    // However, as long as we're adding a lenient standin, we may as well
    // accommodate any who expect to get a function they can call and get
    // a string back. This prepareStackTrace is a do-nothing function that
    // always returns the empty string.
    defineProperties(SharedError, {
      prepareStackTrace: {
        get() {
          return ()=>  '';
         },
        set(_prepareFn) {
          // do nothing
         },
        enumerable: false,
        configurable: true},

      captureStackTrace: {
        value: (errorish, _constructorOpt)=>  {
          defineProperty(errorish, 'stack', {
            value: ''});

         },
        writable: false,
        enumerable: false,
        configurable: true}});


   }

  let initialGetStackString=  tamedMethods.getStackString;
  if( platform===  'v8') {
    initialGetStackString=  tameV8ErrorConstructor(
      FERAL_ERROR,
      InitialError,
      errorTaming,
      stackFiltering);

   }else if( errorTaming===  'unsafe') {
    // v8 has too much magic around their 'stack' own property for it to
    // coexist cleanly with this accessor. So only install it on non-v8

    // Error.prototype.stack property as proposed at
    // https://tc39.es/proposal-error-stacks/
    // with the fix proposed at
    // https://github.com/tc39/proposal-error-stacks/issues/46
    // On others, this still protects from the override mistake,
    // essentially like enable-property-overrides.js would
    // once this accessor property itself is frozen, as will happen
    // later during lockdown.
    //
    // However, there is here a change from the intent in the current
    // state of the proposal. If experience tells us whether this change
    // is a good idea, we should modify the proposal accordingly. There is
    // much code in the world that assumes `error.stack` is a string. So
    // where the proposal accommodates secure operation by making the
    // property optional, we instead accommodate secure operation by
    // having the secure form always return only the stable part, the
    // stringified error instance, and omitting all the frame information
    // rather than omitting the property.
    defineProperties(ErrorPrototype, {
      stack: {
        get() {
          return initialGetStackString(this);
         },
        set(newValue) {
          defineProperties(this, {
            stack: {
              value: newValue,
              writable: true,
              enumerable: true,
              configurable: true}});


         }}});


   }else {
    // v8 has too much magic around their 'stack' own property for it to
    // coexist cleanly with this accessor. So only install it on non-v8
    defineProperties(ErrorPrototype, {
      stack: {
        get() {
          // https://github.com/tc39/proposal-error-stacks/issues/46
          // allows this to not add an unpleasant newline. Otherwise
          // we should fix this.
          return  `${this}`;
         },
        set(newValue) {
          defineProperties(this, {
            stack: {
              value: newValue,
              writable: true,
              enumerable: true,
              configurable: true}});


         }}});


   }

  return {
    '%InitialGetStackString%': initialGetStackString,
    '%InitialError%': InitialError,
    '%SharedError%': SharedError};

 }$h‍_once.default(     tameErrorConstructor);
})()
,
// === functors[39] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let ReferenceError,TypeError,Map,Set,arrayJoin,arrayMap,arrayPush,create,freeze,mapGet,mapHas,mapSet,setAdd,promiseCatch,promiseThen,values,weakmapGet,assert;$h‍_imports([["./commons.js", [["ReferenceError", [$h‍_a => (ReferenceError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["Map", [$h‍_a => (Map = $h‍_a)]],["Set", [$h‍_a => (Set = $h‍_a)]],["arrayJoin", [$h‍_a => (arrayJoin = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]],["arrayPush", [$h‍_a => (arrayPush = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["mapHas", [$h‍_a => (mapHas = $h‍_a)]],["mapSet", [$h‍_a => (mapSet = $h‍_a)]],["setAdd", [$h‍_a => (setAdd = $h‍_a)]],["promiseCatch", [$h‍_a => (promiseCatch = $h‍_a)]],["promiseThen", [$h‍_a => (promiseThen = $h‍_a)]],["values", [$h‍_a => (values = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   




























const { Fail, details: d, quote: q}=   assert;

const noop=  ()=>  { };

// `makeAlias` constructs compartment specifier tuples for the `aliases`
// private field of compartments.
// These aliases allow a compartment to alias an internal module specifier to a
// module specifier in an external compartment, and also to create internal
// aliases.
// Both are facilitated by the moduleMap Compartment constructor option.
const        makeAlias=  (compartment, specifier)=>
  freeze({
    compartment,
    specifier});


// `resolveAll` pre-computes resolutions of all imports within the compartment
// in which a module was loaded.
$h‍_once.makeAlias(makeAlias);const resolveAll=(imports,resolveHook,fullReferrerSpecifier)=>{
  const resolvedImports=  create(null);
  for( const importSpecifier of imports) {
    const fullSpecifier=  resolveHook(importSpecifier, fullReferrerSpecifier);
    resolvedImports[importSpecifier]=  fullSpecifier;
   }
  return freeze(resolvedImports);
 };

const loadRecord=  (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  staticModuleRecord,
  pendingJobs,
  moduleLoads,
  errors,
  importMeta)=>
     {
  const { resolveHook, moduleRecords}=   weakmapGet(
    compartmentPrivateFields,
    compartment);


  // resolve all imports relative to this referrer module.
  const resolvedImports=  resolveAll(
    staticModuleRecord.imports,
    resolveHook,
    moduleSpecifier);

  const moduleRecord=  freeze({
    compartment,
    staticModuleRecord,
    moduleSpecifier,
    resolvedImports,
    importMeta});


  // Enqueue jobs to load this module's shallow dependencies.
  for( const fullSpecifier of values(resolvedImports)) {
    // Behold: recursion.
    // eslint-disable-next-line no-use-before-define
    const dependencyLoaded=  memoizedLoadWithErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      fullSpecifier,
      pendingJobs,
      moduleLoads,
      errors);

    setAdd(
      pendingJobs,
      promiseThen(dependencyLoaded, noop, (error)=>{
        arrayPush(errors, error);
       }));

   }

  // Memoize.
  mapSet(moduleRecords, moduleSpecifier, moduleRecord);
  return moduleRecord;
 };

const loadWithoutErrorAnnotation=  async(
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  pendingJobs,
  moduleLoads,
  errors)=>
     {
  const { importHook, moduleMap, moduleMapHook, moduleRecords}=   weakmapGet(
    compartmentPrivateFields,
    compartment);


  // Follow moduleMap, or moduleMapHook if present.
  let aliasNamespace=  moduleMap[moduleSpecifier];
  if( aliasNamespace===  undefined&&  moduleMapHook!==  undefined) {
    aliasNamespace=  moduleMapHook(moduleSpecifier);
   }
  if( typeof aliasNamespace===  'string') {
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      d `Cannot map module ${q(moduleSpecifier)} to ${q(
        aliasNamespace)
        } in parent compartment, not yet implemented`,
      TypeError);

   }else if( aliasNamespace!==  undefined) {
    const alias=  weakmapGet(moduleAliases, aliasNamespace);
    if( alias===  undefined) {
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        d `Cannot map module ${q(
          moduleSpecifier)
          } because the value is not a module exports namespace, or is from another realm`,
        ReferenceError);

     }
    // Behold: recursion.
    // eslint-disable-next-line no-use-before-define
    const aliasRecord=  await memoizedLoadWithErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      alias.compartment,
      alias.specifier,
      pendingJobs,
      moduleLoads,
      errors);

    mapSet(moduleRecords, moduleSpecifier, aliasRecord);
    return aliasRecord;
   }

  if( mapHas(moduleRecords, moduleSpecifier)) {
    return mapGet(moduleRecords, moduleSpecifier);
   }

  const staticModuleRecord=  await importHook(moduleSpecifier);

  if( staticModuleRecord===  null||  typeof staticModuleRecord!==  'object') {
    Fail `importHook must return a promise for an object, for module ${q(
      moduleSpecifier)
      } in compartment ${q(compartment.name)}`;
   }

  // check if record is a RedirectStaticModuleInterface
  if( staticModuleRecord.specifier!==  undefined) {
    // check if this redirect with an explicit record
    if( staticModuleRecord.record!==  undefined) {
      // ensure expected record shape
      if( staticModuleRecord.compartment!==  undefined) {
        throw TypeError(
          'Cannot redirect to an explicit record with a specified compartment');

       }
      const {
        compartment: aliasCompartment=  compartment,
        specifier: aliasSpecifier=  moduleSpecifier,
        record: aliasModuleRecord,
        importMeta}=
          staticModuleRecord;

      const aliasRecord=  loadRecord(
        compartmentPrivateFields,
        moduleAliases,
        aliasCompartment,
        aliasSpecifier,
        aliasModuleRecord,
        pendingJobs,
        moduleLoads,
        errors,
        importMeta);

      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      return aliasRecord;
     }

    // check if this redirect with an explicit compartment
    if( staticModuleRecord.compartment!==  undefined) {
      // ensure expected record shape
      if( staticModuleRecord.importMeta!==  undefined) {
        throw TypeError(
          'Cannot redirect to an implicit record with a specified importMeta');

       }
      // Behold: recursion.
      // eslint-disable-next-line no-use-before-define
      const aliasRecord=  await memoizedLoadWithErrorAnnotation(
        compartmentPrivateFields,
        moduleAliases,
        staticModuleRecord.compartment,
        staticModuleRecord.specifier,
        pendingJobs,
        moduleLoads,
        errors);

      mapSet(moduleRecords, moduleSpecifier, aliasRecord);
      return aliasRecord;
     }

    throw TypeError('Unnexpected RedirectStaticModuleInterface record shape');
   }

  return loadRecord(
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    staticModuleRecord,
    pendingJobs,
    moduleLoads,
    errors);

 };

const memoizedLoadWithErrorAnnotation=  async(
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier,
  pendingJobs,
  moduleLoads,
  errors)=>
     {
  const { name: compartmentName}=   weakmapGet(
    compartmentPrivateFields,
    compartment);


  // Prevent data-lock from recursion into branches visited in dependent loads.
  let compartmentLoading=  mapGet(moduleLoads, compartment);
  if( compartmentLoading===  undefined) {
    compartmentLoading=  new Map();
    mapSet(moduleLoads, compartment, compartmentLoading);
   }
  let moduleLoading=  mapGet(compartmentLoading, moduleSpecifier);
  if( moduleLoading!==  undefined) {
    return moduleLoading;
   }

  moduleLoading=  promiseCatch(
    loadWithoutErrorAnnotation(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      moduleSpecifier,
      pendingJobs,
      moduleLoads,
      errors),

    (error)=>{
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.note(
        error,
        d `${error.message}, loading ${q(moduleSpecifier)} in compartment ${q(
          compartmentName)
          }`);

      throw error;
     });


  mapSet(compartmentLoading, moduleSpecifier, moduleLoading);

  return moduleLoading;
 };

/*
 * `load` asynchronously gathers the `StaticModuleRecord`s for a module and its
 * transitive dependencies.
 * The module records refer to each other by a reference to the dependency's
 * compartment and the specifier of the module within its own compartment.
 * This graph is then ready to be synchronously linked and executed.
 */
const        load=  async(
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier)=>
     {
  const { name: compartmentName}=   weakmapGet(
    compartmentPrivateFields,
    compartment);


  /** @type {Set<Promise<undefined>>} */
  const pendingJobs=  new Set();
  /** @type {Map<object, Map<string, Promise<Record<any, any>>>>} */
  const moduleLoads=  new Map();
  /** @type {Array<Error>} */
  const errors=  [];

  const dependencyLoaded=  memoizedLoadWithErrorAnnotation(
    compartmentPrivateFields,
    moduleAliases,
    compartment,
    moduleSpecifier,
    pendingJobs,
    moduleLoads,
    errors);

  setAdd(
    pendingJobs,
    promiseThen(dependencyLoaded, noop, (error)=>{
      arrayPush(errors, error);
     }));


  // Drain pending jobs queue.
  // Each job is a promise for undefined, regardless of success or failure.
  // Before we add a job to the queue, we catch any error and push it into the
  // `errors` accumulator.
  for( const job of pendingJobs) {
    // eslint-disable-next-line no-await-in-loop
    await job;
   }

  // Throw an aggregate error if there were any errors.
  if( errors.length>  0) {
    throw TypeError(
       `Failed to load module ${q(moduleSpecifier)} in package ${q(
        compartmentName)
        } (${errors.length} underlying failures: ${arrayJoin(
        arrayMap(errors, (error)=>error.message),
        ', ')
        }`);

   }
 };$h‍_once.load(load);
})()
,
// === functors[40] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeAlias,Proxy,TypeError,create,freeze,mapGet,mapHas,mapSet,ownKeys,reflectGet,reflectGetOwnPropertyDescriptor,reflectHas,reflectIsExtensible,reflectPreventExtensions,weakmapSet,assert;$h‍_imports([["./module-load.js", [["makeAlias", [$h‍_a => (makeAlias = $h‍_a)]]]],["./commons.js", [["Proxy", [$h‍_a => (Proxy = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["mapHas", [$h‍_a => (mapHas = $h‍_a)]],["mapSet", [$h‍_a => (mapSet = $h‍_a)]],["ownKeys", [$h‍_a => (ownKeys = $h‍_a)]],["reflectGet", [$h‍_a => (reflectGet = $h‍_a)]],["reflectGetOwnPropertyDescriptor", [$h‍_a => (reflectGetOwnPropertyDescriptor = $h‍_a)]],["reflectHas", [$h‍_a => (reflectHas = $h‍_a)]],["reflectIsExtensible", [$h‍_a => (reflectIsExtensible = $h‍_a)]],["reflectPreventExtensions", [$h‍_a => (reflectPreventExtensions = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   






























const { quote: q}=   assert;

// `deferExports` creates a module's exports proxy, proxied exports, and
// activator.
// A `Compartment` can create a module for any module specifier, regardless of
// whether it is loadable or executable, and use that object as a token that
// can be fed into another compartment's module map.
// Only after the specified module has been analyzed is it possible for the
// module namespace proxy to behave properly, so it throws exceptions until
// after the compartment has begun executing the module.
// The module instance must freeze the proxied exports and activate the exports
// proxy before executing the module.
//
// The module exports proxy's behavior differs from the ECMAScript 262
// specification for "module namespace exotic objects" only in that according
// to the specification value property descriptors have a non-writable "value"
// and this implementation models all properties with accessors.
//
// https://tc39.es/ecma262/#sec-module-namespace-exotic-objects
//
const        deferExports=  ()=>  {
  let active=  false;
  const proxiedExports=  create(null);
  return freeze({
    activate() {
      active=  true;
     },
    proxiedExports,
    exportsProxy: new Proxy(proxiedExports, {
      get(_target, name, receiver) {
        if( !active) {
          throw TypeError(
             `Cannot get property ${q(
              name)
              } of module exports namespace, the module has not yet begun to execute`);

         }
        return reflectGet(proxiedExports, name, receiver);
       },
      set(_target, name, _value) {
        throw TypeError(
           `Cannot set property ${q(name)} of module exports namespace`);

       },
      has(_target, name) {
        if( !active) {
          throw TypeError(
             `Cannot check property ${q(
              name)
              }, the module has not yet begun to execute`);

         }
        return reflectHas(proxiedExports, name);
       },
      deleteProperty(_target, name) {
        throw TypeError(
           `Cannot delete property ${q(name)}s of module exports namespace`);

       },
      ownKeys(_target) {
        if( !active) {
          throw TypeError(
            'Cannot enumerate keys, the module has not yet begun to execute');

         }
        return ownKeys(proxiedExports);
       },
      getOwnPropertyDescriptor(_target, name) {
        if( !active) {
          throw TypeError(
             `Cannot get own property descriptor ${q(
              name)
              }, the module has not yet begun to execute`);

         }
        return reflectGetOwnPropertyDescriptor(proxiedExports, name);
       },
      preventExtensions(_target) {
        if( !active) {
          throw TypeError(
            'Cannot prevent extensions of module exports namespace, the module has not yet begun to execute');

         }
        return reflectPreventExtensions(proxiedExports);
       },
      isExtensible() {
        if( !active) {
          throw TypeError(
            'Cannot check extensibility of module exports namespace, the module has not yet begun to execute');

         }
        return reflectIsExtensible(proxiedExports);
       },
      getPrototypeOf(_target) {
        return null;
       },
      setPrototypeOf(_target, _proto) {
        throw TypeError('Cannot set prototype of module exports namespace');
       },
      defineProperty(_target, name, _descriptor) {
        throw TypeError(
           `Cannot define property ${q(name)} of module exports namespace`);

       },
      apply(_target, _thisArg, _args) {
        throw TypeError(
          'Cannot call module exports namespace, it is not a function');

       },
      construct(_target, _args) {
        throw TypeError(
          'Cannot construct module exports namespace, it is not a constructor');

       }})});


 };

// `getDeferredExports` memoizes the creation of a deferred module exports
// namespace proxy for any abritrary full specifier in a compartment.
// It also records the compartment and specifier affiliated with that module
// exports namespace proxy so it can be used as an alias into another
// compartment when threaded through a compartment's `moduleMap` argument.
$h‍_once.deferExports(deferExports);const getDeferredExports=(
  compartment,
  compartmentPrivateFields,
  moduleAliases,
  specifier)=>
     {
  const { deferredExports}=   compartmentPrivateFields;
  if( !mapHas(deferredExports, specifier)) {
    const deferred=  deferExports();
    weakmapSet(
      moduleAliases,
      deferred.exportsProxy,
      makeAlias(compartment, specifier));

    mapSet(deferredExports, specifier, deferred);
   }
  return mapGet(deferredExports, specifier);
 };$h‍_once.getDeferredExports(getDeferredExports);
})()
,
// === functors[41] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,arrayPush,create,getOwnPropertyDescriptors,evadeHtmlCommentTest,evadeImportExpressionTest,rejectSomeDirectEvalExpressions,makeSafeEvaluator;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["arrayPush", [$h‍_a => (arrayPush = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]]]],["./transforms.js", [["evadeHtmlCommentTest", [$h‍_a => (evadeHtmlCommentTest = $h‍_a)]],["evadeImportExpressionTest", [$h‍_a => (evadeImportExpressionTest = $h‍_a)]],["rejectSomeDirectEvalExpressions", [$h‍_a => (rejectSomeDirectEvalExpressions = $h‍_a)]]]],["./make-safe-evaluator.js", [["makeSafeEvaluator", [$h‍_a => (makeSafeEvaluator = $h‍_a)]]]]]);   













const        provideCompartmentEvaluator=  (compartmentFields, options)=>  {
  const { sloppyGlobalsMode=  false, __moduleShimLexicals__=  undefined}=
    options;

  let safeEvaluate;

  if( __moduleShimLexicals__===  undefined&&  !sloppyGlobalsMode) {
    ({ safeEvaluate}=   compartmentFields);
   }else {
    // The scope proxy or global lexicals are different from the
    // shared evaluator so we need to build a new one

    let { globalTransforms}=   compartmentFields;
    const { globalObject}=   compartmentFields;

    let moduleLexicals;
    if( __moduleShimLexicals__!==  undefined) {
      // When using `evaluate` for ESM modules, as should only occur from the
      // module-shim's module-instance.js, we do not reveal the SES-shim's
      // module-to-program translation, as this is not standardizable behavior.
      // However, the `localTransforms` will come from the `__shimTransforms__`
      // Compartment option in this case, which is a non-standardizable escape
      // hatch so programs designed specifically for the SES-shim
      // implementation may opt-in to use the same transforms for `evaluate`
      // and `import`, at the expense of being tightly coupled to SES-shim.
      globalTransforms=  undefined;

      moduleLexicals=  create(
        null,
        getOwnPropertyDescriptors(__moduleShimLexicals__));

     }

    ({ safeEvaluate}=   makeSafeEvaluator({
      globalObject,
      moduleLexicals,
      globalTransforms,
      sloppyGlobalsMode}));

   }

  return { safeEvaluate};
 };$h‍_once.provideCompartmentEvaluator(provideCompartmentEvaluator);

const        compartmentEvaluate=  (compartmentFields, source, options)=>  {
  // Perform this check first to avoid unnecessary sanitizing.
  // TODO Maybe relax string check and coerce instead:
  // https://github.com/tc39/proposal-dynamic-code-brand-checks
  if( typeof source!==  'string') {
    throw TypeError('first argument of evaluate() must be a string');
   }

  // Extract options, and shallow-clone transforms.
  const {
    transforms=  [],
    __evadeHtmlCommentTest__=  false,
    __evadeImportExpressionTest__=  false,
    __rejectSomeDirectEvalExpressions__=  true  // Note default on
}=    options;
  const localTransforms=  [...transforms];
  if( __evadeHtmlCommentTest__===  true) {
    arrayPush(localTransforms, evadeHtmlCommentTest);
   }
  if( __evadeImportExpressionTest__===  true) {
    arrayPush(localTransforms, evadeImportExpressionTest);
   }
  if( __rejectSomeDirectEvalExpressions__===  true) {
    arrayPush(localTransforms, rejectSomeDirectEvalExpressions);
   }

  const { safeEvaluate}=   provideCompartmentEvaluator(
    compartmentFields,
    options);


  return safeEvaluate(source, {
    localTransforms});

 };$h‍_once.compartmentEvaluate(compartmentEvaluate);
})()
,
// === functors[42] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assert,getDeferredExports,ReferenceError,SyntaxError,TypeError,arrayForEach,arrayIncludes,arrayPush,arraySome,arraySort,create,defineProperty,entries,freeze,isArray,keys,mapGet,weakmapGet,reflectHas,assign,compartmentEvaluate;$h‍_imports([["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]],["./module-proxy.js", [["getDeferredExports", [$h‍_a => (getDeferredExports = $h‍_a)]]]],["./commons.js", [["ReferenceError", [$h‍_a => (ReferenceError = $h‍_a)]],["SyntaxError", [$h‍_a => (SyntaxError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["arrayForEach", [$h‍_a => (arrayForEach = $h‍_a)]],["arrayIncludes", [$h‍_a => (arrayIncludes = $h‍_a)]],["arrayPush", [$h‍_a => (arrayPush = $h‍_a)]],["arraySome", [$h‍_a => (arraySome = $h‍_a)]],["arraySort", [$h‍_a => (arraySort = $h‍_a)]],["create", [$h‍_a => (create = $h‍_a)]],["defineProperty", [$h‍_a => (defineProperty = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]],["isArray", [$h‍_a => (isArray = $h‍_a)]],["keys", [$h‍_a => (keys = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["reflectHas", [$h‍_a => (reflectHas = $h‍_a)]],["assign", [$h‍_a => (assign = $h‍_a)]]]],["./compartment-evaluate.js", [["compartmentEvaluate", [$h‍_a => (compartmentEvaluate = $h‍_a)]]]]]);   























const { quote: q}=   assert;

const        makeThirdPartyModuleInstance=  (
  compartmentPrivateFields,
  staticModuleRecord,
  compartment,
  moduleAliases,
  moduleSpecifier,
  resolvedImports)=>
     {
  const { exportsProxy, proxiedExports, activate}=   getDeferredExports(
    compartment,
    weakmapGet(compartmentPrivateFields, compartment),
    moduleAliases,
    moduleSpecifier);


  const notifiers=  create(null);

  if( staticModuleRecord.exports) {
    if(
      !isArray(staticModuleRecord.exports)||
      arraySome(staticModuleRecord.exports, (name)=>typeof name!==  'string'))
      {
      throw TypeError(
         `SES third-party static module record "exports" property must be an array of strings for module ${moduleSpecifier}`);

     }
    arrayForEach(staticModuleRecord.exports, (name)=>{
      let value=  proxiedExports[name];
      const updaters=  [];

      const get=  ()=>  value;

      const set=  (newValue)=>{
        value=  newValue;
        for( const updater of updaters) {
          updater(newValue);
         }
       };

      defineProperty(proxiedExports, name, {
        get,
        set,
        enumerable: true,
        configurable: false});


      notifiers[name]=  (update)=>{
        arrayPush(updaters, update);
        update(value);
       };
     });
    // This is enough to support import * from cjs - the '*' field doesn't need to be in exports nor proxiedExports because import will only ever access it via notifiers
    notifiers['*']=  (update)=>{
      update(proxiedExports);
     };
   }

  const localState=  {
    activated: false};

  return freeze({
    notifiers,
    exportsProxy,
    execute() {
      if( reflectHas(localState, 'errorFromExecute')) {
        throw localState.errorFromExecute;
       }
      if( !localState.activated) {
        activate();
        localState.activated=  true;
        try {
          // eslint-disable-next-line @endo/no-polymorphic-call
          staticModuleRecord.execute(
            proxiedExports,
            compartment,
            resolvedImports);

         }catch( err) {
          localState.errorFromExecute=  err;
          throw err;
         }
       }
     }});

 };

// `makeModuleInstance` takes a module's compartment record, the live import
// namespace, and a global object; and produces a module instance.
// The module instance carries the proxied module exports namespace (the
// "exports"), notifiers to update the module's internal import namespace, and
// an idempotent execute function.
// The module exports namespace is a proxy to the proxied exports namespace
// that the execution of the module instance populates.
$h‍_once.makeThirdPartyModuleInstance(makeThirdPartyModuleInstance);const makeModuleInstance=(
  privateFields,
  moduleAliases,
  moduleRecord,
  importedInstances)=>
     {
  const {
    compartment,
    moduleSpecifier,
    staticModuleRecord,
    importMeta: moduleRecordMeta}=
      moduleRecord;
  const {
    reexports: exportAlls=  [],
    __syncModuleProgram__: functorSource,
    __fixedExportMap__: fixedExportMap=  {},
    __liveExportMap__: liveExportMap=  {},
    __reexportMap__: reexportMap=  {},
    __needsImportMeta__: needsImportMeta=  false,
    __syncModuleFunctor__}=
      staticModuleRecord;

  const compartmentFields=  weakmapGet(privateFields, compartment);

  const { __shimTransforms__, importMetaHook}=   compartmentFields;

  const { exportsProxy, proxiedExports, activate}=   getDeferredExports(
    compartment,
    compartmentFields,
    moduleAliases,
    moduleSpecifier);


  // {_exportName_: getter} module exports namespace
  // object (eventually proxied).
  const exportsProps=  create(null);

  // {_localName_: accessor} proxy traps for moduleLexicals and live bindings.
  // The moduleLexicals object is frozen and the corresponding properties of
  // moduleLexicals must be immutable, so we copy the descriptors.
  const moduleLexicals=  create(null);

  // {_localName_: init(initValue) -> initValue} used by the
  // rewritten code to initialize exported fixed bindings.
  const onceVar=  create(null);

  // {_localName_: update(newValue)} used by the rewritten code to
  // both initialize and update live bindings.
  const liveVar=  create(null);

  const importMeta=  create(null);
  if( moduleRecordMeta) {
    assign(importMeta, moduleRecordMeta);
   }
  if( needsImportMeta&&  importMetaHook) {
    importMetaHook(moduleSpecifier, importMeta);
   }

  // {_localName_: [{get, set, notify}]} used to merge all the export updaters.
  const localGetNotify=  create(null);

  // {[importName: string]: notify(update(newValue))} Used by code that imports
  // one of this module's exports, so that their update function will
  // be notified when this binding is initialized or updated.
  const notifiers=  create(null);

  arrayForEach(entries(fixedExportMap), ([fixedExportName, [localName]])=>  {
    let fixedGetNotify=  localGetNotify[localName];
    if( !fixedGetNotify) {
      // fixed binding state
      let value;
      let tdz=  true;
      /** @type {null | Array<(value: any) => void>} */
      let optUpdaters=  [];

      // tdz sensitive getter
      const get=  ()=>  {
        if( tdz) {
          throw ReferenceError( `binding ${q(localName)} not yet initialized`);
         }
        return value;
       };

      // leave tdz once
      const init=  freeze((initValue)=>{
        // init with initValue of a declared const binding, and return
        // it.
        if( !tdz) {
          throw TypeError(
             `Internal: binding ${q(localName)} already initialized`);

         }
        value=  initValue;
        const updaters=  optUpdaters;
        optUpdaters=  null;
        tdz=  false;
        for( const updater of updaters||  []) {
          updater(initValue);
         }
        return initValue;
       });

      // If still tdz, register update for notification later.
      // Otherwise, update now.
      const notify=  (updater)=>{
        if( updater===  init) {
          // Prevent recursion.
          return;
         }
        if( tdz) {
          arrayPush(optUpdaters||  [], updater);
         }else {
          updater(value);
         }
       };

      // Need these for additional exports of the local variable.
      fixedGetNotify=  {
        get,
        notify};

      localGetNotify[localName]=  fixedGetNotify;
      onceVar[localName]=  init;
     }

    exportsProps[fixedExportName]=  {
      get: fixedGetNotify.get,
      set: undefined,
      enumerable: true,
      configurable: false};


    notifiers[fixedExportName]=  fixedGetNotify.notify;
   });

  arrayForEach(
    entries(liveExportMap),
    ([liveExportName, [localName, setProxyTrap]])=>  {
      let liveGetNotify=  localGetNotify[localName];
      if( !liveGetNotify) {
        // live binding state
        let value;
        let tdz=  true;
        const updaters=  [];

        // tdz sensitive getter
        const get=  ()=>  {
          if( tdz) {
            throw ReferenceError(
               `binding ${q(liveExportName)} not yet initialized`);

           }
          return value;
         };

        // This must be usable locally for the translation of initializing
        // a declared local live binding variable.
        //
        // For reexported variable, this is also an update function to
        // register for notification with the downstream import, which we
        // must assume to be live. Thus, it can be called independent of
        // tdz but always leaves tdz. Such reexporting creates a tree of
        // bindings. This lets the tree be hooked up even if the imported
        // module instance isn't initialized yet, as may happen in cycles.
        const update=  freeze((newValue)=>{
          value=  newValue;
          tdz=  false;
          for( const updater of updaters) {
            updater(newValue);
           }
         });

        // tdz sensitive setter
        const set=  (newValue)=>{
          if( tdz) {
            throw ReferenceError( `binding ${q(localName)} not yet initialized`);
           }
          value=  newValue;
          for( const updater of updaters) {
            updater(newValue);
           }
         };

        // Always register the updater function.
        // If not in tdz, also update now.
        const notify=  (updater)=>{
          if( updater===  update) {
            // Prevent recursion.
            return;
           }
          arrayPush(updaters, updater);
          if( !tdz) {
            updater(value);
           }
         };

        liveGetNotify=  {
          get,
          notify};


        localGetNotify[localName]=  liveGetNotify;
        if( setProxyTrap) {
          defineProperty(moduleLexicals, localName, {
            get,
            set,
            enumerable: true,
            configurable: false});

         }
        liveVar[localName]=  update;
       }

      exportsProps[liveExportName]=  {
        get: liveGetNotify.get,
        set: undefined,
        enumerable: true,
        configurable: false};


      notifiers[liveExportName]=  liveGetNotify.notify;
     });


  const notifyStar=  (update)=>{
    update(proxiedExports);
   };
  notifiers['*']=  notifyStar;

  // Per the calling convention for the moduleFunctor generated from
  // an ESM, the `imports` function gets called once up front
  // to populate or arrange the population of imports and reexports.
  // The generated code produces an `updateRecord`: the means for
  // the linker to update the imports and exports of the module.
  // The updateRecord must conform to moduleAnalysis.imports
  // updateRecord = Map<specifier, importUpdaters>
  // importUpdaters = Map<importName, [update(newValue)*]>
  function imports(updateRecord) {
    // By the time imports is called, the importedInstances should already be
    // initialized with module instances that satisfy
    // imports.
    // importedInstances = Map[_specifier_, { notifiers, module, execute }]
    // notifiers = { [importName: string]: notify(update(newValue))}

    // export * cannot export default.
    const candidateAll=  create(null);
    candidateAll.default=  false;
    for( const [specifier, importUpdaters]of  updateRecord) {
      const instance=  mapGet(importedInstances, specifier);
      // The module instance object is an internal literal, does not bind this,
      // and never revealed outside the SES shim.
      // There are two instantiation sites for instances and they are both in
      // this module.
      // eslint-disable-next-line @endo/no-polymorphic-call
      instance.execute(); // bottom up cycle tolerant
      const { notifiers: importNotifiers}=   instance;
      for( const [importName, updaters]of  importUpdaters) {
        const importNotify=  importNotifiers[importName];
        if( !importNotify) {
          throw SyntaxError(
             `The requested module '${specifier}' does not provide an export named '${importName}'`);

         }
        for( const updater of updaters) {
          importNotify(updater);
         }
       }
      if( arrayIncludes(exportAlls, specifier)) {
        // Make all these imports candidates.
        // Note names don't change in reexporting all
        for( const [importAndExportName, importNotify]of  entries(
          importNotifiers))
           {
          if( candidateAll[importAndExportName]===  undefined) {
            candidateAll[importAndExportName]=  importNotify;
           }else {
            // Already a candidate: remove ambiguity.
            candidateAll[importAndExportName]=  false;
           }
         }
       }
      if( reexportMap[specifier]) {
        // Make named reexports candidates too.
        for( const [localName, exportedName]of  reexportMap[specifier]) {
          candidateAll[exportedName]=  importNotifiers[localName];
         }
       }
     }

    for( const [exportName, notify]of  entries(candidateAll)) {
      if( !notifiers[exportName]&&  notify!==  false) {
        notifiers[exportName]=  notify;

        // exported live binding state
        let value;
        const update=  (newValue)=> value=  newValue;
        notify(update);
        exportsProps[exportName]=  {
          get() {
            return value;
           },
          set: undefined,
          enumerable: true,
          configurable: false};

       }
     }

    // Sort the module exports namespace as per spec.
    // The module exports namespace will be wrapped in a module namespace
    // exports proxy which will serve as a "module exports namespace exotic
    // object".
    // Sorting properties is not generally reliable because some properties may
    // be symbols, and symbols do not have an inherent relative order, but
    // since all properties of the exports namespace must be keyed by a string
    // and the string must correspond to a valid identifier, sorting these
    // properties works for this specific case.
    arrayForEach(arraySort(keys(exportsProps)), (k)=>
      defineProperty(proxiedExports, k, exportsProps[k]));


    freeze(proxiedExports);
    activate();
   }

  let optFunctor;
  if( __syncModuleFunctor__!==  undefined) {
    optFunctor=  __syncModuleFunctor__;
   }else {
    optFunctor=  compartmentEvaluate(compartmentFields, functorSource, {
      globalObject: compartment.globalThis,
      transforms: __shimTransforms__,
      __moduleShimLexicals__: moduleLexicals});

   }
  let didThrow=  false;
  let thrownError;
  function execute() {
    if( optFunctor) {
      // uninitialized
      const functor=  optFunctor;
      optFunctor=  null;
      // initializing - call with `this` of `undefined`.
      try {
        functor(
          freeze({
            imports: freeze(imports),
            onceVar: freeze(onceVar),
            liveVar: freeze(liveVar),
            importMeta}));


       }catch( e) {
        didThrow=  true;
        thrownError=  e;
       }
      // initialized
     }
    if( didThrow) {
      throw thrownError;
     }
   }

  return freeze({
    notifiers,
    exportsProxy,
    execute});

 };$h‍_once.makeModuleInstance(makeModuleInstance);
})()
,
// === functors[43] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assert,makeModuleInstance,makeThirdPartyModuleInstance,Map,ReferenceError,TypeError,entries,isArray,isObject,mapGet,mapHas,mapSet,weakmapGet;$h‍_imports([["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]],["./module-instance.js", [["makeModuleInstance", [$h‍_a => (makeModuleInstance = $h‍_a)]],["makeThirdPartyModuleInstance", [$h‍_a => (makeThirdPartyModuleInstance = $h‍_a)]]]],["./commons.js", [["Map", [$h‍_a => (Map = $h‍_a)]],["ReferenceError", [$h‍_a => (ReferenceError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["isArray", [$h‍_a => (isArray = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["mapGet", [$h‍_a => (mapGet = $h‍_a)]],["mapHas", [$h‍_a => (mapHas = $h‍_a)]],["mapSet", [$h‍_a => (mapSet = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]]]]]);   



























const { Fail, quote: q}=   assert;

// `link` creates `ModuleInstances` and `ModuleNamespaces` for a module and its
// transitive dependencies and connects their imports and exports.
// After linking, the resulting working set is ready to be executed.
// The linker only concerns itself with module namespaces that are objects with
// property descriptors for their exports, which the Compartment proxies with
// the actual `ModuleNamespace`.
const        link=  (
  compartmentPrivateFields,
  moduleAliases,
  compartment,
  moduleSpecifier)=>
     {
  const { name: compartmentName, moduleRecords}=   weakmapGet(
    compartmentPrivateFields,
    compartment);


  const moduleRecord=  mapGet(moduleRecords, moduleSpecifier);
  if( moduleRecord===  undefined) {
    throw ReferenceError(
       `Missing link to module ${q(moduleSpecifier)} from compartment ${q(
        compartmentName)
        }`);

   }

  // Mutual recursion so there's no confusion about which
  // compartment is in context: the module record may be in another
  // compartment, denoted by moduleRecord.compartment.
  // eslint-disable-next-line no-use-before-define
  return instantiate(compartmentPrivateFields, moduleAliases, moduleRecord);
 };$h‍_once.link(link);

function isPrecompiled(staticModuleRecord) {
  return typeof staticModuleRecord.__syncModuleProgram__===  'string';
 }

function validatePrecompiledStaticModuleRecord(
  staticModuleRecord,
  moduleSpecifier)
  {
  const { __fixedExportMap__, __liveExportMap__}=   staticModuleRecord;
  isObject(__fixedExportMap__)||
    Fail `Property '__fixedExportMap__' of a precompiled module record must be an object, got ${q(
      __fixedExportMap__)
      }, for module ${q(moduleSpecifier)}`;
  isObject(__liveExportMap__)||
    Fail `Property '__liveExportMap__' of a precompiled module record must be an object, got ${q(
      __liveExportMap__)
      }, for module ${q(moduleSpecifier)}`;
 }

function isThirdParty(staticModuleRecord) {
  return typeof staticModuleRecord.execute===  'function';
 }

function validateThirdPartyStaticModuleRecord(
  staticModuleRecord,
  moduleSpecifier)
  {
  const { exports}=   staticModuleRecord;
  isArray(exports)||
    Fail `Property 'exports' of a third-party static module record must be an array, got ${q(
      exports)
      }, for module ${q(moduleSpecifier)}`;
 }

function validateStaticModuleRecord(staticModuleRecord, moduleSpecifier) {
  isObject(staticModuleRecord)||
    Fail `Static module records must be of type object, got ${q(
      staticModuleRecord)
      }, for module ${q(moduleSpecifier)}`;
  const { imports, exports, reexports=  []}=   staticModuleRecord;
  isArray(imports)||
    Fail `Property 'imports' of a static module record must be an array, got ${q(
      imports)
      }, for module ${q(moduleSpecifier)}`;
  isArray(exports)||
    Fail `Property 'exports' of a precompiled module record must be an array, got ${q(
      exports)
      }, for module ${q(moduleSpecifier)}`;
  isArray(reexports)||
    Fail `Property 'reexports' of a precompiled module record must be an array if present, got ${q(
      reexports)
      }, for module ${q(moduleSpecifier)}`;
 }

const        instantiate=  (
  compartmentPrivateFields,
  moduleAliases,
  moduleRecord)=>
     {
  const { compartment, moduleSpecifier, resolvedImports, staticModuleRecord}=
    moduleRecord;
  const { instances}=   weakmapGet(compartmentPrivateFields, compartment);

  // Memoize.
  if( mapHas(instances, moduleSpecifier)) {
    return mapGet(instances, moduleSpecifier);
   }

  validateStaticModuleRecord(staticModuleRecord, moduleSpecifier);

  const importedInstances=  new Map();
  let moduleInstance;
  if( isPrecompiled(staticModuleRecord)) {
    validatePrecompiledStaticModuleRecord(staticModuleRecord, moduleSpecifier);
    moduleInstance=  makeModuleInstance(
      compartmentPrivateFields,
      moduleAliases,
      moduleRecord,
      importedInstances);

   }else if( isThirdParty(staticModuleRecord)) {
    validateThirdPartyStaticModuleRecord(staticModuleRecord, moduleSpecifier);
    moduleInstance=  makeThirdPartyModuleInstance(
      compartmentPrivateFields,
      staticModuleRecord,
      compartment,
      moduleAliases,
      moduleSpecifier,
      resolvedImports);

   }else {
    throw TypeError(
       `importHook must return a static module record, got ${q(
        staticModuleRecord)
        }`);

   }

  // Memoize.
  mapSet(instances, moduleSpecifier, moduleInstance);

  // Link dependency modules.
  for( const [importSpecifier, resolvedSpecifier]of  entries(resolvedImports)) {
    const importedInstance=  link(
      compartmentPrivateFields,
      moduleAliases,
      compartment,
      resolvedSpecifier);

    mapSet(importedInstances, importSpecifier, importedInstance);
   }

  return moduleInstance;
 };$h‍_once.instantiate(instantiate);
})()
,
// === functors[44] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Map,ReferenceError,TypeError,WeakMap,assign,defineProperties,entries,promiseThen,weakmapGet,weakmapSet,setGlobalObjectSymbolUnscopables,setGlobalObjectConstantProperties,setGlobalObjectMutableProperties,setGlobalObjectEvaluators,sharedGlobalPropertyNames,load,link,getDeferredExports,assert,compartmentEvaluate,makeSafeEvaluator;$h‍_imports([["./commons.js", [["Map", [$h‍_a => (Map = $h‍_a)]],["ReferenceError", [$h‍_a => (ReferenceError = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["WeakMap", [$h‍_a => (WeakMap = $h‍_a)]],["assign", [$h‍_a => (assign = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["promiseThen", [$h‍_a => (promiseThen = $h‍_a)]],["weakmapGet", [$h‍_a => (weakmapGet = $h‍_a)]],["weakmapSet", [$h‍_a => (weakmapSet = $h‍_a)]]]],["./global-object.js", [["setGlobalObjectSymbolUnscopables", [$h‍_a => (setGlobalObjectSymbolUnscopables = $h‍_a)]],["setGlobalObjectConstantProperties", [$h‍_a => (setGlobalObjectConstantProperties = $h‍_a)]],["setGlobalObjectMutableProperties", [$h‍_a => (setGlobalObjectMutableProperties = $h‍_a)]],["setGlobalObjectEvaluators", [$h‍_a => (setGlobalObjectEvaluators = $h‍_a)]]]],["./permits.js", [["sharedGlobalPropertyNames", [$h‍_a => (sharedGlobalPropertyNames = $h‍_a)]]]],["./module-load.js", [["load", [$h‍_a => (load = $h‍_a)]]]],["./module-link.js", [["link", [$h‍_a => (link = $h‍_a)]]]],["./module-proxy.js", [["getDeferredExports", [$h‍_a => (getDeferredExports = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]],["./compartment-evaluate.js", [["compartmentEvaluate", [$h‍_a => (compartmentEvaluate = $h‍_a)]]]],["./make-safe-evaluator.js", [["makeSafeEvaluator", [$h‍_a => (makeSafeEvaluator = $h‍_a)]]]]]);   





























const { quote: q}=   assert;

// moduleAliases associates every public module exports namespace with its
// corresponding compartment and specifier so they can be used to link modules
// across compartments.
// The mechanism to thread an alias is to use the compartment.module function
// to obtain the exports namespace of a foreign module and pass it into another
// compartment's moduleMap constructor option.
const moduleAliases=  new WeakMap();

// privateFields captures the private state for each compartment.
const privateFields=  new WeakMap();

// Compartments do not need an importHook or resolveHook to be useful
// as a vessel for evaluating programs.
// However, any method that operates the module system will throw an exception
// if these hooks are not available.
const assertModuleHooks=  (compartment)=>{
  const { importHook, resolveHook}=   weakmapGet(privateFields, compartment);
  if( typeof importHook!==  'function'||  typeof resolveHook!==  'function') {
    throw TypeError(
      'Compartment must be constructed with an importHook and a resolveHook for it to be able to load modules');

   }
 };

const        InertCompartment=  function Compartment(
  _endowments=  {},
  _modules=  {},
  _options=  {})
  {
  throw TypeError(
    'Compartment.prototype.constructor is not a valid constructor.');

 };

/**
 * @param {Compartment} compartment
 * @param {string} specifier
 */$h‍_once.InertCompartment(InertCompartment);
const compartmentImportNow=  (compartment, specifier)=>  {
  const { execute, exportsProxy}=   link(
    privateFields,
    moduleAliases,
    compartment,
    specifier);

  execute();
  return exportsProxy;
 };

const        CompartmentPrototype=  {
  constructor: InertCompartment,

  get globalThis() {
    return weakmapGet(privateFields, this).globalObject;
   },

  get name() {
    return weakmapGet(privateFields, this).name;
   },

  /**
   * @param {string} source is a JavaScript program grammar construction.
   * @param {object} [options]
   * @param {Array<import('./lockdown-shim').Transform>} [options.transforms]
   * @param {boolean} [options.sloppyGlobalsMode]
   * @param {object} [options.__moduleShimLexicals__]
   * @param {boolean} [options.__evadeHtmlCommentTest__]
   * @param {boolean} [options.__evadeImportExpressionTest__]
   * @param {boolean} [options.__rejectSomeDirectEvalExpressions__]
   */
  evaluate(source, options=  {}) {
    const compartmentFields=  weakmapGet(privateFields, this);
    return compartmentEvaluate(compartmentFields, source, options);
   },

  toString() {
    return '[object Compartment]';
   },

  module(specifier) {
    if( typeof specifier!==  'string') {
      throw TypeError('first argument of module() must be a string');
     }

    assertModuleHooks(this);

    const { exportsProxy}=   getDeferredExports(
      this,
      weakmapGet(privateFields, this),
      moduleAliases,
      specifier);


    return exportsProxy;
   },

        async import(specifier){
    if( typeof specifier!==  'string') {
      throw TypeError('first argument of import() must be a string');
     }

    assertModuleHooks(this);

    return promiseThen(
      load(privateFields, moduleAliases, this, specifier),
      ()=>  {
        // The namespace box is a contentious design and likely to be a breaking
        // change in an appropriately numbered future version.
        const namespace=  compartmentImportNow(
          /** @type {Compartment} */  this,
          specifier);

        return { namespace};
       });

   },

        async load(specifier){
    if( typeof specifier!==  'string') {
      throw TypeError('first argument of load() must be a string');
     }

    assertModuleHooks(this);

    return load(privateFields, moduleAliases, this, specifier);
   },

  importNow(specifier) {
    if( typeof specifier!==  'string') {
      throw TypeError('first argument of importNow() must be a string');
     }

    assertModuleHooks(this);

    return compartmentImportNow(/** @type {Compartment} */  this,  specifier);
   }};$h‍_once.CompartmentPrototype(CompartmentPrototype);


defineProperties(InertCompartment, {
  prototype: { value: CompartmentPrototype}});


/**
 * @callback MakeCompartmentConstructor
 * @param {MakeCompartmentConstructor} targetMakeCompartmentConstructor
 * @param {Record<string, any>} intrinsics
 * @param {(object: object) => void} markVirtualizedNativeFunction
 * @returns {Compartment['constructor']}
 */

/** @type {MakeCompartmentConstructor} */
const        makeCompartmentConstructor=  (
  targetMakeCompartmentConstructor,
  intrinsics,
  markVirtualizedNativeFunction)=>
     {
  function Compartment(endowments=  {}, moduleMap=  {}, options=  {}) {
    if( new.target===  undefined) {
      throw TypeError(
        "Class constructor Compartment cannot be invoked without 'new'");

     }

    // Extract options, and shallow-clone transforms.
    const {
      name=  '<unknown>',
      transforms=  [],
      __shimTransforms__=  [],
      resolveHook,
      importHook,
      moduleMapHook,
      importMetaHook}=
        options;
    const globalTransforms=  [...transforms, ...__shimTransforms__];

    // Map<FullSpecifier, ModuleCompartmentRecord>
    const moduleRecords=  new Map();
    // Map<FullSpecifier, ModuleInstance>
    const instances=  new Map();
    // Map<FullSpecifier, {ExportsProxy, ProxiedExports, activate()}>
    const deferredExports=  new Map();

    // Validate given moduleMap.
    // The module map gets translated on-demand in module-load.js and the
    // moduleMap can be invalid in ways that cannot be detected in the
    // constructor, but these checks allow us to throw early for a better
    // developer experience.
    for( const [specifier, aliasNamespace]of  entries(moduleMap||  {})) {
      if( typeof aliasNamespace===  'string') {
        // TODO implement parent module record retrieval.
        throw TypeError(
           `Cannot map module ${q(specifier)} to ${q(
            aliasNamespace)
            } in parent compartment`);

       }else if( weakmapGet(moduleAliases, aliasNamespace)===  undefined) {
        // TODO create and link a synthetic module instance from the given
        // namespace object.
        throw ReferenceError(
           `Cannot map module ${q(
            specifier)
            } because it has no known compartment in this realm`);

       }
     }

    const globalObject=  {};

    setGlobalObjectSymbolUnscopables(globalObject);

    // We must initialize all constant properties first because
    // `makeSafeEvaluator` may use them to create optimized bindings
    // in the evaluator.
    // TODO: consider merging into a single initialization if internal
    // evaluator is no longer eagerly created
    setGlobalObjectConstantProperties(globalObject);

    const { safeEvaluate}=   makeSafeEvaluator({
      globalObject,
      globalTransforms,
      sloppyGlobalsMode: false});


    setGlobalObjectMutableProperties(globalObject, {
      intrinsics,
      newGlobalPropertyNames: sharedGlobalPropertyNames,
      makeCompartmentConstructor: targetMakeCompartmentConstructor,
      markVirtualizedNativeFunction});


    // TODO: maybe add evalTaming to the Compartment constructor 3rd options?
    setGlobalObjectEvaluators(
      globalObject,
      safeEvaluate,
      markVirtualizedNativeFunction);


    assign(globalObject, endowments);

    weakmapSet(privateFields, this, {
      name:  `${name}`,
      globalTransforms,
      globalObject,
      safeEvaluate,
      resolveHook,
      importHook,
      moduleMap,
      moduleMapHook,
      importMetaHook,
      moduleRecords,
      __shimTransforms__,
      deferredExports,
      instances});

   }

  Compartment.prototype=  CompartmentPrototype;

  return Compartment;
 };$h‍_once.makeCompartmentConstructor(makeCompartmentConstructor);
})()
,
// === functors[45] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let FERAL_FUNCTION,Float32Array,Map,Set,String,getOwnPropertyDescriptor,getPrototypeOf,iterateArray,iterateMap,iterateSet,iterateString,matchAllRegExp,matchAllSymbol,regexpPrototype,globalThis,InertCompartment;$h‍_imports([["./commons.js", [["FERAL_FUNCTION", [$h‍_a => (FERAL_FUNCTION = $h‍_a)]],["Float32Array", [$h‍_a => (Float32Array = $h‍_a)]],["Map", [$h‍_a => (Map = $h‍_a)]],["Set", [$h‍_a => (Set = $h‍_a)]],["String", [$h‍_a => (String = $h‍_a)]],["getOwnPropertyDescriptor", [$h‍_a => (getOwnPropertyDescriptor = $h‍_a)]],["getPrototypeOf", [$h‍_a => (getPrototypeOf = $h‍_a)]],["iterateArray", [$h‍_a => (iterateArray = $h‍_a)]],["iterateMap", [$h‍_a => (iterateMap = $h‍_a)]],["iterateSet", [$h‍_a => (iterateSet = $h‍_a)]],["iterateString", [$h‍_a => (iterateString = $h‍_a)]],["matchAllRegExp", [$h‍_a => (matchAllRegExp = $h‍_a)]],["matchAllSymbol", [$h‍_a => (matchAllSymbol = $h‍_a)]],["regexpPrototype", [$h‍_a => (regexpPrototype = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]]]],["./compartment.js", [["InertCompartment", [$h‍_a => (InertCompartment = $h‍_a)]]]]]);   


















/**
 * Object.getConstructorOf()
 * Helper function to improve readability, similar to Object.getPrototypeOf().
 *
 * @param {object} obj
 */
function getConstructorOf(obj) {
  return getPrototypeOf(obj).constructor;
 }

// getAnonymousIntrinsics uses a utility function to construct an arguments
// object, since it cannot have one of its own and also be a const export.
function makeArguments() {
  // eslint-disable-next-line prefer-rest-params
  return arguments;
 }

/**
 * getAnonymousIntrinsics()
 * Get the intrinsics not otherwise reachable by named own property
 * traversal from the global object.
 *
 * @returns {object}
 */
const        getAnonymousIntrinsics=  ()=>  {
  const InertFunction=  FERAL_FUNCTION.prototype.constructor;

  // 9.2.4.1 %ThrowTypeError%

  const argsCalleeDesc=  getOwnPropertyDescriptor(makeArguments(), 'callee');
  const ThrowTypeError=  argsCalleeDesc&&  argsCalleeDesc.get;

  // 21.1.5.2 The %StringIteratorPrototype% Object

  // eslint-disable-next-line no-new-wrappers
  const StringIteratorObject=  iterateString(new String());
  const StringIteratorPrototype=  getPrototypeOf(StringIteratorObject);

  // 21.2.7.1 The %RegExpStringIteratorPrototype% Object
  const RegExpStringIterator=
    regexpPrototype[matchAllSymbol]&&  matchAllRegExp(/./);
  const RegExpStringIteratorPrototype=
    RegExpStringIterator&&  getPrototypeOf(RegExpStringIterator);

  // 22.1.5.2 The %ArrayIteratorPrototype% Object

  // eslint-disable-next-line no-array-constructor
  const ArrayIteratorObject=  iterateArray([]);
  const ArrayIteratorPrototype=  getPrototypeOf(ArrayIteratorObject);

  // 22.2.1 The %TypedArray% Intrinsic Object

  const TypedArray=  getPrototypeOf(Float32Array);

  // 23.1.5.2 The %MapIteratorPrototype% Object

  const MapIteratorObject=  iterateMap(new Map());
  const MapIteratorPrototype=  getPrototypeOf(MapIteratorObject);

  // 23.2.5.2 The %SetIteratorPrototype% Object

  const SetIteratorObject=  iterateSet(new Set());
  const SetIteratorPrototype=  getPrototypeOf(SetIteratorObject);

  // 25.1.2 The %IteratorPrototype% Object

  const IteratorPrototype=  getPrototypeOf(ArrayIteratorPrototype);

  // 25.2.1 The GeneratorFunction Constructor

  // eslint-disable-next-line no-empty-function
  function* GeneratorFunctionInstance() { }
  const GeneratorFunction=  getConstructorOf(GeneratorFunctionInstance);

  // 25.2.3 Properties of the GeneratorFunction Prototype Object

  const Generator=  GeneratorFunction.prototype;

  // 25.3.1 The AsyncGeneratorFunction Constructor

  // eslint-disable-next-line no-empty-function
  async function* AsyncGeneratorFunctionInstance() { }
  const AsyncGeneratorFunction=  getConstructorOf(
    AsyncGeneratorFunctionInstance);


  // 25.3.2.2 AsyncGeneratorFunction.prototype
  const AsyncGenerator=  AsyncGeneratorFunction.prototype;
  // 25.5.1 Properties of the AsyncGenerator Prototype Object
  const AsyncGeneratorPrototype=  AsyncGenerator.prototype;
  const AsyncIteratorPrototype=  getPrototypeOf(AsyncGeneratorPrototype);

  // 25.7.1 The AsyncFunction Constructor

  // eslint-disable-next-line no-empty-function
  async function AsyncFunctionInstance() { }
  const AsyncFunction=  getConstructorOf(AsyncFunctionInstance);

  const intrinsics=  {
    '%InertFunction%': InertFunction,
    '%ArrayIteratorPrototype%': ArrayIteratorPrototype,
    '%InertAsyncFunction%': AsyncFunction,
    '%AsyncGenerator%': AsyncGenerator,
    '%InertAsyncGeneratorFunction%': AsyncGeneratorFunction,
    '%AsyncGeneratorPrototype%': AsyncGeneratorPrototype,
    '%AsyncIteratorPrototype%': AsyncIteratorPrototype,
    '%Generator%': Generator,
    '%InertGeneratorFunction%': GeneratorFunction,
    '%IteratorPrototype%': IteratorPrototype,
    '%MapIteratorPrototype%': MapIteratorPrototype,
    '%RegExpStringIteratorPrototype%': RegExpStringIteratorPrototype,
    '%SetIteratorPrototype%': SetIteratorPrototype,
    '%StringIteratorPrototype%': StringIteratorPrototype,
    '%ThrowTypeError%': ThrowTypeError,
    '%TypedArray%': TypedArray,
    '%InertCompartment%': InertCompartment};


  if( globalThis.Iterator) {
    intrinsics['%IteratorHelperPrototype%']=  getPrototypeOf(
      // eslint-disable-next-line @endo/no-polymorphic-call
      globalThis.Iterator.from([]).take(0));

    intrinsics['%WrapForValidIteratorPrototype%']=  getPrototypeOf(
      // eslint-disable-next-line @endo/no-polymorphic-call
      globalThis.Iterator.from({ next() { }}));

   }

  if( globalThis.AsyncIterator) {
    intrinsics['%AsyncIteratorHelperPrototype%']=  getPrototypeOf(
      // eslint-disable-next-line @endo/no-polymorphic-call
      globalThis.AsyncIterator.from([]).take(0));

    intrinsics['%WrapForValidAsyncIteratorPrototype%']=  getPrototypeOf(
      // eslint-disable-next-line @endo/no-polymorphic-call
      globalThis.AsyncIterator.from({ next() { }}));

   }

  return intrinsics;
 };$h‍_once.getAnonymousIntrinsics(getAnonymousIntrinsics);
})()
,
// === functors[46] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let TypeError,freeze;$h‍_imports([["./commons.js", [["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["freeze", [$h‍_a => (freeze = $h‍_a)]]]]]);   


const        tameHarden=  (safeHarden, hardenTaming)=>  {
  if( hardenTaming!==  'safe'&&  hardenTaming!==  'unsafe') {
    throw TypeError( `unrecognized fakeHardenOption ${hardenTaming}`);
   }

  if( hardenTaming===  'safe') {
    return safeHarden;
   }

  // In on the joke
  Object.isExtensible=  ()=>  false;
  Object.isFrozen=  ()=>  true;
  Object.isSealed=  ()=>  true;
  Reflect.isExtensible=  ()=>  false;

  if( safeHarden.isFake) {
    // The "safe" hardener is already a fake hardener.
    // Just use it.
    return safeHarden;
   }

  const fakeHarden=  (arg)=>arg;
  fakeHarden.isFake=  true;
  return freeze(fakeHarden);
 };$h‍_once.tameHarden(tameHarden);
freeze(tameHarden);
})()
,
// === functors[47] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Symbol,entries,fromEntries,getOwnPropertyDescriptors,defineProperties,arrayMap;$h‍_imports([["./commons.js", [["Symbol", [$h‍_a => (Symbol = $h‍_a)]],["entries", [$h‍_a => (entries = $h‍_a)]],["fromEntries", [$h‍_a => (fromEntries = $h‍_a)]],["getOwnPropertyDescriptors", [$h‍_a => (getOwnPropertyDescriptors = $h‍_a)]],["defineProperties", [$h‍_a => (defineProperties = $h‍_a)]],["arrayMap", [$h‍_a => (arrayMap = $h‍_a)]]]]]);   








/**
 * This taming provides a tamed alternative to the original `Symbol` constructor
 * that starts off identical, except that all its properties are "temporarily"
 * configurable. The original `Symbol` constructor remains unmodified on
 * the start compartment's global. The tamed alternative is used as the shared
 * `Symbol` constructor on constructed compartments.
 *
 * Starting these properties as configurable assumes two succeeding phases of
 * processing: A whitelisting phase, that
 * removes all properties not on the whitelist (which requires them to be
 * configurable) and a global hardening step that freezes all primordials,
 * returning these properties to their expected non-configurable status.
 *
 * The ses shim is constructed to eventually enable vetted shims to run between
 * repair and global hardening. However, such vetted shims would normally
 * run in the start compartment, which continues to use the original unmodified
 * `Symbol`, so they should not normally be affected by the temporary
 * configurability of these properties.
 *
 * Note that the spec refers to the global `Symbol` function as the
 * ["Symbol Constructor"](https://tc39.es/ecma262/multipage/fundamental-objects.html#sec-symbol-constructor)
 * even though it has a call behavior (can be called as a function) and does not
 * not have a construct behavior (cannot be called with `new`). Accordingly,
 * to tame it, we must replace it with a function without a construct
 * behavior.
 */
const        tameSymbolConstructor=  ()=>  {
  const OriginalSymbol=  Symbol;
  const SymbolPrototype=  OriginalSymbol.prototype;

  const SharedSymbol=  {
    Symbol(description) {
      return OriginalSymbol(description);
     }}.
    Symbol;

  defineProperties(SymbolPrototype, {
    constructor: {
      value: SharedSymbol
      // leave other `constructor` attributes as is
}});


  const originalDescsEntries=  entries(
    getOwnPropertyDescriptors(OriginalSymbol));

  const descs=  fromEntries(
    arrayMap(originalDescsEntries, ([name, desc])=>  [
      name,
      { ...desc, configurable: true}]));


  defineProperties(SharedSymbol, descs);

  return { '%SharedSymbol%': SharedSymbol};
 };$h‍_once.tameSymbolConstructor(tameSymbolConstructor);
})()
,
// === functors[48] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeEnvironmentCaptor,FERAL_FUNCTION,FERAL_EVAL,TypeError,arrayFilter,globalThis,is,ownKeys,stringSplit,noEvalEvaluate,makeHardener,makeIntrinsicsCollector,whitelistIntrinsics,tameFunctionConstructors,tameDateConstructor,tameMathObject,tameRegExpConstructor,enablePropertyOverrides,tameLocaleMethods,setGlobalObjectConstantProperties,setGlobalObjectMutableProperties,setGlobalObjectEvaluators,makeSafeEvaluator,initialGlobalPropertyNames,tameFunctionToString,tameDomains,tameConsole,tameErrorConstructor,assert,makeAssert,getAnonymousIntrinsics,makeCompartmentConstructor,tameHarden,tameSymbolConstructor;$h‍_imports([["@endo/env-options", [["makeEnvironmentCaptor", [$h‍_a => (makeEnvironmentCaptor = $h‍_a)]]]],["./commons.js", [["FERAL_FUNCTION", [$h‍_a => (FERAL_FUNCTION = $h‍_a)]],["FERAL_EVAL", [$h‍_a => (FERAL_EVAL = $h‍_a)]],["TypeError", [$h‍_a => (TypeError = $h‍_a)]],["arrayFilter", [$h‍_a => (arrayFilter = $h‍_a)]],["globalThis", [$h‍_a => (globalThis = $h‍_a)]],["is", [$h‍_a => (is = $h‍_a)]],["ownKeys", [$h‍_a => (ownKeys = $h‍_a)]],["stringSplit", [$h‍_a => (stringSplit = $h‍_a)]],["noEvalEvaluate", [$h‍_a => (noEvalEvaluate = $h‍_a)]]]],["./make-hardener.js", [["makeHardener", [$h‍_a => (makeHardener = $h‍_a)]]]],["./intrinsics.js", [["makeIntrinsicsCollector", [$h‍_a => (makeIntrinsicsCollector = $h‍_a)]]]],["./permits-intrinsics.js", [["default", [$h‍_a => (whitelistIntrinsics = $h‍_a)]]]],["./tame-function-constructors.js", [["default", [$h‍_a => (tameFunctionConstructors = $h‍_a)]]]],["./tame-date-constructor.js", [["default", [$h‍_a => (tameDateConstructor = $h‍_a)]]]],["./tame-math-object.js", [["default", [$h‍_a => (tameMathObject = $h‍_a)]]]],["./tame-regexp-constructor.js", [["default", [$h‍_a => (tameRegExpConstructor = $h‍_a)]]]],["./enable-property-overrides.js", [["default", [$h‍_a => (enablePropertyOverrides = $h‍_a)]]]],["./tame-locale-methods.js", [["default", [$h‍_a => (tameLocaleMethods = $h‍_a)]]]],["./global-object.js", [["setGlobalObjectConstantProperties", [$h‍_a => (setGlobalObjectConstantProperties = $h‍_a)]],["setGlobalObjectMutableProperties", [$h‍_a => (setGlobalObjectMutableProperties = $h‍_a)]],["setGlobalObjectEvaluators", [$h‍_a => (setGlobalObjectEvaluators = $h‍_a)]]]],["./make-safe-evaluator.js", [["makeSafeEvaluator", [$h‍_a => (makeSafeEvaluator = $h‍_a)]]]],["./permits.js", [["initialGlobalPropertyNames", [$h‍_a => (initialGlobalPropertyNames = $h‍_a)]]]],["./tame-function-tostring.js", [["tameFunctionToString", [$h‍_a => (tameFunctionToString = $h‍_a)]]]],["./tame-domains.js", [["tameDomains", [$h‍_a => (tameDomains = $h‍_a)]]]],["./error/tame-console.js", [["tameConsole", [$h‍_a => (tameConsole = $h‍_a)]]]],["./error/tame-error-constructor.js", [["default", [$h‍_a => (tameErrorConstructor = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]],["makeAssert", [$h‍_a => (makeAssert = $h‍_a)]]]],["./get-anonymous-intrinsics.js", [["getAnonymousIntrinsics", [$h‍_a => (getAnonymousIntrinsics = $h‍_a)]]]],["./compartment.js", [["makeCompartmentConstructor", [$h‍_a => (makeCompartmentConstructor = $h‍_a)]]]],["./tame-harden.js", [["tameHarden", [$h‍_a => (tameHarden = $h‍_a)]]]],["./tame-symbol-constructor.js", [["tameSymbolConstructor", [$h‍_a => (tameSymbolConstructor = $h‍_a)]]]]]);   






















































/** @typedef {import('../types.js').LockdownOptions} LockdownOptions */

const { Fail, details: d, quote: q}=   assert;

/** @type {Error=} */
let priorRepairIntrinsics;

/** @type {Error=} */
let priorHardenIntrinsics;

// Build a harden() with an empty fringe.
// Gate it on lockdown.
/**
 * @template T
 * @param {T} ref
 * @returns {T}
 */
const safeHarden=  makeHardener();

/**
 * @callback Transform
 * @param {string} source
 * @returns {string}
 */

/**
 * @callback CompartmentConstructor
 * @param {object} endowments
 * @param {object} moduleMap
 * @param {object} [options]
 * @param {Array<Transform>} [options.transforms]
 * @param {Array<Transform>} [options.__shimTransforms__]
 */

// TODO https://github.com/endojs/endo/issues/814
// Lockdown currently allows multiple calls provided that the specified options
// of every call agree.  With experience, we have observed that lockdown should
// only ever need to be called once and that simplifying lockdown will improve
// the quality of audits.

const assertDirectEvalAvailable=  ()=>  {
  let allowed=  false;
  try {
    allowed=  FERAL_FUNCTION(
      'eval',
      'SES_changed',
       `\
        eval("SES_changed = true");
        return SES_changed;
      `)(
      FERAL_EVAL, false);
    // If we get here and SES_changed stayed false, that means the eval was sloppy
    // and indirect, which generally creates a new global.
    // We are going to throw an exception for failing to initialize SES, but
    // good neighbors clean up.
    if( !allowed) {
      delete globalThis.SES_changed;
     }
   }catch( _error) {
    // We reach here if eval is outright forbidden by a Content Security Policy.
    // We allow this for SES usage that delegates the responsibility to isolate
    // guest code to production code generation.
    allowed=  true;
   }
  if( !allowed) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_DIRECT_EVAL.md
    throw TypeError(
       `SES cannot initialize unless 'eval' is the original intrinsic 'eval', suitable for direct-eval (dynamically scoped eval) (SES_DIRECT_EVAL)`);

   }
 };

/**
 * @param {LockdownOptions} [options]
 */
const        repairIntrinsics=  (options=  {})=>  {
  // First time, absent options default to 'safe'.
  // Subsequent times, absent options default to first options.
  // Thus, all present options must agree with first options.
  // Reconstructing `option` here also ensures that it is a well
  // behaved record, with only own data properties.
  //
  // The `overrideTaming` is not a safety issue. Rather it is a tradeoff
  // between code compatibility, which is better with the `'moderate'`
  // setting, and tool compatibility, which is better with the `'min'`
  // setting. See
  // https://github.com/Agoric/SES-shim/blob/master/packages/ses/README.md#enabling-override-by-assignment)
  // for an explanation of when to use which.
  //
  // The `stackFiltering` is not a safety issue. Rather it is a tradeoff
  // between relevance and completeness of the stack frames shown on the
  // console. Setting`stackFiltering` to `'verbose'` applies no filters, providing
  // the raw stack frames that can be quite versbose. Setting
  // `stackFrameFiltering` to`'concise'` limits the display to the stack frame
  // information most likely to be relevant, eliminating distracting frames
  // such as those from the infrastructure. However, the bug you're trying to
  // track down might be in the infrastrure, in which case the `'verbose'` setting
  // is useful. See
  // [`stackFiltering` options](https://github.com/Agoric/SES-shim/blob/master/packages/ses/lockdown-options.md#stackfiltering-options)
  // for an explanation.

  const { getEnvironmentOption: getenv}=   makeEnvironmentCaptor(globalThis);

  const {
    errorTaming=  getenv('LOCKDOWN_ERROR_TAMING', 'safe'),
    errorTrapping=  getenv('LOCKDOWN_ERROR_TRAPPING', 'platform'),
    unhandledRejectionTrapping=  getenv(
      'LOCKDOWN_UNHANDLED_REJECTION_TRAPPING',
      'report'),

    regExpTaming=  getenv('LOCKDOWN_REGEXP_TAMING', 'safe'),
    localeTaming=  getenv('LOCKDOWN_LOCALE_TAMING', 'safe'),
    consoleTaming=  getenv('LOCKDOWN_CONSOLE_TAMING', 'safe'),
    overrideTaming=  getenv('LOCKDOWN_OVERRIDE_TAMING', 'moderate'),
    stackFiltering=  getenv('LOCKDOWN_STACK_FILTERING', 'concise'),
    domainTaming=  getenv('LOCKDOWN_DOMAIN_TAMING', 'safe'),
    evalTaming=  getenv('LOCKDOWN_EVAL_TAMING', 'safeEval'),
    overrideDebug=  arrayFilter(
      stringSplit(getenv('LOCKDOWN_OVERRIDE_DEBUG', ''), ','),
      /** @param {string} debugName */
      (debugName)=>debugName!==  ''),

    __hardenTaming__=  getenv('LOCKDOWN_HARDEN_TAMING', 'safe'),
    dateTaming=  'safe', // deprecated
    mathTaming=  'safe', // deprecated
    ...extraOptions}=
      options;

  evalTaming===  'unsafeEval'||
    evalTaming===  'safeEval'||
    evalTaming===  'noEval'||
    Fail `lockdown(): non supported option evalTaming: ${q(evalTaming)}`;

  // Assert that only supported options were passed.
  // Use Reflect.ownKeys to reject symbol-named properties as well.
  const extraOptionsNames=  ownKeys(extraOptions);
  extraOptionsNames.length===  0||
    Fail `lockdown(): non supported option ${q(extraOptionsNames)}`;

  priorRepairIntrinsics===  undefined||
    // eslint-disable-next-line @endo/no-polymorphic-call
    assert.fail(
      d `Already locked down at ${priorRepairIntrinsics} (SES_ALREADY_LOCKED_DOWN)`,
      TypeError);

  // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_ALREADY_LOCKED_DOWN.md
  priorRepairIntrinsics=  TypeError('Prior lockdown (SES_ALREADY_LOCKED_DOWN)');
  // Tease V8 to generate the stack string and release the closures the stack
  // trace retained:
  priorRepairIntrinsics.stack;

  assertDirectEvalAvailable();

  /**
   * Because of packagers and bundlers, etc, multiple invocations of lockdown
   * might happen in separate instantiations of the source of this module.
   * In that case, each one sees its own `firstOptions` variable, so the test
   * above will not detect that lockdown has already happened. We
   * unreliably test some telltale signs that lockdown has run, to avoid
   * trying to lock down a locked down environment. Although the test is
   * unreliable, this is consistent with the SES threat model. SES provides
   * security only if it runs first in a given realm, or if everything that
   * runs before it is SES-aware and cooperative. Neither SES nor anything
   * can protect itself from corrupting code that runs first. For these
   * purposes, code that turns a realm into something that passes these
   * tests without actually locking down counts as corrupting code.
   *
   * The specifics of what this tests for may change over time, but it
   * should be consistent with any setting of the lockdown options.
   */
  const seemsToBeLockedDown=  ()=>  {
    return(
      globalThis.Function.prototype.constructor!==  globalThis.Function&&
      // @ts-ignore harden is absent on globalThis type def.
      typeof globalThis.harden===  'function'&&
      // @ts-ignore lockdown is absent on globalThis type def.
      typeof globalThis.lockdown===  'function'&&
      globalThis.Date.prototype.constructor!==  globalThis.Date&&
      typeof globalThis.Date.now===  'function'&&
      // @ts-ignore does not recognize that Date constructor is a special
      // Function.
      // eslint-disable-next-line @endo/no-polymorphic-call
      is(globalThis.Date.prototype.constructor.now(), NaN));

   };

  if( seemsToBeLockedDown()) {
    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_MULTIPLE_INSTANCES.md
    throw TypeError(
       `Already locked down but not by this SES instance (SES_MULTIPLE_INSTANCES)`);

   }

  /**
   * 1. TAME powers & gather intrinsics first.
   */

  tameDomains(domainTaming);

  // Replace Function.prototype.toString with one that recognizes
  // shimmed functions as honorary native functions.
  const markVirtualizedNativeFunction=  tameFunctionToString();

  const { addIntrinsics, completePrototypes, finalIntrinsics}=
    makeIntrinsicsCollector();

  const tamedHarden=  tameHarden(safeHarden, __hardenTaming__);
  addIntrinsics({ harden: tamedHarden});

  addIntrinsics(tameFunctionConstructors());

  addIntrinsics(tameDateConstructor(dateTaming));
  addIntrinsics(tameErrorConstructor(errorTaming, stackFiltering));
  addIntrinsics(tameMathObject(mathTaming));
  addIntrinsics(tameRegExpConstructor(regExpTaming));
  addIntrinsics(tameSymbolConstructor());

  addIntrinsics(getAnonymousIntrinsics());

  completePrototypes();

  const intrinsics=  finalIntrinsics();

  /**
   * Wrap console unless suppressed.
   * At the moment, the console is considered a host power in the start
   * compartment, and not a primordial. Hence it is absent from the whilelist
   * and bypasses the intrinsicsCollector.
   *
   * @type {((error: any) => string | undefined) | undefined}
   */
  let optGetStackString;
  if( errorTaming!==  'unsafe') {
    optGetStackString=  intrinsics['%InitialGetStackString%'];
   }
  const consoleRecord=  tameConsole(
    consoleTaming,
    errorTrapping,
    unhandledRejectionTrapping,
    optGetStackString);

  globalThis.console=  /** @type {Console} */  consoleRecord.console;

  // @ts-ignore assert is absent on globalThis type def.
  if( errorTaming===  'unsafe'&&  globalThis.assert===  assert) {
    // If errorTaming is 'unsafe' we replace the global assert with
    // one whose `details` template literal tag does not redact
    // unmarked substitution values. IOW, it blabs information that
    // was supposed to be secret from callers, as an aid to debugging
    // at a further cost in safety.
    // @ts-ignore assert is absent on globalThis type def.
    globalThis.assert=  makeAssert(undefined, true);
   }

  // Replace *Locale* methods with their non-locale equivalents
  tameLocaleMethods(intrinsics, localeTaming);

  /**
   * 2. WHITELIST to standardize the environment.
   */

  // Remove non-standard properties.
  // All remaining function encountered during whitelisting are
  // branded as honorary native functions.
  whitelistIntrinsics(intrinsics, markVirtualizedNativeFunction);

  // Initialize the powerful initial global, i.e., the global of the
  // start compartment, from the intrinsics.

  setGlobalObjectConstantProperties(globalThis);

  setGlobalObjectMutableProperties(globalThis, {
    intrinsics,
    newGlobalPropertyNames: initialGlobalPropertyNames,
    makeCompartmentConstructor,
    markVirtualizedNativeFunction});


  if( evalTaming===  'noEval') {
    setGlobalObjectEvaluators(
      globalThis,
      noEvalEvaluate,
      markVirtualizedNativeFunction);

   }else if( evalTaming===  'safeEval') {
    const { safeEvaluate}=   makeSafeEvaluator({ globalObject: globalThis});
    setGlobalObjectEvaluators(
      globalThis,
      safeEvaluate,
      markVirtualizedNativeFunction);

   }else if( evalTaming===  'unsafeEval') {
    // Leave eval function and Function constructor of the initial compartment in-tact.
    // Other compartments will not have access to these evaluators unless a guest program
    // escapes containment.
   }

  /**
   * 3. HARDEN to share the intrinsics.
   *
   * We define hardenIntrinsics here so that options are in scope, but return
   * it to the caller because we intend to eventually allow vetted shims to run
   * between repairs and the hardening of intrinsics and so we can benchmark
   * repair separately from hardening.
   */

  const hardenIntrinsics=  ()=>  {
    priorHardenIntrinsics===  undefined||
      // eslint-disable-next-line @endo/no-polymorphic-call
      assert.fail(
        d `Already locked down at ${priorHardenIntrinsics} (SES_ALREADY_LOCKED_DOWN)`,
        TypeError);

    // See https://github.com/endojs/endo/blob/master/packages/ses/error-codes/SES_ALREADY_LOCKED_DOWN.md
    priorHardenIntrinsics=  TypeError(
      'Prior lockdown (SES_ALREADY_LOCKED_DOWN)');

    // Tease V8 to generate the stack string and release the closures the stack
    // trace retained:
    priorHardenIntrinsics.stack;

    // Circumvent the override mistake.
    // TODO consider moving this to the end of the repair phase, and
    // therefore before vetted shims rather than afterwards. It is not
    // clear yet which is better.
    // @ts-ignore enablePropertyOverrides does its own input validation
    enablePropertyOverrides(intrinsics, overrideTaming, overrideDebug);

    // Finally register and optionally freeze all the intrinsics. This
    // must be the operation that modifies the intrinsics.
    tamedHarden(intrinsics);

    return tamedHarden;
   };

  return hardenIntrinsics;
 };$h‍_once.repairIntrinsics(repairIntrinsics);
})()
,
// === functors[49] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let globalThis,repairIntrinsics;$h‍_imports([["./assert-sloppy-mode.js", []],["./commons.js", [["globalThis", [$h‍_a => (globalThis = $h‍_a)]]]],["./lockdown.js", [["repairIntrinsics", [$h‍_a => (repairIntrinsics = $h‍_a)]]]]]);   








/**
 * @param {import('./lockdown.js').LockdownOptions} options
 */
globalThis.lockdown=  (options)=>{
  const hardenIntrinsics=  repairIntrinsics(options);
  globalThis.harden=  hardenIntrinsics();
 };

/**
 * @param {import('./lockdown.js').LockdownOptions} options
 */
globalThis.repairIntrinsics=  (options)=>{
  const hardenIntrinsics=  repairIntrinsics(options);
  // Reveal hardenIntrinsics after repairs.
  globalThis.hardenIntrinsics=  ()=>  {
    // Reveal harden after hardenIntrinsics.
    // Harden is dangerous before hardenIntrinsics because hardening just
    // about anything will inadvertently render intrinsics irreparable.
    // Also, for modules that must work both before or after lockdown (code
    // that is portable between JS and SES), the existence of harden in global
    // scope signals whether such code should attempt to use harden in the
    // defense of its own API.
    // @ts-ignore harden not yet recognized on globalThis.
    globalThis.harden=  hardenIntrinsics();
   };
 };
})()
,
// === functors[50] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let globalThis,makeCompartmentConstructor,tameFunctionToString,getGlobalIntrinsics;$h‍_imports([["./commons.js", [["globalThis", [$h‍_a => (globalThis = $h‍_a)]]]],["./compartment.js", [["makeCompartmentConstructor", [$h‍_a => (makeCompartmentConstructor = $h‍_a)]]]],["./tame-function-tostring.js", [["tameFunctionToString", [$h‍_a => (tameFunctionToString = $h‍_a)]]]],["./intrinsics.js", [["getGlobalIntrinsics", [$h‍_a => (getGlobalIntrinsics = $h‍_a)]]]]]);   






const markVirtualizedNativeFunction=  tameFunctionToString();

// @ts-ignore Compartment is definitely on globalThis.
globalThis.Compartment=  makeCompartmentConstructor(
  makeCompartmentConstructor,
  getGlobalIntrinsics(globalThis),
  markVirtualizedNativeFunction);
})()
,
// === functors[51] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let globalThis,assert;$h‍_imports([["./commons.js", [["globalThis", [$h‍_a => (globalThis = $h‍_a)]]]],["./error/assert.js", [["assert", [$h‍_a => (assert = $h‍_a)]]]]]);   


globalThis.assert=  assert;
})()
,
// === functors[52] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./src/lockdown-shim.js", []],["./src/compartment-shim.js", []],["./src/assert-shim.js", []]]);   
})()
,
// === functors[53] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeEnvironmentCaptor;$h‍_imports([["@endo/env-options", [["makeEnvironmentCaptor", [$h‍_a => (makeEnvironmentCaptor = $h‍_a)]]]]]);   


const { getEnvironmentOption}=   makeEnvironmentCaptor(globalThis);

// NOTE: We can't import these because they're not in scope before lockdown.
// import { assert, details as X, Fail } from '@agoric/assert';

// WARNING: Global Mutable State!
// This state is communicated to `assert` that makes it available to the
// causal console, which affects the console log output. Normally we
// regard the ability to see console log output as a meta-level privilege
// analogous to the ability to debug. Aside from that, this module should
// not have any observably mutable state.

let hiddenPriorError;
let hiddenCurrentTurn=  0;
let hiddenCurrentEvent=  0;

const DEBUG=  getEnvironmentOption('DEBUG', '');

// Turn on if you seem to be losing error logging at the top of the event loop
const VERBOSE=  DEBUG.split(':').includes('track-turns');

// Track-turns is disabled by default and can be enabled by an environment
// option.
const TRACK_TURNS=  getEnvironmentOption('TRACK_TURNS', 'disabled');
if( TRACK_TURNS!==  'enabled'&&  TRACK_TURNS!==  'disabled') {
  throw TypeError( `unrecognized TRACK_TURNS ${JSON.stringify(TRACK_TURNS)}`);
 }
const ENABLED=  (TRACK_TURNS||  'disabled')===  'enabled';

// We hoist the following functions out of trackTurns() to discourage the
// closures from holding onto 'args' or 'func' longer than necessary,
// which we've seen cause HandledPromise arguments to be retained for
// a surprisingly long time.

const addRejectionNote=  (detailsNote)=>(reason)=>{
  if( reason instanceof Error) {
    assert.note(reason, detailsNote);
   }
  if( VERBOSE) {
    console.log('REJECTED at top of event loop', reason);
   }
 };

const wrapFunction=
  (func, sendingError, X)=>
  (...args)=>  {
    hiddenPriorError=  sendingError;
    hiddenCurrentTurn+=  1;
    hiddenCurrentEvent=  0;
    try {
      let result;
      try {
        result=  func(...args);
       }catch( err) {
        if( err instanceof Error) {
          assert.note(
            err,
            X `Thrown from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`);

         }
        if( VERBOSE) {
          console.log('THROWN to top of event loop', err);
         }
        throw err;
       }
      // Must capture this now, not when the catch triggers.
      const detailsNote=  X `Rejection from: ${hiddenPriorError}:${hiddenCurrentTurn}.${hiddenCurrentEvent}`;
      Promise.resolve(result).catch(addRejectionNote(detailsNote));
      return result;
     }finally {
      hiddenPriorError=  undefined;
     }
   };

/**
 * Given a list of `TurnStarterFn`s, returns a list of `TurnStarterFn`s whose
 * `this`-free call behaviors are not observably different to those that
 * cannot see console output. The only purpose is to cause additional
 * information to appear on the console.
 *
 * The call to `trackTurns` is itself a sending event, that occurs in some call
 * stack in some turn number at some event number within that turn. Each call
 * to any of the returned `TurnStartFn`s is a receiving event that begins a new
 * turn. This sending event caused each of those receiving events.
 *
 * @template {TurnStarterFn[]} T
 * @param {T} funcs
 * @returns {T}
 */
const        trackTurns=  (funcs)=>{
  if( !ENABLED||  typeof globalThis===  'undefined'||  !globalThis.assert) {
    return funcs;
   }
  const { details: X}=   assert;

  hiddenCurrentEvent+=  1;
  const sendingError=  Error(
     `Event: ${hiddenCurrentTurn}.${hiddenCurrentEvent}`);

  if( hiddenPriorError!==  undefined) {
    assert.note(sendingError, X `Caused by: ${hiddenPriorError}`);
   }

  return (/** @type {T} */
    funcs.map((func)=>func&&  wrapFunction(func, sendingError, X)));

 };

/**
 * An optional function that is not this-sensitive, expected to be called at
 * bottom of stack to start a new turn.
 *
 * @typedef {((...args: any[]) => any) | undefined} TurnStarterFn
 */$h‍_once.trackTurns(trackTurns);
})()
,
// === functors[54] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   const { details: X, quote: q, Fail}=   assert;

const { getOwnPropertyDescriptors, getPrototypeOf, freeze}=   Object;
const { apply, ownKeys}=   Reflect;

const ntypeof=  (specimen)=> specimen===  null?  'null':  typeof specimen;

/**
 * TODO Consolidate with `isObject` that's currently in `@endo/marshal`
 *
 * @param {any} val
 * @returns {boolean}
 */
const isObject=  (val)=>Object(val)===  val;

/**
 * Prioritize symbols as earlier than strings.
 *
 * @param {string|symbol} a
 * @param {string|symbol} b
 * @returns {-1 | 0 | 1}
 */
const compareStringified=  (a, b)=>  {
  if( typeof a===  typeof b) {
    const left=  String(a);
    const right=  String(b);
    // eslint-disable-next-line no-nested-ternary
    return left<  right?  -1:  left>  right?  1:  0;
   }
  if( typeof a===  'symbol') {
    assert(typeof b===  'string');
    return -1;
   }
  assert(typeof a===  'string');
  assert(typeof b===  'symbol');
  return 1;
 };

/**
 * @param {any} val
 * @returns {(string|symbol)[]}
 */
const        getMethodNames=  (val)=>{
  let layer=  val;
  const names=  new Set(); // Set to deduplicate
  while( layer!==  null&&  layer!==  Object.prototype) {
    // be tolerant of non-objects
    const descs=  getOwnPropertyDescriptors(layer);
    for( const name of ownKeys(descs)) {
      // In case a method is overridden by a non-method,
      // test `val[name]` rather than `layer[name]`
      if( typeof val[name]===  'function') {
        names.add(name);
       }
     }
    if( !isObject(val)) {
      break;
     }
    layer=  getPrototypeOf(layer);
   }
  return harden([...names].sort(compareStringified));
 };
// The top level of the eventual send modules can be evaluated before
// ses creates `harden`, and so cannot rely on `harden` at top level.
$h‍_once.getMethodNames(getMethodNames);freeze(getMethodNames);

const        localApplyFunction=  (t, args)=>  {
  typeof t===  'function'||
    assert.fail(
      X `Cannot invoke target as a function; typeof target is ${q(ntypeof(t))}`,
      TypeError);

  return apply(t, undefined, args);
 };$h‍_once.localApplyFunction(localApplyFunction);

const        localApplyMethod=  (t, method, args)=>  {
  if( method===  undefined||  method===  null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(t, args);
   }
  if( t===  undefined||  t===  null) {
    assert.fail(
      X `Cannot deliver ${q(method)} to target; typeof target is ${q(
        ntypeof(t))
        }`,
      TypeError);

   }
  const fn=  t[method];
  if( fn===  undefined) {
    assert.fail(
      X `target has no method ${q(method)}, has ${q(getMethodNames(t))}`,
      TypeError);

   }
  const ftype=  ntypeof(fn);
  typeof fn===  'function'||
    Fail `invoked method ${q(method)} is not a function; it is a ${q(ftype)}`;
  return apply(fn, t, args);
 };$h‍_once.localApplyMethod(localApplyMethod);

const        localGet=  (t, key)=>  t[key];$h‍_once.localGet(localGet);
})()
,
// === functors[55] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /// <reference types="ses" />

/**
 * Create a simple postponedHandler that just postpones until donePostponing is
 * called.
 *
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 * @returns {[Required<import('./types').Handler<any>>, () => void]} postponedHandler and donePostponing callback.
 */
const        makePostponedHandler=  (HandledPromise)=>{
  /** @type {() => void} */
  let donePostponing;

  const interlockP=  new Promise((resolve)=>{
    donePostponing=  ()=>  resolve(undefined);
   });

  const makePostponedOperation=  (postponedOperation)=>{
    // Just wait until the handler is resolved/rejected.
    return function postpone(x, ...args) {
      // console.log(`forwarding ${postponedOperation} ${args[0]}`);
      return new HandledPromise((resolve, reject)=>  {
        interlockP.
           then((_)=>{
            resolve(HandledPromise[postponedOperation](x, ...args));
           }).
           catch(reject);
       });
     };
   };

  /** @type {Required<import('./types').Handler<any>>} */
  const postponedHandler=  {
    get: makePostponedOperation('get'),
    getSendOnly: makePostponedOperation('getSendOnly'),
    applyFunction: makePostponedOperation('applyFunction'),
    applyFunctionSendOnly: makePostponedOperation('applyFunctionSendOnly'),
    applyMethod: makePostponedOperation('applyMethod'),
    applyMethodSendOnly: makePostponedOperation('applyMethodSendOnly')};


  // @ts-expect-error 2454
  assert(donePostponing);

  return [postponedHandler, donePostponing];
 };$h‍_once.makePostponedHandler(makePostponedHandler);
})()
,
// === functors[56] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let trackTurns,localApplyFunction,localApplyMethod,localGet,getMethodNames,makePostponedHandler;$h‍_imports([["./track-turns.js", [["trackTurns", [$h‍_a => (trackTurns = $h‍_a)]]]],["./local.js", [["localApplyFunction", [$h‍_a => (localApplyFunction = $h‍_a)]],["localApplyMethod", [$h‍_a => (localApplyMethod = $h‍_a)]],["localGet", [$h‍_a => (localGet = $h‍_a)]],["getMethodNames", [$h‍_a => (getMethodNames = $h‍_a)]]]],["./postponed.js", [["makePostponedHandler", [$h‍_a => (makePostponedHandler = $h‍_a)]]]]]);   










const { Fail, details: X, quote: q}=   assert;

const {
  create,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  defineProperties,
  getPrototypeOf,
  setPrototypeOf,
  isFrozen,
  is: objectIs}=
    Object;

const { apply, construct, ownKeys}=   Reflect;

const SEND_ONLY_RE=  /^(.*)SendOnly$/;

/**
 * Coerce to an object property (string or symbol).
 *
 * @param {any} specimen
 * @returns {string | symbol}
 */
const coerceToObjectProperty=  (specimen)=>{
  if( typeof specimen===  'symbol') {
    return specimen;
   }
  return String(specimen);
 };

// the following method (makeHandledPromise) is part
// of the shim, and will not be exported by the module once the feature
// becomes a part of standard javascript

/**
 * Create a HandledPromise class to have it support eventual send
 * (wavy-dot) operations.
 *
 * Based heavily on nanoq
 * https://github.com/drses/nanoq/blob/master/src/nanoq.js
 *
 * Original spec for the infix-bang (predecessor to wavy-dot) desugaring:
 * https://web.archive.org/web/20161026162206/http://wiki.ecmascript.org/doku.php?id=strawman:concurrency
 *
 */
const        makeHandledPromise=  ()=>  {
  const presenceToHandler=  new WeakMap();
  /** @type {WeakMap<any, any>} */
  const presenceToPromise=  new WeakMap();
  const promiseToPendingHandler=  new WeakMap();
  const promiseToPresence=  new WeakMap();
  const forwardedPromiseToPromise=  new WeakMap(); // forwarding, union-find-ish

  /**
   * You can imagine a forest of trees in which the roots of each tree is an
   * unresolved HandledPromise or a non-Promise, and each node's parent is the
   * HandledPromise to which it was forwarded.  We maintain that mapping of
   * forwarded HandledPromise to its resolution in forwardedPromiseToPromise.
   *
   * We use something like the description of "Find" with "Path splitting"
   * to propagate changes down to the children efficiently:
   * https://en.wikipedia.org/wiki/Disjoint-set_data_structure
   *
   * @param {*} target Any value.
   * @returns {*} If the target was a HandledPromise, the most-resolved parent
   * of it, otherwise the target.
   */
  const shorten=  (target)=>{
    let p=  target;
    // Find the most-resolved value for p.
    while( forwardedPromiseToPromise.has(p)) {
      p=  forwardedPromiseToPromise.get(p);
     }
    const presence=  promiseToPresence.get(p);
    if( presence) {
      // Presences are final, so it is ok to propagate
      // this upstream.
      while( !objectIs(target, p)) {
        const parent=  forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.delete(target);
        promiseToPendingHandler.delete(target);
        promiseToPresence.set(target, presence);
        target=  parent;
       }
     }else {
      // We propagate p and remove all other pending handlers
      // upstream.
      // Note that everything except presences is covered here.
      while( !objectIs(target, p)) {
        const parent=  forwardedPromiseToPromise.get(target);
        forwardedPromiseToPromise.set(target, p);
        promiseToPendingHandler.delete(target);
        target=  parent;
       }
     }
    return target;
   };

  /**
   * This special handler accepts Promises, and forwards
   * handled Promises to their corresponding fulfilledHandler.
   *
   * @type {Required<Handler<any>>}
   */
  let forwardingHandler;
  let handle;

  /**
   * @param {string} handlerName
   * @param {Handler<any>} handler
   * @param {string} operation
   * @param {any} o
   * @param {any[]} opArgs
   * @param {Promise<unknown>} [returnedP]
   * @returns {any}
   */
  const dispatchToHandler=  (
    handlerName,
    handler,
    operation,
    o,
    opArgs,
    returnedP)=>
       {
    let actualOp=  operation;

    const matchSendOnly=  SEND_ONLY_RE.exec(actualOp);

    const makeResult=  (result)=> matchSendOnly?  undefined:  result;

    if( matchSendOnly) {
      // We don't specify the resulting promise if it is sendonly.
      returnedP=  undefined;
     }

    if( matchSendOnly&&  typeof handler[actualOp]!==  'function') {
      // Substitute for sendonly with the corresponding non-sendonly operation.
      actualOp=  matchSendOnly[1];
     }

    // Fast path: just call the actual operation.
    const hfn=  handler[actualOp];
    if( typeof hfn===  'function') {
      const result=  apply(hfn, handler, [o, ...opArgs, returnedP]);
      return makeResult(result);
     }

    if( actualOp===  'applyMethod') {
      // Compose a missing applyMethod by get followed by applyFunction.
      const [prop, args]=  opArgs;
      const getResultP=  handle(
        o,
        'get',
        // The argument to 'get' is a string or symbol.
        [coerceToObjectProperty(prop)],
        undefined);

      return makeResult(handle(getResultP, 'applyFunction', [args], returnedP));
     }

    // BASE CASE: applyFunction bottoms out into applyMethod, if it exists.
    if( actualOp===  'applyFunction') {
      const amfn=  handler.applyMethod;
      if( typeof amfn===  'function') {
        // Downlevel a missing applyFunction to applyMethod with undefined name.
        const [args]=  opArgs;
        const result=  apply(amfn, handler, [o, undefined, [args], returnedP]);
        return makeResult(result);
       }
     }

    throw assert.fail(
      X `${q(handlerName)} is defined but has no methods needed for ${q(
        operation)
        } (has ${q(getMethodNames(handler))})`,
      TypeError);

   };

  /** @typedef {{new <R>(executor: HandledExecutor<R>, unfulfilledHandler?: Handler<Promise<unknown>>): Promise<R>, prototype: Promise<unknown>} & PromiseConstructor & HandledPromiseStaticMethods} HandledPromiseConstructor */
  /** @type {HandledPromiseConstructor} */
  let HandledPromise;

  /**
   * This *needs* to be a `function X` so that we can use it as a constructor.
   *
   * @template R
   * @param {HandledExecutor<R>} executor
   * @param {Handler<Promise<R>>} [pendingHandler]
   * @returns {Promise<R>}
   */
  function baseHandledPromise(executor, pendingHandler=  undefined) {
    new.target||  Fail `must be invoked with "new"`;
    let handledResolve;
    let handledReject;
    let resolved=  false;
    let resolvedTarget=  null;
    let handledP;
    let continueForwarding=  ()=>  { };
    const assertNotYetForwarded=  ()=>  {
      !forwardedPromiseToPromise.has(handledP)||
        assert.fail(X `internal: already forwarded`,TypeError);
     };
    const superExecutor=  (superResolve, superReject)=>  {
      handledResolve=  (value)=>{
        if( resolved) {
          return;
         }
        assertNotYetForwarded();
        value=  shorten(value);
        let targetP;
        if(
          promiseToPendingHandler.has(value)||
          promiseToPresence.has(value))
          {
          targetP=  value;
         }else {
          // We're resolving to a non-promise, so remove our handler.
          promiseToPendingHandler.delete(handledP);
          targetP=  presenceToPromise.get(value);
         }
        // Ensure our data structure is a proper tree (avoid cycles).
        if( targetP&&  !objectIs(targetP, handledP)) {
          forwardedPromiseToPromise.set(handledP, targetP);
         }else {
          forwardedPromiseToPromise.delete(handledP);
         }

        // Remove stale pending handlers, set to canonical form.
        shorten(handledP);

        // Finish the resolution.
        superResolve(value);
        resolved=  true;
        resolvedTarget=  value;

        // We're resolved, so forward any postponed operations to us.
        continueForwarding();
       };
      handledReject=  (reason)=>{
        if( resolved) {
          return;
         }
        harden(reason);
        assertNotYetForwarded();
        promiseToPendingHandler.delete(handledP);
        resolved=  true;
        superReject(reason);
        continueForwarding();
       };
     };
    handledP=  harden(construct(Promise, [superExecutor], new.target));

    if( !pendingHandler) {
      // This is insufficient for actual remote handled Promises
      // (too many round-trips), but is an easy way to create a
      // local handled Promise.
      [pendingHandler, continueForwarding]=
        makePostponedHandler(HandledPromise);
     }

    const validateHandler=  (h)=>{
      Object(h)===  h||
        assert.fail(X `Handler ${h} cannot be a primitive`,TypeError);
     };
    validateHandler(pendingHandler);

    // Until the handled promise is resolved, we use the pendingHandler.
    promiseToPendingHandler.set(handledP, pendingHandler);

    const rejectHandled=  (reason)=>{
      if( resolved) {
        return;
       }
      assertNotYetForwarded();
      handledReject(reason);
     };

    const resolveWithPresence=  (
      presenceHandler=  pendingHandler,
      options=  {})=>
         {
      if( resolved) {
        return resolvedTarget;
       }
      assertNotYetForwarded();
      try {
        // Sanity checks.
        validateHandler(presenceHandler);

        const { proxy: proxyOpts}=   options;
        let presence;
        if( proxyOpts) {
          const {
            handler: proxyHandler,
            target: proxyTarget,
            revokerCallback}=
              proxyOpts;
          if( revokerCallback) {
            // Create a proxy and its revoke function.
            const { proxy, revoke}=   Proxy.revocable(
              proxyTarget,
              proxyHandler);

            presence=  proxy;
            revokerCallback(revoke);
           }else {
            presence=  new Proxy(proxyTarget, proxyHandler);
           }
         }else {
          // Default presence.
          presence=  create(null);
         }

        // Validate and install our mapped target (i.e. presence).
        resolvedTarget=  presence;

        // Create table entries for the presence mapped to the
        // fulfilledHandler.
        presenceToPromise.set(resolvedTarget, handledP);
        promiseToPresence.set(handledP, resolvedTarget);
        presenceToHandler.set(resolvedTarget, presenceHandler);

        // We committed to this presence, so resolve.
        handledResolve(resolvedTarget);
        return resolvedTarget;
       }catch( e) {
        assert.note(e, X `during resolveWithPresence`);
        handledReject(e);
        throw e;
       }
     };

    const resolveHandled=  (target)=>{
      if( resolved) {
        return;
       }
      assertNotYetForwarded();
      try {
        // Resolve the target.
        handledResolve(target);
       }catch( e) {
        handledReject(e);
       }
     };

    // Invoke the callback to let the user resolve/reject.
    executor(resolveHandled, rejectHandled, resolveWithPresence);

    return handledP;
   }

  /**
   * If the promise `p` is safe, then during the evaluation of the
   * expressopns `p.then` and `await p`, `p` cannot mount a reentrancy attack.
   * Unfortunately, due to limitations of the current JavaScript standard,
   * it seems impossible to prevent `p` from mounting a reentrancy attack
   * during the evaluation of `isSafePromise(p)`, and therefore during
   * operations like `HandledPromise.resolve(p)` that call
   * `isSafePromise(p)` synchronously.
   *
   * The `@endo/marshal` package defines a related notion of a passable
   * promise, i.e., one for which which `passStyleOf(p) === 'promise'`. All
   * passable promises are also safe. But not vice versa because the
   * requirements for a promise to be passable are slightly greater. A safe
   * promise must not override `then` or `constructor`. A passable promise
   * must not have any own properties. The requirements are otherwise
   * identical.
   *
   * @param {Promise} p
   * @returns {boolean}
   */
  const isSafePromise=  (p)=>{
    return(
      isFrozen(p)&&
      getPrototypeOf(p)===  Promise.prototype&&
      Promise.resolve(p)===  p&&
      getOwnPropertyDescriptor(p, 'then')===  undefined&&
      getOwnPropertyDescriptor(p, 'constructor')===  undefined);

   };

  /** @type {HandledPromiseStaticMethods & Pick<PromiseConstructor, 'resolve'>} */
  const staticMethods=  {
    get(target, prop) {
      prop=  coerceToObjectProperty(prop);
      return handle(target, 'get', [prop]);
     },
    getSendOnly(target, prop) {
      prop=  coerceToObjectProperty(prop);
      handle(target, 'getSendOnly', [prop]).catch(()=>  { });
     },
    applyFunction(target, args) {
      // Ensure args is an array.
      args=  [...args];
      return handle(target, 'applyFunction', [args]);
     },
    applyFunctionSendOnly(target, args) {
      // Ensure args is an array.
      args=  [...args];
      handle(target, 'applyFunctionSendOnly', [args]).catch(()=>  { });
     },
    applyMethod(target, prop, args) {
      prop=  coerceToObjectProperty(prop);
      // Ensure args is an array.
      args=  [...args];
      return handle(target, 'applyMethod', [prop, args]);
     },
    applyMethodSendOnly(target, prop, args) {
      prop=  coerceToObjectProperty(prop);
      // Ensure args is an array.
      args=  [...args];
      handle(target, 'applyMethodSendOnly', [prop, args]).catch(()=>  { });
     },
    resolve(value) {
      // Resolving a Presence returns the pre-registered handled promise.
      let resolvedPromise=  presenceToPromise.get(/** @type {any} */  value);
      if( !resolvedPromise) {
        resolvedPromise=  Promise.resolve(value);
       }
      // Prevent any proxy trickery.
      harden(resolvedPromise);
      if( isSafePromise(resolvedPromise)) {
        // We can use the `resolvedPromise` directly, since it is guaranteed to
        // have a `then` which is actually `Promise.prototype.then`.
        return resolvedPromise;
       }
      // Assimilate the `resolvedPromise` as an actual frozen Promise, by
      // treating `resolvedPromise` as if it is a non-promise thenable.
      const executeThen=  (resolve, reject)=>
        resolvedPromise.then(resolve, reject);
      return harden(
        Promise.resolve().then(()=>  new HandledPromise(executeThen)));

     }};


  const makeForwarder=  (operation, localImpl)=>  {
    return (o, ...args)=>  {
      // We are in another turn already, and have the naked object.
      const presenceHandler=  presenceToHandler.get(o);
      if( !presenceHandler) {
        return localImpl(o, ...args);
       }
      return dispatchToHandler(
        'presenceHandler',
        presenceHandler,
        operation,
        o,
        args);

     };
   };

  // eslint-disable-next-line prefer-const
  forwardingHandler=  {
    get: makeForwarder('get', localGet),
    getSendOnly: makeForwarder('getSendOnly', localGet),
    applyFunction: makeForwarder('applyFunction', localApplyFunction),
    applyFunctionSendOnly: makeForwarder(
      'applyFunctionSendOnly',
      localApplyFunction),

    applyMethod: makeForwarder('applyMethod', localApplyMethod),
    applyMethodSendOnly: makeForwarder('applyMethodSendOnly', localApplyMethod)};


  handle=  (...handleArgs)=>  {
    // We're in SES mode, so we should harden.
    harden(handleArgs);
    const [_p, operation, opArgs, ...dispatchArgs]=  handleArgs;
    let [p]=  handleArgs;
    const doDispatch=  (handlerName, handler, o)=>
      dispatchToHandler(
        handlerName,
        handler,
        operation,
        o,
        opArgs,
        // eslint-disable-next-line no-use-before-define
        ...(dispatchArgs.length===  0?  [returnedP]:  dispatchArgs));

    const [trackedDoDispatch]=  trackTurns([doDispatch]);
    const returnedP=  new HandledPromise((resolve, reject)=>  {
      // We run in a future turn to prevent synchronous attacks,
      let raceIsOver=  false;

      const win=  (handlerName, handler, o)=>  {
        if( raceIsOver) {
          return;
         }
        try {
          resolve(harden(trackedDoDispatch(handlerName, handler, o)));
         }catch( reason) {
          reject(harden(reason));
         }
        raceIsOver=  true;
       };

      const lose=  (reason)=>{
        if( raceIsOver) {
          return;
         }
        reject(harden(reason));
        raceIsOver=  true;
       };

      // This contestant tries to win with the target's resolution.
      staticMethods.
         resolve(p).
         then((o)=>win('forwardingHandler', forwardingHandler, o)).
         catch(lose);

      // This contestant sleeps a turn, but then tries to win immediately.
      staticMethods.
         resolve().
         then(()=>  {
          p=  shorten(p);
          const pendingHandler=  promiseToPendingHandler.get(p);
          if( pendingHandler) {
            // resolve to the answer from the specific pending handler,
            win('pendingHandler', pendingHandler, p);
           }else if( !p||  typeof p.then!==  'function') {
            // Not a Thenable, so use it.
            win('forwardingHandler', forwardingHandler, p);
           }else if( promiseToPresence.has(p)) {
            // We have the object synchronously, so resolve with it.
            const o=  promiseToPresence.get(p);
            win('forwardingHandler', forwardingHandler, o);
           }
          // If we made it here without winning, then we will wait
          // for the other contestant to win instead.
         }).
         catch(lose);
     });

    // We return a handled promise with the default pending handler.  This
    // prevents a race between the above Promise.resolves and pipelining.
    return harden(returnedP);
   };

  // Add everything needed on the constructor.
  baseHandledPromise.prototype=  Promise.prototype;
  setPrototypeOf(baseHandledPromise, Promise);
  defineProperties(
    baseHandledPromise,
    getOwnPropertyDescriptors(staticMethods));


  // FIXME: This is really ugly to bypass the type system, but it will be better
  // once we use Promise.delegated and don't have any [[Constructor]] behaviours.
  // @ts-expect-error cast
  HandledPromise=  baseHandledPromise;

  // We're a vetted shim which runs before `lockdown` allows
  // `harden(HandledPromise)` to function, but single-level `freeze` is a
  // suitable replacement because all mutable objects reachable afterwards are
  // intrinsics hardened by lockdown.
  freeze(HandledPromise);
  for( const key of ownKeys(HandledPromise)) {
    // prototype is the intrinsic Promise.prototype to be hardened by lockdown.
    if( key!==  'prototype') {
      freeze(HandledPromise[key]);
     }
   }

  return HandledPromise;
 };

/**
 * @template T
 * @typedef {{
 *   get?(p: T, name: PropertyKey, returnedP?: Promise<unknown>): unknown;
 *   getSendOnly?(p: T, name: PropertyKey): void;
 *   applyFunction?(p: T, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyFunctionSendOnly?(p: T, args: unknown[]): void;
 *   applyMethod?(p: T, name: PropertyKey | undefined, args: unknown[], returnedP?: Promise<unknown>): unknown;
 *   applyMethodSendOnly?(p: T, name: PropertyKey | undefined, args: unknown[]): void;
 * }} Handler
 */

/**
 * @template {{}} T
 * @typedef {{
 *   proxy?: {
 *     handler: ProxyHandler<T>;
 *     target: unknown;
 *     revokerCallback?(revoker: () => void): void;
 *   };
 * }} ResolveWithPresenceOptionsBag
 */

/**
 * @template [R = unknown]
 * @typedef {(
 *   resolveHandled: (value?: R) => void,
 *   rejectHandled: (reason?: unknown) => void,
 *   resolveWithPresence: (presenceHandler: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>) => object,
 * ) => void} HandledExecutor
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   resolve(value?: R): void;
 *   reject(reason: unknown): void;
 *   resolveWithPresence(presenceHandler?: Handler<{}>, options?: ResolveWithPresenceOptionsBag<{}>): object;
 * }} Settler
 */

/**
 * @typedef {{
 *   applyFunction(target: unknown, args: unknown[]): Promise<unknown>;
 *   applyFunctionSendOnly(target: unknown, args: unknown[]): void;
 *   applyMethod(target: unknown, prop: PropertyKey | undefined, args: unknown[]): Promise<unknown>;
 *   applyMethodSendOnly(target: unknown, prop: PropertyKey, args: unknown[]): void;
 *   get(target: unknown, prop: PropertyKey): Promise<unknown>;
 *   getSendOnly(target: unknown, prop: PropertyKey): void;
 * }} HandledPromiseStaticMethods
 */

/** @typedef {ReturnType<typeof makeHandledPromise>} HandledPromiseConstructor */$h‍_once.makeHandledPromise(makeHandledPromise);
})()
,
// === functors[57] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeHandledPromise;$h‍_imports([["./src/handled-promise.js", [["makeHandledPromise", [$h‍_a => (makeHandledPromise = $h‍_a)]]]]]);   


if( typeof globalThis.HandledPromise===  'undefined') {
  globalThis.HandledPromise=  makeHandledPromise();
 }
})()
,
// === functors[58] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /*
Initial version authored by Brian Kim:
https://github.com/nodejs/node/issues/17469#issuecomment-685216777

This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.

In jurisdictions that recognize copyright laws, the author or authors
of this software dedicate any and all copyright interest in the
software to the public domain. We make this dedication for the benefit
of the public at large and to the detriment of our heirs and
successors. We intend this dedication to be an overt act of
relinquishment in perpetuity of all present and future rights to this
software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR
OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <http://unlicense.org/>
*/

const isObject=  (value)=>Object(value)===  value;

/**
 * @template [T=any]
 * @typedef {object} Deferred
 * @property {(value?: import("./types.js").ERef<T> ) => void} resolve
 * @property {(err?: any ) => void} reject
 */

/**
 * @typedef { never
 *  | {settled: false, deferreds: Set<Deferred>}
 *  | {settled: true, deferreds?: undefined}
 * } PromiseMemoRecord
 */

// Keys are the values passed to race, values are a record of data containing a
// set of deferreds and whether the value has settled.
/** @type {WeakMap<object, PromiseMemoRecord>} */
const knownPromises=  new WeakMap();

/**
 * @param {PromiseMemoRecord | undefined} record
 * @returns {Set<Deferred>}
 */
const markSettled=  (record)=>{
  if( !record||  record.settled) {
    return new Set();
   }

  const { deferreds}=   record;
  Object.assign(record, {
    deferreds: undefined,
    settled: true});

  Object.freeze(record);
  return deferreds;
 };

/**
 *
 * @param {any} value
 * @returns {PromiseMemoRecord}
 */
const getMemoRecord=  (value)=>{
  if( !isObject(value)) {
    // If the contender is a primitive, attempting to use it as a key in the
    // weakmap would throw an error. Luckily, it is safe to call
    // `Promise.resolve(contender).then` on a primitive value multiple times
    // because the promise fulfills immediately. So we fake a settled record.
    return harden({ settled: true});
   }

  let record=  knownPromises.get(value);

  if( !record) {
    record=  { deferreds: new Set(), settled: false};
    knownPromises.set(value, record);
    // This call to `then` happens once for the lifetime of the value.
    Promise.resolve(value).then(
      (val)=>{
        for( const { resolve}of   markSettled(record)) {
          resolve(val);
         }
       },
      (err)=>{
        for( const { reject}of   markSettled(record)) {
          reject(err);
         }
       });

   }
  return record;
 };

const { race}=   {
  /**
   * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
   * or rejected.
   *
   * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
   * the result promise.
   *
   * @template T
   * @template {PromiseConstructor} [P=PromiseConstructor]
   * @this {P}
   * @param {Iterable<T>} values An iterable of Promises.
   * @returns {Promise<Awaited<T>>} A new Promise.
   */
  race(values) {
    let deferred;
    /** @type {T[]} */
    const cachedValues=  [];
    const C=  this;
    const result=  new C((resolve, reject)=>  {
      deferred=  { resolve, reject};
      for( const value of values) {
        cachedValues.push(value);
        const { settled, deferreds}=   getMemoRecord(value);
        if( settled) {
          // If the contender is settled (including primitives), it is safe
          // to call `Promise.resolve(value).then` on it.
          C.resolve(value).then(resolve, reject);
         }else {
          deferreds.add(deferred);
         }
       }
     });

    // The finally callback executes when any value settles, preventing any of
    // the unresolved values from retaining a reference to the resolved value.
    return result.finally(()=>  {
      for( const value of cachedValues) {
        const { deferreds}=   getMemoRecord(value);
        if( deferreds) {
          deferreds.delete(deferred);
         }
       }
     });
   }};$h‍_once.race(race);
})()
,
// === functors[59] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let memoRace;$h‍_imports([["./src/memo-race.js", [["memoRace", [$h‍_a => (memoRace = $h‍_a)]]]]]);   

// Unconditionally replace with a non-leaking version
Promise.race=  memoRace;
})()
,
// === functors[60] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /* global globalThis */

// The post lockdown thunk.
const{default:$c‍_default}={default:()=>{
  // Even on non-v8, we tame the start compartment's Error constructor so
  // this assignment is not rejected, even if it does nothing.
  Error.stackTraceLimit=  Infinity;

  harden(TextEncoder);
  harden(TextDecoder);
  harden(globalThis.URL); // Absent only on XSnap
  harden(globalThis.Base64); // Present only on XSnap
 }};$h‍_once.default($c‍_default);
})()
,
// === functors[61] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let postLockdown;$h‍_imports([["ses", []],["./post.js", [["default", [$h‍_a => (postLockdown = $h‍_a)]]]]]);   









const rawLockdown=  globalThis.lockdown;

/** @type {typeof rawLockdown} */
const        lockdown=  (defaultOptions)=>{
  // For testing under Ava, and also sometimes for testing and debugging in
  // general, when safety is not needed, you perhaps want to use
  // packages/SwingSet/tools/install-ses-debug.js instead of this one.
  // If you're using a prepare-test-env-ava.js, it is probably already doing that
  // for you.

  // The `@endo/init` package exists so the "main" of production code
  // can start with the following import or its equivalent.
  // ```js
  // import '@endo/init';
  // ```
  // But production code must also be tested. Normal ocap discipline of passing
  // explicit arguments into the `lockdown`
  // call would require an awkward structuring of start modules, since
  // the `init` module calls `lockdown` during its initialization,
  // before any explicit code in the start module gets to run. Even if other code
  // does get to run first, the `lockdown` call in this module happens during
  // module initialization, before it can legitimately receive parameters by
  // explicit parameter passing.
  //
  // Instead, for now, `init` violates normal ocap discipline by feature
  // testing global state for a passed "parameter". This is something that a
  // module can but normally should not do, during initialization or otherwise.
  // Initialization is often awkward.
  //
  // The `init` module tests, first,
  // for a JavaScript global named `LOCKDOWN_OPTIONS`, and second, for an
  // environment
  // variable named `LOCKDOWN_OPTIONS`. If either is present, its value should be
  // a JSON encoding of the options bag to pass to the `lockdown` call. If so,
  // then `init` calls `lockdown` with those options. If there is no such
  // feature, `init` calls `lockdown` with appropriate settings for
  // production use.

  let optionsString;
  if( typeof LOCKDOWN_OPTIONS===  'string') {
    optionsString=  LOCKDOWN_OPTIONS;
    console.warn(
       `'@endo/lockdown' sniffed and found a 'LOCKDOWN_OPTIONS' global variable\n`);

   }else if(
    typeof process===  'object'&&
    typeof process.env.LOCKDOWN_OPTIONS===  'string')
    {
    optionsString=  process.env.LOCKDOWN_OPTIONS;
    console.warn(
       `'@endo/lockdown' sniffed and found a 'LOCKDOWN_OPTIONS' environment variable\n`);

   }

  if( typeof optionsString===  'string') {
    let options;
    try {
      options=  JSON.parse(optionsString);
     }catch( err) {
      console.error('Environment variable LOCKDOWN_OPTIONS must be JSON', err);
      throw err;
     }
    if( typeof options!==  'object'||  Array.isArray(options)) {
      const err=  TypeError(
        'Environment variable LOCKDOWN_OPTIONS must be a JSON object');

      console.error('', err, options);
      throw err;
     }
    rawLockdown({
      ...options,
      // See comment on domainTaming below.
      domainTaming: 'unsafe'});

   }else if( defaultOptions) {
    rawLockdown({
      ...defaultOptions,
      // See comment on domainTaming below.
      domainTaming: 'unsafe'});

   }else {
    rawLockdown({
      // The default `{errorTaming: 'safe'}` setting, if possible, redacts the
      // stack trace info from the error instances, so that it is not available
      // merely by saying `errorInstance.stack`. However, some tools
      // will look for the stack there and become much less useful if it is
      // missing. In production, the settings in this file need to preserve
      // security, so the 'unsafe' setting below MUST always be commented out
      // except during private development.
      //
      // NOTE TO REVIEWERS: If you see the following line *not* commented out,
      // this may be a development accident that MUST be fixed before merging.
      //
      // errorTaming: 'unsafe',
      //
      //
      // The default `{stackFiltering: 'concise'}` setting usually makes for a
      // better debugging experience, by severely reducing the noisy distractions
      // of the normal verbose stack traces. Which is why we comment
      // out the `'verbose'` setting is commented out below. However, some
      // tools look for the full filename that it expects in order
      // to fetch the source text for diagnostics,
      //
      // Another reason for not commenting it out: The cause
      // of the bug may be anywhere, so the `'noise'` thrown out by the default
      // `'concise'` setting may also contain the signal you need. To see it,
      // uncomment out the following line. But please do not commit it in that
      // state.
      //
      // NOTE TO REVIEWERS: If you see the following line *not* commented out,
      // this may be a development accident that MUST be fixed before merging.
      //
      // stackFiltering: 'verbose',
      //
      //
      // The default `{overrideTaming: 'moderate'}` setting does not hurt the
      // debugging experience much. But it will introduce noise into, for example,
      // the vscode debugger's object inspector. During debug and test, if you can
      // avoid legacy code that needs the `'moderate'` setting, then the `'min'`
      // setting reduces debugging noise yet further, by turning fewer inherited
      // properties into accessors.
      //
      // NOTE TO REVIEWERS: If you see the following line *not* commented out,
      // this may be a development accident that MUST be fixed before merging.
      //
      // overrideTaming: 'min',
      //
      //
      // The default `{consoleTaming: 'safe'}` setting usually makes for a
      // better debugging experience, by wrapping the original `console` with
      // the SES replacement `console` that provides more information about
      // errors, expecially those thrown by the `assert` system. However,
      // in case the SES `console` is getting in the way, we provide the
      // `'unsafe'` option for leaving the original `console` in place.
      //
      // NOTE TO REVIEWERS: If you see the following line *not* commented out,
      // this may be a development accident that MUST be fixed before merging.
      //
      // consoleTaming: 'unsafe',

      // Domain taming causes lockdown to throw an error if the Node.js domain
      // module has already been loaded, and causes loading the domain module
      // to throw an error if it is pulled into the working set later.
      // This is because domains may add domain properties to promises and other
      // callbacks and that these domain objects provide a means to escape
      // containment.
      // However, our platform still depends on systems like standardthings/esm
      // which ultimately pull in domains.
      // For now, we are resigned to leave this hole open, knowing that all
      // contract code will be run under XS to avoid this vulnerability.
      domainTaming: 'unsafe'});

   }

  // We are now in the "Start Compartment". Our global has all the same
  // powerful things it had before, but the primordials have changed to make
  // them safe to use in the arguments of API calls we make into more limited
  // compartments

  // 'Compartment', 'assert', and 'harden' are now present in our global scope.
  postLockdown();
 };$h‍_once.lockdown(lockdown);

globalThis.lockdown=  lockdown;
})()
,
// === functors[62] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./pre.js", []]]);   

lockdown();
})()
,
// === functors[63] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

/* eslint complexity: [2, 18], max-statements: [2, 33] */
module.exports = function hasSymbols() {
	if (typeof Symbol !== 'function' || typeof Object.getOwnPropertySymbols !== 'function') { return false; }
	if (typeof Symbol.iterator === 'symbol') { return true; }

	var obj = {};
	var sym = Symbol('test');
	var symObj = Object(sym);
	if (typeof sym === 'string') { return false; }

	if (Object.prototype.toString.call(sym) !== '[object Symbol]') { return false; }
	if (Object.prototype.toString.call(symObj) !== '[object Symbol]') { return false; }

	// temp disabled per https://github.com/ljharb/object.assign/issues/17
	// if (sym instanceof Symbol) { return false; }
	// temp disabled per https://github.com/WebReflection/get-own-property-symbols/issues/4
	// if (!(symObj instanceof Symbol)) { return false; }

	// if (typeof Symbol.prototype.toString !== 'function') { return false; }
	// if (String(sym) !== Symbol.prototype.toString.call(sym)) { return false; }

	var symVal = 42;
	obj[sym] = symVal;
	for (sym in obj) { return false; } // eslint-disable-line no-restricted-syntax, no-unreachable-loop
	if (typeof Object.keys === 'function' && Object.keys(obj).length !== 0) { return false; }

	if (typeof Object.getOwnPropertyNames === 'function' && Object.getOwnPropertyNames(obj).length !== 0) { return false; }

	var syms = Object.getOwnPropertySymbols(obj);
	if (syms.length !== 1 || syms[0] !== sym) { return false; }

	if (!Object.prototype.propertyIsEnumerable.call(obj, sym)) { return false; }

	if (typeof Object.getOwnPropertyDescriptor === 'function') {
		var descriptor = Object.getOwnPropertyDescriptor(obj, sym);
		if (descriptor.value !== symVal || descriptor.enumerable !== true) { return false; }
	}

	return true;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/has-symbols/shams.js
,
// === functors[64] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var hasSymbols = require('has-symbols/shams');

module.exports = function hasToStringTagShams() {
	return hasSymbols() && !!Symbol.toStringTag;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/has-tostringtag/shams.js
,
// === functors[65] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var origSymbol = typeof Symbol !== 'undefined' && Symbol;
var hasSymbolSham = require('./shams');

module.exports = function hasNativeSymbols() {
	if (typeof origSymbol !== 'function') { return false; }
	if (typeof Symbol !== 'function') { return false; }
	if (typeof origSymbol('foo') !== 'symbol') { return false; }
	if (typeof Symbol('bar') !== 'symbol') { return false; }

	return hasSymbolSham();
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/has-symbols/index.js
,
// === functors[66] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

/* eslint no-invalid-this: 1 */

var ERROR_MESSAGE = 'Function.prototype.bind called on incompatible ';
var slice = Array.prototype.slice;
var toStr = Object.prototype.toString;
var funcType = '[object Function]';

module.exports = function bind(that) {
    var target = this;
    if (typeof target !== 'function' || toStr.call(target) !== funcType) {
        throw new TypeError(ERROR_MESSAGE + target);
    }
    var args = slice.call(arguments, 1);

    var bound;
    var binder = function () {
        if (this instanceof bound) {
            var result = target.apply(
                this,
                args.concat(slice.call(arguments))
            );
            if (Object(result) === result) {
                return result;
            }
            return this;
        } else {
            return target.apply(
                that,
                args.concat(slice.call(arguments))
            );
        }
    };

    var boundLength = Math.max(0, target.length - args.length);
    var boundArgs = [];
    for (var i = 0; i < boundLength; i++) {
        boundArgs.push('$' + i);
    }

    bound = Function('binder', 'return function (' + boundArgs.join(',') + '){ return binder.apply(this,arguments); }')(binder);

    if (target.prototype) {
        var Empty = function Empty() {};
        Empty.prototype = target.prototype;
        bound.prototype = new Empty();
        Empty.prototype = null;
    }

    return bound;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/function-bind/implementation.js
,
// === functors[67] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var implementation = require('./implementation');

module.exports = Function.prototype.bind || implementation;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/function-bind/index.js
,
// === functors[68] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var bind = require('function-bind');

module.exports = bind.call(Function.call, Object.prototype.hasOwnProperty);
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/has/src/index.js
,
// === functors[69] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var undefined;

var $SyntaxError = SyntaxError;
var $Function = Function;
var $TypeError = TypeError;

// eslint-disable-next-line consistent-return
var getEvalledConstructor = function (expressionSyntax) {
	try {
		return $Function('"use strict"; return (' + expressionSyntax + ').constructor;')();
	} catch (e) {}
};

var $gOPD = Object.getOwnPropertyDescriptor;
if ($gOPD) {
	try {
		$gOPD({}, '');
	} catch (e) {
		$gOPD = null; // this is IE 8, which has a broken gOPD
	}
}

var throwTypeError = function () {
	throw new $TypeError();
};
var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;

var hasSymbols = require('has-symbols')();

var getProto = Object.getPrototypeOf || function (x) { return x.__proto__; }; // eslint-disable-line no-proto

var needsEval = {};

var TypedArray = typeof Uint8Array === 'undefined' ? undefined : getProto(Uint8Array);

var INTRINSICS = {
	'%AggregateError%': typeof AggregateError === 'undefined' ? undefined : AggregateError,
	'%Array%': Array,
	'%ArrayBuffer%': typeof ArrayBuffer === 'undefined' ? undefined : ArrayBuffer,
	'%ArrayIteratorPrototype%': hasSymbols ? getProto([][Symbol.iterator]()) : undefined,
	'%AsyncFromSyncIteratorPrototype%': undefined,
	'%AsyncFunction%': needsEval,
	'%AsyncGenerator%': needsEval,
	'%AsyncGeneratorFunction%': needsEval,
	'%AsyncIteratorPrototype%': needsEval,
	'%Atomics%': typeof Atomics === 'undefined' ? undefined : Atomics,
	'%BigInt%': typeof BigInt === 'undefined' ? undefined : BigInt,
	'%BigInt64Array%': typeof BigInt64Array === 'undefined' ? undefined : BigInt64Array,
	'%BigUint64Array%': typeof BigUint64Array === 'undefined' ? undefined : BigUint64Array,
	'%Boolean%': Boolean,
	'%DataView%': typeof DataView === 'undefined' ? undefined : DataView,
	'%Date%': Date,
	'%decodeURI%': decodeURI,
	'%decodeURIComponent%': decodeURIComponent,
	'%encodeURI%': encodeURI,
	'%encodeURIComponent%': encodeURIComponent,
	'%Error%': Error,
	'%eval%': eval, // eslint-disable-line no-eval
	'%EvalError%': EvalError,
	'%Float32Array%': typeof Float32Array === 'undefined' ? undefined : Float32Array,
	'%Float64Array%': typeof Float64Array === 'undefined' ? undefined : Float64Array,
	'%FinalizationRegistry%': typeof FinalizationRegistry === 'undefined' ? undefined : FinalizationRegistry,
	'%Function%': $Function,
	'%GeneratorFunction%': needsEval,
	'%Int8Array%': typeof Int8Array === 'undefined' ? undefined : Int8Array,
	'%Int16Array%': typeof Int16Array === 'undefined' ? undefined : Int16Array,
	'%Int32Array%': typeof Int32Array === 'undefined' ? undefined : Int32Array,
	'%isFinite%': isFinite,
	'%isNaN%': isNaN,
	'%IteratorPrototype%': hasSymbols ? getProto(getProto([][Symbol.iterator]())) : undefined,
	'%JSON%': typeof JSON === 'object' ? JSON : undefined,
	'%Map%': typeof Map === 'undefined' ? undefined : Map,
	'%MapIteratorPrototype%': typeof Map === 'undefined' || !hasSymbols ? undefined : getProto(new Map()[Symbol.iterator]()),
	'%Math%': Math,
	'%Number%': Number,
	'%Object%': Object,
	'%parseFloat%': parseFloat,
	'%parseInt%': parseInt,
	'%Promise%': typeof Promise === 'undefined' ? undefined : Promise,
	'%Proxy%': typeof Proxy === 'undefined' ? undefined : Proxy,
	'%RangeError%': RangeError,
	'%ReferenceError%': ReferenceError,
	'%Reflect%': typeof Reflect === 'undefined' ? undefined : Reflect,
	'%RegExp%': RegExp,
	'%Set%': typeof Set === 'undefined' ? undefined : Set,
	'%SetIteratorPrototype%': typeof Set === 'undefined' || !hasSymbols ? undefined : getProto(new Set()[Symbol.iterator]()),
	'%SharedArrayBuffer%': typeof SharedArrayBuffer === 'undefined' ? undefined : SharedArrayBuffer,
	'%String%': String,
	'%StringIteratorPrototype%': hasSymbols ? getProto(''[Symbol.iterator]()) : undefined,
	'%Symbol%': hasSymbols ? Symbol : undefined,
	'%SyntaxError%': $SyntaxError,
	'%ThrowTypeError%': ThrowTypeError,
	'%TypedArray%': TypedArray,
	'%TypeError%': $TypeError,
	'%Uint8Array%': typeof Uint8Array === 'undefined' ? undefined : Uint8Array,
	'%Uint8ClampedArray%': typeof Uint8ClampedArray === 'undefined' ? undefined : Uint8ClampedArray,
	'%Uint16Array%': typeof Uint16Array === 'undefined' ? undefined : Uint16Array,
	'%Uint32Array%': typeof Uint32Array === 'undefined' ? undefined : Uint32Array,
	'%URIError%': URIError,
	'%WeakMap%': typeof WeakMap === 'undefined' ? undefined : WeakMap,
	'%WeakRef%': typeof WeakRef === 'undefined' ? undefined : WeakRef,
	'%WeakSet%': typeof WeakSet === 'undefined' ? undefined : WeakSet
};

try {
	null.error; // eslint-disable-line no-unused-expressions
} catch (e) {
	// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
	var errorProto = getProto(getProto(e));
	INTRINSICS['%Error.prototype%'] = errorProto;
}

var doEval = function doEval(name) {
	var value;
	if (name === '%AsyncFunction%') {
		value = getEvalledConstructor('async function () {}');
	} else if (name === '%GeneratorFunction%') {
		value = getEvalledConstructor('function* () {}');
	} else if (name === '%AsyncGeneratorFunction%') {
		value = getEvalledConstructor('async function* () {}');
	} else if (name === '%AsyncGenerator%') {
		var fn = doEval('%AsyncGeneratorFunction%');
		if (fn) {
			value = fn.prototype;
		}
	} else if (name === '%AsyncIteratorPrototype%') {
		var gen = doEval('%AsyncGenerator%');
		if (gen) {
			value = getProto(gen.prototype);
		}
	}

	INTRINSICS[name] = value;

	return value;
};

var LEGACY_ALIASES = {
	'%ArrayBufferPrototype%': ['ArrayBuffer', 'prototype'],
	'%ArrayPrototype%': ['Array', 'prototype'],
	'%ArrayProto_entries%': ['Array', 'prototype', 'entries'],
	'%ArrayProto_forEach%': ['Array', 'prototype', 'forEach'],
	'%ArrayProto_keys%': ['Array', 'prototype', 'keys'],
	'%ArrayProto_values%': ['Array', 'prototype', 'values'],
	'%AsyncFunctionPrototype%': ['AsyncFunction', 'prototype'],
	'%AsyncGenerator%': ['AsyncGeneratorFunction', 'prototype'],
	'%AsyncGeneratorPrototype%': ['AsyncGeneratorFunction', 'prototype', 'prototype'],
	'%BooleanPrototype%': ['Boolean', 'prototype'],
	'%DataViewPrototype%': ['DataView', 'prototype'],
	'%DatePrototype%': ['Date', 'prototype'],
	'%ErrorPrototype%': ['Error', 'prototype'],
	'%EvalErrorPrototype%': ['EvalError', 'prototype'],
	'%Float32ArrayPrototype%': ['Float32Array', 'prototype'],
	'%Float64ArrayPrototype%': ['Float64Array', 'prototype'],
	'%FunctionPrototype%': ['Function', 'prototype'],
	'%Generator%': ['GeneratorFunction', 'prototype'],
	'%GeneratorPrototype%': ['GeneratorFunction', 'prototype', 'prototype'],
	'%Int8ArrayPrototype%': ['Int8Array', 'prototype'],
	'%Int16ArrayPrototype%': ['Int16Array', 'prototype'],
	'%Int32ArrayPrototype%': ['Int32Array', 'prototype'],
	'%JSONParse%': ['JSON', 'parse'],
	'%JSONStringify%': ['JSON', 'stringify'],
	'%MapPrototype%': ['Map', 'prototype'],
	'%NumberPrototype%': ['Number', 'prototype'],
	'%ObjectPrototype%': ['Object', 'prototype'],
	'%ObjProto_toString%': ['Object', 'prototype', 'toString'],
	'%ObjProto_valueOf%': ['Object', 'prototype', 'valueOf'],
	'%PromisePrototype%': ['Promise', 'prototype'],
	'%PromiseProto_then%': ['Promise', 'prototype', 'then'],
	'%Promise_all%': ['Promise', 'all'],
	'%Promise_reject%': ['Promise', 'reject'],
	'%Promise_resolve%': ['Promise', 'resolve'],
	'%RangeErrorPrototype%': ['RangeError', 'prototype'],
	'%ReferenceErrorPrototype%': ['ReferenceError', 'prototype'],
	'%RegExpPrototype%': ['RegExp', 'prototype'],
	'%SetPrototype%': ['Set', 'prototype'],
	'%SharedArrayBufferPrototype%': ['SharedArrayBuffer', 'prototype'],
	'%StringPrototype%': ['String', 'prototype'],
	'%SymbolPrototype%': ['Symbol', 'prototype'],
	'%SyntaxErrorPrototype%': ['SyntaxError', 'prototype'],
	'%TypedArrayPrototype%': ['TypedArray', 'prototype'],
	'%TypeErrorPrototype%': ['TypeError', 'prototype'],
	'%Uint8ArrayPrototype%': ['Uint8Array', 'prototype'],
	'%Uint8ClampedArrayPrototype%': ['Uint8ClampedArray', 'prototype'],
	'%Uint16ArrayPrototype%': ['Uint16Array', 'prototype'],
	'%Uint32ArrayPrototype%': ['Uint32Array', 'prototype'],
	'%URIErrorPrototype%': ['URIError', 'prototype'],
	'%WeakMapPrototype%': ['WeakMap', 'prototype'],
	'%WeakSetPrototype%': ['WeakSet', 'prototype']
};

var bind = require('function-bind');
var hasOwn = require('has');
var $concat = bind.call(Function.call, Array.prototype.concat);
var $spliceApply = bind.call(Function.apply, Array.prototype.splice);
var $replace = bind.call(Function.call, String.prototype.replace);
var $strSlice = bind.call(Function.call, String.prototype.slice);
var $exec = bind.call(Function.call, RegExp.prototype.exec);

/* adapted from https://github.com/lodash/lodash/blob/4.17.15/dist/lodash.js#L6735-L6744 */
var rePropName = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g;
var reEscapeChar = /\\(\\)?/g; /** Used to match backslashes in property paths. */
var stringToPath = function stringToPath(string) {
	var first = $strSlice(string, 0, 1);
	var last = $strSlice(string, -1);
	if (first === '%' && last !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected closing `%`');
	} else if (last === '%' && first !== '%') {
		throw new $SyntaxError('invalid intrinsic syntax, expected opening `%`');
	}
	var result = [];
	$replace(string, rePropName, function (match, number, quote, subString) {
		result[result.length] = quote ? $replace(subString, reEscapeChar, '$1') : number || match;
	});
	return result;
};
/* end adaptation */

var getBaseIntrinsic = function getBaseIntrinsic(name, allowMissing) {
	var intrinsicName = name;
	var alias;
	if (hasOwn(LEGACY_ALIASES, intrinsicName)) {
		alias = LEGACY_ALIASES[intrinsicName];
		intrinsicName = '%' + alias[0] + '%';
	}

	if (hasOwn(INTRINSICS, intrinsicName)) {
		var value = INTRINSICS[intrinsicName];
		if (value === needsEval) {
			value = doEval(intrinsicName);
		}
		if (typeof value === 'undefined' && !allowMissing) {
			throw new $TypeError('intrinsic ' + name + ' exists, but is not available. Please file an issue!');
		}

		return {
			alias: alias,
			name: intrinsicName,
			value: value
		};
	}

	throw new $SyntaxError('intrinsic ' + name + ' does not exist!');
};

module.exports = function GetIntrinsic(name, allowMissing) {
	if (typeof name !== 'string' || name.length === 0) {
		throw new $TypeError('intrinsic name must be a non-empty string');
	}
	if (arguments.length > 1 && typeof allowMissing !== 'boolean') {
		throw new $TypeError('"allowMissing" argument must be a boolean');
	}

	if ($exec(/^%?[^%]*%?$/, name) === null) {
		throw new $SyntaxError('`%` may not be present anywhere but at the beginning and end of the intrinsic name');
	}
	var parts = stringToPath(name);
	var intrinsicBaseName = parts.length > 0 ? parts[0] : '';

	var intrinsic = getBaseIntrinsic('%' + intrinsicBaseName + '%', allowMissing);
	var intrinsicRealName = intrinsic.name;
	var value = intrinsic.value;
	var skipFurtherCaching = false;

	var alias = intrinsic.alias;
	if (alias) {
		intrinsicBaseName = alias[0];
		$spliceApply(parts, $concat([0, 1], alias));
	}

	for (var i = 1, isOwn = true; i < parts.length; i += 1) {
		var part = parts[i];
		var first = $strSlice(part, 0, 1);
		var last = $strSlice(part, -1);
		if (
			(
				(first === '"' || first === "'" || first === '`')
				|| (last === '"' || last === "'" || last === '`')
			)
			&& first !== last
		) {
			throw new $SyntaxError('property names with quotes must have matching quotes');
		}
		if (part === 'constructor' || !isOwn) {
			skipFurtherCaching = true;
		}

		intrinsicBaseName += '.' + part;
		intrinsicRealName = '%' + intrinsicBaseName + '%';

		if (hasOwn(INTRINSICS, intrinsicRealName)) {
			value = INTRINSICS[intrinsicRealName];
		} else if (value != null) {
			if (!(part in value)) {
				if (!allowMissing) {
					throw new $TypeError('base intrinsic for ' + name + ' exists, but the property is not available.');
				}
				return void undefined;
			}
			if ($gOPD && (i + 1) >= parts.length) {
				var desc = $gOPD(value, part);
				isOwn = !!desc;

				// By convention, when a data property is converted to an accessor
				// property to emulate a data property that does not suffer from
				// the override mistake, that accessor's getter is marked with
				// an `originalValue` property. Here, when we detect this, we
				// uphold the illusion by pretending to see that original data
				// property, i.e., returning the value rather than the getter
				// itself.
				if (isOwn && 'get' in desc && !('originalValue' in desc.get)) {
					value = desc.get;
				} else {
					value = value[part];
				}
			} else {
				isOwn = hasOwn(value, part);
				value = value[part];
			}

			if (isOwn && !skipFurtherCaching) {
				INTRINSICS[intrinsicRealName] = value;
			}
		}
	}
	return value;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/get-intrinsic/index.js
,
// === functors[70] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var bind = require('function-bind');
var GetIntrinsic = require('get-intrinsic');

var $apply = GetIntrinsic('%Function.prototype.apply%');
var $call = GetIntrinsic('%Function.prototype.call%');
var $reflectApply = GetIntrinsic('%Reflect.apply%', true) || bind.call($call, $apply);

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);
var $defineProperty = GetIntrinsic('%Object.defineProperty%', true);
var $max = GetIntrinsic('%Math.max%');

if ($defineProperty) {
	try {
		$defineProperty({}, 'a', { value: 1 });
	} catch (e) {
		// IE 8 has a broken defineProperty
		$defineProperty = null;
	}
}

module.exports = function callBind(originalFunction) {
	var func = $reflectApply(bind, $call, arguments);
	if ($gOPD && $defineProperty) {
		var desc = $gOPD(func, 'length');
		if (desc.configurable) {
			// original length, plus the receiver, minus any additional arguments (after the receiver)
			$defineProperty(
				func,
				'length',
				{ value: 1 + $max(0, originalFunction.length - (arguments.length - 1)) }
			);
		}
	}
	return func;
};

var applyBind = function applyBind() {
	return $reflectApply(bind, $apply, arguments);
};

if ($defineProperty) {
	$defineProperty(module.exports, 'apply', { value: applyBind });
} else {
	module.exports.apply = applyBind;
}
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/call-bind/index.js
,
// === functors[71] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var GetIntrinsic = require('get-intrinsic');

var callBind = require('./');

var $indexOf = callBind(GetIntrinsic('String.prototype.indexOf'));

module.exports = function callBoundIntrinsic(name, allowMissing) {
	var intrinsic = GetIntrinsic(name, !!allowMissing);
	if (typeof intrinsic === 'function' && $indexOf(name, '.prototype.') > -1) {
		return callBind(intrinsic);
	}
	return intrinsic;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/call-bind/callBound.js
,
// === functors[72] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var hasToStringTag = require('has-tostringtag/shams')();
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');

var isStandardArguments = function isArguments(value) {
	if (hasToStringTag && value && typeof value === 'object' && Symbol.toStringTag in value) {
		return false;
	}
	return $toString(value) === '[object Arguments]';
};

var isLegacyArguments = function isArguments(value) {
	if (isStandardArguments(value)) {
		return true;
	}
	return value !== null &&
		typeof value === 'object' &&
		typeof value.length === 'number' &&
		value.length >= 0 &&
		$toString(value) !== '[object Array]' &&
		$toString(value.callee) === '[object Function]';
};

var supportsStandardArguments = (function () {
	return isStandardArguments(arguments);
}());

isStandardArguments.isLegacyArguments = isLegacyArguments; // for tests

module.exports = supportsStandardArguments ? isStandardArguments : isLegacyArguments;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/is-arguments/index.js
,
// === functors[73] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var toStr = Object.prototype.toString;
var fnToStr = Function.prototype.toString;
var isFnRegex = /^\s*(?:function)?\*/;
var hasToStringTag = require('has-tostringtag/shams')();
var getProto = Object.getPrototypeOf;
var getGeneratorFunc = function () { // eslint-disable-line consistent-return
	if (!hasToStringTag) {
		return false;
	}
	try {
		return Function('return function*() {}')();
	} catch (e) {
	}
};
var GeneratorFunction;

module.exports = function isGeneratorFunction(fn) {
	if (typeof fn !== 'function') {
		return false;
	}
	if (isFnRegex.test(fnToStr.call(fn))) {
		return true;
	}
	if (!hasToStringTag) {
		var str = toStr.call(fn);
		return str === '[object GeneratorFunction]';
	}
	if (!getProto) {
		return false;
	}
	if (typeof GeneratorFunction === 'undefined') {
		var generatorFunc = getGeneratorFunc();
		GeneratorFunction = generatorFunc ? getProto(generatorFunc) : false;
	}
	return getProto(fn) === GeneratorFunction;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/is-generator-function/index.js
,
// === functors[74] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var fnToStr = Function.prototype.toString;
var reflectApply = typeof Reflect === 'object' && Reflect !== null && Reflect.apply;
var badArrayLike;
var isCallableMarker;
if (typeof reflectApply === 'function' && typeof Object.defineProperty === 'function') {
	try {
		badArrayLike = Object.defineProperty({}, 'length', {
			get: function () {
				throw isCallableMarker;
			}
		});
		isCallableMarker = {};
		// eslint-disable-next-line no-throw-literal
		reflectApply(function () { throw 42; }, null, badArrayLike);
	} catch (_) {
		if (_ !== isCallableMarker) {
			reflectApply = null;
		}
	}
} else {
	reflectApply = null;
}

var constructorRegex = /^\s*class\b/;
var isES6ClassFn = function isES6ClassFunction(value) {
	try {
		var fnStr = fnToStr.call(value);
		return constructorRegex.test(fnStr);
	} catch (e) {
		return false; // not a function
	}
};

var tryFunctionObject = function tryFunctionToStr(value) {
	try {
		if (isES6ClassFn(value)) { return false; }
		fnToStr.call(value);
		return true;
	} catch (e) {
		return false;
	}
};
var toStr = Object.prototype.toString;
var objectClass = '[object Object]';
var fnClass = '[object Function]';
var genClass = '[object GeneratorFunction]';
var ddaClass = '[object HTMLAllCollection]'; // IE 11
var ddaClass2 = '[object HTML document.all class]';
var ddaClass3 = '[object HTMLCollection]'; // IE 9-10
var hasToStringTag = typeof Symbol === 'function' && !!Symbol.toStringTag; // better: use `has-tostringtag`

var isIE68 = !(0 in [,]); // eslint-disable-line no-sparse-arrays, comma-spacing

var isDDA = function isDocumentDotAll() { return false; };
if (typeof document === 'object') {
	// Firefox 3 canonicalizes DDA to undefined when it's not accessed directly
	var all = document.all;
	if (toStr.call(all) === toStr.call(document.all)) {
		isDDA = function isDocumentDotAll(value) {
			/* globals document: false */
			// in IE 6-8, typeof document.all is "object" and it's truthy
			if ((isIE68 || !value) && (typeof value === 'undefined' || typeof value === 'object')) {
				try {
					var str = toStr.call(value);
					return (
						str === ddaClass
						|| str === ddaClass2
						|| str === ddaClass3 // opera 12.16
						|| str === objectClass // IE 6-8
					) && value('') == null; // eslint-disable-line eqeqeq
				} catch (e) { /**/ }
			}
			return false;
		};
	}
}

module.exports = reflectApply
	? function isCallable(value) {
		if (isDDA(value)) { return true; }
		if (!value) { return false; }
		if (typeof value !== 'function' && typeof value !== 'object') { return false; }
		try {
			reflectApply(value, null, badArrayLike);
		} catch (e) {
			if (e !== isCallableMarker) { return false; }
		}
		return !isES6ClassFn(value) && tryFunctionObject(value);
	}
	: function isCallable(value) {
		if (isDDA(value)) { return true; }
		if (!value) { return false; }
		if (typeof value !== 'function' && typeof value !== 'object') { return false; }
		if (hasToStringTag) { return tryFunctionObject(value); }
		if (isES6ClassFn(value)) { return false; }
		var strClass = toStr.call(value);
		if (strClass !== fnClass && strClass !== genClass && !(/^\[object HTML/).test(strClass)) { return false; }
		return tryFunctionObject(value);
	};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/is-callable/index.js
,
// === functors[75] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var isCallable = require('is-callable');

var toStr = Object.prototype.toString;
var hasOwnProperty = Object.prototype.hasOwnProperty;

var forEachArray = function forEachArray(array, iterator, receiver) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            if (receiver == null) {
                iterator(array[i], i, array);
            } else {
                iterator.call(receiver, array[i], i, array);
            }
        }
    }
};

var forEachString = function forEachString(string, iterator, receiver) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        if (receiver == null) {
            iterator(string.charAt(i), i, string);
        } else {
            iterator.call(receiver, string.charAt(i), i, string);
        }
    }
};

var forEachObject = function forEachObject(object, iterator, receiver) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            if (receiver == null) {
                iterator(object[k], k, object);
            } else {
                iterator.call(receiver, object[k], k, object);
            }
        }
    }
};

var forEach = function forEach(list, iterator, thisArg) {
    if (!isCallable(iterator)) {
        throw new TypeError('iterator must be a function');
    }

    var receiver;
    if (arguments.length >= 3) {
        receiver = thisArg;
    }

    if (toStr.call(list) === '[object Array]') {
        forEachArray(list, iterator, receiver);
    } else if (typeof list === 'string') {
        forEachString(list, iterator, receiver);
    } else {
        forEachObject(list, iterator, receiver);
    }
};

module.exports = forEach;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/for-each/index.js
,
// === functors[76] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var possibleNames = [
	'BigInt64Array',
	'BigUint64Array',
	'Float32Array',
	'Float64Array',
	'Int16Array',
	'Int32Array',
	'Int8Array',
	'Uint16Array',
	'Uint32Array',
	'Uint8Array',
	'Uint8ClampedArray'
];

var g = typeof globalThis === 'undefined' ? global : globalThis;

module.exports = function availableTypedArrays() {
	var out = [];
	for (var i = 0; i < possibleNames.length; i++) {
		if (typeof g[possibleNames[i]] === 'function') {
			out[out.length] = possibleNames[i];
		}
	}
	return out;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/available-typed-arrays/index.js
,
// === functors[77] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var GetIntrinsic = require('get-intrinsic');

var $gOPD = GetIntrinsic('%Object.getOwnPropertyDescriptor%', true);

if ($gOPD) {
	try {
		$gOPD([], 'length');
	} catch (e) {
		// IE 8 has a broken gOPD
		$gOPD = null;
	}
}

module.exports = $gOPD;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/gopd/index.js
,
// === functors[78] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var forEach = require('for-each');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');

var $toString = callBound('Object.prototype.toString');
var hasToStringTag = require('has-tostringtag/shams')();
var gOPD = require('gopd');

var g = typeof globalThis === 'undefined' ? global : globalThis;
var typedArrays = availableTypedArrays();

var $indexOf = callBound('Array.prototype.indexOf', true) || function indexOf(array, value) {
	for (var i = 0; i < array.length; i += 1) {
		if (array[i] === value) {
			return i;
		}
	}
	return -1;
};
var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		var arr = new g[typedArray]();
		if (Symbol.toStringTag in arr) {
			var proto = getPrototypeOf(arr);
			var descriptor = gOPD(proto, Symbol.toStringTag);
			if (!descriptor) {
				var superProto = getPrototypeOf(proto);
				descriptor = gOPD(superProto, Symbol.toStringTag);
			}
			toStrTags[typedArray] = descriptor.get;
		}
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var anyTrue = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!anyTrue) {
			try {
				anyTrue = getter.call(value) === typedArray;
			} catch (e) { /**/ }
		}
	});
	return anyTrue;
};

module.exports = function isTypedArray(value) {
	if (!value || typeof value !== 'object') { return false; }
	if (!hasToStringTag || !(Symbol.toStringTag in value)) {
		var tag = $slice($toString(value), 8, -1);
		return $indexOf(typedArrays, tag) > -1;
	}
	if (!gOPD) { return false; }
	return tryTypedArrays(value);
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/is-typed-array/index.js
,
// === functors[79] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var forEach = require('for-each');
var availableTypedArrays = require('available-typed-arrays');
var callBound = require('call-bind/callBound');
var gOPD = require('gopd');

var $toString = callBound('Object.prototype.toString');
var hasToStringTag = require('has-tostringtag/shams')();

var g = typeof globalThis === 'undefined' ? global : globalThis;
var typedArrays = availableTypedArrays();

var $slice = callBound('String.prototype.slice');
var toStrTags = {};
var getPrototypeOf = Object.getPrototypeOf; // require('getprototypeof');
if (hasToStringTag && gOPD && getPrototypeOf) {
	forEach(typedArrays, function (typedArray) {
		if (typeof g[typedArray] === 'function') {
			var arr = new g[typedArray]();
			if (Symbol.toStringTag in arr) {
				var proto = getPrototypeOf(arr);
				var descriptor = gOPD(proto, Symbol.toStringTag);
				if (!descriptor) {
					var superProto = getPrototypeOf(proto);
					descriptor = gOPD(superProto, Symbol.toStringTag);
				}
				toStrTags[typedArray] = descriptor.get;
			}
		}
	});
}

var tryTypedArrays = function tryAllTypedArrays(value) {
	var foundName = false;
	forEach(toStrTags, function (getter, typedArray) {
		if (!foundName) {
			try {
				var name = getter.call(value);
				if (name === typedArray) {
					foundName = name;
				}
			} catch (e) {}
		}
	});
	return foundName;
};

var isTypedArray = require('is-typed-array');

module.exports = function whichTypedArray(value) {
	if (!isTypedArray(value)) { return false; }
	if (!hasToStringTag || !(Symbol.toStringTag in value)) { return $slice($toString(value), 8, -1); }
	return tryTypedArrays(value);
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/which-typed-array/index.js
,
// === functors[80] ===
(function (require, exports, module, __filename, __dirname) { // Currently in sync with Node.js lib/internal/util/types.js
// https://github.com/nodejs/node/commit/112cc7c27551254aa2b17098fb774867f05ed0d9

'use strict';

var isArgumentsObject = require('is-arguments');
var isGeneratorFunction = require('is-generator-function');
var whichTypedArray = require('which-typed-array');
var isTypedArray = require('is-typed-array');

function uncurryThis(f) {
  return f.call.bind(f);
}

var BigIntSupported = typeof BigInt !== 'undefined';
var SymbolSupported = typeof Symbol !== 'undefined';

var ObjectToString = uncurryThis(Object.prototype.toString);

var numberValue = uncurryThis(Number.prototype.valueOf);
var stringValue = uncurryThis(String.prototype.valueOf);
var booleanValue = uncurryThis(Boolean.prototype.valueOf);

if (BigIntSupported) {
  var bigIntValue = uncurryThis(BigInt.prototype.valueOf);
}

if (SymbolSupported) {
  var symbolValue = uncurryThis(Symbol.prototype.valueOf);
}

function checkBoxedPrimitive(value, prototypeValueOf) {
  if (typeof value !== 'object') {
    return false;
  }
  try {
    prototypeValueOf(value);
    return true;
  } catch(e) {
    return false;
  }
}

exports.isArgumentsObject = isArgumentsObject;
exports.isGeneratorFunction = isGeneratorFunction;
exports.isTypedArray = isTypedArray;

// Taken from here and modified for better browser support
// https://github.com/sindresorhus/p-is-promise/blob/cda35a513bda03f977ad5cde3a079d237e82d7ef/index.js
function isPromise(input) {
	return (
		(
			typeof Promise !== 'undefined' &&
			input instanceof Promise
		) ||
		(
			input !== null &&
			typeof input === 'object' &&
			typeof input.then === 'function' &&
			typeof input.catch === 'function'
		)
	);
}
exports.isPromise = isPromise;

function isArrayBufferView(value) {
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
    return ArrayBuffer.isView(value);
  }

  return (
    isTypedArray(value) ||
    isDataView(value)
  );
}
exports.isArrayBufferView = isArrayBufferView;


function isUint8Array(value) {
  return whichTypedArray(value) === 'Uint8Array';
}
exports.isUint8Array = isUint8Array;

function isUint8ClampedArray(value) {
  return whichTypedArray(value) === 'Uint8ClampedArray';
}
exports.isUint8ClampedArray = isUint8ClampedArray;

function isUint16Array(value) {
  return whichTypedArray(value) === 'Uint16Array';
}
exports.isUint16Array = isUint16Array;

function isUint32Array(value) {
  return whichTypedArray(value) === 'Uint32Array';
}
exports.isUint32Array = isUint32Array;

function isInt8Array(value) {
  return whichTypedArray(value) === 'Int8Array';
}
exports.isInt8Array = isInt8Array;

function isInt16Array(value) {
  return whichTypedArray(value) === 'Int16Array';
}
exports.isInt16Array = isInt16Array;

function isInt32Array(value) {
  return whichTypedArray(value) === 'Int32Array';
}
exports.isInt32Array = isInt32Array;

function isFloat32Array(value) {
  return whichTypedArray(value) === 'Float32Array';
}
exports.isFloat32Array = isFloat32Array;

function isFloat64Array(value) {
  return whichTypedArray(value) === 'Float64Array';
}
exports.isFloat64Array = isFloat64Array;

function isBigInt64Array(value) {
  return whichTypedArray(value) === 'BigInt64Array';
}
exports.isBigInt64Array = isBigInt64Array;

function isBigUint64Array(value) {
  return whichTypedArray(value) === 'BigUint64Array';
}
exports.isBigUint64Array = isBigUint64Array;

function isMapToString(value) {
  return ObjectToString(value) === '[object Map]';
}
isMapToString.working = (
  typeof Map !== 'undefined' &&
  isMapToString(new Map())
);

function isMap(value) {
  if (typeof Map === 'undefined') {
    return false;
  }

  return isMapToString.working
    ? isMapToString(value)
    : value instanceof Map;
}
exports.isMap = isMap;

function isSetToString(value) {
  return ObjectToString(value) === '[object Set]';
}
isSetToString.working = (
  typeof Set !== 'undefined' &&
  isSetToString(new Set())
);
function isSet(value) {
  if (typeof Set === 'undefined') {
    return false;
  }

  return isSetToString.working
    ? isSetToString(value)
    : value instanceof Set;
}
exports.isSet = isSet;

function isWeakMapToString(value) {
  return ObjectToString(value) === '[object WeakMap]';
}
isWeakMapToString.working = (
  typeof WeakMap !== 'undefined' &&
  isWeakMapToString(new WeakMap())
);
function isWeakMap(value) {
  if (typeof WeakMap === 'undefined') {
    return false;
  }

  return isWeakMapToString.working
    ? isWeakMapToString(value)
    : value instanceof WeakMap;
}
exports.isWeakMap = isWeakMap;

function isWeakSetToString(value) {
  return ObjectToString(value) === '[object WeakSet]';
}
isWeakSetToString.working = (
  typeof WeakSet !== 'undefined' &&
  isWeakSetToString(new WeakSet())
);
function isWeakSet(value) {
  return isWeakSetToString(value);
}
exports.isWeakSet = isWeakSet;

function isArrayBufferToString(value) {
  return ObjectToString(value) === '[object ArrayBuffer]';
}
isArrayBufferToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  isArrayBufferToString(new ArrayBuffer())
);
function isArrayBuffer(value) {
  if (typeof ArrayBuffer === 'undefined') {
    return false;
  }

  return isArrayBufferToString.working
    ? isArrayBufferToString(value)
    : value instanceof ArrayBuffer;
}
exports.isArrayBuffer = isArrayBuffer;

function isDataViewToString(value) {
  return ObjectToString(value) === '[object DataView]';
}
isDataViewToString.working = (
  typeof ArrayBuffer !== 'undefined' &&
  typeof DataView !== 'undefined' &&
  isDataViewToString(new DataView(new ArrayBuffer(1), 0, 1))
);
function isDataView(value) {
  if (typeof DataView === 'undefined') {
    return false;
  }

  return isDataViewToString.working
    ? isDataViewToString(value)
    : value instanceof DataView;
}
exports.isDataView = isDataView;

// Store a copy of SharedArrayBuffer in case it's deleted elsewhere
var SharedArrayBufferCopy = typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : undefined;
function isSharedArrayBufferToString(value) {
  return ObjectToString(value) === '[object SharedArrayBuffer]';
}
function isSharedArrayBuffer(value) {
  if (typeof SharedArrayBufferCopy === 'undefined') {
    return false;
  }

  if (typeof isSharedArrayBufferToString.working === 'undefined') {
    isSharedArrayBufferToString.working = isSharedArrayBufferToString(new SharedArrayBufferCopy());
  }

  return isSharedArrayBufferToString.working
    ? isSharedArrayBufferToString(value)
    : value instanceof SharedArrayBufferCopy;
}
exports.isSharedArrayBuffer = isSharedArrayBuffer;

function isAsyncFunction(value) {
  return ObjectToString(value) === '[object AsyncFunction]';
}
exports.isAsyncFunction = isAsyncFunction;

function isMapIterator(value) {
  return ObjectToString(value) === '[object Map Iterator]';
}
exports.isMapIterator = isMapIterator;

function isSetIterator(value) {
  return ObjectToString(value) === '[object Set Iterator]';
}
exports.isSetIterator = isSetIterator;

function isGeneratorObject(value) {
  return ObjectToString(value) === '[object Generator]';
}
exports.isGeneratorObject = isGeneratorObject;

function isWebAssemblyCompiledModule(value) {
  return ObjectToString(value) === '[object WebAssembly.Module]';
}
exports.isWebAssemblyCompiledModule = isWebAssemblyCompiledModule;

function isNumberObject(value) {
  return checkBoxedPrimitive(value, numberValue);
}
exports.isNumberObject = isNumberObject;

function isStringObject(value) {
  return checkBoxedPrimitive(value, stringValue);
}
exports.isStringObject = isStringObject;

function isBooleanObject(value) {
  return checkBoxedPrimitive(value, booleanValue);
}
exports.isBooleanObject = isBooleanObject;

function isBigIntObject(value) {
  return BigIntSupported && checkBoxedPrimitive(value, bigIntValue);
}
exports.isBigIntObject = isBigIntObject;

function isSymbolObject(value) {
  return SymbolSupported && checkBoxedPrimitive(value, symbolValue);
}
exports.isSymbolObject = isSymbolObject;

function isBoxedPrimitive(value) {
  return (
    isNumberObject(value) ||
    isStringObject(value) ||
    isBooleanObject(value) ||
    isBigIntObject(value) ||
    isSymbolObject(value)
  );
}
exports.isBoxedPrimitive = isBoxedPrimitive;

function isAnyArrayBuffer(value) {
  return typeof Uint8Array !== 'undefined' && (
    isArrayBuffer(value) ||
    isSharedArrayBuffer(value)
  );
}
exports.isAnyArrayBuffer = isAnyArrayBuffer;

['isProxy', 'isExternal', 'isModuleNamespaceObject'].forEach(function(method) {
  Object.defineProperty(exports, method, {
    enumerable: false,
    value: function() {
      throw new Error(method + ' is not supported in userland');
    }
  });
});
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/util/support/types.js
,
// === functors[81] ===
(function (require, exports, module, __filename, __dirname) { module.exports = function isBuffer(arg) {
  return arg instanceof Buffer;
}
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/util/support/isBuffer.js
,
// === functors[82] ===
(function (require, exports, module, __filename, __dirname) { if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      ctor.prototype = Object.create(superCtor.prototype, {
        constructor: {
          value: ctor,
          enumerable: false,
          writable: true,
          configurable: true
        }
      })
    }
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    if (superCtor) {
      ctor.super_ = superCtor
      var TempCtor = function () {}
      TempCtor.prototype = superCtor.prototype
      ctor.prototype = new TempCtor()
      ctor.prototype.constructor = ctor
    }
  }
}
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/inherits/inherits_browser.js
,
// === functors[83] ===
(function (require, exports, module, __filename, __dirname) { try {
  var util = require('util');
  /* istanbul ignore next */
  if (typeof util.inherits !== 'function') throw '';
  module.exports = util.inherits;
} catch (e) {
  /* istanbul ignore next */
  module.exports = require('./inherits_browser.js');
}
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/inherits/inherits.js
,
// === functors[84] ===
(function (require, exports, module, __filename, __dirname) { // Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var getOwnPropertyDescriptors = Object.getOwnPropertyDescriptors ||
  function getOwnPropertyDescriptors(obj) {
    var keys = Object.keys(obj);
    var descriptors = {};
    for (var i = 0; i < keys.length; i++) {
      descriptors[keys[i]] = Object.getOwnPropertyDescriptor(obj, keys[i]);
    }
    return descriptors;
  };

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  if (typeof process !== 'undefined' && process.noDeprecation === true) {
    return fn;
  }

  // Allow for deprecating things in the process of starting up.
  if (typeof process === 'undefined') {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnvRegex = /^$/;

if (process.env.NODE_DEBUG) {
  var debugEnv = process.env.NODE_DEBUG;
  debugEnv = debugEnv.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/,/g, '$|^')
    .toUpperCase();
  debugEnvRegex = new RegExp('^' + debugEnv + '$', 'i');
}
exports.debuglog = function(set) {
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (debugEnvRegex.test(set)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').slice(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.slice(1, -1);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
exports.types = require('./support/types');

function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;
exports.types.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;
exports.types.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;
exports.types.isNativeError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

var kCustomPromisifiedSymbol = typeof Symbol !== 'undefined' ? Symbol('util.promisify.custom') : undefined;

exports.promisify = function promisify(original) {
  if (typeof original !== 'function')
    throw new TypeError('The "original" argument must be of type Function');

  if (kCustomPromisifiedSymbol && original[kCustomPromisifiedSymbol]) {
    var fn = original[kCustomPromisifiedSymbol];
    if (typeof fn !== 'function') {
      throw new TypeError('The "util.promisify.custom" argument must be of type Function');
    }
    Object.defineProperty(fn, kCustomPromisifiedSymbol, {
      value: fn, enumerable: false, writable: false, configurable: true
    });
    return fn;
  }

  function fn() {
    var promiseResolve, promiseReject;
    var promise = new Promise(function (resolve, reject) {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }
    args.push(function (err, value) {
      if (err) {
        promiseReject(err);
      } else {
        promiseResolve(value);
      }
    });

    try {
      original.apply(this, args);
    } catch (err) {
      promiseReject(err);
    }

    return promise;
  }

  Object.setPrototypeOf(fn, Object.getPrototypeOf(original));

  if (kCustomPromisifiedSymbol) Object.defineProperty(fn, kCustomPromisifiedSymbol, {
    value: fn, enumerable: false, writable: false, configurable: true
  });
  return Object.defineProperties(
    fn,
    getOwnPropertyDescriptors(original)
  );
}

exports.promisify.custom = kCustomPromisifiedSymbol

function callbackifyOnRejected(reason, cb) {
  // `!reason` guard inspired by bluebird (Ref: https://goo.gl/t5IS6M).
  // Because `null` is a special error value in callbacks which means "no error
  // occurred", we error-wrap so the callback consumer can distinguish between
  // "the promise rejected with null" or "the promise fulfilled with undefined".
  if (!reason) {
    var newReason = new Error('Promise was rejected with a falsy value');
    newReason.reason = reason;
    reason = newReason;
  }
  return cb(reason);
}

function callbackify(original) {
  if (typeof original !== 'function') {
    throw new TypeError('The "original" argument must be of type Function');
  }

  // We DO NOT return the promise as it gives the user a false sense that
  // the promise is actually somehow related to the callback's execution
  // and that the callback throwing will reject the promise.
  function callbackified() {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args.push(arguments[i]);
    }

    var maybeCb = args.pop();
    if (typeof maybeCb !== 'function') {
      throw new TypeError('The last argument must be of type Function');
    }
    var self = this;
    var cb = function() {
      return maybeCb.apply(self, arguments);
    };
    // In true node style we process the callback on `nextTick` with all the
    // implications (stack, `uncaughtException`, `async_hooks`)
    original.apply(this, args)
      .then(function(ret) { process.nextTick(cb.bind(null, null, ret)) },
            function(rej) { process.nextTick(callbackifyOnRejected.bind(null, rej, cb)) });
  }

  Object.setPrototypeOf(callbackified, Object.getPrototypeOf(original));
  Object.defineProperties(callbackified,
                          getOwnPropertyDescriptors(original));
  return callbackified;
}
exports.callbackify = callbackify;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/util/util.js
,
// === functors[85] ===
(function (require, exports, module, __filename, __dirname) { /*! https://mths.be/punycode v1.4.1 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports &&
		!exports.nodeType && exports;
	var freeModule = typeof module == 'object' && module &&
		!module.nodeType && module;
	var freeGlobal = typeof global == 'object' && global;
	if (
		freeGlobal.global === freeGlobal ||
		freeGlobal.window === freeGlobal ||
		freeGlobal.self === freeGlobal
	) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^\x20-\x7E]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /[\x2E\u3002\uFF0E\uFF61]/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw new RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		var result = [];
		while (length--) {
			result[length] = fn(array[length]);
		}
		return result;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings or email
	 * addresses.
	 * @private
	 * @param {String} domain The domain name or email address.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		var parts = string.split('@');
		var result = '';
		if (parts.length > 1) {
			// In email addresses, only the domain name should be punycoded. Leave
			// the local part (i.e. everything up to `@`) intact.
			result = parts[0] + '@';
			string = parts[1];
		}
		// Avoid `split(regex)` for IE8 compatibility. See #17.
		string = string.replace(regexSeparators, '\x2E');
		var labels = string.split('.');
		var encoded = map(labels, fn).join('.');
		return result + encoded;
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <https://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * https://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols (e.g. a domain name label) to a
	 * Punycode string of ASCII-only symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name or an email address
	 * to Unicode. Only the Punycoded parts of the input will be converted, i.e.
	 * it doesn't matter if you call it on a string that has already been
	 * converted to Unicode.
	 * @memberOf punycode
	 * @param {String} input The Punycoded domain name or email address to
	 * convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(input) {
		return mapDomain(input, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name or an email address to
	 * Punycode. Only the non-ASCII parts of the domain name will be converted,
	 * i.e. it doesn't matter if you call it with a domain that's already in
	 * ASCII.
	 * @memberOf punycode
	 * @param {String} input The domain name or email address to convert, as a
	 * Unicode string.
	 * @returns {String} The Punycode representation of the given domain name or
	 * email address.
	 */
	function toASCII(input) {
		return mapDomain(input, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.4.1',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <https://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && freeModule) {
		if (module.exports == freeExports) {
			// in Node.js, io.js, or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else {
			// in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else {
		// in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/packages/daemon/node_modules/punycode/punycode.js
,
// === functors[86] ===
(function (require, exports, module, __filename, __dirname) { module.exports = require('util').inspect;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/object-inspect/util.inspect.js
,
// === functors[87] ===
(function (require, exports, module, __filename, __dirname) { var hasMap = typeof Map === 'function' && Map.prototype;
var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, 'size') : null;
var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === 'function' ? mapSizeDescriptor.get : null;
var mapForEach = hasMap && Map.prototype.forEach;
var hasSet = typeof Set === 'function' && Set.prototype;
var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, 'size') : null;
var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === 'function' ? setSizeDescriptor.get : null;
var setForEach = hasSet && Set.prototype.forEach;
var hasWeakMap = typeof WeakMap === 'function' && WeakMap.prototype;
var weakMapHas = hasWeakMap ? WeakMap.prototype.has : null;
var hasWeakSet = typeof WeakSet === 'function' && WeakSet.prototype;
var weakSetHas = hasWeakSet ? WeakSet.prototype.has : null;
var hasWeakRef = typeof WeakRef === 'function' && WeakRef.prototype;
var weakRefDeref = hasWeakRef ? WeakRef.prototype.deref : null;
var booleanValueOf = Boolean.prototype.valueOf;
var objectToString = Object.prototype.toString;
var functionToString = Function.prototype.toString;
var $match = String.prototype.match;
var $slice = String.prototype.slice;
var $replace = String.prototype.replace;
var $toUpperCase = String.prototype.toUpperCase;
var $toLowerCase = String.prototype.toLowerCase;
var $test = RegExp.prototype.test;
var $concat = Array.prototype.concat;
var $join = Array.prototype.join;
var $arrSlice = Array.prototype.slice;
var $floor = Math.floor;
var bigIntValueOf = typeof BigInt === 'function' ? BigInt.prototype.valueOf : null;
var gOPS = Object.getOwnPropertySymbols;
var symToString = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? Symbol.prototype.toString : null;
var hasShammedSymbols = typeof Symbol === 'function' && typeof Symbol.iterator === 'object';
// ie, `has-tostringtag/shams
var toStringTag = typeof Symbol === 'function' && Symbol.toStringTag && (typeof Symbol.toStringTag === hasShammedSymbols ? 'object' : 'symbol')
    ? Symbol.toStringTag
    : null;
var isEnumerable = Object.prototype.propertyIsEnumerable;

var gPO = (typeof Reflect === 'function' ? Reflect.getPrototypeOf : Object.getPrototypeOf) || (
    [].__proto__ === Array.prototype // eslint-disable-line no-proto
        ? function (O) {
            return O.__proto__; // eslint-disable-line no-proto
        }
        : null
);

function addNumericSeparator(num, str) {
    if (
        num === Infinity
        || num === -Infinity
        || num !== num
        || (num && num > -1000 && num < 1000)
        || $test.call(/e/, str)
    ) {
        return str;
    }
    var sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
    if (typeof num === 'number') {
        var int = num < 0 ? -$floor(-num) : $floor(num); // trunc(num)
        if (int !== num) {
            var intStr = String(int);
            var dec = $slice.call(str, intStr.length + 1);
            return $replace.call(intStr, sepRegex, '$&_') + '.' + $replace.call($replace.call(dec, /([0-9]{3})/g, '$&_'), /_$/, '');
        }
    }
    return $replace.call(str, sepRegex, '$&_');
}

var utilInspect = require('./util.inspect');
var inspectCustom = utilInspect.custom;
var inspectSymbol = isSymbol(inspectCustom) ? inspectCustom : null;

module.exports = function inspect_(obj, options, depth, seen) {
    var opts = options || {};

    if (has(opts, 'quoteStyle') && (opts.quoteStyle !== 'single' && opts.quoteStyle !== 'double')) {
        throw new TypeError('option "quoteStyle" must be "single" or "double"');
    }
    if (
        has(opts, 'maxStringLength') && (typeof opts.maxStringLength === 'number'
            ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity
            : opts.maxStringLength !== null
        )
    ) {
        throw new TypeError('option "maxStringLength", if provided, must be a positive integer, Infinity, or `null`');
    }
    var customInspect = has(opts, 'customInspect') ? opts.customInspect : true;
    if (typeof customInspect !== 'boolean' && customInspect !== 'symbol') {
        throw new TypeError('option "customInspect", if provided, must be `true`, `false`, or `\'symbol\'`');
    }

    if (
        has(opts, 'indent')
        && opts.indent !== null
        && opts.indent !== '\t'
        && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)
    ) {
        throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
    }
    if (has(opts, 'numericSeparator') && typeof opts.numericSeparator !== 'boolean') {
        throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
    }
    var numericSeparator = opts.numericSeparator;

    if (typeof obj === 'undefined') {
        return 'undefined';
    }
    if (obj === null) {
        return 'null';
    }
    if (typeof obj === 'boolean') {
        return obj ? 'true' : 'false';
    }

    if (typeof obj === 'string') {
        return inspectString(obj, opts);
    }
    if (typeof obj === 'number') {
        if (obj === 0) {
            return Infinity / obj > 0 ? '0' : '-0';
        }
        var str = String(obj);
        return numericSeparator ? addNumericSeparator(obj, str) : str;
    }
    if (typeof obj === 'bigint') {
        var bigIntStr = String(obj) + 'n';
        return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
    }

    var maxDepth = typeof opts.depth === 'undefined' ? 5 : opts.depth;
    if (typeof depth === 'undefined') { depth = 0; }
    if (depth >= maxDepth && maxDepth > 0 && typeof obj === 'object') {
        return isArray(obj) ? '[Array]' : '[Object]';
    }

    var indent = getIndent(opts, depth);

    if (typeof seen === 'undefined') {
        seen = [];
    } else if (indexOf(seen, obj) >= 0) {
        return '[Circular]';
    }

    function inspect(value, from, noIndent) {
        if (from) {
            seen = $arrSlice.call(seen);
            seen.push(from);
        }
        if (noIndent) {
            var newOpts = {
                depth: opts.depth
            };
            if (has(opts, 'quoteStyle')) {
                newOpts.quoteStyle = opts.quoteStyle;
            }
            return inspect_(value, newOpts, depth + 1, seen);
        }
        return inspect_(value, opts, depth + 1, seen);
    }

    if (typeof obj === 'function' && !isRegExp(obj)) { // in older engines, regexes are callable
        var name = nameOf(obj);
        var keys = arrObjKeys(obj, inspect);
        return '[Function' + (name ? ': ' + name : ' (anonymous)') + ']' + (keys.length > 0 ? ' { ' + $join.call(keys, ', ') + ' }' : '');
    }
    if (isSymbol(obj)) {
        var symString = hasShammedSymbols ? $replace.call(String(obj), /^(Symbol\(.*\))_[^)]*$/, '$1') : symToString.call(obj);
        return typeof obj === 'object' && !hasShammedSymbols ? markBoxed(symString) : symString;
    }
    if (isElement(obj)) {
        var s = '<' + $toLowerCase.call(String(obj.nodeName));
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
            s += ' ' + attrs[i].name + '=' + wrapQuotes(quote(attrs[i].value), 'double', opts);
        }
        s += '>';
        if (obj.childNodes && obj.childNodes.length) { s += '...'; }
        s += '</' + $toLowerCase.call(String(obj.nodeName)) + '>';
        return s;
    }
    if (isArray(obj)) {
        if (obj.length === 0) { return '[]'; }
        var xs = arrObjKeys(obj, inspect);
        if (indent && !singleLineValues(xs)) {
            return '[' + indentedJoin(xs, indent) + ']';
        }
        return '[ ' + $join.call(xs, ', ') + ' ]';
    }
    if (isError(obj)) {
        var parts = arrObjKeys(obj, inspect);
        if (!('cause' in Error.prototype) && 'cause' in obj && !isEnumerable.call(obj, 'cause')) {
            return '{ [' + String(obj) + '] ' + $join.call($concat.call('[cause]: ' + inspect(obj.cause), parts), ', ') + ' }';
        }
        if (parts.length === 0) { return '[' + String(obj) + ']'; }
        return '{ [' + String(obj) + '] ' + $join.call(parts, ', ') + ' }';
    }
    if (typeof obj === 'object' && customInspect) {
        if (inspectSymbol && typeof obj[inspectSymbol] === 'function' && utilInspect) {
            return utilInspect(obj, { depth: maxDepth - depth });
        } else if (customInspect !== 'symbol' && typeof obj.inspect === 'function') {
            return obj.inspect();
        }
    }
    if (isMap(obj)) {
        var mapParts = [];
        if (mapForEach) {
            mapForEach.call(obj, function (value, key) {
                mapParts.push(inspect(key, obj, true) + ' => ' + inspect(value, obj));
            });
        }
        return collectionOf('Map', mapSize.call(obj), mapParts, indent);
    }
    if (isSet(obj)) {
        var setParts = [];
        if (setForEach) {
            setForEach.call(obj, function (value) {
                setParts.push(inspect(value, obj));
            });
        }
        return collectionOf('Set', setSize.call(obj), setParts, indent);
    }
    if (isWeakMap(obj)) {
        return weakCollectionOf('WeakMap');
    }
    if (isWeakSet(obj)) {
        return weakCollectionOf('WeakSet');
    }
    if (isWeakRef(obj)) {
        return weakCollectionOf('WeakRef');
    }
    if (isNumber(obj)) {
        return markBoxed(inspect(Number(obj)));
    }
    if (isBigInt(obj)) {
        return markBoxed(inspect(bigIntValueOf.call(obj)));
    }
    if (isBoolean(obj)) {
        return markBoxed(booleanValueOf.call(obj));
    }
    if (isString(obj)) {
        return markBoxed(inspect(String(obj)));
    }
    if (!isDate(obj) && !isRegExp(obj)) {
        var ys = arrObjKeys(obj, inspect);
        var isPlainObject = gPO ? gPO(obj) === Object.prototype : obj instanceof Object || obj.constructor === Object;
        var protoTag = obj instanceof Object ? '' : 'null prototype';
        var stringTag = !isPlainObject && toStringTag && Object(obj) === obj && toStringTag in obj ? $slice.call(toStr(obj), 8, -1) : protoTag ? 'Object' : '';
        var constructorTag = isPlainObject || typeof obj.constructor !== 'function' ? '' : obj.constructor.name ? obj.constructor.name + ' ' : '';
        var tag = constructorTag + (stringTag || protoTag ? '[' + $join.call($concat.call([], stringTag || [], protoTag || []), ': ') + '] ' : '');
        if (ys.length === 0) { return tag + '{}'; }
        if (indent) {
            return tag + '{' + indentedJoin(ys, indent) + '}';
        }
        return tag + '{ ' + $join.call(ys, ', ') + ' }';
    }
    return String(obj);
};

function wrapQuotes(s, defaultStyle, opts) {
    var quoteChar = (opts.quoteStyle || defaultStyle) === 'double' ? '"' : "'";
    return quoteChar + s + quoteChar;
}

function quote(s) {
    return $replace.call(String(s), /"/g, '&quot;');
}

function isArray(obj) { return toStr(obj) === '[object Array]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isDate(obj) { return toStr(obj) === '[object Date]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isRegExp(obj) { return toStr(obj) === '[object RegExp]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isError(obj) { return toStr(obj) === '[object Error]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isString(obj) { return toStr(obj) === '[object String]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isNumber(obj) { return toStr(obj) === '[object Number]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }
function isBoolean(obj) { return toStr(obj) === '[object Boolean]' && (!toStringTag || !(typeof obj === 'object' && toStringTag in obj)); }

// Symbol and BigInt do have Symbol.toStringTag by spec, so that can't be used to eliminate false positives
function isSymbol(obj) {
    if (hasShammedSymbols) {
        return obj && typeof obj === 'object' && obj instanceof Symbol;
    }
    if (typeof obj === 'symbol') {
        return true;
    }
    if (!obj || typeof obj !== 'object' || !symToString) {
        return false;
    }
    try {
        symToString.call(obj);
        return true;
    } catch (e) {}
    return false;
}

function isBigInt(obj) {
    if (!obj || typeof obj !== 'object' || !bigIntValueOf) {
        return false;
    }
    try {
        bigIntValueOf.call(obj);
        return true;
    } catch (e) {}
    return false;
}

var hasOwn = Object.prototype.hasOwnProperty || function (key) { return key in this; };
function has(obj, key) {
    return hasOwn.call(obj, key);
}

function toStr(obj) {
    return objectToString.call(obj);
}

function nameOf(f) {
    if (f.name) { return f.name; }
    var m = $match.call(functionToString.call(f), /^function\s*([\w$]+)/);
    if (m) { return m[1]; }
    return null;
}

function indexOf(xs, x) {
    if (xs.indexOf) { return xs.indexOf(x); }
    for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) { return i; }
    }
    return -1;
}

function isMap(x) {
    if (!mapSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        mapSize.call(x);
        try {
            setSize.call(x);
        } catch (s) {
            return true;
        }
        return x instanceof Map; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakMap(x) {
    if (!weakMapHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakMapHas.call(x, weakMapHas);
        try {
            weakSetHas.call(x, weakSetHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakMap; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakRef(x) {
    if (!weakRefDeref || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakRefDeref.call(x);
        return true;
    } catch (e) {}
    return false;
}

function isSet(x) {
    if (!setSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        setSize.call(x);
        try {
            mapSize.call(x);
        } catch (m) {
            return true;
        }
        return x instanceof Set; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakSet(x) {
    if (!weakSetHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakSetHas.call(x, weakSetHas);
        try {
            weakMapHas.call(x, weakMapHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakSet; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isElement(x) {
    if (!x || typeof x !== 'object') { return false; }
    if (typeof HTMLElement !== 'undefined' && x instanceof HTMLElement) {
        return true;
    }
    return typeof x.nodeName === 'string' && typeof x.getAttribute === 'function';
}

function inspectString(str, opts) {
    if (str.length > opts.maxStringLength) {
        var remaining = str.length - opts.maxStringLength;
        var trailer = '... ' + remaining + ' more character' + (remaining > 1 ? 's' : '');
        return inspectString($slice.call(str, 0, opts.maxStringLength), opts) + trailer;
    }
    // eslint-disable-next-line no-control-regex
    var s = $replace.call($replace.call(str, /(['\\])/g, '\\$1'), /[\x00-\x1f]/g, lowbyte);
    return wrapQuotes(s, 'single', opts);
}

function lowbyte(c) {
    var n = c.charCodeAt(0);
    var x = {
        8: 'b',
        9: 't',
        10: 'n',
        12: 'f',
        13: 'r'
    }[n];
    if (x) { return '\\' + x; }
    return '\\x' + (n < 0x10 ? '0' : '') + $toUpperCase.call(n.toString(16));
}

function markBoxed(str) {
    return 'Object(' + str + ')';
}

function weakCollectionOf(type) {
    return type + ' { ? }';
}

function collectionOf(type, size, entries, indent) {
    var joinedEntries = indent ? indentedJoin(entries, indent) : $join.call(entries, ', ');
    return type + ' (' + size + ') {' + joinedEntries + '}';
}

function singleLineValues(xs) {
    for (var i = 0; i < xs.length; i++) {
        if (indexOf(xs[i], '\n') >= 0) {
            return false;
        }
    }
    return true;
}

function getIndent(opts, depth) {
    var baseIndent;
    if (opts.indent === '\t') {
        baseIndent = '\t';
    } else if (typeof opts.indent === 'number' && opts.indent > 0) {
        baseIndent = $join.call(Array(opts.indent + 1), ' ');
    } else {
        return null;
    }
    return {
        base: baseIndent,
        prev: $join.call(Array(depth + 1), baseIndent)
    };
}

function indentedJoin(xs, indent) {
    if (xs.length === 0) { return ''; }
    var lineJoiner = '\n' + indent.prev + indent.base;
    return lineJoiner + $join.call(xs, ',' + lineJoiner) + '\n' + indent.prev;
}

function arrObjKeys(obj, inspect) {
    var isArr = isArray(obj);
    var xs = [];
    if (isArr) {
        xs.length = obj.length;
        for (var i = 0; i < obj.length; i++) {
            xs[i] = has(obj, i) ? inspect(obj[i], obj) : '';
        }
    }
    var syms = typeof gOPS === 'function' ? gOPS(obj) : [];
    var symMap;
    if (hasShammedSymbols) {
        symMap = {};
        for (var k = 0; k < syms.length; k++) {
            symMap['$' + syms[k]] = syms[k];
        }
    }

    for (var key in obj) { // eslint-disable-line no-restricted-syntax
        if (!has(obj, key)) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (isArr && String(Number(key)) === key && key < obj.length) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (hasShammedSymbols && symMap['$' + key] instanceof Symbol) {
            // this is to prevent shammed Symbols, which are stored as strings, from being included in the string key section
            continue; // eslint-disable-line no-restricted-syntax, no-continue
        } else if ($test.call(/[^\w$]/, key)) {
            xs.push(inspect(key, obj) + ': ' + inspect(obj[key], obj));
        } else {
            xs.push(key + ': ' + inspect(obj[key], obj));
        }
    }
    if (typeof gOPS === 'function') {
        for (var j = 0; j < syms.length; j++) {
            if (isEnumerable.call(obj, syms[j])) {
                xs.push('[' + inspect(syms[j]) + ']: ' + inspect(obj[syms[j]], obj));
            }
        }
    }
    return xs;
}
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/object-inspect/index.js
,
// === functors[88] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var GetIntrinsic = require('get-intrinsic');
var callBound = require('call-bind/callBound');
var inspect = require('object-inspect');

var $TypeError = GetIntrinsic('%TypeError%');
var $WeakMap = GetIntrinsic('%WeakMap%', true);
var $Map = GetIntrinsic('%Map%', true);

var $weakMapGet = callBound('WeakMap.prototype.get', true);
var $weakMapSet = callBound('WeakMap.prototype.set', true);
var $weakMapHas = callBound('WeakMap.prototype.has', true);
var $mapGet = callBound('Map.prototype.get', true);
var $mapSet = callBound('Map.prototype.set', true);
var $mapHas = callBound('Map.prototype.has', true);

/*
 * This function traverses the list returning the node corresponding to the
 * given key.
 *
 * That node is also moved to the head of the list, so that if it's accessed
 * again we don't need to traverse the whole list. By doing so, all the recently
 * used nodes can be accessed relatively quickly.
 */
var listGetNode = function (list, key) { // eslint-disable-line consistent-return
	for (var prev = list, curr; (curr = prev.next) !== null; prev = curr) {
		if (curr.key === key) {
			prev.next = curr.next;
			curr.next = list.next;
			list.next = curr; // eslint-disable-line no-param-reassign
			return curr;
		}
	}
};

var listGet = function (objects, key) {
	var node = listGetNode(objects, key);
	return node && node.value;
};
var listSet = function (objects, key, value) {
	var node = listGetNode(objects, key);
	if (node) {
		node.value = value;
	} else {
		// Prepend the new node to the beginning of the list
		objects.next = { // eslint-disable-line no-param-reassign
			key: key,
			next: objects.next,
			value: value
		};
	}
};
var listHas = function (objects, key) {
	return !!listGetNode(objects, key);
};

module.exports = function getSideChannel() {
	var $wm;
	var $m;
	var $o;
	var channel = {
		assert: function (key) {
			if (!channel.has(key)) {
				throw new $TypeError('Side channel does not contain ' + inspect(key));
			}
		},
		get: function (key) { // eslint-disable-line consistent-return
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapGet($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapGet($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listGet($o, key);
				}
			}
		},
		has: function (key) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if ($wm) {
					return $weakMapHas($wm, key);
				}
			} else if ($Map) {
				if ($m) {
					return $mapHas($m, key);
				}
			} else {
				if ($o) { // eslint-disable-line no-lonely-if
					return listHas($o, key);
				}
			}
			return false;
		},
		set: function (key, value) {
			if ($WeakMap && key && (typeof key === 'object' || typeof key === 'function')) {
				if (!$wm) {
					$wm = new $WeakMap();
				}
				$weakMapSet($wm, key, value);
			} else if ($Map) {
				if (!$m) {
					$m = new $Map();
				}
				$mapSet($m, key, value);
			} else {
				if (!$o) {
					/*
					 * Initialize the linked list as an empty node, so that we don't have
					 * to special-case handling of the first node: we can always refer to
					 * it as (previous node).next, instead of something like (list).head
					 */
					$o = { key: {}, next: null };
				}
				listSet($o, key, value);
			}
		}
	};
	return channel;
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/side-channel/index.js
,
// === functors[89] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var replace = String.prototype.replace;
var percentTwenties = /%20/g;

var Format = {
    RFC1738: 'RFC1738',
    RFC3986: 'RFC3986'
};

module.exports = {
    'default': Format.RFC3986,
    formatters: {
        RFC1738: function (value) {
            return replace.call(value, percentTwenties, '+');
        },
        RFC3986: function (value) {
            return String(value);
        }
    },
    RFC1738: Format.RFC1738,
    RFC3986: Format.RFC3986
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/qs/lib/formats.js
,
// === functors[90] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var formats = require('./formats');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var hexTable = (function () {
    var array = [];
    for (var i = 0; i < 256; ++i) {
        array.push('%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase());
    }

    return array;
}());

var compactQueue = function compactQueue(queue) {
    while (queue.length > 1) {
        var item = queue.pop();
        var obj = item.obj[item.prop];

        if (isArray(obj)) {
            var compacted = [];

            for (var j = 0; j < obj.length; ++j) {
                if (typeof obj[j] !== 'undefined') {
                    compacted.push(obj[j]);
                }
            }

            item.obj[item.prop] = compacted;
        }
    }
};

var arrayToObject = function arrayToObject(source, options) {
    var obj = options && options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

var merge = function merge(target, source, options) {
    /* eslint no-param-reassign: 0 */
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (isArray(target)) {
            target.push(source);
        } else if (target && typeof target === 'object') {
            if ((options && (options.plainObjects || options.allowPrototypes)) || !has.call(Object.prototype, source)) {
                target[source] = true;
            }
        } else {
            return [target, source];
        }

        return target;
    }

    if (!target || typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (isArray(target) && !isArray(source)) {
        mergeTarget = arrayToObject(target, options);
    }

    if (isArray(target) && isArray(source)) {
        source.forEach(function (item, i) {
            if (has.call(target, i)) {
                var targetItem = target[i];
                if (targetItem && typeof targetItem === 'object' && item && typeof item === 'object') {
                    target[i] = merge(targetItem, item, options);
                } else {
                    target.push(item);
                }
            } else {
                target[i] = item;
            }
        });
        return target;
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (has.call(acc, key)) {
            acc[key] = merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

var assign = function assignSingleSource(target, source) {
    return Object.keys(source).reduce(function (acc, key) {
        acc[key] = source[key];
        return acc;
    }, target);
};

var decode = function (str, decoder, charset) {
    var strWithoutPlus = str.replace(/\+/g, ' ');
    if (charset === 'iso-8859-1') {
        // unescape never throws, no try...catch needed:
        return strWithoutPlus.replace(/%[0-9a-f]{2}/gi, unescape);
    }
    // utf-8
    try {
        return decodeURIComponent(strWithoutPlus);
    } catch (e) {
        return strWithoutPlus;
    }
};

var encode = function encode(str, defaultEncoder, charset, kind, format) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = str;
    if (typeof str === 'symbol') {
        string = Symbol.prototype.toString.call(str);
    } else if (typeof str !== 'string') {
        string = String(str);
    }

    if (charset === 'iso-8859-1') {
        return escape(string).replace(/%u[0-9a-f]{4}/gi, function ($0) {
            return '%26%23' + parseInt($0.slice(2), 16) + '%3B';
        });
    }

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D // -
            || c === 0x2E // .
            || c === 0x5F // _
            || c === 0x7E // ~
            || (c >= 0x30 && c <= 0x39) // 0-9
            || (c >= 0x41 && c <= 0x5A) // a-z
            || (c >= 0x61 && c <= 0x7A) // A-Z
            || (format === formats.RFC1738 && (c === 0x28 || c === 0x29)) // ( )
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        /* eslint operator-linebreak: [2, "before"] */
        out += hexTable[0xF0 | (c >> 18)]
            + hexTable[0x80 | ((c >> 12) & 0x3F)]
            + hexTable[0x80 | ((c >> 6) & 0x3F)]
            + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

var compact = function compact(value) {
    var queue = [{ obj: { o: value }, prop: 'o' }];
    var refs = [];

    for (var i = 0; i < queue.length; ++i) {
        var item = queue[i];
        var obj = item.obj[item.prop];

        var keys = Object.keys(obj);
        for (var j = 0; j < keys.length; ++j) {
            var key = keys[j];
            var val = obj[key];
            if (typeof val === 'object' && val !== null && refs.indexOf(val) === -1) {
                queue.push({ obj: obj, prop: key });
                refs.push(val);
            }
        }
    }

    compactQueue(queue);

    return value;
};

var isRegExp = function isRegExp(obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

var isBuffer = function isBuffer(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

var combine = function combine(a, b) {
    return [].concat(a, b);
};

var maybeMap = function maybeMap(val, fn) {
    if (isArray(val)) {
        var mapped = [];
        for (var i = 0; i < val.length; i += 1) {
            mapped.push(fn(val[i]));
        }
        return mapped;
    }
    return fn(val);
};

module.exports = {
    arrayToObject: arrayToObject,
    assign: assign,
    combine: combine,
    compact: compact,
    decode: decode,
    encode: encode,
    isBuffer: isBuffer,
    isRegExp: isRegExp,
    maybeMap: maybeMap,
    merge: merge
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/qs/lib/utils.js
,
// === functors[91] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var getSideChannel = require('side-channel');
var utils = require('./utils');
var formats = require('./formats');
var has = Object.prototype.hasOwnProperty;

var arrayPrefixGenerators = {
    brackets: function brackets(prefix) {
        return prefix + '[]';
    },
    comma: 'comma',
    indices: function indices(prefix, key) {
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix) {
        return prefix;
    }
};

var isArray = Array.isArray;
var push = Array.prototype.push;
var pushToArray = function (arr, valueOrArray) {
    push.apply(arr, isArray(valueOrArray) ? valueOrArray : [valueOrArray]);
};

var toISO = Date.prototype.toISOString;

var defaultFormat = formats['default'];
var defaults = {
    addQueryPrefix: false,
    allowDots: false,
    charset: 'utf-8',
    charsetSentinel: false,
    delimiter: '&',
    encode: true,
    encoder: utils.encode,
    encodeValuesOnly: false,
    format: defaultFormat,
    formatter: formats.formatters[defaultFormat],
    // deprecated
    indices: false,
    serializeDate: function serializeDate(date) {
        return toISO.call(date);
    },
    skipNulls: false,
    strictNullHandling: false
};

var isNonNullishPrimitive = function isNonNullishPrimitive(v) {
    return typeof v === 'string'
        || typeof v === 'number'
        || typeof v === 'boolean'
        || typeof v === 'symbol'
        || typeof v === 'bigint';
};

var sentinel = {};

var stringify = function stringify(
    object,
    prefix,
    generateArrayPrefix,
    commaRoundTrip,
    strictNullHandling,
    skipNulls,
    encoder,
    filter,
    sort,
    allowDots,
    serializeDate,
    format,
    formatter,
    encodeValuesOnly,
    charset,
    sideChannel
) {
    var obj = object;

    var tmpSc = sideChannel;
    var step = 0;
    var findFlag = false;
    while ((tmpSc = tmpSc.get(sentinel)) !== void undefined && !findFlag) {
        // Where object last appeared in the ref tree
        var pos = tmpSc.get(object);
        step += 1;
        if (typeof pos !== 'undefined') {
            if (pos === step) {
                throw new RangeError('Cyclic object value');
            } else {
                findFlag = true; // Break while
            }
        }
        if (typeof tmpSc.get(sentinel) === 'undefined') {
            step = 0;
        }
    }

    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = serializeDate(obj);
    } else if (generateArrayPrefix === 'comma' && isArray(obj)) {
        obj = utils.maybeMap(obj, function (value) {
            if (value instanceof Date) {
                return serializeDate(value);
            }
            return value;
        });
    }

    if (obj === null) {
        if (strictNullHandling) {
            return encoder && !encodeValuesOnly ? encoder(prefix, defaults.encoder, charset, 'key', format) : prefix;
        }

        obj = '';
    }

    if (isNonNullishPrimitive(obj) || utils.isBuffer(obj)) {
        if (encoder) {
            var keyValue = encodeValuesOnly ? prefix : encoder(prefix, defaults.encoder, charset, 'key', format);
            return [formatter(keyValue) + '=' + formatter(encoder(obj, defaults.encoder, charset, 'value', format))];
        }
        return [formatter(prefix) + '=' + formatter(String(obj))];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys;
    if (generateArrayPrefix === 'comma' && isArray(obj)) {
        // we need to join elements in
        if (encodeValuesOnly && encoder) {
            obj = utils.maybeMap(obj, encoder);
        }
        objKeys = [{ value: obj.length > 0 ? obj.join(',') || null : void undefined }];
    } else if (isArray(filter)) {
        objKeys = filter;
    } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    var adjustedPrefix = commaRoundTrip && isArray(obj) && obj.length === 1 ? prefix + '[]' : prefix;

    for (var j = 0; j < objKeys.length; ++j) {
        var key = objKeys[j];
        var value = typeof key === 'object' && typeof key.value !== 'undefined' ? key.value : obj[key];

        if (skipNulls && value === null) {
            continue;
        }

        var keyPrefix = isArray(obj)
            ? typeof generateArrayPrefix === 'function' ? generateArrayPrefix(adjustedPrefix, key) : adjustedPrefix
            : adjustedPrefix + (allowDots ? '.' + key : '[' + key + ']');

        sideChannel.set(object, step);
        var valueSideChannel = getSideChannel();
        valueSideChannel.set(sentinel, sideChannel);
        pushToArray(values, stringify(
            value,
            keyPrefix,
            generateArrayPrefix,
            commaRoundTrip,
            strictNullHandling,
            skipNulls,
            generateArrayPrefix === 'comma' && encodeValuesOnly && isArray(obj) ? null : encoder,
            filter,
            sort,
            allowDots,
            serializeDate,
            format,
            formatter,
            encodeValuesOnly,
            charset,
            valueSideChannel
        ));
    }

    return values;
};

var normalizeStringifyOptions = function normalizeStringifyOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (opts.encoder !== null && typeof opts.encoder !== 'undefined' && typeof opts.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    var charset = opts.charset || defaults.charset;
    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }

    var format = formats['default'];
    if (typeof opts.format !== 'undefined') {
        if (!has.call(formats.formatters, opts.format)) {
            throw new TypeError('Unknown format option provided.');
        }
        format = opts.format;
    }
    var formatter = formats.formatters[format];

    var filter = defaults.filter;
    if (typeof opts.filter === 'function' || isArray(opts.filter)) {
        filter = opts.filter;
    }

    return {
        addQueryPrefix: typeof opts.addQueryPrefix === 'boolean' ? opts.addQueryPrefix : defaults.addQueryPrefix,
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        delimiter: typeof opts.delimiter === 'undefined' ? defaults.delimiter : opts.delimiter,
        encode: typeof opts.encode === 'boolean' ? opts.encode : defaults.encode,
        encoder: typeof opts.encoder === 'function' ? opts.encoder : defaults.encoder,
        encodeValuesOnly: typeof opts.encodeValuesOnly === 'boolean' ? opts.encodeValuesOnly : defaults.encodeValuesOnly,
        filter: filter,
        format: format,
        formatter: formatter,
        serializeDate: typeof opts.serializeDate === 'function' ? opts.serializeDate : defaults.serializeDate,
        skipNulls: typeof opts.skipNulls === 'boolean' ? opts.skipNulls : defaults.skipNulls,
        sort: typeof opts.sort === 'function' ? opts.sort : null,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (object, opts) {
    var obj = object;
    var options = normalizeStringifyOptions(opts);

    var objKeys;
    var filter;

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (isArray(options.filter)) {
        filter = options.filter;
        objKeys = filter;
    }

    var keys = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    var arrayFormat;
    if (opts && opts.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = opts.arrayFormat;
    } else if (opts && 'indices' in opts) {
        arrayFormat = opts.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = 'indices';
    }

    var generateArrayPrefix = arrayPrefixGenerators[arrayFormat];
    if (opts && 'commaRoundTrip' in opts && typeof opts.commaRoundTrip !== 'boolean') {
        throw new TypeError('`commaRoundTrip` must be a boolean, or absent');
    }
    var commaRoundTrip = generateArrayPrefix === 'comma' && opts && opts.commaRoundTrip;

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (options.sort) {
        objKeys.sort(options.sort);
    }

    var sideChannel = getSideChannel();
    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (options.skipNulls && obj[key] === null) {
            continue;
        }
        pushToArray(keys, stringify(
            obj[key],
            key,
            generateArrayPrefix,
            commaRoundTrip,
            options.strictNullHandling,
            options.skipNulls,
            options.encode ? options.encoder : null,
            options.filter,
            options.sort,
            options.allowDots,
            options.serializeDate,
            options.format,
            options.formatter,
            options.encodeValuesOnly,
            options.charset,
            sideChannel
        ));
    }

    var joined = keys.join(options.delimiter);
    var prefix = options.addQueryPrefix === true ? '?' : '';

    if (options.charsetSentinel) {
        if (options.charset === 'iso-8859-1') {
            // encodeURIComponent('&#10003;'), the "numeric entity" representation of a checkmark
            prefix += 'utf8=%26%2310003%3B&';
        } else {
            // encodeURIComponent('✓')
            prefix += 'utf8=%E2%9C%93&';
        }
    }

    return joined.length > 0 ? prefix + joined : '';
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/qs/lib/stringify.js
,
// === functors[92] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var utils = require('./utils');

var has = Object.prototype.hasOwnProperty;
var isArray = Array.isArray;

var defaults = {
    allowDots: false,
    allowPrototypes: false,
    allowSparse: false,
    arrayLimit: 20,
    charset: 'utf-8',
    charsetSentinel: false,
    comma: false,
    decoder: utils.decode,
    delimiter: '&',
    depth: 5,
    ignoreQueryPrefix: false,
    interpretNumericEntities: false,
    parameterLimit: 1000,
    parseArrays: true,
    plainObjects: false,
    strictNullHandling: false
};

var interpretNumericEntities = function (str) {
    return str.replace(/&#(\d+);/g, function ($0, numberStr) {
        return String.fromCharCode(parseInt(numberStr, 10));
    });
};

var parseArrayValue = function (val, options) {
    if (val && typeof val === 'string' && options.comma && val.indexOf(',') > -1) {
        return val.split(',');
    }

    return val;
};

// This is what browsers will submit when the ✓ character occurs in an
// application/x-www-form-urlencoded body and the encoding of the page containing
// the form is iso-8859-1, or when the submitted form has an accept-charset
// attribute of iso-8859-1. Presumably also with other charsets that do not contain
// the ✓ character, such as us-ascii.
var isoSentinel = 'utf8=%26%2310003%3B'; // encodeURIComponent('&#10003;')

// These are the percent-encoded utf-8 octets representing a checkmark, indicating that the request actually is utf-8 encoded.
var charsetSentinel = 'utf8=%E2%9C%93'; // encodeURIComponent('✓')

var parseValues = function parseQueryStringValues(str, options) {
    var obj = { __proto__: null };

    var cleanStr = options.ignoreQueryPrefix ? str.replace(/^\?/, '') : str;
    var limit = options.parameterLimit === Infinity ? undefined : options.parameterLimit;
    var parts = cleanStr.split(options.delimiter, limit);
    var skipIndex = -1; // Keep track of where the utf8 sentinel was found
    var i;

    var charset = options.charset;
    if (options.charsetSentinel) {
        for (i = 0; i < parts.length; ++i) {
            if (parts[i].indexOf('utf8=') === 0) {
                if (parts[i] === charsetSentinel) {
                    charset = 'utf-8';
                } else if (parts[i] === isoSentinel) {
                    charset = 'iso-8859-1';
                }
                skipIndex = i;
                i = parts.length; // The eslint settings do not allow break;
            }
        }
    }

    for (i = 0; i < parts.length; ++i) {
        if (i === skipIndex) {
            continue;
        }
        var part = parts[i];

        var bracketEqualsPos = part.indexOf(']=');
        var pos = bracketEqualsPos === -1 ? part.indexOf('=') : bracketEqualsPos + 1;

        var key, val;
        if (pos === -1) {
            key = options.decoder(part, defaults.decoder, charset, 'key');
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos), defaults.decoder, charset, 'key');
            val = utils.maybeMap(
                parseArrayValue(part.slice(pos + 1), options),
                function (encodedVal) {
                    return options.decoder(encodedVal, defaults.decoder, charset, 'value');
                }
            );
        }

        if (val && options.interpretNumericEntities && charset === 'iso-8859-1') {
            val = interpretNumericEntities(val);
        }

        if (part.indexOf('[]=') > -1) {
            val = isArray(val) ? [val] : val;
        }

        if (has.call(obj, key)) {
            obj[key] = utils.combine(obj[key], val);
        } else {
            obj[key] = val;
        }
    }

    return obj;
};

var parseObject = function (chain, val, options, valuesParsed) {
    var leaf = valuesParsed ? val : parseArrayValue(val, options);

    for (var i = chain.length - 1; i >= 0; --i) {
        var obj;
        var root = chain[i];

        if (root === '[]' && options.parseArrays) {
            obj = [].concat(leaf);
        } else {
            obj = options.plainObjects ? Object.create(null) : {};
            var cleanRoot = root.charAt(0) === '[' && root.charAt(root.length - 1) === ']' ? root.slice(1, -1) : root;
            var index = parseInt(cleanRoot, 10);
            if (!options.parseArrays && cleanRoot === '') {
                obj = { 0: leaf };
            } else if (
                !isNaN(index)
                && root !== cleanRoot
                && String(index) === cleanRoot
                && index >= 0
                && (options.parseArrays && index <= options.arrayLimit)
            ) {
                obj = [];
                obj[index] = leaf;
            } else if (cleanRoot !== '__proto__') {
                obj[cleanRoot] = leaf;
            }
        }

        leaf = obj;
    }

    return leaf;
};

var parseKeys = function parseQueryStringKeys(givenKey, val, options, valuesParsed) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^.[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var brackets = /(\[[^[\]]*])/;
    var child = /(\[[^[\]]*])/g;

    // Get the parent

    var segment = options.depth > 0 && brackets.exec(key);
    var parent = segment ? key.slice(0, segment.index) : key;

    // Stash the parent if it exists

    var keys = [];
    if (parent) {
        // If we aren't using plain objects, optionally prefix keys that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, parent)) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(parent);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while (options.depth > 0 && (segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].slice(1, -1))) {
            if (!options.allowPrototypes) {
                return;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options, valuesParsed);
};

var normalizeParseOptions = function normalizeParseOptions(opts) {
    if (!opts) {
        return defaults;
    }

    if (opts.decoder !== null && opts.decoder !== undefined && typeof opts.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    if (typeof opts.charset !== 'undefined' && opts.charset !== 'utf-8' && opts.charset !== 'iso-8859-1') {
        throw new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined');
    }
    var charset = typeof opts.charset === 'undefined' ? defaults.charset : opts.charset;

    return {
        allowDots: typeof opts.allowDots === 'undefined' ? defaults.allowDots : !!opts.allowDots,
        allowPrototypes: typeof opts.allowPrototypes === 'boolean' ? opts.allowPrototypes : defaults.allowPrototypes,
        allowSparse: typeof opts.allowSparse === 'boolean' ? opts.allowSparse : defaults.allowSparse,
        arrayLimit: typeof opts.arrayLimit === 'number' ? opts.arrayLimit : defaults.arrayLimit,
        charset: charset,
        charsetSentinel: typeof opts.charsetSentinel === 'boolean' ? opts.charsetSentinel : defaults.charsetSentinel,
        comma: typeof opts.comma === 'boolean' ? opts.comma : defaults.comma,
        decoder: typeof opts.decoder === 'function' ? opts.decoder : defaults.decoder,
        delimiter: typeof opts.delimiter === 'string' || utils.isRegExp(opts.delimiter) ? opts.delimiter : defaults.delimiter,
        // eslint-disable-next-line no-implicit-coercion, no-extra-parens
        depth: (typeof opts.depth === 'number' || opts.depth === false) ? +opts.depth : defaults.depth,
        ignoreQueryPrefix: opts.ignoreQueryPrefix === true,
        interpretNumericEntities: typeof opts.interpretNumericEntities === 'boolean' ? opts.interpretNumericEntities : defaults.interpretNumericEntities,
        parameterLimit: typeof opts.parameterLimit === 'number' ? opts.parameterLimit : defaults.parameterLimit,
        parseArrays: opts.parseArrays !== false,
        plainObjects: typeof opts.plainObjects === 'boolean' ? opts.plainObjects : defaults.plainObjects,
        strictNullHandling: typeof opts.strictNullHandling === 'boolean' ? opts.strictNullHandling : defaults.strictNullHandling
    };
};

module.exports = function (str, opts) {
    var options = normalizeParseOptions(opts);

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options, typeof str === 'string');
        obj = utils.merge(obj, newObj, options);
    }

    if (options.allowSparse === true) {
        return obj;
    }

    return utils.compact(obj);
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/qs/lib/parse.js
,
// === functors[93] ===
(function (require, exports, module, __filename, __dirname) { 'use strict';

var stringify = require('./stringify');
var parse = require('./parse');
var formats = require('./formats');

module.exports = {
    formats: formats,
    parse: parse,
    stringify: stringify
};
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/node_modules/qs/lib/index.js
,
// === functors[94] ===
(function (require, exports, module, __filename, __dirname) { /*
 * Copyright Joyent, Inc. and other Node contributors.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit
 * persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
 * NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
 * USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

'use strict';

var punycode = require('punycode');

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

/*
 * define these here so at least they only have to be
 * compiled once on the first module load.
 */
var protocolPattern = /^([a-z0-9.+-]+:)/i,
  portPattern = /:[0-9]*$/,

  // Special case for a simple path URL
  simplePathPattern = /^(\/\/?(?!\/)[^?\s]*)(\?[^\s]*)?$/,

  /*
   * RFC 2396: characters reserved for delimiting URLs.
   * We actually just auto-escape these.
   */
  delims = [
    '<', '>', '"', '`', ' ', '\r', '\n', '\t'
  ],

  // RFC 2396: characters not allowed for various reasons.
  unwise = [
    '{', '}', '|', '\\', '^', '`'
  ].concat(delims),

  // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
  autoEscape = ['\''].concat(unwise),
  /*
   * Characters that are never ever allowed in a hostname.
   * Note that any invalid chars are also handled, but these
   * are the ones that are *expected* to be seen, so we fast-path
   * them.
   */
  nonHostChars = [
    '%', '/', '?', ';', '#'
  ].concat(autoEscape),
  hostEndingChars = [
    '/', '?', '#'
  ],
  hostnameMaxLen = 255,
  hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/,
  hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/,
  // protocols that can allow "unsafe" and "unwise" chars.
  unsafeProtocol = {
    javascript: true,
    'javascript:': true
  },
  // protocols that never have a hostname.
  hostlessProtocol = {
    javascript: true,
    'javascript:': true
  },
  // protocols that always contain a // bit.
  slashedProtocol = {
    http: true,
    https: true,
    ftp: true,
    gopher: true,
    file: true,
    'http:': true,
    'https:': true,
    'ftp:': true,
    'gopher:': true,
    'file:': true
  },
  querystring = require('qs');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && typeof url === 'object' && url instanceof Url) { return url; }

  var u = new Url();
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function (url, parseQueryString, slashesDenoteHost) {
  if (typeof url !== 'string') {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  /*
   * Copy chrome, IE, opera backslash-handling behavior.
   * Back slashes before the query string get converted to forward slashes
   * See: https://code.google.com/p/chromium/issues/detail?id=25916
   */
  var queryIndex = url.indexOf('?'),
    splitter = queryIndex !== -1 && queryIndex < url.indexOf('#') ? '?' : '#',
    uSplit = url.split(splitter),
    slashRegex = /\\/g;
  uSplit[0] = uSplit[0].replace(slashRegex, '/');
  url = uSplit.join(splitter);

  var rest = url;

  /*
   * trim before proceeding.
   * This is to support parse stuff like "  http://foo.com  \n"
   */
  rest = rest.trim();

  if (!slashesDenoteHost && url.split('#').length === 1) {
    // Try fast path regexp
    var simplePath = simplePathPattern.exec(rest);
    if (simplePath) {
      this.path = rest;
      this.href = rest;
      this.pathname = simplePath[1];
      if (simplePath[2]) {
        this.search = simplePath[2];
        if (parseQueryString) {
          this.query = querystring.parse(this.search.substr(1));
        } else {
          this.query = this.search.substr(1);
        }
      } else if (parseQueryString) {
        this.search = '';
        this.query = {};
      }
      return this;
    }
  }

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  /*
   * figure out if it's got a host
   * user@server is *always* interpreted as a hostname, and url
   * resolution will treat //foo/bar as host=foo,path=bar because that's
   * how the browser resolves relative URLs.
   */
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@/]+@[^@/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] && (slashes || (proto && !slashedProtocol[proto]))) {

    /*
     * there's a hostname.
     * the first instance of /, ?, ;, or # ends the host.
     *
     * If there is an @ in the hostname, then non-host chars *are* allowed
     * to the left of the last @ sign, unless some host-ending character
     * comes *before* the @-sign.
     * URLs are obnoxious.
     *
     * ex:
     * http://a@b@c/ => user:a@b host:c
     * http://a@b?@c => user:a host:c path:/?@c
     */

    /*
     * v0.12 TODO(isaacs): This is not quite how Chrome does things.
     * Review our test case against browsers more comprehensively.
     */

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) { hostEnd = hec; }
    }

    /*
     * at this point, either we have an explicit point where the
     * auth portion cannot go past, or the last @ char is the decider.
     */
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      /*
       * atSign must be in auth portion.
       * http://a@b/c@d => host:b auth:a path:/c@d
       */
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    /*
     * Now we have a portion which is definitely the auth.
     * Pull that off.
     */
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) { hostEnd = hec; }
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1) { hostEnd = rest.length; }

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    /*
     * we've indicated that there is a hostname,
     * so even if it's empty, it has to be present.
     */
    this.hostname = this.hostname || '';

    /*
     * if hostname begins with [ and ends with ]
     * assume that it's an IPv6 address.
     */
    var ipv6Hostname = this.hostname[0] === '[' && this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) { continue; }
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              /*
               * we replace non-ASCII char with a temporary placeholder
               * we need this to make sure size of hostname is not
               * broken by replacing non-ASCII by nothing
               */
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      /*
       * IDNA Support: Returns a punycoded representation of "domain".
       * It only converts parts of the domain name that
       * have non-ASCII characters, i.e. it doesn't matter if
       * you call it with a domain that already is ASCII-only.
       */
      this.hostname = punycode.toASCII(this.hostname);
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    /*
     * strip [ and ] from the hostname
     * the host field still retains them, though
     */
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  /*
   * now rest is set to the post-host stuff.
   * chop off any delim chars.
   */
  if (!unsafeProtocol[lowerProto]) {

    /*
     * First, make 100% sure that any "autoEscape" chars get
     * escaped, even if encodeURIComponent doesn't think they
     * need to be.
     */
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      if (rest.indexOf(ae) === -1) { continue; }
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }

  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) { this.pathname = rest; }
  if (slashedProtocol[lowerProto] && this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  // to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  /*
   * ensure it's an object, and not a string url.
   * If it's an obj, this is a no-op.
   * this way, you can call url_format() on strings
   * to clean up potentially wonky urls.
   */
  if (typeof obj === 'string') { obj = urlParse(obj); }
  if (!(obj instanceof Url)) { return Url.prototype.format.call(obj); }
  return obj.format();
}

Url.prototype.format = function () {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
    pathname = this.pathname || '',
    hash = this.hash || '',
    host = false,
    query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ? this.hostname : '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query && typeof this.query === 'object' && Object.keys(this.query).length) {
    query = querystring.stringify(this.query, {
      arrayFormat: 'repeat',
      addQueryPrefix: false
    });
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') { protocol += ':'; }

  /*
   * only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
   * unless they had them to begin with.
   */
  if (this.slashes || (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') { pathname = '/' + pathname; }
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') { hash = '#' + hash; }
  if (search && search.charAt(0) !== '?') { search = '?' + search; }

  pathname = pathname.replace(/[?#]/g, function (match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function (relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) { return relative; }
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function (relative) {
  if (typeof relative === 'string') {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  var tkeys = Object.keys(this);
  for (var tk = 0; tk < tkeys.length; tk++) {
    var tkey = tkeys[tk];
    result[tkey] = this[tkey];
  }

  /*
   * hash is always overridden, no matter what.
   * even href="" will remove it.
   */
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    var rkeys = Object.keys(relative);
    for (var rk = 0; rk < rkeys.length; rk++) {
      var rkey = rkeys[rk];
      if (rkey !== 'protocol') { result[rkey] = relative[rkey]; }
    }

    // urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] && result.hostname && !result.pathname) {
      result.pathname = '/';
      result.path = result.pathname;
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    /*
     * if it's a known url protocol, then changing
     * the protocol does weird things
     * first, if it's not file:, then we MUST have a host,
     * and if there was a path
     * to begin with, then we MUST have a path.
     * if it is file:, then the host is dropped,
     * because that's known to be hostless.
     * anything else is assumed to be absolute.
     */
    if (!slashedProtocol[relative.protocol]) {
      var keys = Object.keys(relative);
      for (var v = 0; v < keys.length; v++) {
        var k = keys[v];
        result[k] = relative[k];
      }
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift())) { }
      if (!relative.host) { relative.host = ''; }
      if (!relative.hostname) { relative.hostname = ''; }
      if (relPath[0] !== '') { relPath.unshift(''); }
      if (relPath.length < 2) { relPath.unshift(''); }
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = result.pathname && result.pathname.charAt(0) === '/',
    isRelAbs = relative.host || relative.pathname && relative.pathname.charAt(0) === '/',
    mustEndAbs = isRelAbs || isSourceAbs || (result.host && relative.pathname),
    removeAllDots = mustEndAbs,
    srcPath = result.pathname && result.pathname.split('/') || [],
    relPath = relative.pathname && relative.pathname.split('/') || [],
    psychotic = result.protocol && !slashedProtocol[result.protocol];

  /*
   * if the url is a non-slashed url, then relative
   * links like ../.. should be able
   * to crawl up to the hostname, as well.  This is strange.
   * result.protocol has already been set by now.
   * Later on, put the first path part into the host field.
   */
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') { srcPath[0] = result.host; } else { srcPath.unshift(result.host); }
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') { relPath[0] = relative.host; } else { relPath.unshift(relative.host); }
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = relative.host || relative.host === '' ? relative.host : result.host;
    result.hostname = relative.hostname || relative.hostname === '' ? relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    /*
     * it's relative
     * throw away the existing file, and take the new path instead.
     */
    if (!srcPath) { srcPath = []; }
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (relative.search != null) {
    /*
     * just pull out the search.
     * like href='?foo'.
     * Put this after the other two cases because it simplifies the booleans
     */
    if (psychotic) {
      result.host = srcPath.shift();
      result.hostname = result.host;
      /*
       * occationaly the auth can get stuck only in host
       * this especially happens in cases like
       * url.resolveObject('mailto:local1@domain1', 'local2@domain2')
       */
      var authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.hostname = authInHost.shift();
        result.host = result.hostname;
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    // to support http.request
    if (result.pathname !== null || result.search !== null) {
      result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    /*
     * no path at all.  easy.
     * we've already handled the other stuff above.
     */
    result.pathname = null;
    // to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  /*
   * if a url ENDs in . or .., then it must get a trailing slash.
   * however, if it ends in anything else non-slashy,
   * then it must NOT get a trailing slash.
   */
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (result.host || relative.host || srcPath.length > 1) && (last === '.' || last === '..') || last === '';

  /*
   * strip single dots, resolve double dots to parent dir
   * if the path tries to go above the root, `up` ends up > 0
   */
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last === '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' && (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' || (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = isAbsolute ? '' : srcPath.length ? srcPath.shift() : '';
    result.host = result.hostname;
    /*
     * occationaly the auth can get stuck only in host
     * this especially happens in cases like
     * url.resolveObject('mailto:local1@domain1', 'local2@domain2')
     */
    var authInHost = result.host && result.host.indexOf('@') > 0 ? result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.hostname = authInHost.shift();
      result.host = result.hostname;
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (srcPath.length > 0) {
    result.pathname = srcPath.join('/');
  } else {
    result.pathname = null;
    result.path = null;
  }

  // to support request.http
  if (result.pathname !== null || result.search !== null) {
    result.path = (result.pathname ? result.pathname : '') + (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function () {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) { this.hostname = host; }
};

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;
 //*/
})
//# sourceURL=file:///home/xyz/Development/endo/packages/daemon/node_modules/url/url.js
,
// === functors[95] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /// <reference types="ses"/>

/**
 * @template T
 * @callback PromiseExecutor The promise executor
 * @param {(value: import('./types.js').ERef<T>) => void} resolve
 * @param {(reason: any) => void} reject
 */

/**
 * makeReleasingExecutorKit() builds resolve/reject functions which drop references
 * to the resolve/reject functions gathered from an executor to be used with a
 * promise constructor.
 *
 * @template T
 * @returns {Pick<import('./types.js').PromiseKit<T>, 'resolve' | 'reject'> & { executor: PromiseExecutor<T>}}
 */
const        makeReleasingExecutorKit=  ()=>  {
  /** @type {null | undefined | ((value: import('./types.js').ERef<T>) => void)} */
  let internalResolve;
  /** @type {null | undefined | ((reason: unknown) => void)} */
  let internalReject;

  /** @param {import('./types.js').ERef<T>} value */
  const resolve=  (value)=>{
    if( internalResolve) {
      internalResolve(value);
      internalResolve=  null;
      internalReject=  null;
     }else {
      assert(internalResolve===  null);
     }
   };

  /** @param {unknown} reason */
  const reject=  (reason)=>{
    if( internalReject) {
      internalReject(reason);
      internalResolve=  null;
      internalReject=  null;
     }else {
      assert(internalReject===  null);
     }
   };

  const executor=  (res, rej)=>  {
    assert(internalResolve===  undefined&&  internalReject===  undefined);
    internalResolve=  res;
    internalReject=  rej;
   };

  return harden({ resolve, reject, executor});
 };$h‍_once.makeReleasingExecutorKit(makeReleasingExecutorKit);
harden(makeReleasingExecutorKit);
})()
,
// === functors[96] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);Object.defineProperty(isPromise, 'name', {value: "isPromise"});$h‍_once.isPromise(isPromise);   /**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} maybePromise The value to examine
 * @returns {maybePromise is Promise} Whether it is a promise
 */
function        isPromise(maybePromise) {
  return Promise.resolve(maybePromise)===  maybePromise;
 }
harden(isPromise);
})()
,
// === functors[97] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   
})()
,
// === functors[98] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeReleasingExecutorKit,memoRace;$h‍_imports([["./src/promise-executor-kit.js", [["makeReleasingExecutorKit", [$h‍_a => (makeReleasingExecutorKit = $h‍_a)]]]],["./src/memo-race.js", [["memoRace", [$h‍_a => (memoRace = $h‍_a)]]]],["./src/is-promise.js", []],["./src/types.js", []]]);Object.defineProperty(makePromiseKit, 'name', {value: "makePromiseKit"});$h‍_once.makePromiseKit(makePromiseKit);Object.defineProperty(racePromises, 'name', {value: "racePromises"});$h‍_once.racePromises(racePromises);   










/** @type {PromiseConstructor} */
const BestPipelinablePromise=  globalThis.HandledPromise||  Promise;

/**
 * makePromiseKit() builds a Promise object, and returns a record
 * containing the promise itself, as well as separate facets for resolving
 * and rejecting it.
 *
 * @template T
 * @returns {import('./src/types.js').PromiseKit<T>}
 */
function        makePromiseKit() {
  const { resolve, reject, executor}=   makeReleasingExecutorKit();

  const promise=  new BestPipelinablePromise(executor);

  return harden({ promise, resolve, reject});
 }
harden(makePromiseKit);

// NB: Another implementation for Promise.race would be to use the releasing executor,
// However while it would no longer leak the raced promise objects themselves, it would
// still leak reactions on the non-resolved promises contending for the race.

/**
 * Creates a Promise that is resolved or rejected when any of the provided Promises are resolved
 * or rejected.
 *
 * Unlike `Promise.race` it cleans up after itself so a non-resolved value doesn't hold onto
 * the result promise.
 *
 * @template T
 * @param {Iterable<T>} values An iterable of Promises.
 * @returns {Promise<Awaited<T>>} A new Promise.
 */
function        racePromises(values) {
  return harden(memoRace.call(BestPipelinablePromise, values));
 }
harden(racePromises);
})()
,
// === functors[99] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let trackTurns;$h‍_imports([["./track-turns.js", [["trackTurns", [$h‍_a => (trackTurns = $h‍_a)]]]]]);   

const { details: X, quote: q, Fail}=   assert;
const { assign, create}=   Object;

/** @type {ProxyHandler<any>} */
const baseFreezableProxyHandler=  {
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
   }};


// E Proxy handlers pretend that any property exists on the target and returns
// a function for their value. While this function is "bound" by context, it is
// meant to be called as a method. For that reason, the returned function
// includes a check that the `this` argument corresponds to the initial
// receiver when the function was retrieved.
// E Proxy handlers also forward direct calls to the target in case the remote
// is a function instead of an object. No such receiver checks are necessary in
// that case.

/**
 * A Proxy handler for E(x).
 *
 * @param {*} x Any value passed to E(x)
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
const makeEProxyHandler=  (x, HandledPromise)=>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, p, receiver)=>  {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          [p](...args) {
            if( this!==  receiver) {
              // Reject the async function call
              return HandledPromise.reject(
                assert.error(
                  X `Unexpected receiver for "${p}" method of E(${q(x)})`));


             }

            return HandledPromise.applyMethod(x, p, args);
           }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
}[        p]);

     },
    apply: (_target, _thisArg, argArray=  [])=>  {
      return HandledPromise.applyFunction(x, argArray);
     },
    has: (_target, _p)=>  {
      // We just pretend everything exists.
      return true;
     }});


/**
 * A Proxy handler for E.sendOnly(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.sendOnly(x)
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
const makeESendOnlyProxyHandler=  (x, HandledPromise)=>
  harden({
    ...baseFreezableProxyHandler,
    get: (_target, p, receiver)=>  {
      return harden(
        {
          // This function purposely checks the `this` value (see above)
          // In order to be `this` sensitive it is defined using concise method
          // syntax rather than as an arrow function. To ensure the function
          // is not constructable, it also avoids the `function` syntax.
          [p](...args) {
            // Throw since the function returns nothing
            this===  receiver||
              Fail `Unexpected receiver for "${q(p)}" method of E.sendOnly(${q(
                x)
                })`;
            HandledPromise.applyMethodSendOnly(x, p, args);
            return undefined;
           }
          // @ts-expect-error https://github.com/microsoft/TypeScript/issues/50319
}[        p]);

     },
    apply: (_target, _thisArg, argsArray=  [])=>  {
      HandledPromise.applyFunctionSendOnly(x, argsArray);
      return undefined;
     },
    has: (_target, _p)=>  {
      // We just pretend that everything exists.
      return true;
     }});


/**
 * A Proxy handler for E.get(x)
 * It is a variant on the E(x) Proxy handler.
 *
 * @param {*} x Any value passed to E.get(x)
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 * @returns {ProxyHandler} the Proxy handler
 */
const makeEGetProxyHandler=  (x, HandledPromise)=>
  harden({
    ...baseFreezableProxyHandler,
    has: (_target, _prop)=>  true,
    get: (_target, prop)=>  HandledPromise.get(x, prop)});


/**
 * @param {import('./types').HandledPromiseConstructor} HandledPromise
 */
const makeE=  (HandledPromise)=>{
  return harden(
    assign(
      /**
       * E(x) returns a proxy on which you can call arbitrary methods. Each of these
       * method calls returns a promise. The method will be invoked on whatever
       * 'x' designates (or resolves to) in a future turn, not this one.
       *
       * @template T
       * @param {T} x target for method/function call
       * @returns {ECallableOrMethods<RemoteFunctions<T>>} method/function call proxy
       */
      (x)=>harden(new Proxy(()=>  { },makeEProxyHandler(x, HandledPromise))),
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
        get: (x)=>
          harden(
            new Proxy(create(null), makeEGetProxyHandler(x, HandledPromise))),


        /**
         * E.resolve(x) converts x to a handled promise. It is
         * shorthand for HandledPromise.resolve(x)
         *
         * @template T
         * @param {T} x value to convert to a handled promise
         * @returns {Promise<Awaited<T>>} handled promise for x
         * @readonly
         */
        resolve: HandledPromise.resolve,

        /**
         * E.sendOnly returns a proxy similar to E, but for which the results
         * are ignored (undefined is returned).
         *
         * @template T
         * @param {T} x target for method/function call
         * @returns {ESendOnlyCallableOrMethods<RemoteFunctions<T>>} method/function call proxy
         * @readonly
         */
        sendOnly: (x)=>
          harden(
            new Proxy(()=>  { },makeESendOnlyProxyHandler(x, HandledPromise))),


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
        when: (x, onfulfilled, onrejected)=>
          HandledPromise.resolve(x).then(
            ...trackTurns([onfulfilled, onrejected]))}));




 };

const{default:$c‍_default}={default:makeE};

/** @typedef {ReturnType<makeE>} EProxy */

/**
 * Creates a type that accepts both near and marshalled references that were
 * returned from `Remotable` or `Far`, and also promises for such references.
 *
 * @template Primary The type of the primary reference.
 * @template [Local=DataOnly<Primary>] The local properties of the object.
 * @typedef {ERef<Local & import('./types').RemotableBrand<Local, Primary>>} FarRef
 */

/**
 * `DataOnly<T>` means to return a record type `T2` consisting only of
 * properties that are *not* functions.
 *
 * @template T The type to be filtered.
 * @typedef {Omit<T, FilteredKeys<T, import('./types').Callable>>} DataOnly
 */

/**
 * @see {@link https://github.com/microsoft/TypeScript/issues/31394}
 * @template T
 * @typedef {PromiseLike<T> | T} ERef
 */

/**
 * @template {import('./types').Callable} T
 * @typedef {(
 *   ReturnType<T> extends PromiseLike<infer U>                       // if function returns a promise
 *     ? T                                                            // return the function
 *     : (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>  // make it return a promise
 * )} ECallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends import('./types').Callable
 *     ? ECallable<T[P]>
 *     : never;
 * }} EMethods
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends PromiseLike<infer U>
 *     ? T[P]
 *     : Promise<Awaited<T[P]>>;
 * }} EGetters
 */

/**
 * @template {import('./types').Callable} T
 * @typedef {(...args: Parameters<T>) => Promise<void>} ESendOnlyCallable
 */

/**
 * @template T
 * @typedef {{
 *   readonly [P in keyof T]: T[P] extends import('./types').Callable
 *     ? ESendOnlyCallable<T[P]>
 *     : never;
 * }} ESendOnlyMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types').Callable
 *     ? ESendOnlyCallable<T> & ESendOnlyMethods<Required<T>>
 *     : ESendOnlyMethods<Required<T>>
 * )} ESendOnlyCallableOrMethods
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types').Callable
 *     ? ECallable<T> & EMethods<Required<T>>
 *     : EMethods<Required<T>>
 * )} ECallableOrMethods
 */

/**
 * Return a union of property names/symbols/numbers P for which the record element T[P]'s type extends U.
 *
 * Given const x = { a: 123, b: 'hello', c: 42, 49: () => {}, 53: 67 },
 *
 * FilteredKeys<typeof x, number> is the type 'a' | 'c' | 53.
 * FilteredKeys<typeof x, string> is the type 'b'.
 * FilteredKeys<typeof x, 42 | 67> is the type 'c' | 53.
 * FilteredKeys<typeof x, boolean> is the type never.
 *
 * @template T
 * @template U
 * @typedef {{ [P in keyof T]: T[P] extends U ? P : never; }[keyof T]} FilteredKeys
 */

/**
 * `PickCallable<T>` means to return a single root callable or a record type
 * consisting only of properties that are functions.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types').Callable
 *     ? (...args: Parameters<T>) => ReturnType<T>                     // a root callable, no methods
 *     : Pick<T, FilteredKeys<T, import('./types').Callable>>          // any callable methods
 * )} PickCallable
 */

/**
 * `RemoteFunctions<T>` means to return the functions and properties that are remotely callable.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types').RemotableBrand<infer L, infer R>     // if a given T is some remote interface R
 *     ? PickCallable<R>                                              // then return the callable properties of R
 *     : Awaited<T> extends import('./types').RemotableBrand<infer L, infer R> // otherwise, if the final resolution of T is some remote interface R
 *     ? PickCallable<R>                                              // then return the callable properties of R
 *     : T extends PromiseLike<infer U>                               // otherwise, if T is a promise
 *     ? Awaited<T>                                                   // then return resolved value T
 *     : T                                                            // otherwise, return T
 * )} RemoteFunctions
 */

/**
 * @template T
 * @typedef {(
 *   T extends import('./types').RemotableBrand<infer L, infer R>
 *     ? L
 *     : Awaited<T> extends import('./types').RemotableBrand<infer L, infer R>
 *     ? L
 *     : T extends PromiseLike<infer U>
 *     ? Awaited<T>
 *     : T
 * )} LocalRecord
 */

/**
 * @template [R = unknown]
 * @typedef {{
 *   promise: Promise<R>;
 *   settler: import('./types').Settler<R>;
 * }} EPromiseKit
 */

/**
 * Type for an object that must only be invoked with E.  It supports a given
 * interface but declares all the functions as asyncable.
 *
 * @template T
 * @typedef {(
 *   T extends import('./types').Callable
 *     ? (...args: Parameters<T>) => ERef<Awaited<EOnly<ReturnType<T>>>>
 *     : T extends Record<PropertyKey, import('./types').Callable>
 *     ? {
 *         [K in keyof T]: T[K] extends import('./types').Callable
 *           ? (...args: Parameters<T[K]>) => ERef<Awaited<EOnly<ReturnType<T[K]>>>>
 *           : T[K];
 *       }
 *     : T
 * )} EOnly
 */$h‍_once.default($c‍_default);
})()
,
// === functors[100] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   
})()
,
// === functors[101] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeE;$h‍_imports([["./E.js", [["default", [$h‍_a => (makeE = $h‍_a)]]]],["./exports.js", []]]);   

const hp=  HandledPromise;$h‍_once.hp(hp);
const        E=  makeE(hp);$h‍_once.E(E);
})()
,
// === functors[102] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /// <reference types="ses"/>

/** @typedef {import('./types.js').Checker} Checker */
/** @typedef {import('./types.js').PassStyle} PassStyle */

const { details: X, quote: q}=   assert;
const { isArray}=   Array;
const { prototype: functionPrototype}=   Function;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  hasOwnProperty: objectHasOwnProperty,
  isFrozen,
  prototype: objectPrototype}=
    Object;
const { apply}=   Reflect;
const { toStringTag: toStringTagSymbol}=   Symbol;

const typedArrayPrototype=  getPrototypeOf(Uint8Array.prototype);
const typedArrayToStringTagDesc=  getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol);

assert(typedArrayToStringTagDesc);
const getTypedArrayToStringTag=  typedArrayToStringTagDesc.get;
assert(typeof getTypedArrayToStringTag===  'function');

const        hasOwnPropertyOf=  (obj, prop)=>
  apply(objectHasOwnProperty, obj, [prop]);$h‍_once.hasOwnPropertyOf(hasOwnPropertyOf);
harden(hasOwnPropertyOf);

const        isObject=  (val)=>Object(val)===  val;$h‍_once.isObject(isObject);
harden(isObject);

/**
 * Duplicates packages/ses/src/make-hardener.js to avoid a dependency.
 *
 * @param {unknown} object
 */
const        isTypedArray=  (object)=>{
  // The object must pass a brand check or toStringTag will return undefined.
  const tag=  apply(getTypedArrayToStringTag, object, []);
  return tag!==  undefined;
 };$h‍_once.isTypedArray(isTypedArray);
harden(isTypedArray);

const        PASS_STYLE=  Symbol.for('passStyle');

/**
 * For a function to be a valid method, it must not be passable.
 * Otherwise, we risk confusing pass-by-copy data carrying
 * far functions with attempts at far objects with methods.
 *
 * TODO HAZARD Because we check this on the way to hardening a remotable,
 * we cannot yet check that `func` is hardened. However, without
 * doing so, it's inheritance might change after the `PASS_STYLE`
 * check below.
 *
 * @param {any} func
 * @returns {boolean}
 */$h‍_once.PASS_STYLE(PASS_STYLE);
const        canBeMethod=  (func)=>
  typeof func===  'function'&&  !(PASS_STYLE in func);$h‍_once.canBeMethod(canBeMethod);
harden(canBeMethod);

/**
 * Below we have a series of predicate functions and their (curried) assertion
 * functions. The semantics of the assertion function is just to assert that
 * the corresponding predicate function would have returned true. But it
 * reproduces the internal tests so failures can give a better error message.
 *
 * @type {Checker}
 */
const        assertChecker=  (cond, details)=>  {
  assert(cond, details);
  return true;
 };$h‍_once.assertChecker(assertChecker);
harden(assertChecker);

/**
 * Checks for the presence and enumerability of an own data property.
 *
 * @param {object} candidate
 * @param {string|number|symbol} propertyName
 * @param {boolean} shouldBeEnumerable
 * @param {Checker} [check]
 * @returns {boolean}
 */
const        checkNormalProperty=  (
  candidate,
  propertyName,
  shouldBeEnumerable,
  check)=>
     {
  const reject=  !!check&&(  (details)=>check(false, details));
  const desc=  getOwnPropertyDescriptor(candidate, propertyName);
  if( desc===  undefined) {
    return(
      reject&&  reject(X `${q(propertyName)} property expected: ${candidate}`));

   }
  return(
    (hasOwnPropertyOf(desc, 'value')||
       reject&&
        reject(
          X `${q(propertyName)} must not be an accessor property: ${candidate}`))&&(

     shouldBeEnumerable?
        desc.enumerable||
         reject&&
          reject(
            X `${q(propertyName)} must be an enumerable property: ${candidate}`):

        !desc.enumerable||
         reject&&
          reject(
            X `${q(
              propertyName)
              } must not be an enumerable property: ${candidate}`)));


 };$h‍_once.checkNormalProperty(checkNormalProperty);
harden(checkNormalProperty);

const        getTag=  (tagRecord)=>tagRecord[Symbol.toStringTag];$h‍_once.getTag(getTag);
harden(getTag);

const        checkPassStyle=  (obj, expectedPassStyle, check)=>  {
  const reject=  !!check&&(  (details)=>check(false, details));
  const actual=  obj[PASS_STYLE];
  return(
    actual===  expectedPassStyle||
     reject&&
      reject(X `Expected ${q(expectedPassStyle)}, not ${q(actual)}: ${obj}`));

 };$h‍_once.checkPassStyle(checkPassStyle);
harden(checkPassStyle);

const makeCheckTagRecord=  (checkProto)=>{
  /**
   * @param {{ [PASS_STYLE]: string }} tagRecord
   * @param {PassStyle} passStyle
   * @param {Checker} [check]
   * @returns {boolean}
   */
  const checkTagRecord=  (tagRecord, passStyle, check)=>  {
    const reject=  !!check&&(  (details)=>check(false, details));
    return(
      (isObject(tagRecord)||
         reject&&
          reject(X `A non-object cannot be a tagRecord: ${tagRecord}`))&&(
       isFrozen(tagRecord)||
         reject&&  reject(X `A tagRecord must be frozen: ${tagRecord}`))&&(
       !isArray(tagRecord)||
         reject&&  reject(X `An array cannot be a tagRecord: ${tagRecord}`))&&
      checkNormalProperty(tagRecord, PASS_STYLE, false, check)&&
      checkPassStyle(tagRecord, passStyle, check)&&
      checkNormalProperty(tagRecord, Symbol.toStringTag, false, check)&&(
       typeof getTag(tagRecord)===  'string'||
         reject&&
          reject(
            X `A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`))&&

      checkProto(tagRecord, getPrototypeOf(tagRecord), check));

   };
  return harden(checkTagRecord);
 };

const        checkTagRecord=  makeCheckTagRecord(
  (val, proto, check)=>
    proto===  objectPrototype||
     !!check&&
      check(false, X `A tagRecord must inherit from Object.prototype: ${val}`));$h‍_once.checkTagRecord(checkTagRecord);

harden(checkTagRecord);

const        checkFunctionTagRecord=  makeCheckTagRecord(
  (val, proto, check)=>
    proto===  functionPrototype||
     proto!==  null&&  getPrototypeOf(proto)===  functionPrototype||
     !!check&&
      check(
        false,
        X `For functions, a tagRecord must inherit from Function.prototype: ${val}`));$h‍_once.checkFunctionTagRecord(checkFunctionTagRecord);


harden(checkFunctionTagRecord);
})()
,
// === functors[103] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker,canBeMethod,hasOwnPropertyOf,PASS_STYLE,checkTagRecord,checkFunctionTagRecord,isObject,getTag;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["canBeMethod", [$h‍_a => (canBeMethod = $h‍_a)]],["hasOwnPropertyOf", [$h‍_a => (hasOwnPropertyOf = $h‍_a)]],["PASS_STYLE", [$h‍_a => (PASS_STYLE = $h‍_a)]],["checkTagRecord", [$h‍_a => (checkTagRecord = $h‍_a)]],["checkFunctionTagRecord", [$h‍_a => (checkFunctionTagRecord = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["getTag", [$h‍_a => (getTag = $h‍_a)]]]]]);   












/** @typedef {import('./types.js').Checker} Checker */
/** @typedef {import('./types.js').InterfaceSpec} InterfaceSpec */
/** @typedef {import('./types.js').MarshalGetInterfaceOf} MarshalGetInterfaceOf */
/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').RemotableObject} Remotable */

const { details: X, Fail, quote: q}=   assert;
const { ownKeys}=   Reflect;
const { isArray}=   Array;
const {
  getPrototypeOf,
  isFrozen,
  prototype: objectPrototype,
  getOwnPropertyDescriptors}=
    Object;

/**
 * @param {InterfaceSpec} iface
 * @param {Checker} [check]
 */
const checkIface=  (iface, check)=>  {
  const reject=  !!check&&(  (details)=>check(false, details));
  return(
    // TODO other possible ifaces, once we have third party veracity
    (typeof iface===  'string'||
       reject&&
        reject(
          X `For now, interface ${iface} must be a string; unimplemented`))&&(

     iface===  'Remotable'||
      iface.startsWith('Alleged: ')||
      iface.startsWith('DebugName: ')||
       reject&&
        reject(
          X `For now, iface ${q(
            iface)
            } must be "Remotable" or begin with "Alleged: " or "DebugName: "; unimplemented`)));


 };

/**
 * An `iface` must be pure. Right now it must be a string, which is pure.
 * Later we expect to include some other values that qualify as `PureData`,
 * which is a pass-by-copy superstructure ending only in primitives or
 * empty pass-by-copy composites. No remotables, promises, or errors.
 * We *assume* for now that the pass-by-copy superstructure contains no
 * proxies.
 *
 * @param {InterfaceSpec} iface
 */
const        assertIface=  (iface)=>checkIface(iface, assertChecker);$h‍_once.assertIface(assertIface);
harden(assertIface);

/**
 * @param {object | Function} original
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotableProtoOf=  (original, check)=>  {
  const reject=  !!check&&(  (details)=>check(false, details));
  isObject(original)||
    Fail `Remotables must be objects or functions: ${original}`;

  // A valid remotable object must inherit from a "tag record" -- a
  // plain-object prototype consisting of only
  // a `PASS_STYLE` property with value "remotable" and a suitable `Symbol.toStringTag`
  // property. The remotable could inherit directly from such a tag record, or
  // it could inherit from another valid remotable, that therefore itself
  // inherits directly or indirectly from such a tag record.
  //
  // TODO: It would be nice to typedef this shape, but we can't declare a type
  // with PASS_STYLE from JSDoc.
  //
  // @type {{ [PASS_STYLE]: string,
  //          [Symbol.toStringTag]: string,
  //        }}
  //
  const proto=  getPrototypeOf(original);
  if( proto===  objectPrototype||  proto===  null) {
    return(
      reject&&
      reject(X `Remotables must be explicitly declared: ${q(original)}`));

   }

  if( typeof original===  'object') {
    const protoProto=  getPrototypeOf(proto);
    if( protoProto!==  objectPrototype&&  protoProto!==  null) {
      // eslint-disable-next-line no-use-before-define
      return checkRemotable(proto, check);
     }
    if( !checkTagRecord(proto, 'remotable', check)) {
      return false;
     }
   }else if( typeof original===  'function') {
    if( !checkFunctionTagRecord(proto, 'remotable', check)) {
      return false;
     }
   }

  // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
  const passStyleKey=  /** @type {unknown} */  PASS_STYLE;
  const tagKey=  /** @type {unknown} */  Symbol.toStringTag;
  const {
    // checkTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
    [/** @type {string} */  passStyleKey]:  _passStyleDesc,
    [/** @type {string} */  tagKey]:  { value: iface},
    ...restDescs}=
      getOwnPropertyDescriptors(proto);

  return(
    (ownKeys(restDescs).length===  0||
       reject&&
        reject(
          X `Unexpected properties on Remotable Proto ${ownKeys(restDescs)}`))&&

    checkIface(iface, check));

 };

/**
 * Keep a weak set of confirmed remotables for marshal performance
 * (without which we would incur a redundant verification in
 * getInterfaceOf).
 * We don't remember rejections because they are possible to correct
 * with e.g. `harden`.
 *
 * @type {WeakSet<Remotable>}
 */
const confirmedRemotables=  new WeakSet();

/**
 * @param {Remotable} val
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkRemotable=  (val, check)=>  {
  if( confirmedRemotables.has(val)) {
    return true;
   }
  const reject=  !!check&&(  (details)=>check(false, details));
  if( !isFrozen(val)) {
    return reject&&  reject(X `cannot serialize non-frozen objects like ${val}`);
   }
  // eslint-disable-next-line no-use-before-define
  if( !RemotableHelper.canBeValid(val, check)) {
    return false;
   }
  const result=  checkRemotableProtoOf(val, check);
  if( result) {
    confirmedRemotables.add(val);
   }
  return result;
 };

/** @type {MarshalGetInterfaceOf} */
const        getInterfaceOf=  (val)=>{
  if(
    !isObject(val)||
    val[PASS_STYLE]!==  'remotable'||
    !checkRemotable(val))
    {
    return undefined;
   }
  return getTag(val);
 };$h‍_once.getInterfaceOf(getInterfaceOf);
harden(getInterfaceOf);

/**
 *
 * @type {PassStyleHelper}
 */
const        RemotableHelper=  harden({
  styleName: 'remotable',

  canBeValid: (candidate, check=  undefined)=>  {
    const reject=  !!check&&(  (details)=>check(false, details));
    const validType=
      (isObject(candidate)||
         reject&&
          reject(X `cannot serialize non-objects as Remotable ${candidate}`))&&(
       !isArray(candidate)||
         reject&&
          reject(X `cannot serialize arrays as Remotable ${candidate}`));
    if( !validType) {
      return false;
     }

    const descs=  getOwnPropertyDescriptors(candidate);
    if( typeof candidate===  'object') {
      // Every own property (regardless of enumerability)
      // must have a function value.
      return ownKeys(descs).every((key)=>{
        return(
          // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
          (hasOwnPropertyOf(descs[/** @type {string} */  key],  'value')||
             reject&&
              reject(
                X `cannot serialize Remotables with accessors like ${q(
                  String(key))
                  } in ${candidate}`))&&(

            key===  Symbol.toStringTag&&  checkIface(candidate[key], check)||
             (canBeMethod(candidate[key])||
               reject&&
                reject(
                  X `cannot serialize Remotables with non-methods like ${q(
                    String(key))
                    } in ${candidate}`))&&(

               key!==  PASS_STYLE||
                 reject&&
                  reject(X `A pass-by-remote cannot shadow ${q(PASS_STYLE)}`))));

       });
     }else if( typeof candidate===  'function') {
      // Far functions cannot be methods, and cannot have methods.
      // They must have exactly expected `.name` and `.length` properties
      const {
        name: nameDesc,
        length: lengthDesc,
        // @ts-ignore TS doesn't like symbols as computed indexes??
        [Symbol.toStringTag]: toStringTagDesc,
        ...restDescs}=
          descs;
      const restKeys=  ownKeys(restDescs);
      return(
        ( nameDesc&&  typeof nameDesc.value===  'string'||
           reject&&
            reject(X `Far function name must be a string, in ${candidate}`))&&(
          lengthDesc&&  typeof lengthDesc.value===  'number'||
           reject&&
            reject(
              X `Far function length must be a number, in ${candidate}`))&&(

         toStringTagDesc===  undefined||
           (typeof toStringTagDesc.value===  'string'||
             reject&&
              reject(
                X `Far function @@toStringTag must be a string, in ${candidate}`))&&

            checkIface(toStringTagDesc.value, check))&&(
         restKeys.length===  0||
           reject&&
            reject(
              X `Far functions unexpected properties besides .name and .length ${restKeys}`)));


     }
    return reject&&  reject(X `unrecognized typeof ${candidate}`);
   },

  assertValid: (candidate)=>checkRemotable(candidate, assertChecker),

  every: (_passable, _fn)=>  true});$h‍_once.RemotableHelper(RemotableHelper);
})()
,
// === functors[104] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker,PASS_STYLE,assertIface,getInterfaceOf,RemotableHelper;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["PASS_STYLE", [$h‍_a => (PASS_STYLE = $h‍_a)]]]],["./remotable.js", [["assertIface", [$h‍_a => (assertIface = $h‍_a)]],["getInterfaceOf", [$h‍_a => (getInterfaceOf = $h‍_a)]],["RemotableHelper", [$h‍_a => (RemotableHelper = $h‍_a)]]]]]);   




/** @typedef {import('./types.js').InterfaceSpec} InterfaceSpec */
/** @template L,R @typedef {import('@endo/eventual-send').RemotableBrand<L, R>} RemotableBrand */

const { quote: q, Fail}=   assert;

const { prototype: functionPrototype}=   Function;
const {
  getPrototypeOf,
  setPrototypeOf,
  create,
  isFrozen,
  prototype: objectPrototype}=
    Object;

/**
 * Now that the remotableProto does not provide its own `toString` method,
 * ensure it always inherits from something. The original prototype of
 * `remotable` if there was one, or `Object.prototype` otherwise.
 *
 * @param {object} remotable
 * @param {InterfaceSpec} iface
 * @returns {object}
 */
const makeRemotableProto=  (remotable, iface)=>  {
  let oldProto=  getPrototypeOf(remotable);
  if( typeof remotable===  'object') {
    if( oldProto===  null) {
      oldProto=  objectPrototype;
     }
    oldProto===  objectPrototype||
      Fail `For now, remotables cannot inherit from anything unusual, in ${remotable}`;
   }else if( typeof remotable===  'function') {
    oldProto!==  null||
      Fail `Original function must not inherit from null: ${remotable}`;
    oldProto===  functionPrototype||
      getPrototypeOf(oldProto)===  functionPrototype||
      Fail `Far functions must originally inherit from Function.prototype, in ${remotable}`;
   }else {
    Fail `unrecognized typeof ${remotable}`;
   }
  return harden(
    create(oldProto, {
      [PASS_STYLE]: { value: 'remotable'},
      [Symbol.toStringTag]: { value: iface}}));


 };

const assertCanBeRemotable=  (candidate)=>
  RemotableHelper.canBeValid(candidate, assertChecker);

/**
 * Create and register a Remotable.  After this, getInterfaceOf(remotable)
 * returns iface.
 *
 * // https://github.com/Agoric/agoric-sdk/issues/804
 *
 * @template {{}} T
 * @param {InterfaceSpec} [iface] The interface specification for
 * the remotable. For now, a string iface must be "Remotable" or begin with
 * "Alleged: " or "DebugName: ", to serve as the alleged name. More
 * general ifaces are not yet implemented. This is temporary. We include the
 * "Alleged" or "DebugName" as a reminder that we do not yet have SwingSet
 * or Comms Vat
 * support for ensuring this is according to the vat hosting the object.
 * Currently, Alice can tell Bob about Carol, where VatA (on Alice's behalf)
 * misrepresents Carol's `iface`. VatB and therefore Bob will then see
 * Carol's `iface` as misrepresented by VatA.
 * @param {undefined} [props] Currently may only be undefined.
 * That plan is that own-properties are copied to the remotable
 * @param {T} [remotable] The object used as the remotable
 * @returns {T & RemotableBrand<{}, T>} remotable, modified for debuggability
 */
const        Remotable=  (
  iface=  'Remotable',
  props=  undefined,
  remotable=  /** @type {T} */  {})=>
     {
  assertIface(iface);
  assert(iface);
  // TODO: When iface is richer than just string, we need to get the allegedName
  // in a different way.
  props===  undefined||  Fail `Remotable props not yet implemented ${props}`;

  // Fail fast: check that the unmodified object is able to become a Remotable.
  assertCanBeRemotable(remotable);

  // Ensure that the remotable isn't already marked.
  !(PASS_STYLE in remotable)||
    Fail `Remotable ${remotable} is already marked as a ${q(
      remotable[PASS_STYLE])
      }`;
  // `isFrozen` always returns true with a fake `harden`, but we want that case
  // to succeed anyway. Faking `harden` is only correctness preserving
  // if the code in question contains no bugs that the real `harden` would
  // have caught.
  // @ts-ignore `isFake` purposely not in the type
  harden.isFake||
    // Ensure that the remotable isn't already frozen.
    !isFrozen(remotable)||
    Fail `Remotable ${remotable} is already frozen`;
  const remotableProto=  makeRemotableProto(remotable, iface);

  // Take a static copy of the enumerable own properties as data properties.
  // const propDescs = getOwnPropertyDescriptors({ ...props });
  const mutateHardenAndCheck=  (target)=>{
    // defineProperties(target, propDescs);
    setPrototypeOf(target, remotableProto);
    harden(target);
    assertCanBeRemotable(target);
   };

  // Fail fast: check a fresh remotable to see if our rules fit.
  mutateHardenAndCheck({});

  // Actually finish the new remotable.
  mutateHardenAndCheck(remotable);

  // COMMITTED!
  // We're committed, so keep the interface for future reference.
  assert(iface!==  undefined); // To make TypeScript happy
  return (/** @type {T & RemotableBrand<{}, T>} */ remotable);
 };$h‍_once.Remotable(Remotable);
harden(Remotable);

/**
 * A concise convenience for the most common `Remotable` use.
 *
 * @template {{}} T
 * @param {string} farName This name will be prepended with `Alleged: `
 * for now to form the `Remotable` `iface` argument.
 * @param {T} [remotable] The object used as the remotable
 */
const        Far=  (farName, remotable=  undefined)=>  {
  const r=  remotable===  undefined?  /** @type {T} */  {}:   remotable;
  return Remotable( `Alleged: ${farName}`,undefined, r);
 };$h‍_once.Far(Far);
harden(Far);

/**
 * Coerce `func` to a far function that preserves its call behavior.
 * If it is already a far function, return it. Otherwise make and return a
 * new far function that wraps `func` and forwards calls to it. This
 * works even if `func` is already frozen. `ToFarFunction` is to be used
 * when the function comes from elsewhere under less control. For functions
 * you author in place, better to use `Far` on their function literal directly.
 *
 * @param {string} farName to be used only if `func` is not already a
 * far function.
 * @param {(...args: any[]) => any} func
 */
const        ToFarFunction=  (farName, func)=>  {
  if( getInterfaceOf(func)!==  undefined) {
    return func;
   }
  return Far(farName, (...args)=>  func(...args));
 };$h‍_once.ToFarFunction(ToFarFunction);
harden(ToFarFunction);
})()
,
// === functors[105] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Far;$h‍_imports([["./make-far.js", [["Far", [$h‍_a => (Far = $h‍_a)]]]]]);   

/**
 * The result iterator has as many elements as the `baseIterator` and
 * have the same termination -- the same completion value or failure
 * reason. But the non-final values are the corresponding non-final
 * values from `baseIterator` as transformed by `func`.
 *
 * @template T,U
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => U} func
 * @returns {Iterable<U>}
 */
const        mapIterable=  (baseIterable, func)=>
  /** @type {Iterable<U>} */
  Far('mapped iterable', {
    [Symbol.iterator]: ()=>  {
      const baseIterator=  baseIterable[Symbol.iterator]();
      return Far('mapped iterator', {
        next: ()=>  {
          const { value: baseValue, done}=   baseIterator.next();
          const value=  done?  baseValue:  func(baseValue);
          return harden({ value, done});
         }});

     }});$h‍_once.mapIterable(mapIterable);

harden(mapIterable);

/**
 * The result iterator has a subset of the non-final values from the
 * `baseIterator` --- those for which `pred(value)` was truthy. The result
 * has the same termination as the `baseIterator` -- the same completion value
 * or failure reason.
 *
 * @template T
 * @param {Iterable<T>} baseIterable
 * @param {(value: T) => boolean} pred
 * @returns {Iterable<T>}
 */
const        filterIterable=  (baseIterable, pred)=>
  /** @type {Iterable<U>} */
  Far('filtered iterable', {
    [Symbol.iterator]: ()=>  {
      const baseIterator=  baseIterable[Symbol.iterator]();
      return Far('filtered iterator', {
        next: ()=>  {
          for(;;)  {
            const result=  baseIterator.next();
            const { value, done}=   result;
            if( done||  pred(value)) {
              return result;
             }
           }
         }});

     }});$h‍_once.filterIterable(filterIterable);

harden(filterIterable);
})()
,
// === functors[106] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]]]]]);   



/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Checker} Checker */

const { details: X, Fail}=   assert;
const { getPrototypeOf, getOwnPropertyDescriptors}=   Object;
const { ownKeys}=   Reflect;

// TODO: Maintenance hazard: Coordinate with the list of errors in the SES
// whilelist. Currently, both omit AggregateError, which is now standard. Both
// must eventually include it.
const errorConstructors=  new Map([
  ['Error', Error],
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError]]);


const        getErrorConstructor=  (name)=>errorConstructors.get(name);$h‍_once.getErrorConstructor(getErrorConstructor);
harden(getErrorConstructor);

/**
 * @param {unknown} candidate
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkErrorLike=  (candidate, check=  undefined)=>  {
  const reject=  !!check&&(  (details)=>check(false, details));
  // TODO: Need a better test than instanceof
  return(
    candidate instanceof Error||
     reject&&  reject(X `Error expected: ${candidate}`));

 };
harden(checkErrorLike);

/**
 * Validating error objects are passable raises a tension between security
 * vs preserving diagnostic information. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error-like test succeed and to couch these
 * complaints as notes on the error.
 *
 * To resolve this, such a malformed error object will still pass
 * `isErrorLike` so marshal can use this for top level error to report from,
 * even if it would not actually validate.
 * Instead, the diagnostics that `assertError` would have reported are
 * attached as notes to the malformed error. Thus, a malformed
 * error is passable by itself, but not as part of a passable structure.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
const        isErrorLike=  (candidate)=>checkErrorLike(candidate);$h‍_once.isErrorLike(isErrorLike);
harden(isErrorLike);

/**
 * @type {PassStyleHelper}
 */
const        ErrorHelper=  harden({
  styleName: 'error',

  canBeValid: checkErrorLike,

  assertValid: (candidate)=>{
    ErrorHelper.canBeValid(candidate, assertChecker);
    const proto=  getPrototypeOf(candidate);
    const { name}=   proto;
    const EC=  getErrorConstructor(name);
     EC&&  EC.prototype===  proto||
      Fail `Errors must inherit from an error class .prototype ${candidate}`;

    const {
      // TODO Must allow `cause`, `errors`
      message: mDesc,
      stack: stackDesc,
      ...restDescs}=
        getOwnPropertyDescriptors(candidate);
    ownKeys(restDescs).length<  1||
      Fail `Passed Error has extra unpassed properties ${restDescs}`;
    if( mDesc) {
      typeof mDesc.value===  'string'||
        Fail `Passed Error "message" ${mDesc} must be a string-valued data property.`;
      !mDesc.enumerable||
        Fail `Passed Error "message" ${mDesc} must not be enumerable`;
     }
    if( stackDesc) {
      typeof stackDesc.value===  'string'||
        Fail `Passed Error "stack" ${stackDesc} must be a string-valued data property.`;
      !stackDesc.enumerable||
        Fail `Passed Error "stack" ${stackDesc} must not be enumerable`;
     }
    return true;
   }});


/**
 * Return a new passable error that propagates the diagnostic info of the
 * original, and is linked to the original as a note.
 *
 * @param {Error} err
 * @returns {Error}
 */$h‍_once.ErrorHelper(ErrorHelper);
const        toPassableError=  (err)=>{
  const { name, message}=   err;

  const EC=  getErrorConstructor( `${name}`)|| Error;
  const newError=  harden(new EC( `${message}`));
  // Even the cleaned up error copy, if sent to the console, should
  // cause hidden diagnostic information of the original error
  // to be logged.
  assert.note(newError, X `copied from error ${err}`);
  return newError;
 };$h‍_once.toPassableError(toPassableError);
harden(toPassableError);
})()
,
// === functors[107] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   const { Fail, quote: q}=   assert;
const { ownKeys}=   Reflect;

/**
 * The well known symbols are static symbol values on the `Symbol` constructor.
 */
const wellKnownSymbolNames=  new Map(
  ownKeys(Symbol).
     filter(
      (name)=>typeof name===  'string'&&  typeof Symbol[name]===  'symbol').

     filter((name)=>{
      // @ts-expect-error It doesn't know name cannot be a symbol
      !name.startsWith('@@')||
        Fail `Did not expect Symbol to have a symbol-valued property name starting with "@@" ${q(
          name)
          }`;
      return true;
     })
    // @ts-ignore It doesn't know name cannot be a symbol
.    map((name)=>[Symbol[name],  `@@${name}`]));


/**
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols.
 *
 * @param {any} sym
 * @returns {boolean}
 */
const        isPassableSymbol=  (sym)=>
  typeof sym===  'symbol'&&(
   typeof Symbol.keyFor(sym)===  'string'||  wellKnownSymbolNames.has(sym));$h‍_once.isPassableSymbol(isPassableSymbol);
harden(isPassableSymbol);

const        assertPassableSymbol=  (sym)=>
  isPassableSymbol(sym)||
  Fail `Only registered symbols or well-known symbols are passable: ${q(sym)}`;$h‍_once.assertPassableSymbol(assertPassableSymbol);
harden(assertPassableSymbol);

/**
 * If `sym` is a passable symbol, return a string that uniquely identifies this
 * symbol. If `sym` is a non-passable symbol, return `undefined`.
 *
 * The passable symbols are the well known symbols (the symbol values
 * of static properties of the `Symbol` constructor) and the registered
 * symbols. Since the registration string of a registered symbol can be any
 * string, if we simply used that to identify those symbols, there would not
 * be any remaining strings left over to identify the well-known symbols.
 * Instead, we reserve strings beginning with `"@@"` for purposes of this
 * encoding. We identify a well known symbol such as `Symbol.iterator`
 * by prefixing the property name with `"@@"`, such as `"@@iterator"`.
 * For registered symbols whose name happens to begin with `"@@"`, such
 * as `Symbol.for('@@iterator')` or `Symbol.for('@@foo')`, we identify
 * them by prefixing them with an extra `"@@"`, such as
 * `"@@@@iterator"` or `"@@@@foo"`. (This is the Hilbert Hotel encoding
 * technique.)
 *
 * @param {symbol} sym
 * @returns {string=}
 */
const        nameForPassableSymbol=  (sym)=>{
  const name=  Symbol.keyFor(sym);
  if( name===  undefined) {
    return wellKnownSymbolNames.get(sym);
   }
  if( name.startsWith('@@')) {
    return  `@@${name}`;
   }
  return name;
 };$h‍_once.nameForPassableSymbol(nameForPassableSymbol);
harden(nameForPassableSymbol);

const AtAtPrefixPattern=  /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * If `name` is a string that could have been produced by
 * `nameForPassableSymbol`, return the symbol argument it was produced to
 * represent.
 *
 *    If `name` does not begin with `"@@"`, then just the corresponding
 *      registered symbol, `Symbol.for(name)`.
 *    If `name` is `"@@"` followed by a well known symbol's property name on
 *      `Symbol` such `"@@iterator", return that well known symbol such as
 *      `Symbol.iterator`
 *    If `name` begins with `"@@@@"` it encodes the registered symbol whose
 *      name begins with `"@@"` instead.
 *    Otherwise, if name begins with `"@@"` it may encode a registered symbol
 *      from a future version of JavaScript, but it is not one we can decode
 *      yet, so throw.
 *
 * @param {string} name
 * @returns {symbol=}
 */
const        passableSymbolForName=  (name)=>{
  if( typeof name!==  'string') {
    return undefined;
   }
  const match=  AtAtPrefixPattern.exec(name);
  if( match) {
    const suffix=  match[1];
    if( suffix.startsWith('@@')) {
      return Symbol.for(suffix);
     }else {
      const sym=  Symbol[suffix];
      if( typeof sym===  'symbol') {
        return sym;
       }
      Fail `Reserved for well known symbol ${q(suffix)}: ${q(name)}`;
     }
   }
  return Symbol.for(name);
 };$h‍_once.passableSymbolForName(passableSymbolForName);
harden(passableSymbolForName);
})()
,
// === functors[108] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker,checkNormalProperty;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["checkNormalProperty", [$h‍_a => (checkNormalProperty = $h‍_a)]]]]]);   



const { details: X}=   assert;
const { getPrototypeOf}=   Object;
const { ownKeys}=   Reflect;
const { isArray, prototype: arrayPrototype}=   Array;

/**
 * @param {unknown} candidate
 * @param {import('./types.js').Checker} [check]
 * @returns {boolean}
 */
const canBeValid=  (candidate, check=  undefined)=>
  isArray(candidate)||
   !!check&&  check(false, X `Array expected: ${candidate}`);

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
const        CopyArrayHelper=  harden({
  styleName: 'copyArray',

  canBeValid,

  assertValid: (candidate, passStyleOfRecur)=>  {
    canBeValid(candidate, assertChecker);
    getPrototypeOf(candidate)===  arrayPrototype||
      assert.fail(X `Malformed array: ${candidate}`,TypeError);
    // Since we're already ensured candidate is an array, it should not be
    // possible for the following test to fail
    checkNormalProperty(candidate, 'length', false, assertChecker);
    const len=  /** @type {unknown[]} */  candidate. length;
    for( let i=  0; i<  len; i+=  1) {
      checkNormalProperty(candidate, i, true, assertChecker);
     }
    // +1 for the 'length' property itself.
    ownKeys(candidate).length===  len+  1||
      assert.fail(X `Arrays must not have non-indexes: ${candidate}`,TypeError);
    // Recursively validate that each member is passable.
    candidate.every((v)=>!!passStyleOfRecur(v));
   }});$h‍_once.CopyArrayHelper(CopyArrayHelper);
})()
,
// === functors[109] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker,canBeMethod,checkNormalProperty;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["canBeMethod", [$h‍_a => (canBeMethod = $h‍_a)]],["checkNormalProperty", [$h‍_a => (checkNormalProperty = $h‍_a)]]]]]);   







const { details: X}=   assert;
const { ownKeys}=   Reflect;
const { getPrototypeOf, values, prototype: objectPrototype}=   Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
const        CopyRecordHelper=  harden({
  styleName: 'copyRecord',

  canBeValid: (candidate, check=  undefined)=>  {
    const reject=  !!check&&(  (details)=>check(false, details));
    if( getPrototypeOf(candidate)!==  objectPrototype) {
      return(
        reject&&
        reject(X `Records must inherit from Object.prototype: ${candidate}`));

     }

    return ownKeys(candidate).every((key)=>{
      return(
        (typeof key===  'string'||
           !!reject&&
            reject(
              X `Records can only have string-named properties: ${candidate}`))&&(

         !canBeMethod(candidate[key])||
           !!reject&&
            reject(
              // TODO: Update message now that there is no such thing as "implicit Remotable".
              X `Records cannot contain non-far functions because they may be methods of an implicit Remotable: ${candidate}`)));


     });
   },

  assertValid: (candidate, passStyleOfRecur)=>  {
    CopyRecordHelper.canBeValid(candidate, assertChecker);
    for( const name of ownKeys(candidate)) {
      checkNormalProperty(candidate, name, true, assertChecker);
     }
    // Recursively validate that each member is passable.
    for( const val of values(candidate)) {
      passStyleOfRecur(val);
     }
   }});$h‍_once.CopyRecordHelper(CopyRecordHelper);
})()
,
// === functors[110] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let assertChecker,checkTagRecord,PASS_STYLE,checkNormalProperty,checkPassStyle;$h‍_imports([["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["checkTagRecord", [$h‍_a => (checkTagRecord = $h‍_a)]],["PASS_STYLE", [$h‍_a => (PASS_STYLE = $h‍_a)]],["checkNormalProperty", [$h‍_a => (checkNormalProperty = $h‍_a)]],["checkPassStyle", [$h‍_a => (checkPassStyle = $h‍_a)]]]]]);   









const { Fail}=   assert;
const { ownKeys}=   Reflect;
const { getOwnPropertyDescriptors}=   Object;

/**
 *
 * @type {import('./internal-types.js').PassStyleHelper}
 */
const        TaggedHelper=  harden({
  styleName: 'tagged',

  canBeValid: (candidate, check=  undefined)=>
    checkPassStyle(candidate, 'tagged', check),

  assertValid: (candidate, passStyleOfRecur)=>  {
    checkTagRecord(candidate, 'tagged', assertChecker);

    // Typecasts needed due to https://github.com/microsoft/TypeScript/issues/1863
    const passStyleKey=  /** @type {unknown} */  PASS_STYLE;
    const tagKey=  /** @type {unknown} */  Symbol.toStringTag;
    const {
      // checkTagRecord already verified PASS_STYLE and Symbol.toStringTag own data properties.
      [/** @type {string} */  passStyleKey]:  _passStyleDesc,
      [/** @type {string} */  tagKey]:  _labelDesc,
      payload: _payloadDesc, // value checked by recursive walk at the end
      ...restDescs}=
        getOwnPropertyDescriptors(candidate);
    ownKeys(restDescs).length===  0||
      Fail `Unexpected properties on tagged record ${ownKeys(restDescs)}`;

    checkNormalProperty(candidate, 'payload', true, assertChecker);

    // Recursively validate that each member is passable.
    passStyleOfRecur(candidate.payload);
   }});$h‍_once.TaggedHelper(TaggedHelper);
})()
,
// === functors[111] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let isPromise,assertChecker,hasOwnPropertyOf;$h‍_imports([["@endo/promise-kit", [["isPromise", [$h‍_a => (isPromise = $h‍_a)]]]],["./passStyle-helpers.js", [["assertChecker", [$h‍_a => (assertChecker = $h‍_a)]],["hasOwnPropertyOf", [$h‍_a => (hasOwnPropertyOf = $h‍_a)]]]]]);   




/** @typedef {import('./types.js').Checker} Checker */

const { details: X, quote: q}=   assert;
const { isFrozen, getPrototypeOf}=   Object;
const { ownKeys}=   Reflect;

/**
 * @param {Promise} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkPromiseOwnKeys=  (pr, check)=>  {
  const reject=  (details)=>check(false, details);
  const keys=  ownKeys(pr);

  if( keys.length===  0) {
    return true;
   }

  const unknownKeys=  keys.filter(
    (key)=>typeof key!==  'symbol'||  !hasOwnPropertyOf(Promise.prototype, key));


  if( unknownKeys.length!==  0) {
    return reject(
      X `${pr} - Must not have any own properties: ${q(unknownKeys)}`);

   }

  /**
   * At the time of this writing, Node's async_hooks contains the
   * following code, which we can also safely tolerate
   *
   * ```js
   * function destroyTracking(promise, parent) {
   * trackPromise(promise, parent);
   *   const asyncId = promise[async_id_symbol];
   *   const destroyed = { destroyed: false };
   *   promise[destroyedSymbol] = destroyed;
   *   registerDestroyHook(promise, asyncId, destroyed);
   * }
   * ```
   *
   * @param {string|symbol} key
   */
  const checkSafeAsyncHooksKey=  (key)=>{
    const val=  pr[key];
    if( val===  undefined||  typeof val===  'number') {
      return true;
     }
    if(
      typeof val===  'object'&&
      val!==  null&&
      isFrozen(val)&&
      getPrototypeOf(val)===  Object.prototype)
      {
      const subKeys=  ownKeys(val);
      if( subKeys.length===  0) {
        return true;
       }

      if(
        subKeys.length===  1&&
        subKeys[0]===  'destroyed'&&
        val.destroyed===  false)
        {
        return true;
       }
     }
    return reject(
      X `Unexpected Node async_hooks additions to promise: ${pr}.${q(
        String(key))
        } is ${val}`);

   };

  return keys.every(checkSafeAsyncHooksKey);
 };

/**
 * Under Hardened JS a promise is "safe" if its `then` method can be called
 * synchronously without giving the promise an opportunity for a
 * reentrancy attack during that call.
 *
 * https://github.com/Agoric/agoric-sdk/issues/9
 * raises the issue of testing that a specimen is a safe promise
 * such that the test also does not give the specimen a
 * reentrancy opportunity. That is well beyond the ambition here.
 * TODO Though if we figure out a nice solution, it might be good to
 * use it here as well.
 *
 * @param {unknown} pr The value to examine
 * @param {Checker} check
 * @returns {pr is Promise} Whether it is a safe promise
 */
const checkSafePromise=  (pr, check)=>  {
  const reject=  (details)=>check(false, details);
  return(
    (isFrozen(pr)||  reject(X `${pr} - Must be frozen`))&&(
     isPromise(pr)||  reject(X `${pr} - Must be a promise`))&&(
     getPrototypeOf(pr)===  Promise.prototype||
      reject(
        X `${pr} - Must inherit from Promise.prototype: ${q(
          getPrototypeOf(pr))
          }`))&&

    checkPromiseOwnKeys(/** @type {Promise} */  pr,  check));

 };
harden(checkSafePromise);

/**
 * Determine if the argument is a Promise.
 *
 * @param {unknown} pr The value to examine
 * @returns {pr is Promise} Whether it is a promise
 */
const        isSafePromise=  (pr)=>checkSafePromise(pr, (x)=>x);$h‍_once.isSafePromise(isSafePromise);
harden(isSafePromise);

const        assertSafePromise=  (pr)=>checkSafePromise(pr, assertChecker);$h‍_once.assertSafePromise(assertSafePromise);
})()
,
// === functors[112] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let isPromise,isObject,isTypedArray,PASS_STYLE,CopyArrayHelper,CopyRecordHelper,TaggedHelper,ErrorHelper,RemotableHelper,assertPassableSymbol,assertSafePromise;$h‍_imports([["@endo/promise-kit", [["isPromise", [$h‍_a => (isPromise = $h‍_a)]]]],["./passStyle-helpers.js", [["isObject", [$h‍_a => (isObject = $h‍_a)]],["isTypedArray", [$h‍_a => (isTypedArray = $h‍_a)]],["PASS_STYLE", [$h‍_a => (PASS_STYLE = $h‍_a)]]]],["./copyArray.js", [["CopyArrayHelper", [$h‍_a => (CopyArrayHelper = $h‍_a)]]]],["./copyRecord.js", [["CopyRecordHelper", [$h‍_a => (CopyRecordHelper = $h‍_a)]]]],["./tagged.js", [["TaggedHelper", [$h‍_a => (TaggedHelper = $h‍_a)]]]],["./error.js", [["ErrorHelper", [$h‍_a => (ErrorHelper = $h‍_a)]]]],["./remotable.js", [["RemotableHelper", [$h‍_a => (RemotableHelper = $h‍_a)]]]],["./symbol.js", [["assertPassableSymbol", [$h‍_a => (assertPassableSymbol = $h‍_a)]]]],["./safe-promise.js", [["assertSafePromise", [$h‍_a => (assertSafePromise = $h‍_a)]]]]]);   















/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Passable} Passable */
/** @typedef {import('./types.js').PassStyle} PassStyle */
/** @typedef {import('./types.js').PassStyleOf} PassStyleOf */
/** @typedef {import('./types.js').PrimitiveStyle} PrimitiveStyle */

/** @typedef {Exclude<PassStyle, PrimitiveStyle | "promise">} HelperPassStyle */

const { details: X, Fail, quote: q}=   assert;
const { ownKeys}=   Reflect;
const { isFrozen}=   Object;

/**
 * @param {PassStyleHelper[]} passStyleHelpers
 * @returns {Record<HelperPassStyle, PassStyleHelper> }
 */

const makeHelperTable=  (passStyleHelpers)=>{
  /** @type {Record<HelperPassStyle, any> & {__proto__: null}} */
  const HelperTable=  {
    __proto__: null,
    copyArray: undefined,
    copyRecord: undefined,
    tagged: undefined,
    error: undefined,
    remotable: undefined};

  for( const helper of passStyleHelpers) {
    const { styleName}=   helper;
    styleName in HelperTable||  Fail `Unrecognized helper: ${q(styleName)}`;
    HelperTable[styleName]===  undefined||
      Fail `conflicting helpers for ${q(styleName)}`;
    HelperTable[styleName]=  helper;
   }
  for( const styleName of ownKeys(HelperTable)) {
    HelperTable[styleName]!==  undefined||
      Fail `missing helper for ${q(styleName)}`;
   }

  return harden(HelperTable);
 };

/**
 * @param {PassStyleHelper[]} passStyleHelpers The passStyleHelpers to register,
 * in priority order.
 * NOTE These must all be "trusted",
 * complete, and non-colliding. `makePassStyleOf` may *assume* that each helper
 * does what it is supposed to do. `makePassStyleOf` is not trying to defend
 * itself against malicious helpers, though it does defend against some
 * accidents.
 * @returns {PassStyleOf}
 */
const makePassStyleOf=  (passStyleHelpers)=>{
  const HelperTable=  makeHelperTable(passStyleHelpers);
  const remotableHelper=  HelperTable.remotable;

  /**
   * Purely for performance. However it is mutable static state, and
   * it does have some observability on proxies. TODO need to assess
   * whether this creates a static communications channel.
   *
   * passStyleOf does a full recursive walk of pass-by-copy
   * structures, in order to validate that they are acyclic. In addition
   * it is used by other algorithms to recursively walk these pass-by-copy
   * structures, so without this cache, these algorithms could be
   * O(N**2) or worse.
   *
   * @type {WeakMap<Passable, PassStyle>}
   */
  const passStyleMemo=  new WeakMap();

  /**
   * @type {PassStyleOf}
   */
  const passStyleOf=  (passable)=>{
    // Even when a WeakSet is correct, when the set has a shorter lifetime
    // than its keys, we prefer a Set due to expected implementation
    // tradeoffs.
    const inProgress=  new Set();

    /**
     * @type {PassStyleOf}
     */
    const passStyleOfRecur=  (inner)=>{
      const innerIsObject=  isObject(inner);
      if( innerIsObject) {
        if( passStyleMemo.has(inner)) {
          // @ts-ignore TypeScript doesn't know that `get` after `has` is safe
          return passStyleMemo.get(inner);
         }
        !inProgress.has(inner)||
          Fail `Pass-by-copy data cannot be cyclic ${inner}`;
        inProgress.add(inner);
       }
      // eslint-disable-next-line no-use-before-define
      const passStyle=  passStyleOfInternal(inner);
      if( innerIsObject) {
        passStyleMemo.set(inner, passStyle);
        inProgress.delete(inner);
       }
      return passStyle;
     };

    /**
     * @type {PassStyleOf}
     */
    const passStyleOfInternal=  (inner)=>{
      const typestr=  typeof inner;
      switch( typestr){
        case 'undefined':
        case 'string':
        case 'boolean':
        case 'number':
        case 'bigint': {
          return typestr;
         }
        case 'symbol': {
          assertPassableSymbol(inner);
          return 'symbol';
         }
        case 'object': {
          if( inner===  null) {
            return 'null';
           }
          if( !isFrozen(inner)) {
            assert.fail(
              // TypedArrays get special treatment in harden()
              // and a corresponding special error message here.
              isTypedArray(inner)?
                  X `Cannot pass mutable typed arrays like ${inner}.`:
                  X `Cannot pass non-frozen objects like ${inner}. Use harden()`);

           }
          if( isPromise(inner)) {
            assertSafePromise(inner);
            return 'promise';
           }
          typeof inner.then!==  'function'||
            Fail `Cannot pass non-promise thenables`;
          const passStyleTag=  inner[PASS_STYLE];
          if( passStyleTag!==  undefined) {
            assert.typeof(passStyleTag, 'string');
            const helper=  HelperTable[passStyleTag];
            helper!==  undefined||
              Fail `Unrecognized PassStyle: ${q(passStyleTag)}`;
            helper.assertValid(inner, passStyleOfRecur);
            return (/** @type {PassStyle} */ passStyleTag);
           }
          for( const helper of passStyleHelpers) {
            if( helper.canBeValid(inner)) {
              helper.assertValid(inner, passStyleOfRecur);
              return helper.styleName;
             }
           }
          remotableHelper.assertValid(inner, passStyleOfRecur);
          return 'remotable';
         }
        case 'function': {
          isFrozen(inner)||
            Fail `Cannot pass non-frozen objects like ${inner}. Use harden()`;
          typeof inner.then!==  'function'||
            Fail `Cannot pass non-promise thenables`;
          remotableHelper.assertValid(inner, passStyleOfRecur);
          return 'remotable';
         }
        default: {
          throw assert.fail(X `Unrecognized typeof ${q(typestr)}`,TypeError);
         }}

     };

    return passStyleOfRecur(passable);
   };
  return harden(passStyleOf);
 };

/**
 * If there is already a `VataData` global containing a `passStyleOf`,
 * then presumably it was endowed for us by liveslots, so we should use
 * and export that one instead. Other software may have left it for us here,
 * but it would require write access to our global, or the ability to
 * provide endowments to our global, both of which seems adequate as a test of
 * whether it is authorized to serve the same role as liveslots.
 *
 * NOTE HAZARD: This use by liveslots does rely on `passStyleOf` being
 * deterministic. If it is not, then in a liveslot-like virtualized
 * environment, it can be used to detect GC.
 *
 * @type {PassStyleOf}
 */
const        passStyleOf=
  // UNTIL https://github.com/endojs/endo/issues/1514
  // Prefer: globalThis?.VatData?.passStyleOf ||
   globalThis&&  globalThis.VatData&&  globalThis.VatData.passStyleOf||
  makePassStyleOf([
    CopyArrayHelper,
    CopyRecordHelper,
    TaggedHelper,
    ErrorHelper,
    RemotableHelper]);$h‍_once.passStyleOf(passStyleOf);


const        assertPassable=  (val)=>{
  passStyleOf(val); // throws if val is not a passable
 };$h‍_once.assertPassable(assertPassable);
harden(assertPassable);
})()
,
// === functors[113] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let PASS_STYLE,assertPassable;$h‍_imports([["./passStyle-helpers.js", [["PASS_STYLE", [$h‍_a => (PASS_STYLE = $h‍_a)]]]],["./passStyleOf.js", [["assertPassable", [$h‍_a => (assertPassable = $h‍_a)]]]]]);   




const { create, prototype: objectPrototype}=   Object;
const { Fail}=   assert;

const        makeTagged=  (tag, payload)=>  {
  typeof tag===  'string'||
    Fail `The tag of a tagged record must be a string: ${tag}`;
  assertPassable(harden(payload));
  return harden(
    create(objectPrototype, {
      [PASS_STYLE]: { value: 'tagged'},
      [Symbol.toStringTag]: { value: tag},
      payload: { value: payload, enumerable: true}}));


 };$h‍_once.makeTagged(makeTagged);
harden(makeTagged);
})()
,
// === functors[114] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let passStyleOf;$h‍_imports([["./passStyleOf.js", [["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]]]]]);   

/** @typedef {import('./types.js').Passable} Passable */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyArray<T>} CopyArray
 */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('./types.js').CopyRecord<T>} CopyRecord
 */
/** @typedef {import('./types.js').RemotableObject} Remotable */

const { Fail, quote: q}=   assert;

/**
 * Check whether the argument is a pass-by-copy array, AKA a "copyArray"
 * in @endo/marshal terms
 *
 * @param {Passable} arr
 * @returns {arr is CopyArray<any>}
 */
const isCopyArray=  (arr)=>passStyleOf(arr)===  'copyArray';$h‍_once.isCopyArray(isCopyArray);
harden(isCopyArray);

/**
 * Check whether the argument is a pass-by-copy record, AKA a
 * "copyRecord" in @endo/marshal terms
 *
 * @param {Passable} record
 * @returns {record is CopyRecord<any>}
 */
const isRecord=  (record)=>passStyleOf(record)===  'copyRecord';$h‍_once.isRecord(isRecord);
harden(isRecord);

/**
 * Check whether the argument is a remotable.
 *
 * @param {Passable} remotable
 * @returns {remotable is Remotable}
 */
const isRemotable=  (remotable)=>passStyleOf(remotable)===  'remotable';$h‍_once.isRemotable(isRemotable);
harden(isRemotable);

/**
 * @callback AssertArray
 * @param {Passable} array
 * @param {string=} optNameOfArray
 * @returns {asserts array is CopyArray<any>}
 */

/** @type {AssertArray} */
const assertCopyArray=  (array, optNameOfArray=  'Alleged array')=>  {
  const passStyle=  passStyleOf(array);
  passStyle===  'copyArray'||
    Fail `${q(optNameOfArray)} ${array} must be a pass-by-copy array, not ${q(
      passStyle)
      }`;
 };$h‍_once.assertCopyArray(assertCopyArray);
harden(assertCopyArray);

/**
 * @callback AssertRecord
 * @param {Passable} record
 * @param {string=} optNameOfRecord
 * @returns {asserts record is CopyRecord<any>}
 */

/** @type {AssertRecord} */
const assertRecord=  (record, optNameOfRecord=  'Alleged record')=>  {
  const passStyle=  passStyleOf(record);
  passStyle===  'copyRecord'||
    Fail `${q(optNameOfRecord)} ${record} must be a pass-by-copy record, not ${q(
      passStyle)
      }`;
 };$h‍_once.assertRecord(assertRecord);
harden(assertRecord);

/**
 * @callback AssertRemotable
 * @param {Passable} remotable
 * @param {string=} optNameOfRemotable
 * @returns {asserts remotable is Remotable}
 */

/** @type {AssertRemotable} */
const assertRemotable=  (
  remotable,
  optNameOfRemotable=  'Alleged remotable')=>
     {
  const passStyle=  passStyleOf(remotable);
  passStyle===  'remotable'||
    Fail `${q(optNameOfRemotable)} ${remotable} must be a remotable, not ${q(
      passStyle)
      }`;
 };$h‍_once.assertRemotable(assertRemotable);
harden(assertRemotable);
})()
,
// === functors[115] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   
})()
,
// === functors[116] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./src/iter-helpers.js", []],["./src/passStyle-helpers.js", []],["./src/error.js", []],["./src/remotable.js", []],["./src/symbol.js", []],["./src/passStyleOf.js", []],["./src/makeTagged.js", []],["./src/make-far.js", []],["./src/typeGuards.js", []],["./src/types.js", []]]);   
})()
,
// === functors[117] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["@endo/eventual-send", []],["@endo/pass-style", []]]);   
})()
,
// === functors[118] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);Object.defineProperty(isNat, 'name', {value: "isNat"});$h‍_once.isNat(isNat);Object.defineProperty(Nat, 'name', {value: "Nat"});$h‍_once.Nat(Nat);   // Copyright (C) 2011 Google Inc.
// Copyright (C) 2018 Agoric
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// @ts-check

/**
 * Is `allegedNum` a number in the [contiguous range of exactly and
 * unambiguously
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 *  natural numbers (non-negative integers)?
 *
 * To qualify `allegedNum` must either be a
 * non-negative `bigint`, or a non-negative `number` representing an integer
 * within range of [integers safely representable in
 * floating point](https://tc39.es/ecma262/#sec-number.issafeinteger).
 *
 * @param {unknown} allegedNum
 * @returns {boolean}
 */
function isNat(allegedNum) {
  if( typeof allegedNum===  'bigint') {
    return allegedNum>=  0;
   }
  if( typeof allegedNum!==  'number') {
    return false;
   }

  return Number.isSafeInteger(allegedNum)&&  allegedNum>=  0;
 }

/**
 * If `allegedNumber` passes the `isNat` test, then return it as a bigint.
 * Otherwise throw an appropriate error.
 *
 * If `allegedNum` is neither a bigint nor a number, `Nat` throws a `TypeError`.
 * Otherwise, if it is not a [safely
 * representable](https://esdiscuss.org/topic/more-numeric-constants-please-especially-epsilon#content-14)
 * non-negative integer, `Nat` throws a `RangeError`.
 * Otherwise, it is converted to a bigint if necessary and returned.
 *
 * @param {unknown} allegedNum
 * @returns {bigint}
 */
function Nat(allegedNum) {
  if( typeof allegedNum===  'bigint') {
    if( allegedNum<  0) {
      throw RangeError( `${allegedNum} is negative`);
     }
    return allegedNum;
   }

  if( typeof allegedNum===  'number') {
    if( !Number.isSafeInteger(allegedNum)) {
      throw RangeError( `${allegedNum} not a safe integer`);
     }
    if( allegedNum<  0) {
      throw RangeError( `${allegedNum} is negative`);
     }
    return BigInt(allegedNum);
   }

  throw TypeError(
     `${allegedNum} is a ${typeof allegedNum} but must be a bigint or a number`);

 }
})()
,
// === functors[119] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let E,isPromise,getTag,isObject,makeTagged,passStyleOf;$h‍_imports([["@endo/eventual-send", [["E", [$h‍_a => (E = $h‍_a)]]]],["@endo/promise-kit", [["isPromise", [$h‍_a => (isPromise = $h‍_a)]]]],["@endo/pass-style", [["getTag", [$h‍_a => (getTag = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["makeTagged", [$h‍_a => (makeTagged = $h‍_a)]],["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]]]]]);   





/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @template T @typedef {import('@endo/eventual-send').ERef<T>} ERef */

const { details: X, quote: q}=   assert;
const { ownKeys}=   Reflect;
const { fromEntries}=   Object;

/**
 * Given a Passable `val` whose pass-by-copy structure may contain leaf
 * promises, return a promise for a replacement Passable,
 * where that replacement is *deeply fulfilled*, i.e., its
 * pass-by-copy structure does not contain any promises.
 *
 * This is a deep form of `Promise.all` specialized for Passables. For each
 * encountered promise, replace it with the deeply fulfilled form of
 * its fulfillment.
 * If any of the promises reject, then the promise for the replacement
 * rejects. If any of the promises never settle, then the promise for
 * the replacement never settles.
 *
 * If the replacement would not be Passable, i.e., if `val` is not
 * Passable, or if any of the transitive promises fulfill to something
 * that is not Passable, then the returned promise rejects.
 *
 * If `val` or its parts are non-key Passables only *because* they contains
 * promises, the deeply fulfilled forms of val or its parts may be keys. This
 * is for the higher "store" level of abstraction to determine, because it
 * defines the "key" notion in question.
 *
 * // TODO: That higher level is in the process of being migrated from
 * // `@agoric/store` to `@endo/patterns`. Once that is far enough along,
 * // revise the above comment to match.
 * // See https://github.com/endojs/endo/pull/1451
 *
 * @param {Passable} val
 * @returns {Promise<Passable>}
 */
const        deeplyFulfilled=  async(val)=> {
  if( !isObject(val)) {
    return val;
   }
  if( isPromise(val)) {
    return E.when(val, (nonp)=>deeplyFulfilled(nonp));
   }
  const passStyle=  passStyleOf(val);
  switch( passStyle){
    case 'copyRecord': {
      const names=  ownKeys(val);
      const valPs=  names.map((name)=>deeplyFulfilled(val[name]));
      return E.when(Promise.all(valPs), (vals)=>
        harden(fromEntries(vals.map((c, i)=>  [names[i], c]))));

     }
    case 'copyArray': {
      const valPs=  val.map((p)=>deeplyFulfilled(p));
      return E.when(Promise.all(valPs), (vals)=>harden(vals));
     }
    case 'tagged': {
      const tag=  getTag(val);
      return E.when(deeplyFulfilled(val.payload), (payload)=>
        makeTagged(tag, payload));

     }
    case 'remotable': {
      return val;
     }
    case 'error': {
      return val;
     }
    case 'promise': {
      return E.when(val, (nonp)=>deeplyFulfilled(nonp));
     }
    default: {
      throw assert.fail(X `Unexpected passStyle ${q(passStyle)}`,TypeError);
     }}

 };$h‍_once.deeplyFulfilled(deeplyFulfilled);
harden(deeplyFulfilled);
})()
,
// === functors[120] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let passStyleOf,isErrorLike,makeTagged,isObject,getTag,hasOwnPropertyOf,assertPassableSymbol,nameForPassableSymbol,passableSymbolForName;$h‍_imports([["@endo/pass-style", [["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]],["isErrorLike", [$h‍_a => (isErrorLike = $h‍_a)]],["makeTagged", [$h‍_a => (makeTagged = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["getTag", [$h‍_a => (getTag = $h‍_a)]],["hasOwnPropertyOf", [$h‍_a => (hasOwnPropertyOf = $h‍_a)]],["assertPassableSymbol", [$h‍_a => (assertPassableSymbol = $h‍_a)]],["nameForPassableSymbol", [$h‍_a => (nameForPassableSymbol = $h‍_a)]],["passableSymbolForName", [$h‍_a => (passableSymbolForName = $h‍_a)]]]]]);   



















/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('./types.js').Encoding} Encoding */
/** @typedef {import('@endo/pass-style').Remotable} Remotable */
/** @typedef {import('./types.js').EncodingUnion} EncodingUnion */

const { ownKeys}=   Reflect;
const { isArray}=   Array;
const {
  getOwnPropertyDescriptors,
  defineProperties,
  is,
  entries,
  fromEntries,
  freeze}=
    Object;
const { details: X, Fail, quote: q}=   assert;

/**
 * Special property name that indicates an encoding that needs special
 * decoding.
 */
const QCLASS=  '@qclass';$h‍_once.QCLASS(QCLASS);


/**
 * @param {Encoding} encoded
 * @returns {encoded is EncodingUnion}
 */
const hasQClass=  (encoded)=>hasOwnPropertyOf(encoded, QCLASS);

/**
 * @param {Encoding} encoded
 * @param {string} qclass
 * @returns {boolean}
 */
const qclassMatches=  (encoded, qclass)=>
  isObject(encoded)&&
  !isArray(encoded)&&
  hasQClass(encoded)&&
  encoded[QCLASS]===  qclass;

/**
 * @typedef {object} EncodeToCapDataOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeRemotableToCapData]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodePromiseToCapData]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => Encoding
 * ) => Encoding} [encodeErrorToCapData]
 */

const dontEncodeRemotableToCapData=  (rem)=>Fail `remotable unexpected: ${rem}`;

const dontEncodePromiseToCapData=  (prom)=>Fail `promise unexpected: ${prom}`;

const dontEncodeErrorToCapData=  (err)=>Fail `error object unexpected: ${err}`;

/**
 * @param {EncodeToCapDataOptions} [encodeOptions]
 * @returns {(passable: Passable) => Encoding}
 */
const        makeEncodeToCapData=  (encodeOptions=  {})=>  {
  const {
    encodeRemotableToCapData=  dontEncodeRemotableToCapData,
    encodePromiseToCapData=  dontEncodePromiseToCapData,
    encodeErrorToCapData=  dontEncodeErrorToCapData}=
      encodeOptions;

  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`. For most
   * encodings, the order of properties of each node of the output
   * structure is determined by the algorithm below without special
   * arrangement, usually by being expressed directly as an object literal.
   * The exception is copyRecords, whose natural enumeration order
   * can differ between copyRecords that our distributed object semantics
   * considers to be equivalent.
   * Since, for each copyRecord, we only accept string property names,
   * not symbols, we can canonically sort the names first.
   * JSON.stringify will then visit these in that sorted order.
   *
   * Encoding with a canonical-JSON encoder would also solve this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicately depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {Passable} passable
   * @returns {Encoding} except that `encodeToCapData` does not generally
   * `harden` this result before returning. Rather, `encodeToCapData` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToCapDataRecur=  (passable)=>{
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded as [QCLASS] composites.
    const passStyle=  passStyleOf(passable);
    switch( passStyle){
      case 'null':
      case 'boolean':
      case 'string': {
        // pass through to JSON
        return passable;
       }
      case 'undefined': {
        return { [QCLASS]: 'undefined'};
       }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if( Number.isNaN(passable)) {
          return { [QCLASS]: 'NaN'};
         }else if( passable===  Infinity) {
          return { [QCLASS]: 'Infinity'};
         }else if( passable===  -Infinity) {
          return { [QCLASS]: '-Infinity'};
         }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0)?  0:  passable;
       }
      case 'bigint': {
        return {
          [QCLASS]: 'bigint',
          digits: String(passable)};

       }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name=  /** @type {string} */  nameForPassableSymbol(passable);
        return {
          [QCLASS]: 'symbol',
          name};

       }
      case 'copyRecord': {
        if( hasOwnPropertyOf(passable, QCLASS)) {
          // Hilbert hotel
          const { [QCLASS]: qclassValue, ...rest}=   passable;
          /** @type {Encoding} */
          const result=  {
            [QCLASS]: 'hilbert',
            original: encodeToCapDataRecur(qclassValue)};

          if( ownKeys(rest).length>=  1) {
            // We harden the entire capData encoding before we return it.
            // `encodeToCapData` requires that its input be Passable, and
            // therefore hardened.
            // The `freeze` here is needed anyway, because the `rest` is
            // freshly constructed by the `...` above, and we're using it
            // as imput in another call to `encodeToCapData`.
            result.rest=  encodeToCapDataRecur(freeze(rest));
           }
          return result;
         }
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names=  ownKeys(passable).sort();
        return fromEntries(
          names.map((name)=>[name, encodeToCapDataRecur(passable[name])]));

       }
      case 'copyArray': {
        return passable.map(encodeToCapDataRecur);
       }
      case 'tagged': {
        return {
          [QCLASS]: 'tagged',
          tag: getTag(passable),
          payload: encodeToCapDataRecur(passable.payload)};

       }
      case 'remotable': {
        const encoded=  encodeRemotableToCapData(
          passable,
          encodeToCapDataRecur);

        if( qclassMatches(encoded, 'slot')) {
          return encoded;
         }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail `internal: Remotable encoding must be an object with ${q(
          QCLASS)
          } ${q('slot')}: ${encoded}`;
       }
      case 'promise': {
        const encoded=  encodePromiseToCapData(passable, encodeToCapDataRecur);
        if( qclassMatches(encoded, 'slot')) {
          return encoded;
         }
        throw Fail `internal: Promise encoding must be an object with ${q(
          QCLASS,
          'slot')
          }: ${encoded}`;
       }
      case 'error': {
        const encoded=  encodeErrorToCapData(passable, encodeToCapDataRecur);
        if( qclassMatches(encoded, 'error')) {
          return encoded;
         }
        throw Fail `internal: Error encoding must be an object with ${q(
          QCLASS,
          'error')
          }: ${encoded}`;
       }
      default: {
        throw assert.fail(
          X `internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError);

       }}

   };
  const encodeToCapData=  (passable)=>{
    if( isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      return harden(encodeErrorToCapData(passable, encodeToCapDataRecur));
     }
    return harden(encodeToCapDataRecur(passable));
   };
  return harden(encodeToCapData);
 };$h‍_once.makeEncodeToCapData(makeEncodeToCapData);
harden(makeEncodeToCapData);

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|Remotable)} [decodeRemotableFromCapData]
 * @property {(
 *   encodedPromise: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => (Promise|Remotable)} [decodePromiseFromCapData]
 * @property {(
 *   encodedError: Encoding,
 *   decodeRecur: (e: Encoding) => Passable
 * ) => Error} [decodeErrorFromCapData]
 */

const dontDecodeRemotableOrPromiseFromCapData=  (slotEncoding)=>
  Fail `remotable or promise unexpected: ${slotEncoding}`;
const dontDecodeErrorFromCapData=  (errorEncoding)=>
  Fail `error unexpected: ${errorEncoding}`;

/**
 * The current encoding does not give the decoder enough into to distinguish
 * whether a slot represents a promise or a remotable. As an implementation
 * restriction until this is fixed, if either is provided, both must be
 * provided and they must be the same.
 *
 * This seems like the best starting point to incrementally evolve to an
 * API where these can reliably differ.
 * See https://github.com/Agoric/agoric-sdk/issues/4334
 *
 * @param {DecodeOptions} [decodeOptions]
 * @returns {(encoded: Encoding) => Passable}
 */
const        makeDecodeFromCapData=  (decodeOptions=  {})=>  {
  const {
    decodeRemotableFromCapData=  dontDecodeRemotableOrPromiseFromCapData,
    decodePromiseFromCapData=  dontDecodeRemotableOrPromiseFromCapData,
    decodeErrorFromCapData=  dontDecodeErrorFromCapData}=
      decodeOptions;

  decodeRemotableFromCapData===  decodePromiseFromCapData||
    Fail `An implementation restriction for now: If either decodeRemotableFromCapData or decodePromiseFromCapData is provided, both must be provided and they must be the same: ${q(
      decodeRemotableFromCapData)
      } vs ${q(decodePromiseFromCapData)}`;

  /**
   * `decodeFromCapData` may rely on `jsonEncoded` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `jsonEncoded`
   * having been produced by JSON.stringify on the output of `encodeToCapData`
   * above, i.e., `decodeFromCapData` cannot rely on `jsonEncoded` being a
   * valid marshalled representation. Rather, `decodeFromCapData` must
   * validate that.
   *
   * @param {Encoding} jsonEncoded must be hardened
   */
  const decodeFromCapData=  (jsonEncoded)=>{
    if( !isObject(jsonEncoded)) {
      // primitives pass through
      return jsonEncoded;
     }
    if( isArray(jsonEncoded)) {
      return jsonEncoded.map((encodedVal)=>decodeFromCapData(encodedVal));
     }else if( hasQClass(jsonEncoded)) {
      const qclass=  jsonEncoded[QCLASS];
      typeof qclass===  'string'||
        Fail `invalid ${q(QCLASS)} typeof ${q(typeof qclass)}`;
      switch( qclass){
        // Encoding of primitives not handled by JSON
        case 'undefined': {
          return undefined;
         }
        case 'NaN': {
          return NaN;
         }
        case 'Infinity': {
          return Infinity;
         }
        case '-Infinity': {
          return -Infinity;
         }
        case 'bigint': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { digits}=   jsonEncoded;
          typeof digits===  'string'||
            Fail `invalid digits typeof ${q(typeof digits)}`;
          return BigInt(digits);
         }
        case '@@asyncIterator': {
          // Deprecated qclass. TODO make conditional
          // on environment variable. Eventually remove, but after confident
          // that there are no more supported senders.
          //
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          return Symbol.asyncIterator;
         }
        case 'symbol': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { name}=   jsonEncoded;
          return passableSymbolForName(name);
         }
        case 'tagged': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { tag, payload}=   jsonEncoded;
          return makeTagged(tag, decodeFromCapData(payload));
         }
        case 'slot': {
          // See note above about how the current encoding cannot reliably
          // distinguish which we should call, so in the non-default case
          // both must be the same and it doesn't matter which we call.
          const decoded=  decodeRemotableFromCapData(
            jsonEncoded,
            decodeFromCapData);

          // BEWARE: capdata does not check that `decoded` is
          // a promise or a remotable, since that would break some
          // capdata clients. We are deprecating capdata, and these clients
          // will need to update before switching to smallcaps.
          return decoded;
         }
        case 'error': {
          const decoded=  decodeErrorFromCapData(
            jsonEncoded,
            decodeFromCapData);

          if( passStyleOf(decoded)===  'error') {
            return decoded;
           }
          throw Fail `internal: decodeErrorFromCapData option must return an error: ${decoded}`;
         }
        case 'hilbert': {
          // Using @ts-ignore rather than @ts-expect-error below because
          // with @ts-expect-error I get a red underline in vscode, but
          // without it I get errors from `yarn lint`.
          // @ts-ignore inadequate type inference
          // See https://github.com/endojs/endo/pull/1259#discussion_r954561901
          const { original, rest}=   jsonEncoded;
          hasOwnPropertyOf(jsonEncoded, 'original')||
            Fail `Invalid Hilbert Hotel encoding ${jsonEncoded}`;
          // Don't harden since we're not done mutating it
          const result=  { [QCLASS]: decodeFromCapData(original)};
          if( hasOwnPropertyOf(jsonEncoded, 'rest')) {
            const isNonEmptyObject=
              typeof rest===  'object'&&
              rest!==  null&&
              ownKeys(rest).length>=  1;
            if( !isNonEmptyObject) {
              throw Fail `Rest encoding must be a non-empty object: ${rest}`;
             }
            const restObj=  decodeFromCapData(rest);
            // TODO really should assert that `passStyleOf(rest)` is
            // `'copyRecord'` but we'd have to harden it and it is too
            // early to do that.
            !hasOwnPropertyOf(restObj, QCLASS)||
              Fail `Rest must not contain its own definition of ${q(QCLASS)}`;
            defineProperties(result, getOwnPropertyDescriptors(restObj));
           }
          return result;
         }
        // @ts-expect-error This is the error case we're testing for
        case 'ibid': {
          throw Fail `The capData protocol no longer supports ${q(QCLASS)} ${q(
            qclass)
            }`;
         }
        default: {
          throw assert.fail(
            X `unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError);

         }}

     }else {
      assert(typeof jsonEncoded===  'object'&&  jsonEncoded!==  null);
      const decodeEntry=  ([name, encodedVal])=>  {
        typeof name===  'string'||
          Fail `Property ${q(name)} of ${jsonEncoded} must be a string`;
        return [name, decodeFromCapData(encodedVal)];
       };
      const decodedEntries=  entries(jsonEncoded).map(decodeEntry);
      return fromEntries(decodedEntries);
     }
   };
  return harden(decodeFromCapData);
 };$h‍_once.makeDecodeFromCapData(makeDecodeFromCapData);
})()
,
// === functors[121] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let passStyleOf,isErrorLike,makeTagged,getTag,hasOwnPropertyOf,assertPassableSymbol,nameForPassableSymbol,passableSymbolForName;$h‍_imports([["@endo/pass-style", [["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]],["isErrorLike", [$h‍_a => (isErrorLike = $h‍_a)]],["makeTagged", [$h‍_a => (makeTagged = $h‍_a)]],["getTag", [$h‍_a => (getTag = $h‍_a)]],["hasOwnPropertyOf", [$h‍_a => (hasOwnPropertyOf = $h‍_a)]],["assertPassableSymbol", [$h‍_a => (assertPassableSymbol = $h‍_a)]],["nameForPassableSymbol", [$h‍_a => (nameForPassableSymbol = $h‍_a)]],["passableSymbolForName", [$h‍_a => (passableSymbolForName = $h‍_a)]]]]]);   


















/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').Remotable} Remotable */
// @typedef {import('./types.js').SmallcapsEncoding} SmallcapsEncoding */
// @typedef {import('./types.js').SmallcapsEncodingUnion} SmallcapsEncodingUnion */
/** @typedef {any} SmallcapsEncoding */
/** @typedef {any} SmallcapsEncodingUnion */

const { ownKeys}=   Reflect;
const { isArray}=   Array;
const { is, entries, fromEntries}=   Object;
const { details: X, Fail, quote: q}=   assert;

const BANG=  '!'.charCodeAt(0);
const DASH=  '-'.charCodeAt(0);

/**
 * An `encodeToSmallcaps` function takes a passable and returns a
 * JSON-representable object (i.e., round-tripping it through
 * `JSON.stringify` and `JSON.parse` with no replacers or revivers
 * returns an equivalent structure except for object identity).
 * We call this representation a Smallcaps Encoding.
 *
 * A `decodeFromSmallcaps` function takes as argument what it
 * *assumes* is the result of a plain `JSON.parse` with no resolver. It then
 * must validate that it is a valid Smallcaps Encoding, and if it is,
 * return a corresponding passable.
 *
 * Smallcaps considers the characters between `!` (ascii code 33, BANG)
 * and `-` (ascii code 45, DASH) to be special prefixes allowing
 * representation of JSON-incompatible data using strings.
 * These characters, in order, are `!"#$%&'()*+,-`
 * Of these, smallcaps currently uses the following:
 *
 *  * `!` - escaped string
 *  * `+` - non-negative bigint
 *  * `-` - negative bigint
 *  * `#` - manifest constant
 *  * `%` - symbol
 *  * `$` - remotable
 *  * `&` - promise
 *
 * All other special characters (`"'()*,`) are reserved for future use.
 *
 * The manifest constants that smallcaps currently uses for values:
 *  * `#undefined`
 *  * `#NaN`
 *  * `#Infinity`
 *  * `#-Infinity`
 *
 * and for property names analogous to capdata @qclass:
 *  * `#tag`
 *  * `#error`
 *
 * All other encoded strings beginning with `#` are reserved for
 * future use.
 *
 * @param {string} encodedStr
 * @returns {boolean}
 */
const startsSpecial=  (encodedStr)=>{
  if( encodedStr===  '') {
    return false;
   }
  // charCodeAt(0) and number compare is a bit faster.
  const code=  encodedStr.charCodeAt(0);
  // eslint-disable-next-line yoda
  return BANG<=  code&&  code<=  DASH;
 };

/**
 * @typedef {object} EncodeToSmallcapsOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeRemotableToSmallcaps]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodePromiseToSmallcaps]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => SmallcapsEncoding
 * ) => SmallcapsEncoding} [encodeErrorToSmallcaps]
 */

const dontEncodeRemotableToSmallcaps=  (rem)=>
  Fail `remotable unexpected: ${rem}`;

const dontEncodePromiseToSmallcaps=  (prom)=>Fail `promise unexpected: ${prom}`;

const dontEncodeErrorToSmallcaps=  (err)=>
  Fail `error object unexpected: ${q(err)}`;

/**
 * @param {EncodeToSmallcapsOptions} [encodeOptions]
 * encodeOptions is actually optional, but not marked as such to work around
 * https://github.com/microsoft/TypeScript/issues/50286
 *
 * @returns {(passable: Passable) => SmallcapsEncoding}
 */
const        makeEncodeToSmallcaps=  (encodeOptions=  {})=>  {
  const {
    encodeRemotableToSmallcaps=  dontEncodeRemotableToSmallcaps,
    encodePromiseToSmallcaps=  dontEncodePromiseToSmallcaps,
    encodeErrorToSmallcaps=  dontEncodeErrorToSmallcaps}=
      encodeOptions;

  const assertEncodedError=  (encoding)=>{
     typeof encoding===  'object'&&  hasOwnPropertyOf(encoding, '#error')||
      Fail `internal: Error encoding must have "#error" property: ${q(
        encoding)
        }`;
    // Assert that the #error property decodes to a string.
    const message=  encoding['#error'];
     typeof message===  'string'&&(
       !startsSpecial(message)||  message.startsWith('!'))||
      Fail `internal: Error encoding must have string message: ${q(message)}`;
   };

  /**
   * Must encode `val` into plain JSON data *canonically*, such that
   * `JSON.stringify(encode(v1)) === JSON.stringify(encode(v1))`. For most
   * encodings, the order of properties of each node of the output
   * structure is determined by the algorithm below without special
   * arrangement, usually by being expressed directly as an object literal.
   * The exception is copyRecords, whose natural enumeration order
   * can differ between copyRecords that our distributed object semantics
   * considers to be equivalent.
   * Since, for each copyRecord, we only accept string property names,
   * not symbols, we can canonically sort the names first.
   * JSON.stringify will then visit these in that sorted order.
   *
   * Encoding with a canonical-JSON encoder would also solve this canonicalness
   * problem in a more modular and encapsulated manner. Note that the
   * actual order produced here, though it agrees with canonical-JSON on
   * copyRecord property ordering, differs from canonical-JSON as a whole
   * in that the other record properties are visited in the order in which
   * they are literally written below. TODO perhaps we should indeed switch
   * to a canonical JSON encoder, and not delicately depend on the order
   * in which these object literals are written.
   *
   * Readers must not care about this order anyway. We impose this requirement
   * mainly to reduce non-determinism exposed outside a vat.
   *
   * @param {Passable} passable
   * @returns {SmallcapsEncoding} except that `encodeToSmallcaps` does not generally
   * `harden` this result before returning. Rather, `encodeToSmallcaps` is not
   * directly exposed.
   * What's exposed instead is a wrapper that freezes the output before
   * returning. If this turns out to impede static analysis for `harden` safety,
   * we can always put the (now redundant) hardens back in. They don't hurt.
   */
  const encodeToSmallcapsRecur=  (passable)=>{
    // First we handle all primitives. Some can be represented directly as
    // JSON, and some must be encoded into smallcaps strings.
    const passStyle=  passStyleOf(passable);
    switch( passStyle){
      case 'null':
      case 'boolean': {
        // pass through to JSON
        return passable;
       }
      case 'string': {
        if( startsSpecial(passable)) {
          // Strings that start with a special char are quoted with `!`.
          // Since `!` is itself a special character, this trivially does
          // the Hilbert hotel. Also, since the special characters are
          // a continuous subrange of ascii, this quoting is sort-order
          // preserving.
          return  `!${passable}`;
         }
        // All other strings pass through to JSON
        return passable;
       }
      case 'undefined': {
        return '#undefined';
       }
      case 'number': {
        // Special-case numbers with no digit-based representation.
        if( Number.isNaN(passable)) {
          return '#NaN';
         }else if( passable===  Infinity) {
          return '#Infinity';
         }else if( passable===  -Infinity) {
          return '#-Infinity';
         }
        // Pass through everything else, replacing -0 with 0.
        return is(passable, -0)?  0:  passable;
       }
      case 'bigint': {
        const str=  String(passable);
        return (/** @type {bigint} */ passable<   0n?  str:   `+${str}`);
       }
      case 'symbol': {
        assertPassableSymbol(passable);
        const name=  /** @type {string} */  nameForPassableSymbol(passable);
        return  `%${name}`;
       }
      case 'copyRecord': {
        // Currently copyRecord allows only string keys so this will
        // work. If we allow sortable symbol keys, this will need to
        // become more interesting.
        const names=  ownKeys(passable).sort();
        return fromEntries(
          names.map((name)=>[
            encodeToSmallcapsRecur(name),
            encodeToSmallcapsRecur(passable[name])]));


       }
      case 'copyArray': {
        return passable.map(encodeToSmallcapsRecur);
       }
      case 'tagged': {
        return {
          '#tag': encodeToSmallcapsRecur(getTag(passable)),
          payload: encodeToSmallcapsRecur(passable.payload)};

       }
      case 'remotable': {
        const result=  encodeRemotableToSmallcaps(
          passable,
          encodeToSmallcapsRecur);

        if( typeof result===  'string'&&  result.startsWith('$')) {
          return result;
         }
        // `throw` is noop since `Fail` throws. But linter confused
        throw Fail `internal: Remotable encoding must start with "$": ${result}`;
       }
      case 'promise': {
        const result=  encodePromiseToSmallcaps(
          passable,
          encodeToSmallcapsRecur);

        if( typeof result===  'string'&&  result.startsWith('&')) {
          return result;
         }
        throw Fail `internal: Promise encoding must start with "&": ${result}`;
       }
      case 'error': {
        const result=  encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur);
        assertEncodedError(result);
        return result;
       }
      default: {
        throw assert.fail(
          X `internal: Unrecognized passStyle ${q(passStyle)}`,
          TypeError);

       }}

   };
  const encodeToSmallcaps=  (passable)=>{
    if( isErrorLike(passable)) {
      // We pull out this special case to accommodate errors that are not
      // valid Passables. For example, because they're not frozen.
      // The special case can only ever apply at the root, and therefore
      // outside the recursion, since an error could only be deeper in
      // a passable structure if it were passable.
      //
      // We pull out this special case because, for these errors, we're much
      // more interested in reporting whatever diagnostic information they
      // carry than we are about reporting problems encountered in reporting
      // this information.
      const result=  harden(
        encodeErrorToSmallcaps(passable, encodeToSmallcapsRecur));

      assertEncodedError(result);
      return result;
     }
    return harden(encodeToSmallcapsRecur(passable));
   };
  return harden(encodeToSmallcaps);
 };$h‍_once.makeEncodeToSmallcaps(makeEncodeToSmallcaps);
harden(makeEncodeToSmallcaps);

/**
 * @typedef {object} DecodeFromSmallcapsOptions
 * @property {(
 *   encodedRemotable: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Remotable} [decodeRemotableFromSmallcaps]
 * @property {(
 *   encodedPromise: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Promise} [decodePromiseFromSmallcaps]
 * @property {(
 *   encodedError: SmallcapsEncoding,
 *   decodeRecur: (e :SmallcapsEncoding) => Passable
 * ) => Error} [decodeErrorFromSmallcaps]
 */

const dontDecodeRemotableFromSmallcaps=  (encoding)=>
  Fail `remotable unexpected: ${encoding}`;
const dontDecodePromiseFromSmallcaps=  (encoding)=>
  Fail `promise unexpected: ${encoding}`;
const dontDecodeErrorFromSmallcaps=  (encoding)=>
  Fail `error unexpected: ${q(encoding)}`;

/**
 * @param {DecodeFromSmallcapsOptions} [decodeOptions]
 * @returns {(encoded: SmallcapsEncoding) => Passable}
 */
const        makeDecodeFromSmallcaps=  (decodeOptions=  {})=>  {
  const {
    decodeRemotableFromSmallcaps=  dontDecodeRemotableFromSmallcaps,
    decodePromiseFromSmallcaps=  dontDecodePromiseFromSmallcaps,
    decodeErrorFromSmallcaps=  dontDecodeErrorFromSmallcaps}=
      decodeOptions;

  /**
   * `decodeFromSmallcaps` may rely on `encoding` being the result of a
   * plain call to JSON.parse. However, it *cannot* rely on `encoding`
   * having been produced by JSON.stringify on the output of `encodeToSmallcaps`
   * above, i.e., `decodeFromSmallcaps` cannot rely on `encoding` being a
   * valid marshalled representation. Rather, `decodeFromSmallcaps` must
   * validate that.
   *
   * @param {SmallcapsEncoding} encoding must be hardened
   */
  const decodeFromSmallcaps=  (encoding)=>{
    switch( typeof encoding){
      case 'boolean':
      case 'number': {
        return encoding;
       }
      case 'string': {
        if( !startsSpecial(encoding)) {
          return encoding;
         }
        const c=  encoding.charAt(0);
        switch( c){
          case '!': {
            // un-hilbert-ify the string
            return encoding.slice(1);
           }
          case '%': {
            return passableSymbolForName(encoding.slice(1));
           }
          case '#': {
            switch( encoding){
              case '#undefined': {
                return undefined;
               }
              case '#NaN': {
                return NaN;
               }
              case '#Infinity': {
                return Infinity;
               }
              case '#-Infinity': {
                return -Infinity;
               }
              default: {
                throw assert.fail(
                  X `unknown constant "${q(encoding)}"`,
                  TypeError);

               }}

           }
          case '+':
          case '-': {
            return BigInt(encoding);
           }
          case '$': {
            const result=  decodeRemotableFromSmallcaps(
              encoding,
              decodeFromSmallcaps);

            if( passStyleOf(result)!==  'remotable') {
              Fail `internal: decodeRemotableFromSmallcaps option must return a remotable: ${result}`;
             }
            return result;
           }
          case '&': {
            const result=  decodePromiseFromSmallcaps(
              encoding,
              decodeFromSmallcaps);

            if( passStyleOf(result)!==  'promise') {
              Fail `internal: decodePromiseFromSmallcaps option must return a promise: ${result}`;
             }
            return result;
           }
          default: {
            throw Fail `Special char ${q(
              c)
              } reserved for future use: ${encoding}`;
           }}

       }
      case 'object': {
        if( encoding===  null) {
          return encoding;
         }

        if( isArray(encoding)) {
          return encoding.map((val)=>decodeFromSmallcaps(val));
         }

        if( hasOwnPropertyOf(encoding, '#tag')) {
          const { '#tag': tag, payload, ...rest}=   encoding;
          typeof tag===  'string'||
            Fail `Value of "#tag", the tag, must be a string: ${encoding}`;
          ownKeys(rest).length===  0||
            Fail `#tag record unexpected properties: ${q(ownKeys(rest))}`;
          return makeTagged(
            decodeFromSmallcaps(tag),
            decodeFromSmallcaps(payload));

         }

        if( hasOwnPropertyOf(encoding, '#error')) {
          const result=  decodeErrorFromSmallcaps(
            encoding,
            decodeFromSmallcaps);

          passStyleOf(result)===  'error'||
            Fail `internal: decodeErrorFromSmallcaps option must return an error: ${result}`;
          return result;
         }

        const decodeEntry=  ([encodedName, encodedVal])=>  {
          typeof encodedName===  'string'||
            Fail `Property name ${q(
              encodedName)
              } of ${encoding} must be a string`;
          !encodedName.startsWith('#')||
            Fail `Unrecognized record type ${q(encodedName)}: ${encoding}`;
          const name=  decodeFromSmallcaps(encodedName);
          typeof name===  'string'||
            Fail `Decoded property name ${name} from ${encoding} must be a string`;
          return [name, decodeFromSmallcaps(encodedVal)];
         };
        const decodedEntries=  entries(encoding).map(decodeEntry);
        return fromEntries(decodedEntries);
       }
      default: {
        throw assert.fail(
          X `internal: unrecognized JSON typeof ${q(
            typeof encoding)
            }: ${encoding}`,
          TypeError);

       }}

   };
  return harden(decodeFromSmallcaps);
 };$h‍_once.makeDecodeFromSmallcaps(makeDecodeFromSmallcaps);
})()
,
// === functors[122] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Nat,assertPassable,getInterfaceOf,getErrorConstructor,hasOwnPropertyOf,QCLASS,makeEncodeToCapData,makeDecodeFromCapData,makeDecodeFromSmallcaps,makeEncodeToSmallcaps;$h‍_imports([["@endo/nat", [["Nat", [$h‍_a => (Nat = $h‍_a)]]]],["@endo/pass-style", [["assertPassable", [$h‍_a => (assertPassable = $h‍_a)]],["getInterfaceOf", [$h‍_a => (getInterfaceOf = $h‍_a)]],["getErrorConstructor", [$h‍_a => (getErrorConstructor = $h‍_a)]],["hasOwnPropertyOf", [$h‍_a => (hasOwnPropertyOf = $h‍_a)]]]],["./encodeToCapData.js", [["QCLASS", [$h‍_a => (QCLASS = $h‍_a)]],["makeEncodeToCapData", [$h‍_a => (makeEncodeToCapData = $h‍_a)]],["makeDecodeFromCapData", [$h‍_a => (makeDecodeFromCapData = $h‍_a)]]]],["./encodeToSmallcaps.js", [["makeDecodeFromSmallcaps", [$h‍_a => (makeDecodeFromSmallcaps = $h‍_a)]],["makeEncodeToSmallcaps", [$h‍_a => (makeEncodeToSmallcaps = $h‍_a)]]]]]);   



















/** @typedef {import('./types.js').MakeMarshalOptions} MakeMarshalOptions */
/** @template Slot @typedef {import('./types.js').ConvertSlotToVal<Slot>} ConvertSlotToVal */
/** @template Slot @typedef {import('./types.js').ConvertValToSlot<Slot>} ConvertValToSlot */
/** @template Slot @typedef {import('./types.js').ToCapData<Slot>} ToCapData */
/** @template Slot @typedef {import('./types.js').FromCapData<Slot>} FromCapData */
/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').InterfaceSpec} InterfaceSpec */
/** @typedef {import('./types.js').Encoding} Encoding */
/** @typedef {import('@endo/pass-style').RemotableObject} Remotable */

const { isArray}=   Array;
const { details: X, Fail, quote: q}=   assert;
const { ownKeys}=   Reflect;

/** @type {ConvertValToSlot<any>} */
const defaultValToSlotFn=  (x)=>x;
/** @type {ConvertSlotToVal<any>} */
const defaultSlotToValFn=  (x, _)=>  x;

/**
 * @template Slot
 * @param {ConvertValToSlot<Slot>} [convertValToSlot]
 * @param {ConvertSlotToVal<Slot>} [convertSlotToVal]
 * @param {MakeMarshalOptions} options
 */
const        makeMarshal=  (
  convertValToSlot=  defaultValToSlotFn,
  convertSlotToVal=  defaultSlotToValFn,
  {
    errorTagging=  'on',
    marshalName=  'anon-marshal',
    // TODO Temporary hack.
    // See https://github.com/Agoric/agoric-sdk/issues/2780
    errorIdNum=  10000,
    // We prefer that the caller instead log to somewhere hidden
    // to be revealed when correlating with the received error.
    marshalSaveError=  (err)=>
      console.log('Temporary logging of sent error', err),
    // Default to 'capdata' because it was implemented first.
    // Sometimes, ontogeny does recapitulate phylogeny ;)
    serializeBodyFormat=  'capdata'}=
      {})=>
     {
  assert.typeof(marshalName, 'string');
  errorTagging===  'on'||
    errorTagging===  'off'||
    Fail `The errorTagging option can only be "on" or "off" ${errorTagging}`;
  const nextErrorId=  ()=>  {
    errorIdNum+=  1;
    return  `error:${marshalName}#${errorIdNum}`;
   };

  /**
   * @type {ToCapData<Slot>}
   */
  const toCapData=  (root)=>{
    const slots=  [];
    // maps val (promise or remotable) to index of slots[]
    const slotMap=  new Map();

    /**
     * @param {Remotable | Promise} passable
     * @returns {{index: number, repeat: boolean}}
     */
    const encodeSlotCommon=  (passable)=>{
      let index=  slotMap.get(passable);
      if( index!==  undefined) {
        // TODO assert that it's the same iface as before
        assert.typeof(index, 'number');
        return harden({ index, repeat: true});
       }

      index=  slots.length;
      const slot=  convertValToSlot(passable);
      slots.push(slot);
      slotMap.set(passable, index);
      return harden({ index, repeat: false});
     };

    /**
     * Even if an Error is not actually passable, we'd rather send
     * it anyway because the diagnostic info carried by the error
     * is more valuable than diagnosing why the error isn't
     * passable. See comments in isErrorLike.
     *
     * @param {Error} err
     * @param {(p: Passable) => unknown} encodeRecur
     * @returns {{errorId?: string, message: string, name: string}}
     */
    const encodeErrorCommon=  (err, encodeRecur)=>  {
      const message=  encodeRecur( `${err.message}`);
      assert.typeof(message, 'string');
      const name=  encodeRecur( `${err.name}`);
      assert.typeof(name, 'string');
      // Must encode `cause`, `errors`.
      // nested non-passable errors must be ok from here.
      if( errorTagging===  'on') {
        // We deliberately do not share the stack, but it would
        // be useful to log the stack locally so someone who has
        // privileged access to the throwing Vat can correlate
        // the problem with the remote Vat that gets this
        // summary. If we do that, we could allocate some random
        // identifier and include it in the message, to help
        // with the correlation.
        const errorId=  encodeRecur(nextErrorId());
        assert.typeof(errorId, 'string');
        assert.note(err, X `Sent as ${errorId}`);
        marshalSaveError(err);
        return harden({ errorId, message, name});
       }else {
        return harden({ message, name});
       }
     };

    if( serializeBodyFormat===  'capdata') {
      /**
       * @param {Passable} passable
       * @param {InterfaceSpec} [iface]
       * @returns {Encoding}
       */
      const encodeSlotToCapData=  (passable, iface=  undefined)=>  {
        const { index, repeat}=   encodeSlotCommon(passable);

        if( repeat===  true||  iface===  undefined) {
          return harden({ [QCLASS]: 'slot', index});
         }else {
          return harden({ [QCLASS]: 'slot', iface, index});
         }
       };

      const encodeRemotableToCapData=  (val, _encodeRecur)=>
        encodeSlotToCapData(val, getInterfaceOf(val));

      const encodePromiseToCapData=  (promise, _encodeRecur)=>
        encodeSlotToCapData(promise);

      /**
       * Even if an Error is not actually passable, we'd rather send
       * it anyway because the diagnostic info carried by the error
       * is more valuable than diagnosing why the error isn't
       * passable. See comments in isErrorLike.
       *
       * @param {Error} err
       * @param {(p: Passable) => Encoding} encodeRecur
       * @returns {Encoding}
       */
      const encodeErrorToCapData=  (err, encodeRecur)=>  {
        const errData=  encodeErrorCommon(err, encodeRecur);
        return harden({ [QCLASS]: 'error', ...errData});
       };

      const encodeToCapData=  makeEncodeToCapData({
        encodeRemotableToCapData,
        encodePromiseToCapData,
        encodeErrorToCapData});


      const encoded=  encodeToCapData(root);
      const body=  JSON.stringify(encoded);
      return harden({
        body,
        slots});

     }else if( serializeBodyFormat===  'smallcaps') {
      /**
       * @param {string} prefix
       * @param {Passable} passable
       * @param {InterfaceSpec} [iface]
       * @returns {string}
       */
      const encodeSlotToSmallcaps=  (prefix, passable, iface=  undefined)=>  {
        const { index, repeat}=   encodeSlotCommon(passable);

        // TODO explore removing this special case
        if( repeat===  true||  iface===  undefined) {
          return  `${prefix}${index}`;
         }
        return  `${prefix}${index}.${iface}`;
       };

      const encodeRemotableToSmallcaps=  (remotable, _encodeRecur)=>
        encodeSlotToSmallcaps('$', remotable, getInterfaceOf(remotable));

      const encodePromiseToSmallcaps=  (promise, _encodeRecur)=>
        encodeSlotToSmallcaps('&', promise);

      const encodeErrorToSmallcaps=  (err, encodeRecur)=>  {
        const errData=  encodeErrorCommon(err, encodeRecur);
        const { message, ...rest}=   errData;
        return harden({ '#error': message, ...rest});
       };

      const encodeToSmallcaps=  makeEncodeToSmallcaps({
        encodeRemotableToSmallcaps,
        encodePromiseToSmallcaps,
        encodeErrorToSmallcaps});


      const encoded=  encodeToSmallcaps(root);
      const smallcapsBody=  JSON.stringify(encoded);
      return harden({
        // Valid JSON cannot begin with a '#', so this is a valid signal
        // indicating smallcaps format.
        body:  `#${smallcapsBody}`,
        slots});

     }else {
      // The `throw` is a noop since `Fail` throws. Added for confused linters.
      throw Fail `Unrecognized serializeBodyFormat: ${q(serializeBodyFormat)}`;
     }
   };

  const makeFullRevive=  (slots)=>{
    /** @type {Map<number, Passable>} */
    const valMap=  new Map();

    /**
     * @param {{iface?: string, index: number}} slotData
     * @returns {Remotable | Promise}
     */
    const decodeSlotCommon=  (slotData)=>{
      const { iface=  undefined, index, ...rest}=   slotData;
      ownKeys(rest).length===  0||
        Fail `unexpected encoded slot properties ${q(ownKeys(rest))}`;
      if( valMap.has(index)) {
        return valMap.get(index);
       }
      // TODO SECURITY HAZARD: must enfoce that remotable vs promise
      // is according to the encoded string.
      const slot=  slots[Number(Nat(index))];
      const val=  convertSlotToVal(slot, iface);
      valMap.set(index, val);
      return val;
     };

    /**
     * @param {{errorId?: string, message: string, name: string}} errData
     * @param {(e: unknown) => Passable} decodeRecur
     * @returns {Error}
     */
    const decodeErrorCommon=  (errData, decodeRecur)=>  {
      const { errorId=  undefined, message, name, ...rest}=   errData;
      ownKeys(rest).length===  0||
        Fail `unexpected encoded error properties ${q(ownKeys(rest))}`;
      // TODO Must decode `cause` and `errors` properties
      // capData does not transform strings. The calls to `decodeRecur`
      // are for reuse by other encodings that do, such as smallcaps.
      const dName=  decodeRecur(name);
      const dMessage=  decodeRecur(message);
      const dErrorId=  errorId&&  decodeRecur(errorId);
      typeof dName===  'string'||
        Fail `invalid error name typeof ${q(typeof dName)}`;
      typeof dMessage===  'string'||
        Fail `invalid error message typeof ${q(typeof dMessage)}`;
      const EC=  getErrorConstructor(dName)||  Error;
      // errorId is a late addition so be tolerant of its absence.
      const errorName=
        dErrorId===  undefined?
             `Remote${EC.name}`:
             `Remote${EC.name}(${dErrorId})`;
      const error=  assert.error(dMessage, EC, { errorName});
      return harden(error);
     };

    // The current encoding does not give the decoder enough into to distinguish
    // whether a slot represents a promise or a remotable. As an implementation
    // restriction until this is fixed, if either is provided, both must be
    // provided and they must be the same.
    // See https://github.com/Agoric/agoric-sdk/issues/4334
    const decodeRemotableOrPromiseFromCapData=  (rawTree, _decodeRecur)=>  {
      const { [QCLASS]: _, ...slotData}=   rawTree;
      return decodeSlotCommon(slotData);
     };

    const decodeErrorFromCapData=  (rawTree, decodeRecur)=>  {
      const { [QCLASS]: _, ...errData}=   rawTree;
      return decodeErrorCommon(errData, decodeRecur);
     };

    const reviveFromCapData=  makeDecodeFromCapData({
      decodeRemotableFromCapData: decodeRemotableOrPromiseFromCapData,
      decodePromiseFromCapData: decodeRemotableOrPromiseFromCapData,
      decodeErrorFromCapData});


    const makeDecodeSlotFromSmallcaps=  (prefix)=>{
      /**
       * @param {string} stringEncoding
       * @param {(e: unknown) => Passable} _decodeRecur
       * @returns {Remotable | Promise}
       */
      return (stringEncoding, _decodeRecur)=>  {
        assert(stringEncoding.startsWith(prefix));
        // slots: $slotIndex.iface or $slotIndex
        const i=  stringEncoding.indexOf('.');
        const index=  Number(stringEncoding.slice(1, i<  0?  undefined:  i));
        // i < 0 means there was no iface included.
        const iface=  i<  0?  undefined:  stringEncoding.slice(i+  1);
        return decodeSlotCommon({ iface, index});
       };
     };
    const decodeRemotableFromSmallcaps=  makeDecodeSlotFromSmallcaps('$');
    const decodePromiseFromSmallcaps=  makeDecodeSlotFromSmallcaps('&');

    const decodeErrorFromSmallcaps=  (encoding, decodeRecur)=>  {
      const { '#error': message, ...restErrData}=   encoding;
      !hasOwnPropertyOf(restErrData, 'message')||
        Fail `unexpected encoded error property ${q('message')}`;
      return decodeErrorCommon({ message, ...restErrData},  decodeRecur);
     };

    const reviveFromSmallcaps=  makeDecodeFromSmallcaps({
      decodeRemotableFromSmallcaps,
      decodePromiseFromSmallcaps,
      decodeErrorFromSmallcaps});


    return harden({ reviveFromCapData, reviveFromSmallcaps});
   };

  /**
   * @type {FromCapData<Slot>}
   */
  const fromCapData=  (data)=>{
    const { body, slots}=   data;
    typeof body===  'string'||
      Fail `unserialize() given non-capdata (.body is ${body}, not string)`;
    isArray(data.slots)||
      Fail `unserialize() given non-capdata (.slots are not Array)`;
    const { reviveFromCapData, reviveFromSmallcaps}=   makeFullRevive(slots);
    let result;
    // JSON cannot begin with a '#', so this is an unambiguous signal.
    if( body.startsWith('#')) {
      const smallcapsBody=  body.slice(1);
      const encoding=  harden(JSON.parse(smallcapsBody));
      result=  harden(reviveFromSmallcaps(encoding));
     }else {
      const rawTree=  harden(JSON.parse(body));
      result=  harden(reviveFromCapData(rawTree));
     }
    // See https://github.com/Agoric/agoric-sdk/issues/4337
    // which should be considered fixed once we've completed the switch
    // to smallcaps.
    assertPassable(result);
    return result;
   };

  return harden({
    toCapData,
    fromCapData,

    // for backwards compatibility
    /** @deprecated use toCapData */
    serialize: toCapData,
    /** @deprecated use fromCapData */
    unserialize: fromCapData});

 };$h‍_once.makeMarshal(makeMarshal);
})()
,
// === functors[123] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeMarshal;$h‍_imports([["./marshal.js", [["makeMarshal", [$h‍_a => (makeMarshal = $h‍_a)]]]]]);   



/** @typedef {import('@endo/pass-style').Passable} Passable */

const { Fail}=   assert;

/** @type {import('./types.js').ConvertValToSlot<any>} */
const doNotConvertValToSlot=  (val)=>
  Fail `Marshal's stringify rejects presences and promises ${val}`;

/** @type {import('./types.js').ConvertSlotToVal<any>} */
const doNotConvertSlotToVal=  (slot, _iface)=>
  Fail `Marshal's parse must not encode any slots ${slot}`;

const badArrayHandler=  harden({
  get: (_target, name, _receiver)=>  {
    if( name===  'length') {
      return 0;
     }
    // `throw` is noop since `Fail` throws. But linter confused
    throw Fail `Marshal's parse must not encode any slot positions ${name}`;
   }});


const badArray=  harden(new Proxy(harden([]), badArrayHandler));

const { serialize, unserialize}=   makeMarshal(
  doNotConvertValToSlot,
  doNotConvertSlotToVal,
  {
    errorTagging: 'off',
    // TODO fix tests to works with smallcaps.
    serializeBodyFormat: 'capdata'});



/**
 * @param {Passable} val
 * @returns {string}
 */
const stringify=  (val)=>serialize(val).body;$h‍_once.stringify(stringify);
harden(stringify);

/**
 * @param {string} str
 * @returns {Passable}
 */
const parse=  (str)=>
  unserialize(
    harden({
      body: str,
      slots: badArray}));$h‍_once.parse(parse);


harden(parse);
})()
,
// === functors[124] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Nat,getErrorConstructor,isObject,passableSymbolForName,QCLASS;$h‍_imports([["@endo/nat", [["Nat", [$h‍_a => (Nat = $h‍_a)]]]],["@endo/pass-style", [["getErrorConstructor", [$h‍_a => (getErrorConstructor = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]],["passableSymbolForName", [$h‍_a => (passableSymbolForName = $h‍_a)]]]],["./encodeToCapData.js", [["QCLASS", [$h‍_a => (QCLASS = $h‍_a)]]]]]);   









/** @typedef {import('./types.js').Encoding} Encoding */
/** @template T @typedef {import('./types.js').CapData<T>} CapData */

const { ownKeys}=   Reflect;
const { isArray}=   Array;
const { stringify: quote}=   JSON;
const { quote: q, details: X, Fail}=   assert;

/**
 * @typedef {object} Indenter
 * @property {(openBracket: string) => number} open
 * @property {() => number} line
 * @property {(token: string) => number} next
 * @property {(closeBracket: string) => number} close
 * @property {() => string} done
 */

/**
 * Generous whitespace for readability
 *
 * @returns {Indenter}
 */
const makeYesIndenter=  ()=>  {
  const strings=  [];
  let level=  0;
  let needSpace=  false;
  const line=  ()=>  {
    needSpace=  false;
    return strings.push('\n', '  '.repeat(level));
   };
  return harden({
    open: (openBracket)=>{
      level+=  1;
      if( needSpace) {
        strings.push(' ');
       }
      needSpace=  false;
      return strings.push(openBracket);
     },
    line,
    next: (token)=>{
      if( needSpace&&  token!==  ',') {
        strings.push(' ');
       }
      needSpace=  true;
      return strings.push(token);
     },
    close: (closeBracket)=>{
      assert(level>=  1);
      level-=  1;
      line();
      return strings.push(closeBracket);
     },
    done: ()=>  {
      assert.equal(level, 0);
      return strings.join('');
     }});

 };

/**
 * If the last character of one token together with the first character
 * of the next token matches this pattern, then the two tokens must be
 * separated by whitespace to preserve their meaning. Otherwise the
 * whitespace in unnecessary.
 *
 * The `<!` and `->` cases prevent the accidental formation of an
 * html-like comment. I don't think the double angle brackets are actually
 * needed but I haven't thought about it enough to remove them.
 */
const badPairPattern=  /^(?:\w\w|<<|>>|\+\+|--|<!|->)$/;

/**
 * Minimum whitespace needed to preseve meaning.
 *
 * @returns {Indenter}
 */
const makeNoIndenter=  ()=>  {
  /** @type {string[]} */
  const strings=  [];
  return harden({
    open: (openBracket)=>strings.push(openBracket),
    line: ()=>  strings.length,
    next: (token)=>{
      if( strings.length>=  1) {
        const last=  strings[strings.length-  1];
        // eslint-disable-next-line @endo/restrict-comparison-operands -- error
        if( last.length>=  1&&  token.length>=  1) {
          const pair=   `${last[last.length- 1] }${token[0]}`;
          if( badPairPattern.test(pair)) {
            strings.push(' ');
           }
         }
       }
      return strings.push(token);
     },
    close: (closeBracket)=>{
      if( strings.length>=  1&&  strings[strings.length-  1]===  ',') {
        strings.pop();
       }
      return strings.push(closeBracket);
     },
    done: ()=>  strings.join('')});

 };

const identPattern=  /^[a-zA-Z]\w*$/;
harden(identPattern);
const AtAtPrefixPattern=  /^@@(.*)$/;
harden(AtAtPrefixPattern);

/**
 * @param {Encoding} encoding
 * @param {boolean=} shouldIndent
 * @param {any[]} [slots]
 * @returns {string}
 */
const decodeToJustin=  (encoding, shouldIndent=  false, slots=  [])=>  {
  /**
   * The first pass does some input validation.
   * Its control flow should mirror `recur` as closely as possible
   * and the two should be maintained together. They must visit everything
   * in the same order.
   *
   * TODO now that ibids are gone, we should fold this back together into
   * one validating pass.
   *
   * @param {Encoding} rawTree
   * @returns {void}
   */
  const prepare=  (rawTree)=>{
    if( !isObject(rawTree)) {
      return;
     }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree!==  null);
    if( QCLASS in rawTree) {
      const qclass=  rawTree[QCLASS];
      typeof qclass===  'string'||
        Fail `invalid qclass typeof ${q(typeof qclass)}`;
      assert(!isArray(rawTree));
      switch( rawTree['@qclass']){
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          return;
         }
        case 'bigint': {
          const { digits}=   rawTree;
          typeof digits===  'string'||
            Fail `invalid digits typeof ${q(typeof digits)}`;
          return;
         }
        case '@@asyncIterator': {
          return;
         }
        case 'symbol': {
          const { name}=   rawTree;
          assert.typeof(name, 'string');
          const sym=  passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          return;
         }
        case 'tagged': {
          const { tag, payload}=   rawTree;
          assert.typeof(tag, 'string');
          prepare(payload);
          return;
         }
        case 'slot': {
          const { index, iface}=   rawTree;
          assert.typeof(index, 'number');
          Nat(index);
          if( iface!==  undefined) {
            assert.typeof(iface, 'string');
           }
          return;
         }
        case 'hilbert': {
          const { original, rest}=   rawTree;
          'original'in  rawTree||
            Fail `Invalid Hilbert Hotel encoding ${rawTree}`;
          prepare(original);
          if( 'rest'in  rawTree) {
            if( typeof rest!==  'object') {
              throw Fail `Rest ${rest} encoding must be an object`;
             }
            if( rest===  null) {
              throw Fail `Rest ${rest} encoding must not be null`;
             }
            if( isArray(rest)) {
              throw Fail `Rest ${rest} encoding must not be an array`;
             }
            if( QCLASS in rest) {
              throw Fail `Rest encoding ${rest} must not contain ${q(QCLASS)}`;
             }
            const names=  ownKeys(rest);
            for( const name of names) {
              typeof name===  'string'||
                Fail `Property name ${name} of ${rawTree} must be a string`;
              prepare(rest[name]);
             }
           }
          return;
         }
        case 'error': {
          const { name, message}=   rawTree;
          typeof name===  'string'||
            Fail `invalid error name typeof ${q(typeof name)}`;
          getErrorConstructor(name)!==  undefined||
            Fail `Must be the name of an Error constructor ${name}`;
          typeof message===  'string'||
            Fail `invalid error message typeof ${q(typeof message)}`;
          return;
         }

        default: {
          assert.fail(X `unrecognized ${q(QCLASS)} ${q(qclass)}`,TypeError);
         }}

     }else if( isArray(rawTree)) {
      const { length}=   rawTree;
      for( let i=  0; i<  length; i+=  1) {
        prepare(rawTree[i]);
       }
     }else {
      const names=  ownKeys(rawTree);
      for( const name of names) {
        if( typeof name!==  'string') {
          throw Fail `Property name ${name} of ${rawTree} must be a string`;
         }
        prepare(rawTree[name]);
       }
     }
   };

  const makeIndenter=  shouldIndent?  makeYesIndenter:  makeNoIndenter;
  let out=  makeIndenter();

  /**
   * This is the second pass recursion after the first pass `prepare`.
   * The first pass did some input validation so
   * here we can safely assume everything those things are validated.
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const decode=  (rawTree)=>{
    // eslint-disable-next-line no-use-before-define
    return recur(rawTree);
   };

  const decodeProperty=  (name, value)=>  {
    out.line();
    if( name===  '__proto__') {
      // JavaScript interprets `{__proto__: x, ...}`
      // as making an object inheriting from `x`, whereas
      // in JSON it is simply a property name. Preserve the
      // JSON meaning.
      out.next( `["__proto__"]:`);
     }else if( identPattern.test(name)) {
      out.next( `${name}:`);
     }else {
      out.next( `${quote(name)}:`);
     }
    decode(value);
    out.next(',');
   };

  /**
   * Modeled after `fullRevive` in marshal.js
   *
   * @param {Encoding} rawTree
   * @returns {number}
   */
  const recur=  (rawTree)=>{
    if( !isObject(rawTree)) {
      // primitives get quoted
      return out.next(quote(rawTree));
     }
    // Assertions of the above to narrow the type.
    assert.typeof(rawTree, 'object');
    assert(rawTree!==  null);
    if( QCLASS in rawTree) {
      const qclass=  rawTree[QCLASS];
      assert.typeof(qclass, 'string');
      assert(!isArray(rawTree));
      // Switching on `encoded[QCLASS]` (or anything less direct, like
      // `qclass`) does not discriminate rawTree in typescript@4.2.3 and
      // earlier.
      switch( rawTree['@qclass']){
        // Encoding of primitives not handled by JSON
        case 'undefined':
        case 'NaN':
        case 'Infinity':
        case '-Infinity': {
          // Their qclass is their expression source.
          return out.next(qclass);
         }
        case 'bigint': {
          const { digits}=   rawTree;
          assert.typeof(digits, 'string');
          return out.next( `${BigInt(digits)}n`);
         }
        case '@@asyncIterator': {
          // TODO deprecated. Eventually remove.
          return out.next('Symbol.asyncIterator');
         }
        case 'symbol': {
          const { name}=   rawTree;
          assert.typeof(name, 'string');
          const sym=  passableSymbolForName(name);
          assert.typeof(sym, 'symbol');
          const registeredName=  Symbol.keyFor(sym);
          if( registeredName===  undefined) {
            const match=  AtAtPrefixPattern.exec(name);
            assert(match!==  null);
            const suffix=  match[1];
            assert(Symbol[suffix]===  sym);
            assert(identPattern.test(suffix));
            return out.next( `Symbol.${suffix}`);
           }
          return out.next( `Symbol.for(${quote(registeredName)})`);
         }
        case 'tagged': {
          const { tag, payload}=   rawTree;
          out.next( `makeTagged(${quote(tag)},`);
          decode(payload);
          return out.next(')');
         }

        case 'slot': {
          let { iface}=   rawTree;
          const index=  Number(Nat(rawTree.index));
          const nestedRender=  (arg)=>{
            const oldOut=  out;
            try {
              out=  makeNoIndenter();
              decode(arg);
              return out.done();
             }finally {
              out=  oldOut;
             }
           };
          if( index<  slots.length) {
            const slot=  nestedRender(slots[index]);
            if( iface===  undefined) {
              return out.next( `slotToVal(${slot})`);
             }
            iface=  nestedRender(iface);
            return out.next( `slotToVal(${slot},${iface})`);
           }else if( iface===  undefined) {
            return out.next( `slot(${index})`);
           }
          iface=  nestedRender(iface);
          return out.next( `slot(${index},${iface})`);
         }

        case 'hilbert': {
          const { original, rest}=   rawTree;
          out.open('{');
          decodeProperty(QCLASS, original);
          if( 'rest'in  rawTree) {
            assert.typeof(rest, 'object');
            assert(rest!==  null);
            const names=  ownKeys(rest);
            for( const name of names) {
              if( typeof name!==  'string') {
                throw Fail `Property name ${q(
                  name)
                  } of ${rest} must be a string`;
               }
              decodeProperty(name, rest[name]);
             }
           }
          return out.close('}');
         }

        case 'error': {
          const { name, message}=   rawTree;
          return out.next( `${name}(${quote(message)})`);
         }

        default: {
          throw assert.fail(
            X `unrecognized ${q(QCLASS)} ${q(qclass)}`,
            TypeError);

         }}

     }else if( isArray(rawTree)) {
      const { length}=   rawTree;
      if( length===  0) {
        return out.next('[]');
       }else {
        out.open('[');
        for( let i=  0; i<  length; i+=  1) {
          out.line();
          decode(rawTree[i]);
          out.next(',');
         }
        return out.close(']');
       }
     }else {
      // rawTree is an `EncodingRecord` which only has string keys,
      // but since ownKeys is not generic, it can't propagate that
      const names=  /** @type {string[]} */  ownKeys(rawTree);
      if( names.length===  0) {
        return out.next('{}');
       }else {
        out.open('{');
        for( const name of names) {
          decodeProperty(name, rawTree[name]);
         }
        return out.close('}');
       }
     }
   };
  prepare(encoding);
  decode(encoding);
  return out.done();
 };$h‍_once.decodeToJustin(decodeToJustin);
harden(decodeToJustin);
})()
,
// === functors[125] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let getTag,makeTagged,passStyleOf,assertRecord,isErrorLike,nameForPassableSymbol,passableSymbolForName;$h‍_imports([["@endo/pass-style", [["getTag", [$h‍_a => (getTag = $h‍_a)]],["makeTagged", [$h‍_a => (makeTagged = $h‍_a)]],["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]],["assertRecord", [$h‍_a => (assertRecord = $h‍_a)]],["isErrorLike", [$h‍_a => (isErrorLike = $h‍_a)]],["nameForPassableSymbol", [$h‍_a => (nameForPassableSymbol = $h‍_a)]],["passableSymbolForName", [$h‍_a => (passableSymbolForName = $h‍_a)]]]]]);   










/** @typedef {import('@endo/pass-style').PassStyle} PassStyle */
/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').RemotableObject} Remotable */
/**
 * @template {Passable} [T=Passable]
 * @typedef {import('@endo/pass-style').CopyRecord<T>} CopyRecord
 */
/** @typedef {import('./types.js').RankCover} RankCover */

const { quote: q, Fail}=   assert;
const { fromEntries, is}=   Object;
const { ownKeys}=   Reflect;

/**
 * Assuming that `record` is a CopyRecord, we have only
 * string-named own properties. `recordNames` returns those name *reverse*
 * sorted, because that's how records are compared, encoded, and sorted.
 *
 * @template T
 * @param {CopyRecord<T>} record
 * @returns {string[]}
 */
const        recordNames=  (record)=>
  // https://github.com/endojs/endo/pull/1260#discussion_r1003657244
  // compares two ways of reverse sorting, and shows that `.sort().reverse()`
  // is currently faster on Moddable XS, while the other way,
  // `.sort(reverseComparator)`, is faster on v8. We currently care more about
  // XS performance, so we reverse sort using `.sort().reverse()`.
  harden(/** @type {string[]} */  ownKeys(record). sort().reverse());$h‍_once.recordNames(recordNames);
harden(recordNames);

/**
 * Assuming that `record` is a CopyRecord and `names` is `recordNames(record)`,
 * return the corresponding array of property values.
 *
 * @template T
 * @param {CopyRecord<T>} record
 * @param {string[]} names
 * @returns {T[]}
 */
const        recordValues=  (record, names)=>
  harden(names.map((name)=>record[name]));$h‍_once.recordValues(recordValues);
harden(recordValues);

/**
 * @param {unknown} n
 * @param {number} size
 * @returns {string}
 */
const        zeroPad=  (n, size)=>  {
  const nStr=   `${n}`;
  assert(nStr.length<=  size);
  const str=   `00000000000000000000${nStr}`;
  const result=  str.substring(str.length-  size);
  assert(result.length===  size);
  return result;
 };$h‍_once.zeroPad(zeroPad);
harden(zeroPad);

// This is the JavaScript analog to a C union: a way to map between a float as a
// number and the bits that represent the float as a buffer full of bytes.  Note
// that the mutation of static state here makes this invalid Jessie code, but
// doing it this way saves the nugatory and gratuitous allocations that would
// happen every time you do a conversion -- and in practical terms it's safe
// because we put the value in one side and then immediately take it out the
// other; there is no actual state retained in the classic sense and thus no
// re-entrancy issue.
const asNumber=  new Float64Array(1);
const asBits=  new BigUint64Array(asNumber.buffer);

// JavaScript numbers are encoded by outputting the base-16
// representation of the binary value of the underlying IEEE floating point
// representation.  For negative values, all bits of this representation are
// complemented prior to the base-16 conversion, while for positive values, the
// sign bit is complemented.  This ensures both that negative values sort before
// positive values and that negative values sort according to their negative
// magnitude rather than their positive magnitude.  This results in an ASCII
// encoding whose lexicographic sort order is the same as the numeric sort order
// of the corresponding numbers.

// TODO Choose the same canonical NaN encoding that cosmWasm and ewasm chose.
const CanonicalNaNBits=  'fff8000000000000';

/**
 * @param {number} n
 * @returns {string}
 */
const encodeBinary64=  (n)=>{
  // Normalize -0 to 0 and NaN to a canonical encoding
  if( is(n, -0)) {
    n=  0;
   }else if( is(n, NaN)) {
    return  `f${CanonicalNaNBits}`;
   }
  asNumber[0]=  n;
  let bits=  asBits[0];
  if( n<  0) {
    bits^=  0xffffffffffffffffn;
   }else {
    bits^=  0x8000000000000000n;
   }
  return  `f${zeroPad(bits.toString(16),16) }`;
 };

/**
 * @param {string} encoded
 * @returns {number}
 */
const decodeBinary64=  (encoded)=>{
  encoded.startsWith('f')||  Fail `Encoded number expected: ${encoded}`;
  let bits=  BigInt( `0x${encoded.substring(1)}`);
  if( encoded[1]<  '8') {
    bits^=  0xffffffffffffffffn;
   }else {
    bits^=  0x8000000000000000n;
   }
  asBits[0]=  bits;
  const result=  asNumber[0];
  !is(result, -0)||  Fail `Unexpected negative zero: ${encoded}`;
  return result;
 };

/**
 * Encode a JavaScript bigint using a variant of Elias delta coding, with an
 * initial component for the length of the digit count as a unary string, a
 * second component for the decimal digit count, and a third component for the
 * decimal digits preceded by a gratuitous separating colon.
 * To ensure that the lexicographic sort order of encoded values matches the
 * numeric sort order of the corresponding numbers, the characters of the unary
 * prefix are different for negative values (type "n" followed by any number of
 * "#"s [which sort before decimal digits]) vs. positive and zero values (type
 * "p" followed by any number of "~"s [which sort after decimal digits]) and
 * each decimal digit of the encoding for a negative value is replaced with its
 * ten's complement (so that negative values of the same scale sort by
 * *descending* absolute value).
 *
 * @param {bigint} n
 * @returns {string}
 */
const encodeBigInt=  (n)=>{
  const abs=  n<  0n?  -n:  n;
  const nDigits=  abs.toString().length;
  const lDigits=  nDigits.toString().length;
  if( n<  0n) {
    return  `n${
      // A "#" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '#'.repeat(lDigits-  1)
     }${
      // The ten's complement of the count of digits.
      (10**  lDigits-  nDigits).toString().padStart(lDigits, '0')
     }:${
      // The ten's complement of the digits.
      (10n**  BigInt(nDigits)+  n).toString().padStart(nDigits, '0')
     }`;
   }else {
    return  `p${
      // A "~" for each digit beyond the first
      // in the decimal *count* of decimal digits.
      '~'.repeat(lDigits-  1)
     }${
      // The count of digits.
      nDigits
     }:${
      // The digits.
      n
     }`;
   }
 };

/**
 * @param {string} encoded
 * @returns {bigint}
 */
const decodeBigInt=  (encoded)=>{
  const typePrefix=  encoded.charAt(0); // faster than encoded[0]
  let rem=  encoded.slice(1);
  typePrefix===  'p'||
    typePrefix===  'n'||
    Fail `Encoded bigint expected: ${encoded}`;

  const lDigits=  rem.search(/[0-9]/)+  1;
  lDigits>=  1||  Fail `Digit count expected: ${encoded}`;
  rem=  rem.slice(lDigits-  1);

  rem.length>=  lDigits||  Fail `Complete digit count expected: ${encoded}`;
  const snDigits=  rem.slice(0, lDigits);
  rem=  rem.slice(lDigits);
  /^[0-9]+$/.test(snDigits)||  Fail `Decimal digit count expected: ${encoded}`;
  let nDigits=  parseInt(snDigits, 10);
  if( typePrefix===  'n') {
    // TODO Assert to reject forbidden encodings
    // like "n0:" and "n00:…" and "n91:…" through "n99:…"?
    nDigits=  10**  lDigits-  nDigits;
   }

  rem.startsWith(':')||  Fail `Separator expected: ${encoded}`;
  rem=  rem.slice(1);
  rem.length===  nDigits||
    Fail `Fixed-length digit sequence expected: ${encoded}`;
  let n=  BigInt(rem);
  if( typePrefix===  'n') {
    // TODO Assert to reject forbidden encodings
    // like "n9:0" and "n8:00" and "n8:91" through "n8:99"?
    n=  -(10n**  BigInt(nDigits)-  n);
   }

  return n;
 };

// `'\u0000'` is the terminator after elements.
// `'\u0001'` is the backslash-like escape character, for
// escaping both of these characters.

const encodeArray=  (array, encodePassable)=>  {
  const chars=  ['['];
  for( const element of array) {
    const enc=  encodePassable(element);
    for( const c of enc) {
      if( c===  '\u0000'||  c===  '\u0001') {
        chars.push('\u0001');
       }
      chars.push(c);
     }
    chars.push('\u0000');
   }
  return chars.join('');
 };

/**
 * @param {string} encoded
 * @param {(encoded: string) => Passable} decodePassable
 * @returns {Array}
 */
const decodeArray=  (encoded, decodePassable)=>  {
  encoded.startsWith('[')||  Fail `Encoded array expected: ${encoded}`;
  const elements=  [];
  const elemChars=  [];
  for( let i=  1; i<  encoded.length; i+=  1) {
    const c=  encoded[i];
    if( c===  '\u0000') {
      const encodedElement=  elemChars.join('');
      elemChars.length=  0;
      const element=  decodePassable(encodedElement);
      elements.push(element);
     }else if( c===  '\u0001') {
      i+=  1;
      i<  encoded.length||  Fail `unexpected end of encoding ${encoded}`;
      const c2=  encoded[i];
      c2===  '\u0000'||
        c2===  '\u0001'||
        Fail `Unexpected character after u0001 escape: ${c2}`;
      elemChars.push(c2);
     }else {
      elemChars.push(c);
     }
   }
  elemChars.length===  0||  Fail `encoding terminated early: ${encoded}`;
  return harden(elements);
 };

const encodeRecord=  (record, encodePassable)=>  {
  const names=  recordNames(record);
  const values=  recordValues(record, names);
  return  `(${encodeArray(harden([names,values]), encodePassable) }`;
 };

const decodeRecord=  (encoded, decodePassable)=>  {
  assert(encoded.startsWith('('));
  const keysvals=  decodeArray(encoded.substring(1), decodePassable);
  keysvals.length===  2||  Fail `expected keys,values pair: ${encoded}`;
  const [keys, vals]=  keysvals;

   passStyleOf(keys)===  'copyArray'&&
    passStyleOf(vals)===  'copyArray'&&
    keys.length===  vals.length&&
    keys.every((key)=>typeof key===  'string')||
    Fail `not a valid record encoding: ${encoded}`;
  const mapEntries=  keys.map((key, i)=>  [key, vals[i]]);
  const record=  harden(fromEntries(mapEntries));
  assertRecord(record, 'decoded record');
  return record;
 };

const encodeTagged=  (tagged, encodePassable)=>
   `:${encodeArray(harden([getTag(tagged),tagged.payload]), encodePassable) }`;

const decodeTagged=  (encoded, decodePassable)=>  {
  assert(encoded.startsWith(':'));
  const tagpayload=  decodeArray(encoded.substring(1), decodePassable);
  tagpayload.length===  2||  Fail `expected tag,payload pair: ${encoded}`;
  const [tag, payload]=  tagpayload;
  passStyleOf(tag)===  'string'||
    Fail `not a valid tagged encoding: ${encoded}`;
  return makeTagged(tag, payload);
 };

/**
 * @typedef {object} EncodeOptions
 * @property {(
 *   remotable: Remotable,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeRemotable]
 * @property {(
 *   promise: Promise,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodePromise]
 * @property {(
 *   error: Error,
 *   encodeRecur: (p: Passable) => string,
 * ) => string} [encodeError]
 */

/**
 * @param {EncodeOptions} [encodeOptions]
 * @returns {(passable: Passable) => string}
 */
const        makeEncodePassable=  (encodeOptions=  {})=>  {
  const {
    encodeRemotable=  (rem, _)=>  Fail `remotable unexpected: ${rem}`,
    encodePromise=  (prom, _)=>  Fail `promise unexpected: ${prom}`,
    encodeError=  (err, _)=>  Fail `error unexpected: ${err}`}=
      encodeOptions;

  const encodePassable=  (passable)=>{
    if( isErrorLike(passable)) {
      return encodeError(passable, encodePassable);
     }
    const passStyle=  passStyleOf(passable);
    switch( passStyle){
      case 'null': {
        return 'v';
       }
      case 'undefined': {
        return 'z';
       }
      case 'number': {
        return encodeBinary64(passable);
       }
      case 'string': {
        return  `s${passable}`;
       }
      case 'boolean': {
        return  `b${passable}`;
       }
      case 'bigint': {
        return encodeBigInt(passable);
       }
      case 'remotable': {
        const result=  encodeRemotable(passable, encodePassable);
        result.startsWith('r')||
          Fail `internal: Remotable encoding must start with "r": ${result}`;
        return result;
       }
      case 'error': {
        const result=  encodeError(passable, encodePassable);
        result.startsWith('!')||
          Fail `internal: Error encoding must start with "!": ${result}`;
        return result;
       }
      case 'promise': {
        const result=  encodePromise(passable, encodePassable);
        result.startsWith('?')||
          Fail `internal: Promise encoding must start with "?": ${result}`;
        return result;
       }
      case 'symbol': {
        return  `y${nameForPassableSymbol(passable)}`;
       }
      case 'copyArray': {
        return encodeArray(passable, encodePassable);
       }
      case 'copyRecord': {
        return encodeRecord(passable, encodePassable);
       }
      case 'tagged': {
        return encodeTagged(passable, encodePassable);
       }
      default: {
        throw Fail `a ${q(passStyle)} cannot be used as a collection passable`;
       }}

   };
  return harden(encodePassable);
 };$h‍_once.makeEncodePassable(makeEncodePassable);
harden(makeEncodePassable);

/**
 * @typedef {object} DecodeOptions
 * @property {(
 *   encodedRemotable: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Remotable} [decodeRemotable]
 * @property {(
 *   encodedPromise: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Promise} [decodePromise]
 * @property {(
 *   encodedError: string,
 *   decodeRecur: (e: string) => Passable
 * ) => Error} [decodeError]
 */

/**
 * @param {DecodeOptions} [decodeOptions]
 * @returns {(encoded: string) => Passable}
 */
const        makeDecodePassable=  (decodeOptions=  {})=>  {
  const {
    decodeRemotable=  (rem, _)=>  Fail `remotable unexpected: ${rem}`,
    decodePromise=  (prom, _)=>  Fail `promise unexpected: ${prom}`,
    decodeError=  (err, _)=>  Fail `error unexpected: ${err}`}=
      decodeOptions;

  const decodePassable=  (encoded)=>{
    switch( encoded.charAt(0)){
      case 'v': {
        return null;
       }
      case 'z': {
        return undefined;
       }
      case 'f': {
        return decodeBinary64(encoded);
       }
      case 's': {
        return encoded.substring(1);
       }
      case 'b': {
        return encoded.substring(1)!==  'false';
       }
      case 'n':
      case 'p': {
        return decodeBigInt(encoded);
       }
      case 'r': {
        return decodeRemotable(encoded, decodePassable);
       }
      case '?': {
        return decodePromise(encoded, decodePassable);
       }
      case '!': {
        return decodeError(encoded, decodePassable);
       }
      case 'y': {
        return passableSymbolForName(encoded.substring(1));
       }
      case '[': {
        return decodeArray(encoded, decodePassable);
       }
      case '(': {
        return decodeRecord(encoded, decodePassable);
       }
      case ':': {
        return decodeTagged(encoded, decodePassable);
       }
      default: {
        throw Fail `invalid database key: ${encoded}`;
       }}

   };
  return harden(decodePassable);
 };$h‍_once.makeDecodePassable(makeDecodePassable);
harden(makeDecodePassable);

const        isEncodedRemotable=  (encoded)=>encoded.charAt(0)===  'r';$h‍_once.isEncodedRemotable(isEncodedRemotable);
harden(isEncodedRemotable);

// /////////////////////////////////////////////////////////////////////////////

/**
 * @type {Record<PassStyle, string>}
 * The single prefix characters to be used for each PassStyle category.
 * `bigint` is a two character string because each of those characters
 * individually is a valid bigint prefix. `n` for "negative" and `p` for
 * "positive". The ordering of these prefixes is the same as the
 * rankOrdering of their respective PassStyles. This table is imported by
 * rankOrder.js for this purpose.
 *
 * In addition, `|` is the remotable->ordinal mapping prefix:
 * This is not used in covers but it is
 * reserved from the same set of strings. Note that the prefix is > any
 * prefix used by any cover so that ordinal mapping keys are always outside
 * the range of valid collection entry keys.
 */
const        passStylePrefixes=  {
  error: '!',
  copyRecord: '(',
  tagged: ':',
  promise: '?',
  copyArray: '[',
  boolean: 'b',
  number: 'f',
  bigint: 'np',
  remotable: 'r',
  string: 's',
  null: 'v',
  symbol: 'y',
  undefined: 'z'};$h‍_once.passStylePrefixes(passStylePrefixes);

Object.setPrototypeOf(passStylePrefixes, null);
harden(passStylePrefixes);
})()
,
// === functors[126] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let getTag,passStyleOf,nameForPassableSymbol,passStylePrefixes,recordNames,recordValues;$h‍_imports([["@endo/pass-style", [["getTag", [$h‍_a => (getTag = $h‍_a)]],["passStyleOf", [$h‍_a => (passStyleOf = $h‍_a)]],["nameForPassableSymbol", [$h‍_a => (nameForPassableSymbol = $h‍_a)]]]],["./encodePassable.js", [["passStylePrefixes", [$h‍_a => (passStylePrefixes = $h‍_a)]],["recordNames", [$h‍_a => (recordNames = $h‍_a)]],["recordValues", [$h‍_a => (recordValues = $h‍_a)]]]]]);   






/** @typedef {import('@endo/pass-style').Passable} Passable */
/** @typedef {import('@endo/pass-style').PassStyle} PassStyle */
/** @typedef {import('./types.js').RankCover} RankCover */
/** @typedef {import('./types.js').RankComparison} RankComparison */
/** @typedef {import('./types.js').RankCompare} RankCompare */
/** @typedef {import('./types.js').FullCompare} FullCompare */

const { Fail, quote: q}=   assert;
const { entries, fromEntries, setPrototypeOf, is}=   Object;

/**
 * @typedef {object} RankComparatorKit
 * @property {RankCompare} comparator
 * @property {RankCompare} antiComparator
 */

/**
 * @typedef {object} FullComparatorKit
 * @property {FullCompare} comparator
 * @property {FullCompare} antiComparator
 */

/**
 * @typedef {[number, number]} IndexCover
 */

/**
 * This is the equality comparison used by JavaScript's Map and Set
 * abstractions, where NaN is the same as NaN and -0 is the same as
 * 0. Marshal serializes -0 as zero, so the semantics of our distributed
 * object system does not distinguish 0 from -0.
 *
 * `sameValueZero` is the EcmaScript spec name for this equality comparison,
 * but TODO we need a better name for the API.
 *
 * @param {any} x
 * @param {any} y
 * @returns {boolean}
 */
const sameValueZero=  (x, y)=>  x===  y||  is(x, y);

const        trivialComparator=  (left, right)=>
  // eslint-disable-next-line no-nested-ternary, @endo/restrict-comparison-operands
  left<  right?  -1:  left===  right?  0:  1;

/**
 * @typedef {Record<PassStyle, { index: number, cover: RankCover }>} PassStyleRanksRecord
 */$h‍_once.trivialComparator(trivialComparator);

const passStyleRanks=  /** @type {PassStyleRanksRecord} */
  fromEntries(
    entries(passStylePrefixes)
      // Sort entries by ascending prefix.
.      sort(([_leftStyle, leftPrefixes], [_rightStyle, rightPrefixes])=>  {
        return trivialComparator(leftPrefixes, rightPrefixes);
       }).
       map(([passStyle, prefixes], index)=>  {
        // Cover all strings that start with any character in `prefixes`,
        // verifying that it is sorted so that is
        // all s such that prefixes.at(0) ≤ s < successor(prefixes.at(-1)).
        prefixes===  [...prefixes].sort().join('')||
          Fail `unsorted prefixes for passStyle ${q(passStyle)}: ${q(prefixes)}`;
        const cover=  [
          prefixes.charAt(0),
          String.fromCharCode(prefixes.charCodeAt(prefixes.length-  1)+  1)];

        return [passStyle, { index, cover}];
       }));


setPrototypeOf(passStyleRanks, null);
harden(passStyleRanks);

/**
 * Associate with each passStyle a RankCover that may be an overestimate,
 * and whose results therefore need to be filtered down. For example, because
 * there is not a smallest or biggest bigint, bound it by `NaN` (the last place
 * number) and `''` (the empty string, which is the first place string). Thus,
 * a range query using this range may include these values, which would then
 * need to be filtered out.
 *
 * @param {PassStyle} passStyle
 * @returns {RankCover}
 */
const        getPassStyleCover=  (passStyle)=>passStyleRanks[passStyle].cover;$h‍_once.getPassStyleCover(getPassStyleCover);
harden(getPassStyleCover);

/**
 * @type {WeakMap<RankCompare,WeakSet<Passable[]>>}
 */
const memoOfSorted=  new WeakMap();

/**
 * @type {WeakMap<RankCompare,RankCompare>}
 */
const comparatorMirrorImages=  new WeakMap();

/**
 * @param {RankCompare=} compareRemotables
 * An option to create a comparator in which an internal order is
 * assigned to remotables. This defaults to a comparator that
 * always returns `0`, meaning that all remotables are tied
 * for the same rank.
 * @returns {RankComparatorKit}
 */
const        makeComparatorKit=  (compareRemotables=  (_x, _y)=>  0)=>  {
  /** @type {RankCompare} */
  const comparator=  (left, right)=>  {
    if( sameValueZero(left, right)) {
      return 0;
     }
    const leftStyle=  passStyleOf(left);
    const rightStyle=  passStyleOf(right);
    if( leftStyle!==  rightStyle) {
      return trivialComparator(
        passStyleRanks[leftStyle].index,
        passStyleRanks[rightStyle].index);

     }
    /* eslint-disable @endo/restrict-comparison-operands --
     * We know `left` and `right` are comparable.
     */
    switch( leftStyle){
      case 'remotable': {
        return compareRemotables(left, right);
       }
      case 'undefined':
      case 'null':
      case 'error':
      case 'promise': {
        // For each of these passStyles, all members of that passStyle are tied
        // for the same rank.
        return 0;
       }
      case 'boolean':
      case 'bigint':
      case 'string': {
        // Within each of these passStyles, the rank ordering agrees with
        // JavaScript's relational operators `<` and `>`.
        if( left<  right) {
          return -1;
         }else {
          assert(left>  right);
          return 1;
         }
       }
      case 'symbol': {
        return comparator(
          nameForPassableSymbol(left),
          nameForPassableSymbol(right));

       }
      case 'number': {
        // `NaN`'s rank is after all other numbers.
        if( Number.isNaN(left)) {
          assert(!Number.isNaN(right));
          return 1;
         }else if( Number.isNaN(right)) {
          return -1;
         }
        // The rank ordering of non-NaN numbers agrees with JavaScript's
        // relational operators '<' and '>'.
        if( left<  right) {
          return -1;
         }else {
          assert(left>  right);
          return 1;
         }
       }
      case 'copyRecord': {
        // Lexicographic by inverse sorted order of property names, then
        // lexicographic by corresponding values in that same inverse
        // order of their property names. Comparing names by themselves first,
        // all records with the exact same set of property names sort next to
        // each other in a rank-sort of copyRecords.

        // The copyRecord invariants enforced by passStyleOf ensure that
        // all the property names are strings. We need the reverse sorted order
        // of these names, which we then compare lexicographically. This ensures
        // that if the names of record X are a subset of the names of record Y,
        // then record X will have an earlier rank and sort to the left of Y.
        const leftNames=  recordNames(left);
        const rightNames=  recordNames(right);

        const result=  comparator(leftNames, rightNames);
        if( result!==  0) {
          return result;
         }
        return comparator(
          recordValues(left, leftNames),
          recordValues(right, rightNames));

       }
      case 'copyArray': {
        // Lexicographic
        const len=  Math.min(left.length, right.length);
        for( let i=  0; i<  len; i+=  1) {
          const result=  comparator(left[i], right[i]);
          if( result!==  0) {
            return result;
           }
         }
        // If all matching elements were tied, then according to their lengths.
        // If array X is a prefix of array Y, then X has an earlier rank than Y.
        return comparator(left.length, right.length);
       }
      case 'tagged': {
        // Lexicographic by `[Symbol.toStringTag]` then `.payload`.
        const labelComp=  comparator(getTag(left), getTag(right));
        if( labelComp!==  0) {
          return labelComp;
         }
        return comparator(left.payload, right.payload);
       }
      default: {
        throw Fail `Unrecognized passStyle: ${q(leftStyle)}`;
       }}

    /* eslint-enable */
   };

  /** @type {RankCompare} */
  const antiComparator=  (x, y)=>  comparator(y, x);

  memoOfSorted.set(comparator, new WeakSet());
  memoOfSorted.set(antiComparator, new WeakSet());
  comparatorMirrorImages.set(comparator, antiComparator);
  comparatorMirrorImages.set(antiComparator, comparator);

  return harden({ comparator, antiComparator});
 };
/**
 * @param {RankCompare} comparator
 * @returns {RankCompare=}
 */$h‍_once.makeComparatorKit(makeComparatorKit);
const        comparatorMirrorImage=  (comparator)=>
  comparatorMirrorImages.get(comparator);

/**
 * @param {Passable[]} passables
 * @param {RankCompare} compare
 * @returns {boolean}
 */$h‍_once.comparatorMirrorImage(comparatorMirrorImage);
const        isRankSorted=  (passables, compare)=>  {
  const subMemoOfSorted=  memoOfSorted.get(compare);
  assert(subMemoOfSorted!==  undefined);
  if( subMemoOfSorted.has(passables)) {
    return true;
   }
  assert(passStyleOf(passables)===  'copyArray');
  for( let i=  1; i<  passables.length; i+=  1) {
    if( compare(passables[i-  1], passables[i])>=  1) {
      return false;
     }
   }
  subMemoOfSorted.add(passables);
  return true;
 };$h‍_once.isRankSorted(isRankSorted);
harden(isRankSorted);

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 */
const        assertRankSorted=  (sorted, compare)=>
  isRankSorted(sorted, compare)||
  // TODO assert on bug could lead to infinite recursion. Fix.
  // eslint-disable-next-line no-use-before-define
  Fail `Must be rank sorted: ${sorted} vs ${sortByRank(sorted,compare) }`;$h‍_once.assertRankSorted(assertRankSorted);
harden(assertRankSorted);

/**
 * TODO SECURITY BUG: https://github.com/Agoric/agoric-sdk/issues/4260
 * sortByRank currently uses `Array.prototype.sort` directly, and
 * so only works correctly when given a `compare` function that considers
 * `undefined` strictly bigger (`>`) than everything else. This is
 * because `Array.prototype.sort` bizarrely moves all `undefined`s to
 * the end of the array regardless, without consulting the `compare`
 * function. This is a genuine bug for us NOW because sometimes we sort
 * in reverse order by passing a reversed rank comparison function.
 *
 * @param {Iterable<Passable>} passables
 * @param {RankCompare} compare
 * @returns {Passable[]}
 */
const        sortByRank=  (passables, compare)=>  {
  if( Array.isArray(passables)) {
    harden(passables);
    // Calling isRankSorted gives it a chance to get memoized for
    // this `compare` function even if it was already memoized for a different
    // `compare` function.
    if( isRankSorted(passables, compare)) {
      return passables;
     }
   }
  const unsorted=  [...passables];
  unsorted.forEach(harden);
  const sorted=  harden(unsorted.sort(compare));
  const subMemoOfSorted=  memoOfSorted.get(compare);
  assert(subMemoOfSorted!==  undefined);
  subMemoOfSorted.add(sorted);
  return sorted;
 };$h‍_once.sortByRank(sortByRank);
harden(sortByRank);

/**
 * See
 * https://en.wikipedia.org/wiki/Binary_search_algorithm#Procedure_for_finding_the_leftmost_element
 *
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {Passable} key
 * @param {("leftMost" | "rightMost")=} bias
 * @returns {number}
 */
const rankSearch=  (sorted, compare, key, bias=  'leftMost')=>  {
  assertRankSorted(sorted, compare);
  let left=  0;
  let right=  sorted.length;
  while( left<  right) {
    const m=  Math.floor((left+  right)/  2);
    const comp=  compare(sorted[m], key);
    if( comp<=  -1||   comp===  0&&  bias===  'rightMost')  {
      left=  m+  1;
     }else {
      assert(comp>=  1||   comp===  0&&  bias===  'leftMost');
      right=  m;
     }
   }
  return bias===  'leftMost'?  left:  right-  1;
 };

/**
 * @param {Passable[]} sorted
 * @param {RankCompare} compare
 * @param {RankCover} rankCover
 * @returns {IndexCover}
 */
const        getIndexCover=  (sorted, compare, [leftKey, rightKey])=>  {
  assertRankSorted(sorted, compare);
  const leftIndex=  rankSearch(sorted, compare, leftKey, 'leftMost');
  const rightIndex=  rankSearch(sorted, compare, rightKey, 'rightMost');
  return [leftIndex, rightIndex];
 };$h‍_once.getIndexCover(getIndexCover);
harden(getIndexCover);

/** @type {RankCover} */
const        FullRankCover=  harden(['', '{']);

/**
 * @param {Passable[]} sorted
 * @param {IndexCover} indexCover
 * @returns {Iterable<[number, Passable]>}
 */$h‍_once.FullRankCover(FullRankCover);
const        coveredEntries=  (sorted, [leftIndex, rightIndex])=>  {
  /** @type {Iterable<[number, Passable]>} */
  const iterable=  harden({
    [Symbol.iterator]: ()=>  {
      let i=  leftIndex;
      return harden({
        next: ()=>  {
          if( i<=  rightIndex) {
            const element=  sorted[i];
            i+=  1;
            return harden({ value: [i, element], done: false});
           }else {
            return harden({ value: undefined, done: true});
           }
         }});

     }});

  return iterable;
 };$h‍_once.coveredEntries(coveredEntries);
harden(coveredEntries);

/**
 * @param {RankCompare} compare
 * @param {Passable} a
 * @param {Passable} b
 * @returns {Passable}
 */
const maxRank=  (compare, a, b)=>   compare(a, b)>=  0?  a:  b;

/**
 * @param {RankCompare} compare
 * @param {Passable} a
 * @param {Passable} b
 * @returns {Passable}
 */
const minRank=  (compare, a, b)=>   compare(a, b)<=  0?  a:  b;

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
const        unionRankCovers=  (compare, covers)=>  {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const unionRankCoverPair=  ([leftA, rightA], [leftB, rightB])=>  [
    minRank(compare, leftA, leftB),
    maxRank(compare, rightA, rightB)];

  return covers.reduce(unionRankCoverPair, ['{', '']);
 };$h‍_once.unionRankCovers(unionRankCovers);
harden(unionRankCovers);

/**
 * @param {RankCompare} compare
 * @param {RankCover[]} covers
 * @returns {RankCover}
 */
const        intersectRankCovers=  (compare, covers)=>  {
  /**
   * @param {RankCover} a
   * @param {RankCover} b
   * @returns {RankCover}
   */
  const intersectRankCoverPair=  ([leftA, rightA], [leftB, rightB])=>  [
    maxRank(compare, leftA, leftB),
    minRank(compare, rightA, rightB)];

  return covers.reduce(intersectRankCoverPair, ['', '{']);
 };$h‍_once.intersectRankCovers(intersectRankCovers);

const        { comparator: compareRank, antiComparator: compareAntiRank}=
  makeComparatorKit();

/**
 * Create a comparator kit in which remotables are fully ordered
 * by the order in which they are first seen by *this* comparator kit.
 * BEWARE: This is observable mutable state, so such a comparator kit
 * should never be shared among subsystems that should not be able
 * to communicate.
 *
 * Note that this order does not meet the requirements for store
 * ordering, since it has no memory of deleted keys.
 *
 * These full order comparator kit is strictly more precise that the
 * rank order comparator kits above. As a result, any array which is
 * sorted by such a full order will pass the isRankSorted test with
 * a corresponding rank order.
 *
 * An array which is sorted by a *fresh* full order comparator, i.e.,
 * one that has not yet seen any remotables, will of course remain
 * sorted by according to *that* full order comparator. An array *of
 * scalars* sorted by a fresh full order will remain sorted even
 * according to a new fresh full order comparator, since it will see
 * the remotables in the same order again. Unfortunately, this is
 * not true of arrays of passables in general.
 *
 * @param {boolean=} longLived
 * @returns {FullComparatorKit}
 */$h‍_once.compareRank(compareRank);$h‍_once.compareAntiRank(compareAntiRank);
const        makeFullOrderComparatorKit=  (longLived=  false)=>  {
  let numSeen=  0;
  // When dynamically created with short lifetimes (the default) a WeakMap
  // would perform poorly, and the leak created by a Map only lasts as long
  // as the Map.
  const MapConstructor=  longLived?  WeakMap:  Map;
  const seen=  new MapConstructor();
  const tag=  (r)=>{
    if( seen.has(r)) {
      return seen.get(r);
     }
    numSeen+=  1;
    seen.set(r, numSeen);
    return numSeen;
   };
  const compareRemotables=  (x, y)=>  compareRank(tag(x), tag(y));
  return makeComparatorKit(compareRemotables);
 };$h‍_once.makeFullOrderComparatorKit(makeFullOrderComparatorKit);
harden(makeFullOrderComparatorKit);
})()
,
// === functors[127] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   
})()
,
// === functors[128] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./src/deeplyFulfilled.js", []],["./src/encodeToCapData.js", []],["./src/marshal.js", []],["./src/marshal-stringify.js", []],["./src/marshal-justin.js", []],["./src/encodePassable.js", []],["./src/rankOrder.js", []],["./src/types.js", []],["@endo/pass-style", []]]);   
})()
,
// === functors[129] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /** @typedef {string} CapTPSlot */

/**
 * @typedef {object} TrapImpl
 * @property {(target: any, args: Array<any>) => any} applyFunction function
 * application
 * @property {(
 *   target: any,
 *   method: string | symbol | number,
 *   args: Array<any>
 * ) => any} applyMethod method invocation, which is an atomic lookup of method
 * and apply
 * @property {(target: any, prop: string | symbol | number) => any} get property
 * lookup
 */

/**
 * @typedef {[boolean, import('@endo/marshal').CapData<CapTPSlot>]} TrapCompletion The head of the pair
 * is the `isRejected` value indicating whether the sync call was an exception,
 * and tail of the pair is the serialized fulfillment value or rejection reason.
 * (The fulfillment value is a non-thenable.  The rejection reason is normally
 * an error.)
 */

/**
 * @typedef TrapRequest the argument to TrapGuest
 * @property {keyof TrapImpl} trapMethod the TrapImpl method that was called
 * @property {CapTPSlot} slot the target slot
 * @property {Array<any>} trapArgs arguments to the TrapImpl method
 * @property {() => Required<Iterator<void, void, any>>} startTrap start the
 * trap process on the trapHost, and drive the other side.
 */

/**
 * @callback TrapGuest Use out-of-band communications to synchronously return a
 * TrapCompletion value indicating the final results of a Trap call.
 * @param {TrapRequest} req
 * @returns {TrapCompletion}
 */

/**
 * @callback TrapHost start the process of transferring the Trap request's
 * results
 * @param {TrapCompletion} completion
 * @returns {AsyncIterator<void, void, any> | undefined} If an AsyncIterator is
 * returned, it will satisfy a future guest IterationObserver.
 */

/** @typedef {import('./ts-types.js').Trap} Trap */

/**
 * @template T
 * @typedef {import('./ts-types').TrapHandler<T>} TrapHandler
 */
})()
,
// === functors[130] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./types.js", []]]);   



/**
 * Default implementation of Trap for near objects.
 *
 * @type {TrapImpl}
 */
const        nearTrapImpl=  harden({
  applyFunction(target, args) {
    return target(...args);
   },
  applyMethod(target, prop, args) {
    return target[prop](...args);
   },
  get(target, prop) {
    return target[prop];
   }});


/** @type {ProxyHandler<any>} */$h‍_once.nearTrapImpl(nearTrapImpl);
const baseFreezableProxyHandler=  {
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
   }};


/**
 * A Proxy handler for Trap(x)
 *
 * @param {*} x Any value passed to Trap(x)
 * @param {TrapImpl} trapImpl
 * @returns {ProxyHandler}
 */
const TrapProxyHandler=  (x, trapImpl)=>  {
  return harden({
    ...baseFreezableProxyHandler,
    get(_target, p, _receiver) {
      return (...args)=>  trapImpl.applyMethod(x, p, args);
     },
    apply(_target, _thisArg, argArray=  []) {
      return trapImpl.applyFunction(x, argArray);
     },
    has(_target, _p) {
      // TODO: has property is not yet transferrable over captp.
      return true;
     }});

 };

/**
 * @param {TrapImpl} trapImpl
 * @returns {Trap}
 */
const        makeTrap=  (trapImpl)=>{
  const Trap=  (x)=>{
    const handler=  TrapProxyHandler(x, trapImpl);
    return harden(new Proxy(()=>  { },handler));
   };

  const makeTrapGetterProxy=  (x)=>{
    const handler=  harden({
      ...baseFreezableProxyHandler,
      has(_target, _prop) {
        // TODO: has property is not yet transferrable over captp.
        return true;
       },
      get(_target, prop) {
        return trapImpl.get(x, prop);
       }});

    return new Proxy(Object.create(null), handler);
   };
  Trap.get=  makeTrapGetterProxy;

  return harden(Trap);
 };$h‍_once.makeTrap(makeTrap);
})()
,
// === functors[131] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Far,isObject;$h‍_imports([["@endo/marshal", [["Far", [$h‍_a => (Far = $h‍_a)]],["isObject", [$h‍_a => (isObject = $h‍_a)]]]]]);   


// @ts-check
const { WeakRef, FinalizationRegistry}=   globalThis;

/**
 * @template K
 * @template {object} V
 * @typedef {Pick<Map<K, V>, 'get' | 'has' | 'delete'> &
 *  {
 *   set: (key: K, value: V) => void,
 *   clearWithoutFinalizing: () => void,
 *   getSize: () => number,
 * }} FinalizingMap
 */

/**
 *
 * Elsewhere this is known as a "Weak Value Map". Whereas a std JS WeakMap
 * is weak on its keys, this map is weak on its values. It does not retain these
 * values strongly. If a given value disappears, then the entries for it
 * disappear from every weak-value-map that holds it as a value.
 *
 * Just as a WeakMap only allows gc-able values as keys, a weak-value-map
 * only allows gc-able values as values.
 *
 * Unlike a WeakMap, a weak-value-map unavoidably exposes the non-determinism of
 * gc to its clients. Thus, both the ability to create one, as well as each
 * created one, must be treated as dangerous capabilities that must be closely
 * held. A program with access to these can read side channels though gc that do
 * not* rely on the ability to measure duration. This is a separate, and bad,
 * timing-independent side channel.
 *
 * This non-determinism also enables code to escape deterministic replay. In a
 * blockchain context, this could cause validators to differ from each other,
 * preventing consensus, and thus preventing chain progress.
 *
 * JS standards weakrefs have been carefully designed so that operations which
 * `deref()` a weakref cause that weakref to remain stable for the remainder of
 * that turn. The operations below guaranteed to do this derefing are `has`,
 * `get`, `set`, `delete`. Note that neither `clearWithoutFinalizing` nor
 * `getSize` are guaranteed to deref. Thus, a call to `map.getSize()` may
 * reflect values that might still be collected later in the same turn.
 *
 * @template K
 * @template {object} V
 * @param {(key: K) => void} [finalizer]
 * @param {object} [opts]
 * @param {boolean} [opts.weakValues]
 * @returns {FinalizingMap<K, V> &
 *  import('@endo/eventual-send').RemotableBrand<{}, FinalizingMap<K, V>>
 * }
 */
const        makeFinalizingMap=  (finalizer, opts)=>  {
  const { weakValues=  false}=   opts||  {};
  if( !weakValues||  !WeakRef||  !FinalizationRegistry) {
    /** @type Map<K, V> */
    const keyToVal=  new Map();
    return Far('fakeFinalizingMap', {
      clearWithoutFinalizing: keyToVal.clear.bind(keyToVal),
      get: keyToVal.get.bind(keyToVal),
      has: keyToVal.has.bind(keyToVal),
      set: (key, val)=>  {
        keyToVal.set(key, val);
       },
      delete: keyToVal.delete.bind(keyToVal),
      getSize: ()=>  keyToVal.size});

   }
  /** @type Map<K, WeakRef<any>> */
  const keyToRef=  new Map();
  const registry=  new FinalizationRegistry((key)=>{
    // Because this will delete the current binding of `key`, we need to
    // be sure that it is not called because a previous binding was collected.
    // We do this with the `unregister` in `set` below, assuming that
    // `unregister` *immediately* suppresses the finalization of the thing
    // it unregisters. TODO If this is not actually guaranteed, i.e., if
    // finalizations that have, say, already been scheduled might still
    // happen after they've been unregistered, we will need to revisit this.
    // eslint-disable-next-line no-use-before-define
    finalizingMap.delete(key);
   });
  const finalizingMap=  Far('finalizingMap', {
    /**
     * `clearWithoutFinalizing` does not `deref` anything, and so does not
     * suppress collection of the weakly-pointed-to values until the end of the
     * turn.  Because `clearWithoutFinalizing` immediately removes all entries
     * from this map, this possible collection is not observable using only this
     * map instance.  But it is observable via other uses of WeakRef or
     * FinalizationGroup, including other map instances made by this
     * `makeFinalizingMap`.
     */
    clearWithoutFinalizing: ()=>  {
      for( const ref of keyToRef.values()) {
        registry.unregister(ref);
       }
      keyToRef.clear();
     },
    // Does deref, and thus does guarantee stability of the value until the
    // end of the turn.
    // UNTIL https://github.com/endojs/endo/issues/1514
    // Prefer: get: key => keyToRef.get(key)?.deref(),
    get: (key)=>{
      const wr=  keyToRef.get(key);
      if( !wr) {
        return wr;
       }
      return wr.deref();
     },
    has: (key)=>finalizingMap.get(key)!==  undefined,
    // Does deref, and thus does guarantee stability of both old and new values
    // until the end of the turn.
    set: (key, ref)=>  {
      assert(isObject(ref));
      finalizingMap.delete(key);
      const newWR=  new WeakRef(ref);
      keyToRef.set(key, newWR);
      registry.register(ref, key, newWR);
     },
    delete: (key)=>{
      const wr=  keyToRef.get(key);
      if( !wr) {
        return false;
       }

      registry.unregister(wr);
      keyToRef.delete(key);

      // Our semantics are to finalize upon explicit `delete`, `set` (which
      // calls `delete`) or garbage collection (which also calls `delete`).
      // `clearWithoutFinalizing` is exempt.
      if( finalizer) {
        finalizer(key);
       }
      return true;
     },
    getSize: ()=>  keyToRef.size});

  return finalizingMap;
 };$h‍_once.makeFinalizingMap(makeFinalizingMap);
})()
,
// === functors[132] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Remotable,Far,makeMarshal,QCLASS,E,HandledPromise,isPromise,makePromiseKit,makeTrap,makeFinalizingMap;$h‍_imports([["@endo/marshal", [["Remotable", [$h‍_a => (Remotable = $h‍_a)]],["Far", [$h‍_a => (Far = $h‍_a)]],["makeMarshal", [$h‍_a => (makeMarshal = $h‍_a)]],["QCLASS", [$h‍_a => (QCLASS = $h‍_a)]]]],["@endo/eventual-send", [["E", [$h‍_a => (E = $h‍_a),$h‍_live["E"]]],["HandledPromise", [$h‍_a => (HandledPromise = $h‍_a)]]]],["@endo/promise-kit", [["isPromise", [$h‍_a => (isPromise = $h‍_a)]],["makePromiseKit", [$h‍_a => (makePromiseKit = $h‍_a)]]]],["./trap.js", [["makeTrap", [$h‍_a => (makeTrap = $h‍_a)]]]],["./types.js", []],["./finalize.js", [["makeFinalizingMap", [$h‍_a => (makeFinalizingMap = $h‍_a)]]]]]);   




















const { details: X, Fail}=   assert;

const WELL_KNOWN_SLOT_PROPERTIES=  harden(['answerID', 'questionID', 'target']);

/**
 * @param {any} maybeThenable
 * @returns {boolean}
 */
const isThenable=  (maybeThenable)=>
  maybeThenable&&  typeof maybeThenable.then===  'function';

/**
 * Reverse slot direction.
 *
 * Reversed to prevent namespace collisions between slots we
 * allocate and the ones the other side allocates.  If we allocate
 * a slot, serialize it to the other side, and they send it back to
 * us, we need to reference just our own slot, not one from their
 * side.
 *
 * @param {CapTPSlot} slot
 * @returns {CapTPSlot} slot with direction reversed
 */
const reverseSlot=  (slot)=>{
  const otherDir=  slot[1]===  '+'?  '-':  '+';
  const revslot=   `${slot[0]}${otherDir}${slot.slice(2)}`;
  return revslot;
 };

/**
 * @typedef {object} CapTPOptions the options to makeCapTP
 * @property {(val: unknown, slot: CapTPSlot) => void} [exportHook]
 * @property {(val: unknown, slot: CapTPSlot) => void} [importHook]
 * @property {(err: any) => void} [onReject]
 * @property {number} [epoch] an integer tag to attach to all messages in order to
 * assist in ignoring earlier defunct instance's messages
 * @property {TrapGuest} [trapGuest] if specified, enable this CapTP (guest) to
 * use Trap(target) to block while the recipient (host) resolves and
 * communicates the response to the message
 * @property {TrapHost} [trapHost] if specified, enable this CapTP (host) to serve
 * objects marked with makeTrapHandler to synchronous clients (guests)
 * @property {boolean} [gcImports] if true, aggressively garbage collect imports
 */

/**
 * Create a CapTP connection.
 *
 * @param {string} ourId our name for the current side
 * @param {(obj: Record<string, any>) => void} rawSend send a JSONable packet
 * @param {any} bootstrapObj the object to export to the other side
 * @param {CapTPOptions} opts options to the connection
 */
const        makeCapTP=  (
  ourId,
  rawSend,
  bootstrapObj=  undefined,
  opts=  {})=>
     {
  /** @type {Record<string, number>} */
  const sendStats=  {};
  /** @type {Record<string, number>} */
  const recvStats=  {};

  const gcStats=  {
    DROPPED: 0};

  const getStats=  ()=>
    harden({
      send: { ...sendStats},
      recv: { ...recvStats},
      gc: { ...gcStats}});


  const {
    onReject=  (err)=>console.error('CapTP', ourId, 'exception:', err),
    epoch=  0,
    exportHook,
    importHook,
    trapGuest,
    trapHost,
    gcImports=  false}=
      opts;

  // It's a hazard to have trapGuest and trapHost both enabled, as we may
  // encounter deadlock.  Without a lot more bookkeeping, we can't detect it for
  // more general networks of CapTPs, but we are conservative for at least this
  // one case.
  !(trapHost&&  trapGuest)||
    Fail `CapTP ${ourId} can only be one of either trapGuest or trapHost`;

  const disconnectReason=  (id)=>
    Error( `${JSON.stringify(id)} connection closed`);

  /** @type {Map<string, Promise<IteratorResult<void, void>>>} */
  const trapIteratorResultP=  new Map();
  /** @type {Map<string, AsyncIterator<void, void, any>>} */
  const trapIterator=  new Map();

  /** @type {any} */
  let unplug=  false;
  const quietReject=  (reason=  undefined, returnIt=  true)=>  {
    if( (unplug===  false||  reason!==  unplug)&&  reason!==  undefined) {
      onReject(reason);
     }
    if( !returnIt) {
      return Promise.resolve();
     }

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    const p=  Promise.reject(reason);
    p.catch((_)=>{ });
    return p;
   };

  /**
   * @template T
   * @param {Map<T, number>} specimenToRefCount
   * @param {(specimen: T) => boolean} predicate
   */
  const makeRefCounter=  (specimenToRefCount, predicate)=>  {
    /** @type {Set<T>} */
    const seen=  new Set();

    return harden({
      add(specimen) {
        if( predicate(specimen)) {
          seen.add(specimen);
         }
        return specimen;
       },
      commit() {
        // Increment the reference count for each seen specimen.
        for( const specimen of seen.keys()) {
          const numRefs=  specimenToRefCount.get(specimen)||  0;
          specimenToRefCount.set(specimen, numRefs+  1);
         }
        seen.clear();
       },
      abort() {
        seen.clear();
       }});

   };

  /** @type {Map<CapTPSlot, number>} */
  const slotToNumRefs=  new Map();

  const recvSlot=  makeRefCounter(
    slotToNumRefs,
    (slot)=>typeof slot===  'string'&&  slot[1]===  '-');


  const sendSlot=  makeRefCounter(
    slotToNumRefs,
    (slot)=>typeof slot===  'string'&&  slot[1]===  '+');


  /**
   * @param {Record<string, any>} obj
   */
  const send=  (obj)=>{
    sendStats[obj.type]=  (sendStats[obj.type]||  0)+  1;

    for( const prop of WELL_KNOWN_SLOT_PROPERTIES) {
      sendSlot.add(obj[prop]);
     }
    sendSlot.commit();

    // Don't throw here if unplugged, just don't send.
    if( unplug!==  false) {
      return;
     }

    // Actually send the message, in the next turn.
    rawSend(obj);
   };

  /**
   * convertValToSlot and convertSlotToVal both perform side effects,
   * populating the c-lists (imports/exports/questions/answers) upon
   * marshalling/unmarshalling.  As we traverse the datastructure representing
   * the message, we discover what we need to import/export and send relevant
   * messages across the wire.
   */
  const { serialize, unserialize}=   makeMarshal(
    // eslint-disable-next-line no-use-before-define
    convertValToSlot,
    // eslint-disable-next-line no-use-before-define
    convertSlotToVal,
    {
      marshalName:  `captp:${ourId}`,
      // TODO Temporary hack.
      // See https://github.com/Agoric/agoric-sdk/issues/2780
      errorIdNum: 20000,
      // TODO: fix captp to be compatible with smallcaps
      serializeBodyFormat: 'capdata'});



  /** @type {WeakMap<any, CapTPSlot>} */
  const valToSlot=  new WeakMap(); // exports looked up by val
  /** @type {Map<CapTPSlot, any>} */
  const slotToExported=  new Map();
  const slotToImported=  makeFinalizingMap(
    /**
     * @param {CapTPSlot} slotID
     */
    (slotID)=>{
      // We drop all the references we know about at once, since GC told us we
      // don't need them anymore.
      const decRefs=  slotToNumRefs.get(slotID)||  0;
      slotToNumRefs.delete(slotID);
      send({ type: 'CTP_DROP', slotID, decRefs, epoch});
     },
    { weakValues: gcImports});

  const exportedTrapHandlers=  new WeakSet();

  // Used to construct slot names for promises/non-promises.
  // In this version of CapTP we use strings for export/import slot names.
  // prefixed with 'p' if promises and 'o' otherwise;
  let lastPromiseID=  0;
  let lastExportID=  0;
  // Since we decide the ids for questions, we use this to increment the
  // question key

  /** @type {Map<CapTPSlot, Settler<unknown>>} */
  const settlers=  new Map();
  /** @type {Map<string, any>} */
  const answers=  new Map(); // chosen by our peer

  /**
   * Called at marshalling time.  Either retrieves an existing export, or if
   * not yet exported, records this exported object.  If a promise, sets up a
   * promise listener to inform the other side when the promise is
   * fulfilled/broken.
   *
   * @type {import('@endo/marshal').ConvertValToSlot<CapTPSlot>}
   */
  function convertValToSlot(val) {
    if( !valToSlot.has(val)) {
      /**
       * new export
       *
       * @type {CapTPSlot}
       */
      let slot;
      if( isPromise(val)) {
        // This is a promise, so we're going to increment the lastPromiseId
        // and use that to construct the slot name.  Promise slots are prefaced
        // with 'p+'.
        lastPromiseID+=  1;
        slot=   `p+${lastPromiseID}`;
        const promiseID=  reverseSlot(slot);
        if( exportHook) {
          exportHook(val, slot);
         }
        // Set up promise listener to inform other side when this promise
        // is fulfilled/broken
        const rejected=  (reason)=>
          send({
            type: 'CTP_RESOLVE',
            promiseID,
            rej: serialize(harden(reason))});

        E.when(
          val,
          (result)=>
            send({
              type: 'CTP_RESOLVE',
              promiseID,
              res: serialize(harden(result))}),

          rejected
          // Propagate internal errors as rejections.
).        catch(rejected);
       }else {
        // Since this isn't a promise, we instead increment the lastExportId and
        // use that to construct the slot name.  Non-promises are prefaced with
        // 'o+' for normal objects, or `t+` for syncable.
        const exportID=  lastExportID+  1;
        if( exportedTrapHandlers.has(val)) {
          slot=   `t+${exportID}`;
         }else {
          slot=   `o+${exportID}`;
         }
        if( exportHook) {
          exportHook(val, slot);
         }
        lastExportID=  exportID;
       }

      // Now record the export in both valToSlot and slotToVal so we can look it
      // up from either the value or the slot name later.
      valToSlot.set(val, slot);
      slotToExported.set(slot, val);
     }
    // At this point, the value is guaranteed to be exported, so return the
    // associated slot number.
    const slot=  valToSlot.get(val);
    assert.typeof(slot, 'string');

    return sendSlot.add(slot);
   }

  const IS_REMOTE_PUMPKIN=  harden({});
  /**
   * @type {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>}
   */
  const assertValIsLocal=  (val)=>{
    const slot=  valToSlot.get(val);
    if( slot&&  slot[1]===  '-') {
      throw IS_REMOTE_PUMPKIN;
     }
   };

  const { serialize: assertOnlyLocal}=   makeMarshal(assertValIsLocal);
  const isOnlyLocal=  (specimen)=>{
    // Try marshalling the object, but throw on references to remote objects.
    try {
      assertOnlyLocal(harden(specimen));
      return true;
     }catch( e) {
      if( e===  IS_REMOTE_PUMPKIN) {
        return false;
       }
      throw e;
     }
   };

  /**
   * Generate a new question in the questions table and set up a new
   * remote handled promise.
   *
   * @returns {[CapTPSlot, Promise]}
   */
  const makeQuestion=  ()=>  {
    lastPromiseID+=  1;
    const slotID=   `q-${lastPromiseID}`;

    // eslint-disable-next-line no-use-before-define
    const { promise, settler}=   makeRemoteKit(slotID);
    settlers.set(slotID, settler);

    // To fix #2846:
    // We return 'p' to the handler, and the eventual resolution of 'p' will
    // be used to resolve the caller's Promise, but the caller never sees 'p'
    // itself. The caller got back their Promise before the handler ever got
    // invoked, and thus before queueMessage was called. If that caller
    // passes the Promise they received as argument or return value, we want
    // it to serialize as resultVPID. And if someone passes resultVPID to
    // them, we want the user-level code to get back that Promise, not 'p'.
    valToSlot.set(promise, slotID);
    slotToImported.set(slotID, promise);

    return [sendSlot.add(slotID), promise];
   };

  /**
   * @template [T=unknown]
   * @param {string} target
   * @returns {RemoteKit<T>}
   * Make a remote promise for `target` (an id in the questions table)
   */
  const makeRemoteKit=  (target)=>{
    /**
     * This handler is set up such that it will transform both
     * attribute access and method invocation of this remote promise
     * as also being questions / remote handled promises
     *
     * @type {import('@endo/eventual-send').EHandler<{}>}
     */
    const handler=  {
      get(_o, prop) {
        if( unplug!==  false) {
          return quietReject(unplug);
         }
        const [questionID, promise]=  makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          method: serialize(harden([prop]))});

        return promise;
       },
      applyFunction(_o, args) {
        if( unplug!==  false) {
          return quietReject(unplug);
         }
        const [questionID, promise]=  makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          method: serialize(harden([null, args]))});

        return promise;
       },
      applyMethod(_o, prop, args) {
        if( unplug!==  false) {
          return quietReject(unplug);
         }
        // Support: o~.[prop](...args) remote method invocation
        const [questionID, promise]=  makeQuestion();
        send({
          type: 'CTP_CALL',
          epoch,
          questionID,
          target,
          method: serialize(harden([prop, args]))});

        return promise;
       }};


    /** @type {Settler<T> | undefined} */
    let settler;

    /** @type {import('@endo/eventual-send').HandledExecutor<T>} */
    const executor=  (resolve, reject, resolveWithPresence)=>  {
      const s=  Far('settler', {
        resolve,
        reject,
        resolveWithPresence: ()=>  resolveWithPresence(handler)});

      settler=  s;
     };

    const promise=  new HandledPromise(executor, handler);
    assert(settler);

    // Silence the unhandled rejection warning, but don't affect
    // the user's handlers.
    promise.catch((e)=>quietReject(e, false));

    return harden({ promise, settler});
   };

  /**
   * Set up import
   *
   * @type {import('@endo/marshal').ConvertSlotToVal<CapTPSlot>}
   */
  function convertSlotToVal(theirSlot, iface=  undefined) {
    let val;
    const slot=  reverseSlot(theirSlot);

    if( slot[1]===  '+') {
      slotToExported.has(slot)||  Fail `Unknown export ${slot}`;
      return slotToExported.get(slot);
     }
    if( !slotToImported.has(slot)) {
      // Make a new handled promise for the slot.
      const { promise, settler}=   makeRemoteKit(slot);
      if( slot[0]===  'o'||  slot[0]===  't') {
        if( iface===  undefined) {
          iface=   `Alleged: Presence ${ourId} ${slot}`;
         }
        // A new remote presence
        // Use Remotable rather than Far to make a remote from a presence
        val=  Remotable(iface, undefined, settler.resolveWithPresence());
        if( importHook) {
          importHook(val, slot);
         }
       }else {
        val=  promise;
        if( importHook) {
          importHook(val, slot);
         }
        // A new promise
        settlers.set(slot, settler);
       }
      slotToImported.set(slot, val);
      valToSlot.set(val, slot);
     }

    // If we imported this slot, mark it as one our peer exported.
    return slotToImported.get(recvSlot.add(slot));
   }

  // Message handler used for CapTP dispatcher
  const handler=  {
    // Remote is asking for bootstrap object
    CTP_BOOTSTRAP(obj) {
      const { questionID}=   obj;
      const bootstrap=
        typeof bootstrapObj===  'function'?  bootstrapObj(obj):  bootstrapObj;
      E.when(bootstrap, (bs)=>{
        // console.log('sending bootstrap', bs);
        answers.set(questionID, bs);
        send({
          type: 'CTP_RETURN',
          epoch,
          answerID: questionID,
          result: serialize(bs)});

       });
     },
    CTP_DROP(obj) {
      const { slotID, decRefs=  0}=   obj;
      // Ensure we are decrementing one of our exports.
      slotID[1]===  '-'||  Fail `Cannot drop non-exported ${slotID}`;
      const slot=  reverseSlot(slotID);

      const numRefs=  slotToNumRefs.get(slot)||  0;
      const toDecr=  Number(decRefs);
      if( numRefs>  toDecr) {
        slotToNumRefs.set(slot, numRefs-  toDecr);
       }else {
        // We are dropping the last known reference to this slot.
        gcStats.DROPPED+=  1;
        slotToNumRefs.delete(slot);
        slotToExported.delete(slot);
        answers.delete(slot);
       }
     },
    // Remote is invoking a method or retrieving a property.
    CTP_CALL(obj) {
      // questionId: Remote promise (for promise pipelining) this call is
      //   to fulfill
      // target: Slot id of the target to be invoked.  Checks against
      //   answers first; otherwise goes through unserializer
      const { questionID, target, trap}=   obj;

      const [prop, args]=  unserialize(obj.method);
      let val;
      if( answers.has(target)) {
        val=  answers.get(target);
       }else {
        val=  unserialize({
          body: JSON.stringify({
            [QCLASS]: 'slot',
            index: 0}),

          slots: [target]});

       }

      /** @type {(isReject: boolean, value: any) => void} */
      let processResult=  (isReject, value)=>  {
        // Serialize the result.
        let serial;
        try {
          serial=  serialize(harden(value));
         }catch( error) {
          // Promote serialization errors to rejections.
          isReject=  true;
          serial=  serialize(harden(error));
         }

        send({
          type: 'CTP_RETURN',
          epoch,
          answerID: questionID,
          [isReject?  'exception':  'result']: serial});

       };
      if( trap) {
        exportedTrapHandlers.has(val)||
          Fail `Refused Trap(${val}) because target was not registered with makeTrapHandler`;
        assert.typeof(
          trapHost,
          'function',
          X `CapTP cannot answer Trap(${val}) without a trapHost function`);


        // We need to create a promise for the "isDone" iteration right now to
        // prevent a race with the other side.
        const resultPK=  makePromiseKit();
        trapIteratorResultP.set(questionID, resultPK.promise);

        processResult=  (isReject, value)=>  {
          const serialized=  serialize(harden(value));
          const ait=  trapHost([isReject, serialized]);
          if( !ait) {
            // One-shot, no async iterator.
            resultPK.resolve({ done: true});
            return;
           }

          // We're ready for them to drive the iterator.
          trapIterator.set(questionID, ait);
          resultPK.resolve({ done: false});
         };
       }

      // If `args` is supplied, we're applying a method or function...
      // otherwise this is property access
      let hp;
      if( !args) {
        hp=  HandledPromise.get(val, prop);
       }else if( prop===  null) {
        hp=  HandledPromise.applyFunction(val, args);
       }else {
        hp=  HandledPromise.applyMethod(val, prop, args);
       }

      // Answer with our handled promise
      answers.set(questionID, hp);

      hp
        // Process this handled promise method's result when settled.
.        then(
          (fulfilment)=>processResult(false, fulfilment),
          (reason)=>processResult(true, reason))

        // Propagate internal errors as rejections.
.        catch((reason)=>processResult(true, reason));
     },
    // Have the host serve more of the reply.
    CTP_TRAP_ITERATE: (obj)=>{
      trapHost||  Fail `CTP_TRAP_ITERATE is impossible without a trapHost`;
      const { questionID, serialized}=   obj;

      const resultP=  trapIteratorResultP.get(questionID);
      resultP||  Fail `CTP_TRAP_ITERATE did not expect ${questionID}`;

      const [method, args]=  unserialize(serialized);

      const getNextResultP=  async()=>   {
        const result=  await resultP;

        // Done with this trap iterator.
        const cleanup=  ()=>  {
          trapIterator.delete(questionID);
          trapIteratorResultP.delete(questionID);
          return harden({ done: true});
         };

        // We want to ensure we clean up the iterator in case of any failure.
        try {
          if( !result||  result.done) {
            return cleanup();
           }

          const ait=  trapIterator.get(questionID);
          if( !ait) {
            // The iterator is done, so we're done.
            return cleanup();
           }

          // Drive the next iteration.
          return await ait[method](...args);
         }catch( e) {
          cleanup();
          if( !e) {
            Fail `trapGuest expected trapHost AsyncIterator(${questionID}) to be done, but it wasn't`;
           }
          assert.note(e, X `trapHost AsyncIterator(${questionID}) threw`);
          throw e;
         }
       };

      // Store the next result promise.
      const nextResultP=  getNextResultP();
      trapIteratorResultP.set(questionID, nextResultP);

      // Ensure that our caller handles any rejection.
      return nextResultP.then(()=>  { });
     },
    // Answer to one of our questions.
    CTP_RETURN(obj) {
      const { result, exception, answerID}=   obj;
      const settler=  settlers.get(answerID);
      if( !settler) {
        throw Error(
           `Got an answer to a question we have not asked. (answerID = ${answerID} )`);

       }
      settlers.delete(answerID);
      if( 'exception'in  obj) {
        settler.reject(unserialize(exception));
       }else {
        settler.resolve(unserialize(result));
       }
     },
    // Resolution to an imported promise
    CTP_RESOLVE(obj) {
      const { promiseID, res, rej}=   obj;
      const settler=  settlers.get(promiseID);
      if( !settler) {
        // Not a promise we know about; maybe it was collected?
        throw Error(
           `Got a resolvement of a promise we have not imported. (promiseID = ${promiseID} )`);

       }
      settlers.delete(promiseID);
      if( 'rej'in  obj) {
        settler.reject(unserialize(rej));
       }else {
        settler.resolve(unserialize(res));
       }
     },
    // The other side has signaled something has gone wrong.
    // Pull the plug!
    CTP_DISCONNECT(obj) {
      const { reason=  disconnectReason(ourId)}=   obj;
      if( unplug===  false) {
        // Reject with the original reason.
        quietReject(obj.reason, false);
        unplug=  reason;
        // Deliver the object, even though we're unplugged.
        rawSend(obj);
       }
      // We no longer wish to subscribe to object finalization.
      slotToImported.clearWithoutFinalizing();
      for( const settler of settlers.values()) {
        settler.reject(reason);
       }
     }};


  // Get a reference to the other side's bootstrap object.
  const getBootstrap=  async()=>   {
    if( unplug!==  false) {
      return quietReject(unplug);
     }
    const [questionID, promise]=  makeQuestion();
    send({
      type: 'CTP_BOOTSTRAP',
      epoch,
      questionID});

    return harden(promise);
   };
  harden(handler);

  const validTypes=  new Set(Object.keys(handler));
  for( const t of validTypes.keys()) {
    sendStats[t]=  0;
    recvStats[t]=  0;
   }

  // Return a dispatch function.
  const dispatch=  (obj)=>{
    try {
      validTypes.has(obj.type)||  Fail `unknown message type ${obj.type}`;

      recvStats[obj.type]+=  1;
      if( unplug!==  false) {
        return false;
       }
      const fn=  handler[obj.type];
      if( !fn) {
        return false;
       }

      for( const prop of WELL_KNOWN_SLOT_PROPERTIES) {
        recvSlot.add(obj[prop]);
       }
      fn(obj);
      recvSlot.commit();

      return true;
     }catch( e) {
      recvSlot.abort();
      quietReject(e, false);

      return false;
     }
   };

  // Abort a connection.
  const abort=  (reason=  undefined)=>  {
    dispatch({ type: 'CTP_DISCONNECT', epoch, reason});
   };

  const makeTrapHandler=  (name, obj)=>  {
    const far=  Far(name, obj);
    exportedTrapHandlers.add(far);
    return far;
   };

  // Put together our return value.
  const rets=  {
    abort,
    dispatch,
    getBootstrap,
    getStats,
    isOnlyLocal,
    serialize,
    unserialize,
    makeTrapHandler,
    Trap: /** @type {Trap | undefined} */  undefined};


  if( trapGuest) {
    assert.typeof(trapGuest, 'function', X `opts.trapGuest must be a function`);

    // Create the Trap proxy maker.
    const makeTrapImpl=
      (implMethod)=>
      (val, ...implArgs)=>  {
        Promise.resolve(val)!==  val||
          Fail `Trap(${val}) target cannot be a promise`;

        const slot=  valToSlot.get(val);
        // TypeScript confused about `||` control flow so use `if` instead
        // https://github.com/microsoft/TypeScript/issues/50739
        if( !(slot&&  slot[1]===  '-')) {
          Fail `Trap(${val}) target was not imported`;
         }
        // @ts-expect-error TypeScript confused by `Fail` too?
        slot[0]===  't'||
          Fail `Trap(${val}) imported target was not created with makeTrapHandler`;

        // Send a "trap" message.
        lastPromiseID+=  1;
        const questionID=   `q-${lastPromiseID}`;

        // Encode the "method" parameter of the CTP_CALL.
        let method;
        switch( implMethod){
          case 'get': {
            const [prop]=  implArgs;
            method=  serialize(harden([prop]));
            break;
           }
          case 'applyFunction': {
            const [args]=  implArgs;
            method=  serialize(harden([null, args]));
            break;
           }
          case 'applyMethod': {
            const [prop, args]=  implArgs;
            method=  serialize(harden([prop, args]));
            break;
           }
          default: {
            Fail `Internal error; unrecognized implMethod ${implMethod}`;
           }}


        // Set up the trap call with its identifying information and a way to send
        // messages over the current CapTP data channel.
        const [isException, serialized]=  trapGuest({
          trapMethod: implMethod,
          // @ts-expect-error TypeScript confused by `Fail` too?
          slot,
          trapArgs: implArgs,
          startTrap: ()=>  {
            // Send the call metadata over the connection.
            send({
              type: 'CTP_CALL',
              epoch,
              trap: true, // This is the magic marker.
              questionID,
              target: slot,
              method});


            // Return an IterationObserver.
            const makeIteratorMethod=
              (iteratorMethod, done)=>
              (...args)=>  {
                send({
                  type: 'CTP_TRAP_ITERATE',
                  epoch,
                  questionID,
                  serialized: serialize(harden([iteratorMethod, args]))});

                return harden({ done, value: undefined});
               };
            return harden({
              next: makeIteratorMethod('next', false),
              return: makeIteratorMethod('return', true),
              throw: makeIteratorMethod('throw', true)});

           }});


        const value=  unserialize(serialized);
        !isThenable(value)||
          Fail `Trap(${val}) reply cannot be a Thenable; have ${value}`;

        if( isException) {
          throw value;
         }
        return value;
       };

    /** @type {TrapImpl} */
    const trapImpl=  {
      applyFunction: makeTrapImpl('applyFunction'),
      applyMethod: makeTrapImpl('applyMethod'),
      get: makeTrapImpl('get')};

    harden(trapImpl);

    rets.Trap=  makeTrap(trapImpl);
   }

  return harden(rets);
 };$h‍_once.makeCapTP(makeCapTP);
})()
,
// === functors[133] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let Far,E,makeCapTP,nearTrapImpl,makeFinalizingMap;$h‍_imports([["@endo/marshal", [["Far", [$h‍_a => (Far = $h‍_a)]]]],["./captp.js", [["E", [$h‍_a => (E = $h‍_a),$h‍_live["E"]]],["makeCapTP", [$h‍_a => (makeCapTP = $h‍_a)]]]],["./trap.js", [["nearTrapImpl", [$h‍_a => (nearTrapImpl = $h‍_a)]]]],["./finalize.js", [["makeFinalizingMap", [$h‍_a => (makeFinalizingMap = $h‍_a)]]]]]);   






/**
 * @template T
 * @typedef {import('@endo/eventual-send').ERef<T>} ERef
 */

/**
 * Create an async-isolated channel to an object.
 *
 * @param {string} ourId
 * @param {import('./captp.js').CapTPOptions} [nearOptions]
 * @param {import('./captp.js').CapTPOptions} [farOptions]
 * @returns {{
 *   makeFar<T>(x: T): ERef<T>,
 *   makeNear<T>(x: T): ERef<T>,
 *   makeTrapHandler<T>(x: T): T,
 *   isOnlyNear(x: any): boolean,
 *   isOnlyFar(x: any): boolean,
 *   getNearStats(): any,
 *   getFarStats(): any,
 *   Trap: Trap
 * }}
 */
const        makeLoopback=  (ourId, nearOptions, farOptions)=>  {
  let lastNonce=  0;
  const nonceToRef=  makeFinalizingMap();

  const bootstrap=  Far('refGetter', {
    getRef(nonce) {
      // Find the local ref for the specified nonce.
      const xFar=  nonceToRef.get(nonce);
      nonceToRef.delete(nonce);
      return xFar;
     }});


  const slotBody=  JSON.stringify({
    '@qclass': 'slot',
    index: 0});


  // Create the tunnel.
  const {
    Trap,
    dispatch: nearDispatch,
    getBootstrap: getFarBootstrap,
    getStats: getNearStats,
    isOnlyLocal: isOnlyNear
    // eslint-disable-next-line no-use-before-define
}=    makeCapTP( `near-${ourId}`,(o)=>farDispatch(o), bootstrap, {
    trapGuest: ({ trapMethod, slot, trapArgs})=>   {
      let value;
      let isException=  false;
      try {
        // Cross the boundary to pull out the far object.
        // eslint-disable-next-line no-use-before-define
        const far=  farUnserialize({ body: slotBody, slots: [slot]});
        value=  nearTrapImpl[trapMethod](far, trapArgs[0], trapArgs[1]);
       }catch( e) {
        isException=  true;
        value=  e;
       }
      harden(value);
      // eslint-disable-next-line no-use-before-define
      return [isException, farSerialize(value)];
     },
    ...nearOptions});

  assert(Trap);

  const {
    makeTrapHandler,
    dispatch: farDispatch,
    getBootstrap: getNearBootstrap,
    getStats: getFarStats,
    isOnlyLocal: isOnlyFar,
    unserialize: farUnserialize,
    serialize: farSerialize}=
      makeCapTP( `far-${ourId}`,nearDispatch, bootstrap, farOptions);

  const farGetter=  getFarBootstrap();
  const nearGetter=  getNearBootstrap();

  /**
   * @template T
   * @param {ERef<{ getRef(nonce: number): T }>} refGetter
   */
  const makeRefMaker=
    (refGetter)=>
    /**
     * @param {T} x
     * @returns {Promise<T>}
     */
    async(x)=> {
      lastNonce+=  1;
      const myNonce=  lastNonce;
      const val=  await x;
      nonceToRef.set(myNonce, harden(val));
      return E(refGetter).getRef(myNonce);
     };

  return {
    makeFar: makeRefMaker(farGetter),
    makeNear: makeRefMaker(nearGetter),
    isOnlyNear,
    isOnlyFar,
    getNearStats,
    getFarStats,
    makeTrapHandler,
    Trap};

 };$h‍_once.makeLoopback(makeLoopback);
})()
,
// === functors[134] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   /// <reference types="ses"/>

const { details: X, Fail}=   assert;

// This is a pathological minimum, but exercised by the unit test.
const        MIN_DATA_BUFFER_LENGTH=  1;

// Calculate how big the transfer buffer needs to be.
$h‍_once.MIN_DATA_BUFFER_LENGTH(MIN_DATA_BUFFER_LENGTH);const TRANSFER_OVERHEAD_LENGTH=
  BigUint64Array.BYTES_PER_ELEMENT+  Int32Array.BYTES_PER_ELEMENT;$h‍_once.TRANSFER_OVERHEAD_LENGTH(TRANSFER_OVERHEAD_LENGTH);
const        MIN_TRANSFER_BUFFER_LENGTH=
  MIN_DATA_BUFFER_LENGTH+  TRANSFER_OVERHEAD_LENGTH;

// These are bit flags for the status element of the transfer buffer.
$h‍_once.MIN_TRANSFER_BUFFER_LENGTH(MIN_TRANSFER_BUFFER_LENGTH);const STATUS_WAITING=1;
const STATUS_FLAG_DONE=  2;
const STATUS_FLAG_REJECT=  4;

/**
 * Return a status buffer, length buffer, and data buffer backed by transferBuffer.
 *
 * @param {SharedArrayBuffer} transferBuffer the backing buffer
 */
const splitTransferBuffer=  (transferBuffer)=>{
  transferBuffer.byteLength>=  MIN_TRANSFER_BUFFER_LENGTH||
    Fail `Transfer buffer of ${transferBuffer.byteLength} bytes is smaller than MIN_TRANSFER_BUFFER_LENGTH ${MIN_TRANSFER_BUFFER_LENGTH}`;
  const lenbuf=  new BigUint64Array(transferBuffer, 0, 1);

  // The documentation says that this needs to be an Int32Array for use with
  // Atomics.notify:
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics/notify#syntax
  const statusbuf=  new Int32Array(transferBuffer, lenbuf.byteLength, 1);
  const overheadLength=  lenbuf.byteLength+  statusbuf.byteLength;
  assert.equal(
    overheadLength,
    TRANSFER_OVERHEAD_LENGTH,
    X `Internal error; actual overhead ${overheadLength} of bytes is not TRANSFER_OVERHEAD_LENGTH ${TRANSFER_OVERHEAD_LENGTH}`);

  const databuf=  new Uint8Array(transferBuffer, overheadLength);
  databuf.byteLength>=  MIN_DATA_BUFFER_LENGTH||
    Fail `Transfer buffer of size ${transferBuffer.byteLength} only supports ${databuf.byteLength} data bytes; need at least ${MIN_DATA_BUFFER_LENGTH}`;
  return harden({ statusbuf, lenbuf, databuf});
 };

/**
 * Create a trapHost that can be paired with makeAtomicsTrapGuest.
 *
 * This host encodes the transfer buffer and returns it in consecutive slices
 * when the guest iterates over it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {TrapHost}
 */
const        makeAtomicsTrapHost=  (transferBuffer)=>{
  const { statusbuf, lenbuf, databuf}=   splitTransferBuffer(transferBuffer);

  const te=  new TextEncoder();

  return async function* trapHost([isReject, serialized]) {
    // Get the complete encoded message buffer.
    const json=  JSON.stringify(serialized);
    const encoded=  te.encode(json);

    // Send chunks in the data transfer buffer.
    let i=  0;
    let done=  false;
    while( !done) {
      // Copy the next slice of the encoded arry to the data buffer.
      const subenc=  encoded.subarray(i, i+  databuf.length);
      databuf.set(subenc);

      // Save the length of the remaining data.
      const remaining=  BigInt(encoded.length-  i);
      lenbuf[0]=  remaining;

      // Calculate the next slice, and whether this is the last one.
      i+=  subenc.length;
      done=  i>=  encoded.length;

      // Find bitflags to represent the rejected and finished state.
      const rejectFlag=  isReject?  STATUS_FLAG_REJECT:  0;
      const doneFlag=  done?  STATUS_FLAG_DONE:  0;

      // Notify our guest for this data buffer.

      // eslint-disable-next-line no-bitwise
      statusbuf[0]=  rejectFlag|  doneFlag;
      Atomics.notify(statusbuf, 0, +Infinity);

      if( !done) {
        // Wait until the next call to `it.next()`.  If the guest calls
        // `it.return()` or `it.throw()`, then this yield will return or throw,
        // terminating the generator function early.
        yield;
       }
     }
   };
 };

/**
 * Create a trapGuest that can be paired with makeAtomicsTrapHost.
 *
 * This guest iterates through the consecutive slices of the JSON-encoded data,
 * then returns it.
 *
 * @param {SharedArrayBuffer} transferBuffer
 * @returns {TrapGuest}
 */$h‍_once.makeAtomicsTrapHost(makeAtomicsTrapHost);
const        makeAtomicsTrapGuest=  (transferBuffer)=>{
  const { statusbuf, lenbuf, databuf}=   splitTransferBuffer(transferBuffer);

  return ({ startTrap})=>   {
    // Start by sending the trap call to the host.
    const it=  startTrap();

    /** @type {Uint8Array | undefined} */
    let encoded;
    let i=  0;
    let done=  false;
    while( !done) {
      // Tell that we are ready for another buffer.
      statusbuf[0]=  STATUS_WAITING;
      const { done: itDone}=   it.next();
      !itDone||  Fail `Internal error; it.next() returned done=${itDone}`;

      // Wait for the host to wake us.
      Atomics.wait(statusbuf, 0, STATUS_WAITING);

      // Determine whether this is the last buffer.
      // eslint-disable-next-line no-bitwise
      done=  (statusbuf[0]&  STATUS_FLAG_DONE)!==  0;

      // Accumulate the encoded buffer.
      const remaining=  Number(lenbuf[0]);
      const datalen=  Math.min(remaining, databuf.byteLength);
      if( !encoded) {
        if( done) {
          // Special case: we are done on first try, so we don't need to copy
          // anything.
          encoded=  databuf.subarray(0, datalen);
          break;
         }
        // Allocate our buffer for the remaining data.
        encoded=  new Uint8Array(remaining);
       }

      // Copy the next buffer.
      encoded.set(databuf.subarray(0, datalen), i);
      i+=  datalen;
     }

    // This throw is harmless if the host iterator has already finished, and
    // if not finished, captp will correctly raise an error.
    //
    // TODO: It would be nice to use an error type, but captp is just too
    // noisy with spurious "Temporary logging of sent error" messages.
    // it.throw(assert.error(X`Trap host has not finished`));
    it.throw(null);

    // eslint-disable-next-line no-bitwise
    const isReject=  !!(statusbuf[0]&  STATUS_FLAG_REJECT);

    // Decode the accumulated encoded buffer.
    const td=  new TextDecoder('utf-8');
    const json=  td.decode(encoded);

    // Parse the JSON data into marshalled form.
    const serialized=  JSON.parse(json);
    return [isReject, serialized];
   };
 };$h‍_once.makeAtomicsTrapGuest(makeAtomicsTrapGuest);
})()
,
// === functors[135] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["@endo/nat", []],["@endo/marshal", []],["./captp.js", []],["./loopback.js", []],["./atomics.js", []]]);   
})()
,
// === functors[136] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let E,makePromiseKit;$h‍_imports([["@endo/eventual-send", [["E", [$h‍_a => (E = $h‍_a)]]]],["@endo/promise-kit", [["makePromiseKit", [$h‍_a => (makePromiseKit = $h‍_a)]]]]]);   















/**
 * @template T
 * @typedef {{
 *   resolve(value?: T | Promise<T>): void,
 *   reject(error: Error): void,
 *   promise: Promise<T>
 * }} PromiseKit
 */

// TypeScript ReadOnly semantics are not sufficiently expressive to distinguish
// a value one promises not to alter from a value one must not alter,
// making it useless.
const freeze=  /** @type {<T>(v: T | Readonly<T>) => T} */  Object.freeze;

/**
 * @template T
 * @returns {import('./types.js').AsyncQueue<T>}
 */
const        makeQueue=  ()=>  {
  let { promise: tailPromise, resolve: tailResolve}=   makePromiseKit();
  return {
    put(value) {
      const { resolve, promise}=   makePromiseKit();
      tailResolve(freeze({ value, promise}));
      tailResolve=  resolve;
     },
    get() {
      const promise=  tailPromise.then((next)=>next.value);
      tailPromise=  tailPromise.then((next)=>next.promise);
      return harden(promise);
     }};

 };$h‍_once.makeQueue(makeQueue);
harden(makeQueue);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').AsyncQueue<IteratorResult<TRead, TReadReturn>>} acks
 * @param {import('./types.js').AsyncQueue<IteratorResult<TWrite, TWriteReturn>>} data
 */
const        makeStream=  (acks, data)=>  {
  const stream=  harden({
    /**
     * @param {TWrite} value
     */
    next(value) {
      // Note the shallow freeze since value is not guaranteed to be freezable
      // (typed arrays are not).
      data.put(freeze({ value, done: false}));
      return acks.get();
     },
    /**
     * @param {TWriteReturn} value
     */
    return(value) {
      data.put(freeze({ value, done: true}));
      return acks.get();
     },
    /**
     * @param {Error} error
     */
    throw(error) {
      data.put(harden(Promise.reject(error)));
      return acks.get();
     },
    [Symbol.asyncIterator]() {
      return stream;
     }});

  return stream;
 };$h‍_once.makeStream(makeStream);
harden(makeStream);

// JSDoc TypeScript seems unable to express this particular function's
// entanglement of queues, but the definition in types.d.ts works for the end
// user.
const        makePipe=  ()=>  {
  const data=  makeQueue();
  const acks=  makeQueue();
  const reader=  makeStream(acks, data);
  const writer=  makeStream(data, acks);
  return harden([writer, reader]);
 };$h‍_once.makePipe(makePipe);
harden(makePipe);

/**
 * @template TRead
 * @template TWrite
 * @template TReadReturn
 * @template TWriteReturn
 * @param {import('./types.js').Stream<TWrite, TRead, TWriteReturn, TReadReturn>} writer
 * @param {import('./types.js').Stream<TRead, TWrite, TReadReturn, TWriteReturn>} reader
 * @param {TWrite} primer
 */
const        pump=  async( writer, reader, primer)=>  {
  /** @param {Promise<IteratorResult<TRead, TReadReturn>>} promise */
  const tick=  (promise)=>
    E.when(
      promise,
      (result)=>{
        if( result.done) {
          return writer.return(result.value);
         }else {
          // Behold: mutual recursion.
          // eslint-disable-next-line no-use-before-define
          return tock(writer.next(result.value));
         }
       },
      (/** @type {Error} */ error)=>  {
        return writer.throw(error);
       });

  /** @param {Promise<IteratorResult<TWrite, TWriteReturn>>} promise */
  const tock=  (promise)=>
    E.when(
      promise,
      (result)=>{
        if( result.done) {
          return reader.return(result.value);
         }else {
          return tick(reader.next(result.value));
         }
       },
      (/** @type {Error} */ error)=>  {
        return reader.throw(error);
       });

  await tick(reader.next(primer));
  return undefined;
 };$h‍_once.pump(pump);
harden(pump);

/**
 * @template TRead
 * @template TWrite
 * @template TReturn
 * @param {AsyncGenerator<TRead, TReturn, TWrite>} generator
 * @param {TWrite} primer
 */
const        prime=  (generator, primer)=>  {
  // We capture the first returned promise.
  const first=  generator.next(primer);
  /** @type {IteratorResult<TRead, TReturn>=} */
  let result;
  const primed=  harden({
    /** @param {TWrite} value */
          async next(value){
      if( result===  undefined) {
        result=  await first;
        if( result.done) {
          return result;
         }
       }
      return generator.next(value);
     },
    /** @param {TReturn} value */
          async return(value){
      if( result===  undefined) {
        result=  await first;
        if( result.done) {
          return result;
         }
       }
      return generator.return(value);
     },
    /** @param {Error} error */
          async throw(error){
      if( result===  undefined) {
        result=  await first;
        if( result.done) {
          throw error;
         }
       }
      return generator.throw(error);
     }});

  return primed;
 };$h‍_once.prime(prime);
harden(prime);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Reader<TIn>} reader
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Reader<TOut>}
 */
const        mapReader=  (reader, transform)=>  {
  async function* transformGenerator() {
    for await( const value of reader) {
      yield transform(value);
     }
    return undefined;
   }
  return harden(transformGenerator());
 };$h‍_once.mapReader(mapReader);
harden(mapReader);

/**
 * @template TIn
 * @template TOut
 * @param {import('./types.js').Writer<TOut>} writer
 * @param {(value: TIn) => TOut} transform
 * @returns {import('./types.js').Writer<TIn>}
 */
const        mapWriter=  (writer, transform)=>  {
  const transformedWriter=  harden({
    /**
     * @param {TIn} value
     */
          async next(value){
      return writer.next(transform(value));
     },
    /**
     * @param {Error} error
     */
          async throw(error){
      return writer.throw(error);
     },
    /**
     * @param {undefined} value
     */
          async return(value){
      return writer.return(value);
     },
    [Symbol.asyncIterator]() {
      return transformedWriter;
     }});

  return transformedWriter;
 };$h‍_once.mapWriter(mapWriter);
harden(mapWriter);
})()
,
// === functors[137] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   // @ts-check
/// <reference types="ses"/>

const COLON=  ':'.charCodeAt(0);
const COMMA=  ','.charCodeAt(0);
const ZERO=  '0'.charCodeAt(0);
const NINE=  '9'.charCodeAt(0);

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} opts
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 */
async function* makeNetstringIterator(
  input,
  { name=  '<unknown>', maxMessageLength=  999999999}=   {})
  {
  // eslint-disable-next-line no-bitwise
  const maxPrefixLength=   `${maxMessageLength| 0 }:`.length;

  // byte offset of data consumed so far in the input stream
  let offset=  0;

  // The iterator can be in 2 states: waiting for the length, or waiting for the data
  // - When waiting for the length, the lengthBuffer is an array containing
  //   digits charCodes for the length prefix
  // - When waiting for the data, the dataBuffer is either:
  //   - null to indicate no data has been received yet.
  //   - A newly allocated buffer large enough to accommodate the whole expected data.
  //   In either case, remainingDataLength contains the length of the data to read.
  //   If the whole data is received in one chunk, no copy is made.
  /** @type {number[] | null} */
  let lengthBuffer=  [];
  /** @type {Uint8Array | null} */
  let dataBuffer=  null;
  let remainingDataLength=  -1;

  for await( const chunk of input) {
    let buffer=  chunk;

    while( buffer.length) {
      // Waiting for full length prefix
      if( lengthBuffer) {
        let i=  0;
        while( i<  buffer.length) {
          const c=  buffer[i];
          i+=  1;
          if( c>=  ZERO&&  c<=  NINE) {
            lengthBuffer.push(c);
            if( lengthBuffer.length===  maxPrefixLength) {
              throw Error(
                 `Too long netstring length prefix ${JSON.stringify(
                  String.fromCharCode(...lengthBuffer))
                  }... at offset ${offset} of ${name}`);

             }
           }else if( c===  COLON&&  lengthBuffer.length) {
            lengthBuffer.push(c);
            break;
           }else {
            throw Error(
               `Invalid netstring length prefix ${JSON.stringify(
                String.fromCharCode(...lengthBuffer, c))
                } at offset ${offset} of ${name}`);

           }
         }

        buffer=  buffer.subarray(i);

        if( lengthBuffer[lengthBuffer.length-  1]===  COLON) {
          lengthBuffer.pop();
          const prefix=  String.fromCharCode(...lengthBuffer);
          remainingDataLength=  +prefix;
          if( Number.isNaN(remainingDataLength)) {
            throw Error(
               `Invalid netstring prefix length ${prefix} at offset ${offset} of ${name}`);

           }else if( remainingDataLength>  maxMessageLength) {
            throw Error(
               `Netstring message too big (length ${remainingDataLength}) at offset ${offset} of ${name}`);

           }
          offset+=  lengthBuffer.length+  1;
          lengthBuffer=  null;
         }
       }

      // Waiting for data
      if( !lengthBuffer) {
        if( buffer.length>  remainingDataLength) {
          const remainingData=  buffer.subarray(0, remainingDataLength);
          const data=  dataBuffer?(
               dataBuffer.set(
                remainingData,
                dataBuffer.length-  remainingDataLength),

              dataBuffer):
              remainingData;
          dataBuffer=  null;
          offset+=  data.length;
          if( buffer[remainingDataLength]!==  COMMA) {
            throw Error(
               `Invalid netstring separator "${String.fromCharCode(
                buffer[remainingDataLength])
                } at offset ${offset} of ${name}`);

           }
          offset+=  1;
          buffer=  buffer.subarray(remainingDataLength+  1);
          remainingDataLength=  -1;
          lengthBuffer=  [];
          yield data;
         }else if( buffer.length) {
          if( !dataBuffer&&  buffer.length===  remainingDataLength) {
            dataBuffer=  buffer;
           }else {
            dataBuffer=  dataBuffer||  new Uint8Array(remainingDataLength);
            dataBuffer.set(buffer, dataBuffer.length-  remainingDataLength);
           }
          remainingDataLength-=  buffer.length;
          buffer=  buffer.subarray(buffer.length);
         }
       }
     }
   }

  if( !lengthBuffer) {
    throw Error( `Unexpected dangling message at offset ${offset} of ${name}`);
   }

  return undefined;
 }

/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 * @returns {import('@endo/stream').Reader<Uint8Array, undefined>} input
 */
const        makeNetstringReader=  (input, opts)=>  {
  return harden(makeNetstringIterator(input, opts));
 };$h‍_once.makeNetstringReader(makeNetstringReader);
harden(makeNetstringReader);

// Legacy
/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {string=} name
 * @param {number=} _capacity
 * @returns {import('@endo/stream').Stream<Uint8Array, undefined>} input
 */
const        netstringReader=  (input, name, _capacity)=>  {
  return harden(
    makeNetstringIterator(input, {
      name}));


 };$h‍_once.netstringReader(netstringReader);
})()
,
// === functors[138] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([]);   // @ts-check
/// <reference types="ses"/>

const COMMA_BUFFER=  new Uint8Array([','.charCodeAt(0)]);

/** @param {number} length */
const getLengthPrefixCharCodes=  (length)=>
  // eslint-disable-next-line no-bitwise
  [... `${length| 0 }:`].map((char)=>char.charCodeAt(0));

/**
 * Create a writer stream which wraps messages into a netstring encoding and
 * writes them to an output writer stream.
 *
 * This transform can be zero-copy, if the output stream supports consecutive
 * writes without waiting, aka if it can gracefully handle writes if full or
 * closed. In that case the by default off `chunked` mode can be enabled.
 *
 * Accepts the message as an array of buffers in case the producer would like
 * to avoid pre-concatenating them.
 *
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} opts
 * @param {boolean} [opts.chunked]
 * @returns {import('@endo/stream').Writer<Uint8Array | Uint8Array[], undefined>}
 */
const        makeNetstringWriter=  (output, { chunked=  false}=   {})=>  {
  return harden({
          async next(messageChunks){
      if( !Array.isArray(messageChunks)) {
        messageChunks=  [messageChunks];
       }

      const messageLength=  messageChunks.reduce(
        (acc, { length})=>   acc+  length,
        0);


      const prefix=  getLengthPrefixCharCodes(messageLength);

      if( chunked) {
        return Promise.all([
          output.next(new Uint8Array(prefix)),
          ...messageChunks.map(async(chunk)=> output.next(chunk)),
          output.next(COMMA_BUFFER)]).
           then(([r1, r2, r3])=>(  {
          done: !!(r1.done||  r2.done||  r3.done),
          value: undefined}));

       }else {
        const buffer=  new Uint8Array(prefix.length+  messageLength+  1);
        buffer.set(prefix, 0);
        let i=  prefix.length;
        for( const chunk of messageChunks) {
          buffer.set(chunk, i);
          i+=  chunk.length;
         }
        buffer.set(COMMA_BUFFER, i);

        return output.next(buffer);
       }
     },
          async return(){
      return output.return(undefined);
     },
          async throw(error){
      return output.throw(error);
     },
    [Symbol.asyncIterator]() {
      return this;
     }});

 };$h‍_once.makeNetstringWriter(makeNetstringWriter);
harden(makeNetstringWriter);

// Legacy
const        netstringWriter=  makeNetstringWriter;$h‍_once.netstringWriter(netstringWriter);
})()
,
// === functors[139] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   $h‍_imports([["./reader.js", []],["./writer.js", []]]);   
})()
,
// === functors[140] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeCapTP,mapWriter,mapReader,makeNetstringReader,makeNetstringWriter;$h‍_imports([["@endo/captp", [["makeCapTP", [$h‍_a => (makeCapTP = $h‍_a)]]]],["@endo/stream", [["mapWriter", [$h‍_a => (mapWriter = $h‍_a)]],["mapReader", [$h‍_a => (mapReader = $h‍_a)]]]],["@endo/netstring", [["makeNetstringReader", [$h‍_a => (makeNetstringReader = $h‍_a)]],["makeNetstringWriter", [$h‍_a => (makeNetstringWriter = $h‍_a)]]]]]);   





const textEncoder=  new TextEncoder();
const textDecoder=  new TextDecoder();

/**
 * @template TBootstrap
 * @param {string} name
 * @param {import('@endo/stream').Stream<unknown, any, unknown, unknown>} writer
 * @param {import('@endo/stream').Stream<any, undefined, undefined, undefined>} reader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 */
const        makeMessageCapTP=  (
  name,
  writer,
  reader,
  cancelled,
  bootstrap)=>
     {
  /** @param {any} message */
  const send=  (message)=>{
    return writer.next(message);
   };

  const { dispatch, getBootstrap, abort}=   makeCapTP(name, send, bootstrap);

  const drained=  (async()=>   {
    for await( const message of reader) {
      console.log('captp reader', message);
      dispatch(message);
     }
   })();

  const closed=  cancelled.catch(async()=>   {
    abort();
    await Promise.all([writer.return(undefined), drained]);
   });

  return {
    getBootstrap,
    closed};

 };

/** @param {any} message */$h‍_once.makeMessageCapTP(makeMessageCapTP);
const        messageToBytes=  (message)=>{
  const text=  JSON.stringify(message);
  // console.log('->', text);
  const bytes=  textEncoder.encode(text);
  return bytes;
 };

/** @param {Uint8Array} bytes */$h‍_once.messageToBytes(messageToBytes);
const        bytesToMessage=  (bytes)=>{
  const text=  textDecoder.decode(bytes);
  // console.log('<-', text);
  const message=  JSON.parse(text);
  return message;
 };

/**
 * @template TBootstrap
 * @param {string} name
 * @param {import('@endo/stream').Writer<Uint8Array>} bytesWriter
 * @param {import('@endo/stream').Reader<Uint8Array>} bytesReader
 * @param {Promise<void>} cancelled
 * @param {TBootstrap} bootstrap
 */$h‍_once.bytesToMessage(bytesToMessage);
const        makeNetstringCapTP=  (
  name,
  bytesWriter,
  bytesReader,
  cancelled,
  bootstrap)=>
     {
  const messageWriter=  mapWriter(
    makeNetstringWriter(bytesWriter, { chunked: true}),
    messageToBytes);

  const messageReader=  mapReader(
    makeNetstringReader(bytesReader),
    bytesToMessage);

  return makeMessageCapTP(
    name,
    messageWriter,
    messageReader,
    cancelled,
    bootstrap);

 };$h‍_once.makeNetstringCapTP(makeNetstringCapTP);
})()
,
// === functors[141] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let E,Far,makeNetstringCapTP;$h‍_imports([["@endo/far", [["E", [$h‍_a => (E = $h‍_a)]],["Far", [$h‍_a => (Far = $h‍_a)]]]],["./connection.js", [["makeNetstringCapTP", [$h‍_a => (makeNetstringCapTP = $h‍_a)]]]]]);   





const endowments=  harden({
  assert,
  console,
  E,
  Far,
  TextEncoder,
  TextDecoder,
  URL});


/**
 * @typedef {ReturnType<makeWorkerFacet>} WorkerBootstrap
 */

/**
 * @param {object} args
 * @param {() => any} args.getDaemonBootstrap
 * @param {(error: Error) => void} args.cancel
 * @param {(path: string) => string} args.pathToFileURL
 */
const        makeWorkerFacet=  ({
  getDaemonBootstrap,
  pathToFileURL,
  cancel})=>
      {
  return Far('EndoWorkerFacet', {
    terminate: async()=>   {
      console.error('Endo worker received terminate request');
      cancel(Error('terminate'));
     },

    /**
     * @param {string} source
     * @param {Array<string>} names
     * @param {Array<unknown>} values
     */
    evaluate: async( source, names, values)=>  {
      const compartment=  new Compartment(
        harden({
          ...endowments,
          ...Object.fromEntries(
            names.map((name, index)=>  [name, values[index]]))}));



      return compartment.evaluate(source);
     },

    /**
     * @param {string} path
     * @param {unknown} powersP
     */
    importUnsafeAndEndow: async( path, powersP)=>  {
      const url=  pathToFileURL(path);
      const namespace=  await $h‍_import(url);
      return namespace.make(powersP);
     },

    /**
     * @param {import('@endo/eventual-send').ERef<import('./types.js').EndoReadable>} readableP
     * @param {unknown} powersP
     */
    importBundleAndEndow: async( readableP, powersP)=>  {
      const bundleText=  await E(readableP).text();
      const bundle=  JSON.parse(bundleText);

      // We defer importing the import-bundle machinery to this in order to
      // avoid an up-front cost for workers that never use importBundle.
      const { importBundle}=   await $h‍_import('@endo/import-bundle');
      const namespace=  await importBundle(bundle, {
        endowments});

      return namespace.make(powersP);
     }});

 };

/**
 * @param {import('./types.js').MignonicPowers} powers
 * @param {import('./types.js').Locator} locator
 * @param {string} uuid
 * @param {number | undefined} pid
 * @param {(error: Error) => void} cancel
 * @param {Promise<never>} cancelled
 */$h‍_once.makeWorkerFacet(makeWorkerFacet);
const        main=  async( powers, locator, uuid, pid, cancel, cancelled)=>  {
  console.error( `Endo worker started on pid ${pid}`);
  cancelled.catch(()=>  {
    console.error( `Endo worker exiting on pid ${pid}`);
   });

  const { pathToFileURL}=   powers;

  const { reader, writer}=   powers.connection;

  const workerFacet=  makeWorkerFacet({
    // Behold: reference cycle
    // eslint-disable-next-line no-use-before-define
    getDaemonBootstrap: ()=>  getBootstrap(),
    pathToFileURL,
    cancel});


  const { closed, getBootstrap}=   makeNetstringCapTP(
    'Endo',
    writer,
    reader,
    cancelled,
    workerFacet);


  return Promise.race([cancelled, closed]);
 };$h‍_once.main(main);
})()
,
// === functors[142] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeQueue;$h‍_imports([["@endo/stream", [["makeQueue", [$h‍_a => (makeQueue = $h‍_a)]]]]]);   

const asyncIterFromQueue=  async function*( queue) {
  while( true) {
    yield await queue.get();
   }
 };

const        makeWebWorkerWriter=  (workerContext)=>{
  let index=  0;
  /** @type {import('@endo/stream').Writer<Uint8Array>} */
  const webWorkerWriter=  harden({
    /** @param {Uint8Array} value */
          async next(value){
      // console.log('worker writer "next"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'next', value});
     },
          async return(value){
      // console.log('worker writer "return"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'return'});
     },
    /**
     * @param {Error} error
     */
          async throw(value){
      // console.log('worker writer "throw"', value, { isInWorker: typeof window === 'undefined' })
      index++;
      workerContext.postMessage({ index, type: 'throw', value});
     },
    [Symbol.asyncIterator]() {
      return webWorkerWriter;
     }});

  return webWorkerWriter;
 };$h‍_once.makeWebWorkerWriter(makeWebWorkerWriter);

const        makeWebWorkerReader=  (workerContext)=>{

  const queue=  makeQueue();
  // workerContext.addEventListener('message', event => {
  //   queue.put(event.data);
  // })
  // const iterator = asyncIterFromQueue(queue);

  const nextQueue=  makeQueue();
  const returnQueue=  makeQueue();
  const throwQueue=  makeQueue();
  workerContext.addEventListener('message', (event)=>{
    switch( event.data.type){
      case 'next':
        // console.log('worker reader "next"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put({ value: event.data.value, done: false});
        break;
      case 'return':
        // console.log('worker reader "return"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put({ value: undefined, done: true});
        break;
      case 'throw':
        // console.log('worker reader "throw"', event.data, { isInWorker: typeof window === 'undefined' })
        queue.put(Promise.reject(event.data.value));
        break;}

   });

  // Adapt the AsyncIterator to the more strict interface of a Stream: must
  // have return and throw methods.
  /** @type {import('@endo/stream').Reader<Buffer>} */
  const reader=  {
          async next(){
      // console.log('> webworker reader next requested', { isInWorker: typeof window === 'undefined' })
      const result=  await queue.get();
      // console.log('< webworker reader next requested', result, { isInWorker: typeof window === 'undefined' })
      return result;
     },
          async return(){
      // console.log('> webworker reader return requested', { isInWorker: typeof window === 'undefined' })
      debugger;
      // const result = await returnQueue.get();
      // console.log('< webworker reader return requested', { isInWorker: typeof window === 'undefined' })
      // return result
     },
          async throw(error){
      // console.log('> webworker reader throw requested', error, { isInWorker: typeof window === 'undefined' })
      // send error over to worker?
      // const result = await throwQueue.get();
      debugger;
      // console.log('< webworker reader throw requested', error, { isInWorker: typeof window === 'undefined' })
      // return result
     },
    [Symbol.asyncIterator]() {
      return reader;
     }};


  return reader;
 };$h‍_once.makeWebWorkerReader(makeWebWorkerReader);
})()
,
// === functors[143] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let makeWebWorkerReader,makeWebWorkerWriter;$h‍_imports([["./web-worker-util.js", [["makeWebWorkerReader", [$h‍_a => (makeWebWorkerReader = $h‍_a)]],["makeWebWorkerWriter", [$h‍_a => (makeWebWorkerWriter = $h‍_a)]]]]]);   



/**
 * @param {object} modules
 * @param {typeof import('fs')} modules.fs
 * @param {typeof import('url')} modules.url
 * @returns {import('../types.js').MignonicPowers}
 */
const        makePowers=  ({ fs, url})=>   {
  // // @ts-ignore This is in fact how you open a file descriptor.
  // const reader = makeNodeReader(fs.createReadStream(null, { fd: 3 }));
  // // @ts-ignore This is in fact how you open a file descriptor.
  // const writer = makeNodeWriter(fs.createWriteStream(null, { fd: 4 }));

  const reader=  makeWebWorkerReader(globalThis);
  const writer=  makeWebWorkerWriter(globalThis);

  const connection=  {
    reader,
    writer};


  const { pathToFileURL}=   url;

  return harden({
    connection,
    // pathToFileURL: path => pathToFileURL(path).toString(),
    pathToFileURL: (path)=>{
      console.log('pathToFileURL', path);
      return  `file://${path}`;
     }});

 };$h‍_once.makePowers(makePowers);
})()
,
// === functors[144] ===
({   imports: $h‍_imports,   liveVar: $h‍_live,   onceVar: $h‍_once,   importMeta: $h‍____meta, }) => (function () {   let fs,url,makePromiseKit,daemonMain,makePowers;$h‍_imports([["./environment.js", []],["ses", []],["@endo/eventual-send/shim.js", []],["@endo/promise-kit/shim.js", []],["@endo/lockdown/commit.js", []],["fs", [["default", [$h‍_a => (fs = $h‍_a)]]]],["url", [["default", [$h‍_a => (url = $h‍_a)]]]],["@endo/promise-kit", [["makePromiseKit", [$h‍_a => (makePromiseKit = $h‍_a)]]]],["../worker.js", [["main", [$h‍_a => (daemonMain = $h‍_a)]]]],["./worker-web-powers.js", [["makePowers", [$h‍_a => (makePowers = $h‍_a)]]]]]);   















console.log('hello from worker-web.js');

// if (process.argv.length < 7) {
//   throw new Error(
//     `worker.js requires arguments workerUuid, daemonSockPath, workerStatePath, workerEphemeralStatePath, workerCachePath, got ${process.argv.join(
//       ', ',
//     )}`,
//   );
// }

// const [workerUuid, sockPath, statePath, ephemeralStatePath, cachePath] =
//   process.argv.slice(2);

// /** @type {import('../index.js').Locator} */
// const locator = {
//   sockPath,
//   statePath,
//   ephemeralStatePath,
//   cachePath,
// };

const powers=  makePowers({ fs, url});

const { promise: cancelled, reject: cancel}=
  /** @type {import('@endo/promise-kit').PromiseKit<never>} */
    makePromiseKit();


process.once('SIGINT', ()=>  cancel(new Error('SIGINT')));
process.exitCode=  1;

const main=  async()=>   {
  const initParamsP=  new Promise((resolve)=>globalThis.addEventListener('message', resolve, { once: true}));
  globalThis.postMessage('WORKER_READY');
  const initParams=  await initParamsP;
  console.log('got init params', initParams);
  const {
    id: workerUuid,
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath}=
      initParams;
  /** @type {import('../index.js').Locator} */
  const locator=  {
    sockPath,
    statePath,
    ephemeralStatePath,
    cachePath};


  await daemonMain(powers, locator, workerUuid, process.pid, cancel, cancelled);
  console.error( `Endo worker exited on pid ${process.pid}`);

 };

main();
// .then(
//   () => {
//     process.exitCode = 0;
//   },
//   error => {
//     console.error(error);
//   },
// );
})()
,
]; // functors end

  const cell = (name, value = undefined) => {
    const observers = [];
    return Object.freeze({
      get: Object.freeze(() => {
        return value;
      }),
      set: Object.freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: Object.freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
    {
    },
    {
      globalThis: cell("globalThis"),
      Array: cell("Array"),
      Date: cell("Date"),
      FinalizationRegistry: cell("FinalizationRegistry"),
      Float32Array: cell("Float32Array"),
      JSON: cell("JSON"),
      Map: cell("Map"),
      Math: cell("Math"),
      Number: cell("Number"),
      Object: cell("Object"),
      Promise: cell("Promise"),
      Proxy: cell("Proxy"),
      Reflect: cell("Reflect"),
      FERAL_REG_EXP: cell("FERAL_REG_EXP"),
      Set: cell("Set"),
      String: cell("String"),
      Symbol: cell("Symbol"),
      WeakMap: cell("WeakMap"),
      WeakSet: cell("WeakSet"),
      FERAL_ERROR: cell("FERAL_ERROR"),
      RangeError: cell("RangeError"),
      ReferenceError: cell("ReferenceError"),
      SyntaxError: cell("SyntaxError"),
      TypeError: cell("TypeError"),
      assign: cell("assign"),
      create: cell("create"),
      defineProperties: cell("defineProperties"),
      entries: cell("entries"),
      freeze: cell("freeze"),
      getOwnPropertyDescriptor: cell("getOwnPropertyDescriptor"),
      getOwnPropertyDescriptors: cell("getOwnPropertyDescriptors"),
      getOwnPropertyNames: cell("getOwnPropertyNames"),
      getPrototypeOf: cell("getPrototypeOf"),
      is: cell("is"),
      isFrozen: cell("isFrozen"),
      isSealed: cell("isSealed"),
      isExtensible: cell("isExtensible"),
      keys: cell("keys"),
      objectPrototype: cell("objectPrototype"),
      seal: cell("seal"),
      preventExtensions: cell("preventExtensions"),
      setPrototypeOf: cell("setPrototypeOf"),
      values: cell("values"),
      fromEntries: cell("fromEntries"),
      speciesSymbol: cell("speciesSymbol"),
      toStringTagSymbol: cell("toStringTagSymbol"),
      iteratorSymbol: cell("iteratorSymbol"),
      matchAllSymbol: cell("matchAllSymbol"),
      unscopablesSymbol: cell("unscopablesSymbol"),
      symbolKeyFor: cell("symbolKeyFor"),
      symbolFor: cell("symbolFor"),
      isInteger: cell("isInteger"),
      stringifyJson: cell("stringifyJson"),
      defineProperty: cell("defineProperty"),
      apply: cell("apply"),
      construct: cell("construct"),
      reflectGet: cell("reflectGet"),
      reflectGetOwnPropertyDescriptor: cell("reflectGetOwnPropertyDescriptor"),
      reflectHas: cell("reflectHas"),
      reflectIsExtensible: cell("reflectIsExtensible"),
      ownKeys: cell("ownKeys"),
      reflectPreventExtensions: cell("reflectPreventExtensions"),
      reflectSet: cell("reflectSet"),
      isArray: cell("isArray"),
      arrayPrototype: cell("arrayPrototype"),
      mapPrototype: cell("mapPrototype"),
      proxyRevocable: cell("proxyRevocable"),
      regexpPrototype: cell("regexpPrototype"),
      setPrototype: cell("setPrototype"),
      stringPrototype: cell("stringPrototype"),
      weakmapPrototype: cell("weakmapPrototype"),
      weaksetPrototype: cell("weaksetPrototype"),
      functionPrototype: cell("functionPrototype"),
      promisePrototype: cell("promisePrototype"),
      typedArrayPrototype: cell("typedArrayPrototype"),
      uncurryThis: cell("uncurryThis"),
      objectHasOwnProperty: cell("objectHasOwnProperty"),
      arrayFilter: cell("arrayFilter"),
      arrayForEach: cell("arrayForEach"),
      arrayIncludes: cell("arrayIncludes"),
      arrayJoin: cell("arrayJoin"),
      arrayMap: cell("arrayMap"),
      arrayPop: cell("arrayPop"),
      arrayPush: cell("arrayPush"),
      arraySlice: cell("arraySlice"),
      arraySome: cell("arraySome"),
      arraySort: cell("arraySort"),
      iterateArray: cell("iterateArray"),
      mapSet: cell("mapSet"),
      mapGet: cell("mapGet"),
      mapHas: cell("mapHas"),
      mapDelete: cell("mapDelete"),
      mapEntries: cell("mapEntries"),
      iterateMap: cell("iterateMap"),
      setAdd: cell("setAdd"),
      setDelete: cell("setDelete"),
      setForEach: cell("setForEach"),
      setHas: cell("setHas"),
      iterateSet: cell("iterateSet"),
      regexpTest: cell("regexpTest"),
      regexpExec: cell("regexpExec"),
      matchAllRegExp: cell("matchAllRegExp"),
      stringEndsWith: cell("stringEndsWith"),
      stringIncludes: cell("stringIncludes"),
      stringIndexOf: cell("stringIndexOf"),
      stringMatch: cell("stringMatch"),
      stringReplace: cell("stringReplace"),
      stringSearch: cell("stringSearch"),
      stringSlice: cell("stringSlice"),
      stringSplit: cell("stringSplit"),
      stringStartsWith: cell("stringStartsWith"),
      iterateString: cell("iterateString"),
      weakmapDelete: cell("weakmapDelete"),
      weakmapGet: cell("weakmapGet"),
      weakmapHas: cell("weakmapHas"),
      weakmapSet: cell("weakmapSet"),
      weaksetAdd: cell("weaksetAdd"),
      weaksetHas: cell("weaksetHas"),
      functionToString: cell("functionToString"),
      promiseAll: cell("promiseAll"),
      promiseCatch: cell("promiseCatch"),
      promiseThen: cell("promiseThen"),
      finalizationRegistryRegister: cell("finalizationRegistryRegister"),
      finalizationRegistryUnregister: cell("finalizationRegistryUnregister"),
      getConstructorOf: cell("getConstructorOf"),
      immutableObject: cell("immutableObject"),
      isObject: cell("isObject"),
      isError: cell("isError"),
      FERAL_EVAL: cell("FERAL_EVAL"),
      FERAL_FUNCTION: cell("FERAL_FUNCTION"),
      noEvalEvaluate: cell("noEvalEvaluate"),
    },
    {
    },
    {
      makeEnvironmentCaptor: cell("makeEnvironmentCaptor"),
    },
    {
    },
    {
      an: cell("an"),
      bestEffortStringify: cell("bestEffortStringify"),
      enJoin: cell("enJoin"),
    },
    {
    },
    {
    },
    {
      makeLRUCacheMap: cell("makeLRUCacheMap"),
      makeNoteLogArgsArrayKit: cell("makeNoteLogArgsArrayKit"),
    },
    {
      unredactedDetails: cell("unredactedDetails"),
      loggedErrorHandler: cell("loggedErrorHandler"),
      makeAssert: cell("makeAssert"),
      assert: cell("assert"),
    },
    {
      isTypedArray: cell("isTypedArray"),
      makeHardener: cell("makeHardener"),
    },
    {
      constantProperties: cell("constantProperties"),
      universalPropertyNames: cell("universalPropertyNames"),
      initialGlobalPropertyNames: cell("initialGlobalPropertyNames"),
      sharedGlobalPropertyNames: cell("sharedGlobalPropertyNames"),
      uniqueGlobalPropertyNames: cell("uniqueGlobalPropertyNames"),
      NativeErrors: cell("NativeErrors"),
      FunctionInstance: cell("FunctionInstance"),
      AsyncFunctionInstance: cell("AsyncFunctionInstance"),
      isAccessorPermit: cell("isAccessorPermit"),
      permitted: cell("permitted"),
    },
    {
      makeIntrinsicsCollector: cell("makeIntrinsicsCollector"),
      getGlobalIntrinsics: cell("getGlobalIntrinsics"),
    },
    {
      default: cell("default"),
    },
    {
      default: cell("default"),
    },
    {
      default: cell("default"),
    },
    {
      default: cell("default"),
    },
    {
      default: cell("default"),
    },
    {
      minEnablements: cell("minEnablements"),
      moderateEnablements: cell("moderateEnablements"),
      severeEnablements: cell("severeEnablements"),
    },
    {
      default: cell("default"),
    },
    {
      default: cell("default"),
    },
    {
      makeEvalFunction: cell("makeEvalFunction"),
    },
    {
      makeFunctionConstructor: cell("makeFunctionConstructor"),
    },
    {
      setGlobalObjectSymbolUnscopables: cell("setGlobalObjectSymbolUnscopables"),
      setGlobalObjectConstantProperties: cell("setGlobalObjectConstantProperties"),
      setGlobalObjectMutableProperties: cell("setGlobalObjectMutableProperties"),
      setGlobalObjectEvaluators: cell("setGlobalObjectEvaluators"),
    },
    {
      alwaysThrowHandler: cell("alwaysThrowHandler"),
      strictScopeTerminatorHandler: cell("strictScopeTerminatorHandler"),
      strictScopeTerminator: cell("strictScopeTerminator"),
    },
    {
      createSloppyGlobalsScopeTerminator: cell("createSloppyGlobalsScopeTerminator"),
    },
    {
      makeEvalScopeKit: cell("makeEvalScopeKit"),
    },
    {
      getSourceURL: cell("getSourceURL"),
    },
    {
      rejectHtmlComments: cell("rejectHtmlComments"),
      evadeHtmlCommentTest: cell("evadeHtmlCommentTest"),
      rejectImportExpressions: cell("rejectImportExpressions"),
      evadeImportExpressionTest: cell("evadeImportExpressionTest"),
      rejectSomeDirectEvalExpressions: cell("rejectSomeDirectEvalExpressions"),
      mandatoryTransforms: cell("mandatoryTransforms"),
      applyTransforms: cell("applyTransforms"),
      transforms: cell("transforms"),
    },
    {
      isValidIdentifierName: cell("isValidIdentifierName"),
      getScopeConstants: cell("getScopeConstants"),
    },
    {
      makeEvaluate: cell("makeEvaluate"),
    },
    {
      makeSafeEvaluator: cell("makeSafeEvaluator"),
    },
    {
      tameFunctionToString: cell("tameFunctionToString"),
    },
    {
      tameDomains: cell("tameDomains"),
    },
    {
      makeLoggingConsoleKit: cell("makeLoggingConsoleKit"),
      makeCausalConsole: cell("makeCausalConsole"),
      filterConsole: cell("filterConsole"),
      consoleWhitelist: cell("consoleWhitelist"),
    },
    {
      makeRejectionHandlers: cell("makeRejectionHandlers"),
    },
    {
      tameConsole: cell("tameConsole"),
    },
    {
      filterFileName: cell("filterFileName"),
      shortenCallSiteString: cell("shortenCallSiteString"),
      tameV8ErrorConstructor: cell("tameV8ErrorConstructor"),
    },
    {
      default: cell("default"),
    },
    {
      makeAlias: cell("makeAlias"),
      load: cell("load"),
    },
    {
      deferExports: cell("deferExports"),
      getDeferredExports: cell("getDeferredExports"),
    },
    {
      provideCompartmentEvaluator: cell("provideCompartmentEvaluator"),
      compartmentEvaluate: cell("compartmentEvaluate"),
    },
    {
      makeThirdPartyModuleInstance: cell("makeThirdPartyModuleInstance"),
      makeModuleInstance: cell("makeModuleInstance"),
    },
    {
      link: cell("link"),
      instantiate: cell("instantiate"),
    },
    {
      InertCompartment: cell("InertCompartment"),
      CompartmentPrototype: cell("CompartmentPrototype"),
      makeCompartmentConstructor: cell("makeCompartmentConstructor"),
    },
    {
      getAnonymousIntrinsics: cell("getAnonymousIntrinsics"),
    },
    {
      tameHarden: cell("tameHarden"),
    },
    {
      tameSymbolConstructor: cell("tameSymbolConstructor"),
    },
    {
      repairIntrinsics: cell("repairIntrinsics"),
    },
    {
    },
    {
    },
    {
    },
    {
    },
    {
      trackTurns: cell("trackTurns"),
    },
    {
      getMethodNames: cell("getMethodNames"),
      localApplyFunction: cell("localApplyFunction"),
      localApplyMethod: cell("localApplyMethod"),
      localGet: cell("localGet"),
    },
    {
      makePostponedHandler: cell("makePostponedHandler"),
    },
    {
      makeHandledPromise: cell("makeHandledPromise"),
    },
    {
    },
    {
      memoRace: cell("memoRace"),
    },
    {
    },
    {
      default: cell("default"),
    },
    {
      lockdown: cell("lockdown"),
    },
    {
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
      apply: cell("apply"),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      isArgumentsObject: cell("isArgumentsObject"),
      isGeneratorFunction: cell("isGeneratorFunction"),
      isTypedArray: cell("isTypedArray"),
      isPromise: cell("isPromise"),
      isArrayBufferView: cell("isArrayBufferView"),
      isUint8Array: cell("isUint8Array"),
      isUint8ClampedArray: cell("isUint8ClampedArray"),
      isUint16Array: cell("isUint16Array"),
      isUint32Array: cell("isUint32Array"),
      isInt8Array: cell("isInt8Array"),
      isInt16Array: cell("isInt16Array"),
      isInt32Array: cell("isInt32Array"),
      isFloat32Array: cell("isFloat32Array"),
      isFloat64Array: cell("isFloat64Array"),
      isBigInt64Array: cell("isBigInt64Array"),
      isBigUint64Array: cell("isBigUint64Array"),
      isMap: cell("isMap"),
      isSet: cell("isSet"),
      isWeakMap: cell("isWeakMap"),
      isWeakSet: cell("isWeakSet"),
      isArrayBuffer: cell("isArrayBuffer"),
      isDataView: cell("isDataView"),
      isSharedArrayBuffer: cell("isSharedArrayBuffer"),
      isAsyncFunction: cell("isAsyncFunction"),
      isMapIterator: cell("isMapIterator"),
      isSetIterator: cell("isSetIterator"),
      isGeneratorObject: cell("isGeneratorObject"),
      isWebAssemblyCompiledModule: cell("isWebAssemblyCompiledModule"),
      isNumberObject: cell("isNumberObject"),
      isStringObject: cell("isStringObject"),
      isBooleanObject: cell("isBooleanObject"),
      isBigIntObject: cell("isBigIntObject"),
      isSymbolObject: cell("isSymbolObject"),
      isBoxedPrimitive: cell("isBoxedPrimitive"),
      isAnyArrayBuffer: cell("isAnyArrayBuffer"),
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      format: cell("format"),
      deprecate: cell("deprecate"),
      debuglog: cell("debuglog"),
      inspect: cell("inspect"),
      types: cell("types"),
      isArray: cell("isArray"),
      isBoolean: cell("isBoolean"),
      isNull: cell("isNull"),
      isNullOrUndefined: cell("isNullOrUndefined"),
      isNumber: cell("isNumber"),
      isString: cell("isString"),
      isSymbol: cell("isSymbol"),
      isUndefined: cell("isUndefined"),
      isRegExp: cell("isRegExp"),
      isObject: cell("isObject"),
      isDate: cell("isDate"),
      isError: cell("isError"),
      isFunction: cell("isFunction"),
      isPrimitive: cell("isPrimitive"),
      isBuffer: cell("isBuffer"),
      log: cell("log"),
      inherits: cell("inherits"),
      _extend: cell("_extend"),
      promisify: cell("promisify"),
      callbackify: cell("callbackify"),
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      arrayToObject: cell("arrayToObject"),
      assign: cell("assign"),
      combine: cell("combine"),
      compact: cell("compact"),
      decode: cell("decode"),
      encode: cell("encode"),
      isBuffer: cell("isBuffer"),
      isRegExp: cell("isRegExp"),
      maybeMap: cell("maybeMap"),
      merge: cell("merge"),
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      default: cell("default", {}),
    },
    {
      formats: cell("formats"),
      parse: cell("parse"),
      stringify: cell("stringify"),
      default: cell("default", {}),
    },
    {
      parse: cell("parse"),
      resolve: cell("resolve"),
      resolveObject: cell("resolveObject"),
      format: cell("format"),
      Url: cell("Url"),
      default: cell("default", {}),
    },
    {
      makeReleasingExecutorKit: cell("makeReleasingExecutorKit"),
    },
    {
      isPromise: cell("isPromise"),
    },
    {
    },
    {
      makePromiseKit: cell("makePromiseKit"),
      racePromises: cell("racePromises"),
    },
    {
      default: cell("default"),
    },
    {
    },
    {
      HandledPromise: cell("HandledPromise"),
      E: cell("E"),
    },
    {
      hasOwnPropertyOf: cell("hasOwnPropertyOf"),
      isObject: cell("isObject"),
      isTypedArray: cell("isTypedArray"),
      PASS_STYLE: cell("PASS_STYLE"),
      canBeMethod: cell("canBeMethod"),
      assertChecker: cell("assertChecker"),
      checkNormalProperty: cell("checkNormalProperty"),
      getTag: cell("getTag"),
      checkPassStyle: cell("checkPassStyle"),
      checkTagRecord: cell("checkTagRecord"),
      checkFunctionTagRecord: cell("checkFunctionTagRecord"),
    },
    {
      assertIface: cell("assertIface"),
      getInterfaceOf: cell("getInterfaceOf"),
      RemotableHelper: cell("RemotableHelper"),
    },
    {
      Remotable: cell("Remotable"),
      Far: cell("Far"),
      ToFarFunction: cell("ToFarFunction"),
    },
    {
      mapIterable: cell("mapIterable"),
      filterIterable: cell("filterIterable"),
    },
    {
      getErrorConstructor: cell("getErrorConstructor"),
      isErrorLike: cell("isErrorLike"),
      ErrorHelper: cell("ErrorHelper"),
      toPassableError: cell("toPassableError"),
    },
    {
      isPassableSymbol: cell("isPassableSymbol"),
      assertPassableSymbol: cell("assertPassableSymbol"),
      nameForPassableSymbol: cell("nameForPassableSymbol"),
      passableSymbolForName: cell("passableSymbolForName"),
    },
    {
      CopyArrayHelper: cell("CopyArrayHelper"),
    },
    {
      CopyRecordHelper: cell("CopyRecordHelper"),
    },
    {
      TaggedHelper: cell("TaggedHelper"),
    },
    {
      isSafePromise: cell("isSafePromise"),
      assertSafePromise: cell("assertSafePromise"),
    },
    {
      passStyleOf: cell("passStyleOf"),
      assertPassable: cell("assertPassable"),
    },
    {
      makeTagged: cell("makeTagged"),
    },
    {
      isCopyArray: cell("isCopyArray"),
      isRecord: cell("isRecord"),
      isRemotable: cell("isRemotable"),
      assertCopyArray: cell("assertCopyArray"),
      assertRecord: cell("assertRecord"),
      assertRemotable: cell("assertRemotable"),
    },
    {
    },
    {
      mapIterable: cell("mapIterable"),
      filterIterable: cell("filterIterable"),
      PASS_STYLE: cell("PASS_STYLE"),
      isObject: cell("isObject"),
      assertChecker: cell("assertChecker"),
      getTag: cell("getTag"),
      hasOwnPropertyOf: cell("hasOwnPropertyOf"),
      getErrorConstructor: cell("getErrorConstructor"),
      toPassableError: cell("toPassableError"),
      isErrorLike: cell("isErrorLike"),
      getInterfaceOf: cell("getInterfaceOf"),
      assertPassableSymbol: cell("assertPassableSymbol"),
      isPassableSymbol: cell("isPassableSymbol"),
      nameForPassableSymbol: cell("nameForPassableSymbol"),
      passableSymbolForName: cell("passableSymbolForName"),
      passStyleOf: cell("passStyleOf"),
      assertPassable: cell("assertPassable"),
      makeTagged: cell("makeTagged"),
      Remotable: cell("Remotable"),
      Far: cell("Far"),
      ToFarFunction: cell("ToFarFunction"),
      assertRecord: cell("assertRecord"),
      assertCopyArray: cell("assertCopyArray"),
      assertRemotable: cell("assertRemotable"),
      isRemotable: cell("isRemotable"),
      isRecord: cell("isRecord"),
      isCopyArray: cell("isCopyArray"),
    },
    {
      E: cell("E"),
      Far: cell("Far"),
      getInterfaceOf: cell("getInterfaceOf"),
      passStyleOf: cell("passStyleOf"),
    },
    {
      isNat: cell("isNat"),
      Nat: cell("Nat"),
    },
    {
      deeplyFulfilled: cell("deeplyFulfilled"),
    },
    {
      QCLASS: cell("QCLASS"),
      makeEncodeToCapData: cell("makeEncodeToCapData"),
      makeDecodeFromCapData: cell("makeDecodeFromCapData"),
    },
    {
      makeEncodeToSmallcaps: cell("makeEncodeToSmallcaps"),
      makeDecodeFromSmallcaps: cell("makeDecodeFromSmallcaps"),
    },
    {
      makeMarshal: cell("makeMarshal"),
    },
    {
      stringify: cell("stringify"),
      parse: cell("parse"),
    },
    {
      decodeToJustin: cell("decodeToJustin"),
    },
    {
      recordNames: cell("recordNames"),
      recordValues: cell("recordValues"),
      zeroPad: cell("zeroPad"),
      makeEncodePassable: cell("makeEncodePassable"),
      makeDecodePassable: cell("makeDecodePassable"),
      isEncodedRemotable: cell("isEncodedRemotable"),
      passStylePrefixes: cell("passStylePrefixes"),
    },
    {
      trivialComparator: cell("trivialComparator"),
      getPassStyleCover: cell("getPassStyleCover"),
      makeComparatorKit: cell("makeComparatorKit"),
      comparatorMirrorImage: cell("comparatorMirrorImage"),
      isRankSorted: cell("isRankSorted"),
      assertRankSorted: cell("assertRankSorted"),
      sortByRank: cell("sortByRank"),
      getIndexCover: cell("getIndexCover"),
      FullRankCover: cell("FullRankCover"),
      coveredEntries: cell("coveredEntries"),
      unionRankCovers: cell("unionRankCovers"),
      intersectRankCovers: cell("intersectRankCovers"),
      compareRank: cell("compareRank"),
      compareAntiRank: cell("compareAntiRank"),
      makeFullOrderComparatorKit: cell("makeFullOrderComparatorKit"),
    },
    {
    },
    {
      deeplyFulfilled: cell("deeplyFulfilled"),
      QCLASS: cell("QCLASS"),
      makeMarshal: cell("makeMarshal"),
      stringify: cell("stringify"),
      parse: cell("parse"),
      decodeToJustin: cell("decodeToJustin"),
      makeEncodePassable: cell("makeEncodePassable"),
      makeDecodePassable: cell("makeDecodePassable"),
      isEncodedRemotable: cell("isEncodedRemotable"),
      zeroPad: cell("zeroPad"),
      recordNames: cell("recordNames"),
      recordValues: cell("recordValues"),
      trivialComparator: cell("trivialComparator"),
      assertRankSorted: cell("assertRankSorted"),
      compareRank: cell("compareRank"),
      isRankSorted: cell("isRankSorted"),
      sortByRank: cell("sortByRank"),
      compareAntiRank: cell("compareAntiRank"),
      makeFullOrderComparatorKit: cell("makeFullOrderComparatorKit"),
      getPassStyleCover: cell("getPassStyleCover"),
      intersectRankCovers: cell("intersectRankCovers"),
      unionRankCovers: cell("unionRankCovers"),
    },
    {
    },
    {
      nearTrapImpl: cell("nearTrapImpl"),
      makeTrap: cell("makeTrap"),
    },
    {
      makeFinalizingMap: cell("makeFinalizingMap"),
    },
    {
      makeCapTP: cell("makeCapTP"),
      E: cell("E"),
    },
    {
      makeLoopback: cell("makeLoopback"),
      E: cell("E"),
    },
    {
      MIN_DATA_BUFFER_LENGTH: cell("MIN_DATA_BUFFER_LENGTH"),
      TRANSFER_OVERHEAD_LENGTH: cell("TRANSFER_OVERHEAD_LENGTH"),
      MIN_TRANSFER_BUFFER_LENGTH: cell("MIN_TRANSFER_BUFFER_LENGTH"),
      makeAtomicsTrapHost: cell("makeAtomicsTrapHost"),
      makeAtomicsTrapGuest: cell("makeAtomicsTrapGuest"),
    },
    {
      Nat: cell("Nat"),
      makeLoopback: cell("makeLoopback"),
    },
    {
      makeQueue: cell("makeQueue"),
      makeStream: cell("makeStream"),
      makePipe: cell("makePipe"),
      pump: cell("pump"),
      prime: cell("prime"),
      mapReader: cell("mapReader"),
      mapWriter: cell("mapWriter"),
    },
    {
      makeNetstringReader: cell("makeNetstringReader"),
      netstringReader: cell("netstringReader"),
    },
    {
      makeNetstringWriter: cell("makeNetstringWriter"),
      netstringWriter: cell("netstringWriter"),
    },
    {
      makeNetstringReader: cell("makeNetstringReader"),
      netstringReader: cell("netstringReader"),
      makeNetstringWriter: cell("makeNetstringWriter"),
      netstringWriter: cell("netstringWriter"),
    },
    {
      makeMessageCapTP: cell("makeMessageCapTP"),
      messageToBytes: cell("messageToBytes"),
      bytesToMessage: cell("bytesToMessage"),
      makeNetstringCapTP: cell("makeNetstringCapTP"),
    },
    {
      makeWorkerFacet: cell("makeWorkerFacet"),
      main: cell("main"),
    },
    {
      makeWebWorkerWriter: cell("makeWebWorkerWriter"),
      makeWebWorkerReader: cell("makeWebWorkerReader"),
    },
    {
      makePowers: cell("makePowers"),
    },
    {
    },
  ];

  Object.defineProperties(cells[4], Object.getOwnPropertyDescriptors(cells[3]));
  Object.defineProperties(cells[61], Object.getOwnPropertyDescriptors(cells[52]));
  Object.defineProperties(cells[62], Object.getOwnPropertyDescriptors(cells[61]));
  Object.defineProperties(cells[98], Object.getOwnPropertyDescriptors(cells[96]));
  Object.defineProperties(cells[98], Object.getOwnPropertyDescriptors(cells[97]));
  Object.defineProperties(cells[101], Object.getOwnPropertyDescriptors(cells[100]));
  Object.defineProperties(cells[116], Object.getOwnPropertyDescriptors(cells[115]));

  Object.defineProperties(cells[116], {"mapIterable": { value: cells[105]["mapIterable"] },"filterIterable": { value: cells[105]["filterIterable"] },"PASS_STYLE": { value: cells[102]["PASS_STYLE"] },"isObject": { value: cells[102]["isObject"] },"assertChecker": { value: cells[102]["assertChecker"] },"getTag": { value: cells[102]["getTag"] },"hasOwnPropertyOf": { value: cells[102]["hasOwnPropertyOf"] },"getErrorConstructor": { value: cells[106]["getErrorConstructor"] },"toPassableError": { value: cells[106]["toPassableError"] },"isErrorLike": { value: cells[106]["isErrorLike"] },"getInterfaceOf": { value: cells[103]["getInterfaceOf"] },"assertPassableSymbol": { value: cells[107]["assertPassableSymbol"] },"isPassableSymbol": { value: cells[107]["isPassableSymbol"] },"nameForPassableSymbol": { value: cells[107]["nameForPassableSymbol"] },"passableSymbolForName": { value: cells[107]["passableSymbolForName"] },"passStyleOf": { value: cells[112]["passStyleOf"] },"assertPassable": { value: cells[112]["assertPassable"] },"makeTagged": { value: cells[113]["makeTagged"] },"Remotable": { value: cells[104]["Remotable"] },"Far": { value: cells[104]["Far"] },"ToFarFunction": { value: cells[104]["ToFarFunction"] },"assertRecord": { value: cells[114]["assertRecord"] },"assertCopyArray": { value: cells[114]["assertCopyArray"] },"assertRemotable": { value: cells[114]["assertRemotable"] },"isRemotable": { value: cells[114]["isRemotable"] },"isRecord": { value: cells[114]["isRecord"] },"isCopyArray": { value: cells[114]["isCopyArray"] } });

  Object.defineProperties(cells[117], {"E": { value: cells[101]["E"] },"Far": { value: cells[116]["Far"] },"getInterfaceOf": { value: cells[116]["getInterfaceOf"] },"passStyleOf": { value: cells[116]["passStyleOf"] } });
  Object.defineProperties(cells[128], Object.getOwnPropertyDescriptors(cells[127]));
  Object.defineProperties(cells[128], Object.getOwnPropertyDescriptors(cells[116]));

  Object.defineProperties(cells[128], {"deeplyFulfilled": { value: cells[119]["deeplyFulfilled"] },"QCLASS": { value: cells[120]["QCLASS"] },"makeMarshal": { value: cells[122]["makeMarshal"] },"stringify": { value: cells[123]["stringify"] },"parse": { value: cells[123]["parse"] },"decodeToJustin": { value: cells[124]["decodeToJustin"] },"makeEncodePassable": { value: cells[125]["makeEncodePassable"] },"makeDecodePassable": { value: cells[125]["makeDecodePassable"] },"isEncodedRemotable": { value: cells[125]["isEncodedRemotable"] },"zeroPad": { value: cells[125]["zeroPad"] },"recordNames": { value: cells[125]["recordNames"] },"recordValues": { value: cells[125]["recordValues"] },"trivialComparator": { value: cells[126]["trivialComparator"] },"assertRankSorted": { value: cells[126]["assertRankSorted"] },"compareRank": { value: cells[126]["compareRank"] },"isRankSorted": { value: cells[126]["isRankSorted"] },"sortByRank": { value: cells[126]["sortByRank"] },"compareAntiRank": { value: cells[126]["compareAntiRank"] },"makeFullOrderComparatorKit": { value: cells[126]["makeFullOrderComparatorKit"] },"getPassStyleCover": { value: cells[126]["getPassStyleCover"] },"intersectRankCovers": { value: cells[126]["intersectRankCovers"] },"unionRankCovers": { value: cells[126]["unionRankCovers"] } });
  Object.defineProperties(cells[135], Object.getOwnPropertyDescriptors(cells[134]));
  Object.defineProperties(cells[135], Object.getOwnPropertyDescriptors(cells[132]));
  Object.defineProperties(cells[135], Object.getOwnPropertyDescriptors(cells[128]));

  Object.defineProperties(cells[135], {"Nat": { value: cells[118]["Nat"] },"makeLoopback": { value: cells[133]["makeLoopback"] } });

  Object.defineProperties(cells[139], {"makeNetstringReader": { value: cells[137]["makeNetstringReader"] },"netstringReader": { value: cells[137]["netstringReader"] },"makeNetstringWriter": { value: cells[138]["makeNetstringWriter"] },"netstringWriter": { value: cells[138]["netstringWriter"] } });

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

function observeImports(map, importName, importIndex) {
  for (const [name, observers] of map.get(importName)) {
    const cell = cells[importIndex][name];
    if (cell === undefined) {
      throw new ReferenceError(`Cannot import name ${name}`);
    }
    for (const observer of observers) {
      cell.observe(observer);
    }
  }
}
function wrapCjsFunctor(num) {
  /* eslint-disable no-undef */
  return ({ imports = {} }) => {
    const cModule = Object.freeze(
      Object.defineProperty({}, 'exports', cells[num].default),
    );
    // TODO: specifier not found handling
    const requireImpl = specifier => cells[imports[specifier]].default.get();
    functors[num](Object.freeze(requireImpl), cModule.exports, cModule);
    Object.keys(cells[num])
      .filter(k => k !== 'default' && k !== '*')
      .map(k => cells[num][k].set(cModule.exports[k]));
  };
  /* eslint-enable no-undef */
}

  functors[0]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[1]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      universalThis: cells[1].globalThis.set,
      Array: cells[1].Array.set,
      Date: cells[1].Date.set,
      FinalizationRegistry: cells[1].FinalizationRegistry.set,
      Float32Array: cells[1].Float32Array.set,
      JSON: cells[1].JSON.set,
      Map: cells[1].Map.set,
      Math: cells[1].Math.set,
      Number: cells[1].Number.set,
      Object: cells[1].Object.set,
      Promise: cells[1].Promise.set,
      Proxy: cells[1].Proxy.set,
      Reflect: cells[1].Reflect.set,
      FERAL_REG_EXP: cells[1].FERAL_REG_EXP.set,
      Set: cells[1].Set.set,
      String: cells[1].String.set,
      Symbol: cells[1].Symbol.set,
      WeakMap: cells[1].WeakMap.set,
      WeakSet: cells[1].WeakSet.set,
      FERAL_ERROR: cells[1].FERAL_ERROR.set,
      RangeError: cells[1].RangeError.set,
      ReferenceError: cells[1].ReferenceError.set,
      SyntaxError: cells[1].SyntaxError.set,
      TypeError: cells[1].TypeError.set,
      assign: cells[1].assign.set,
      create: cells[1].create.set,
      defineProperties: cells[1].defineProperties.set,
      entries: cells[1].entries.set,
      freeze: cells[1].freeze.set,
      getOwnPropertyDescriptor: cells[1].getOwnPropertyDescriptor.set,
      getOwnPropertyDescriptors: cells[1].getOwnPropertyDescriptors.set,
      getOwnPropertyNames: cells[1].getOwnPropertyNames.set,
      getPrototypeOf: cells[1].getPrototypeOf.set,
      is: cells[1].is.set,
      isFrozen: cells[1].isFrozen.set,
      isSealed: cells[1].isSealed.set,
      isExtensible: cells[1].isExtensible.set,
      keys: cells[1].keys.set,
      objectPrototype: cells[1].objectPrototype.set,
      seal: cells[1].seal.set,
      preventExtensions: cells[1].preventExtensions.set,
      setPrototypeOf: cells[1].setPrototypeOf.set,
      values: cells[1].values.set,
      fromEntries: cells[1].fromEntries.set,
      speciesSymbol: cells[1].speciesSymbol.set,
      toStringTagSymbol: cells[1].toStringTagSymbol.set,
      iteratorSymbol: cells[1].iteratorSymbol.set,
      matchAllSymbol: cells[1].matchAllSymbol.set,
      unscopablesSymbol: cells[1].unscopablesSymbol.set,
      symbolKeyFor: cells[1].symbolKeyFor.set,
      symbolFor: cells[1].symbolFor.set,
      isInteger: cells[1].isInteger.set,
      stringifyJson: cells[1].stringifyJson.set,
      defineProperty: cells[1].defineProperty.set,
      apply: cells[1].apply.set,
      construct: cells[1].construct.set,
      reflectGet: cells[1].reflectGet.set,
      reflectGetOwnPropertyDescriptor: cells[1].reflectGetOwnPropertyDescriptor.set,
      reflectHas: cells[1].reflectHas.set,
      reflectIsExtensible: cells[1].reflectIsExtensible.set,
      ownKeys: cells[1].ownKeys.set,
      reflectPreventExtensions: cells[1].reflectPreventExtensions.set,
      reflectSet: cells[1].reflectSet.set,
      isArray: cells[1].isArray.set,
      arrayPrototype: cells[1].arrayPrototype.set,
      mapPrototype: cells[1].mapPrototype.set,
      proxyRevocable: cells[1].proxyRevocable.set,
      regexpPrototype: cells[1].regexpPrototype.set,
      setPrototype: cells[1].setPrototype.set,
      stringPrototype: cells[1].stringPrototype.set,
      weakmapPrototype: cells[1].weakmapPrototype.set,
      weaksetPrototype: cells[1].weaksetPrototype.set,
      functionPrototype: cells[1].functionPrototype.set,
      promisePrototype: cells[1].promisePrototype.set,
      typedArrayPrototype: cells[1].typedArrayPrototype.set,
      uncurryThis: cells[1].uncurryThis.set,
      objectHasOwnProperty: cells[1].objectHasOwnProperty.set,
      arrayFilter: cells[1].arrayFilter.set,
      arrayForEach: cells[1].arrayForEach.set,
      arrayIncludes: cells[1].arrayIncludes.set,
      arrayJoin: cells[1].arrayJoin.set,
      arrayMap: cells[1].arrayMap.set,
      arrayPop: cells[1].arrayPop.set,
      arrayPush: cells[1].arrayPush.set,
      arraySlice: cells[1].arraySlice.set,
      arraySome: cells[1].arraySome.set,
      arraySort: cells[1].arraySort.set,
      iterateArray: cells[1].iterateArray.set,
      mapSet: cells[1].mapSet.set,
      mapGet: cells[1].mapGet.set,
      mapHas: cells[1].mapHas.set,
      mapDelete: cells[1].mapDelete.set,
      mapEntries: cells[1].mapEntries.set,
      iterateMap: cells[1].iterateMap.set,
      setAdd: cells[1].setAdd.set,
      setDelete: cells[1].setDelete.set,
      setForEach: cells[1].setForEach.set,
      setHas: cells[1].setHas.set,
      iterateSet: cells[1].iterateSet.set,
      regexpTest: cells[1].regexpTest.set,
      regexpExec: cells[1].regexpExec.set,
      matchAllRegExp: cells[1].matchAllRegExp.set,
      stringEndsWith: cells[1].stringEndsWith.set,
      stringIncludes: cells[1].stringIncludes.set,
      stringIndexOf: cells[1].stringIndexOf.set,
      stringMatch: cells[1].stringMatch.set,
      stringReplace: cells[1].stringReplace.set,
      stringSearch: cells[1].stringSearch.set,
      stringSlice: cells[1].stringSlice.set,
      stringSplit: cells[1].stringSplit.set,
      stringStartsWith: cells[1].stringStartsWith.set,
      iterateString: cells[1].iterateString.set,
      weakmapDelete: cells[1].weakmapDelete.set,
      weakmapGet: cells[1].weakmapGet.set,
      weakmapHas: cells[1].weakmapHas.set,
      weakmapSet: cells[1].weakmapSet.set,
      weaksetAdd: cells[1].weaksetAdd.set,
      weaksetHas: cells[1].weaksetHas.set,
      functionToString: cells[1].functionToString.set,
      promiseAll: cells[1].promiseAll.set,
      promiseCatch: cells[1].promiseCatch.set,
      promiseThen: cells[1].promiseThen.set,
      finalizationRegistryRegister: cells[1].finalizationRegistryRegister.set,
      finalizationRegistryUnregister: cells[1].finalizationRegistryUnregister.set,
      getConstructorOf: cells[1].getConstructorOf.set,
      immutableObject: cells[1].immutableObject.set,
      isObject: cells[1].isObject.set,
      isError: cells[1].isError.set,
      FERAL_EVAL: cells[1].FERAL_EVAL.set,
      FERAL_FUNCTION: cells[1].FERAL_FUNCTION.set,
      noEvalEvaluate: cells[1].noEvalEvaluate.set,
    },
    importMeta: {},
  });
  functors[2]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[3]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeEnvironmentCaptor: cells[3].makeEnvironmentCaptor.set,
    },
    importMeta: {},
  });
  functors[4]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/env-options.js", 3);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[5]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      an: cells[5].an.set,
      bestEffortStringify: cells[5].bestEffortStringify.set,
      enJoin: cells[5].enJoin.set,
    },
    importMeta: {},
  });
  functors[6]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[7]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[8]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./internal-types.js", 7);
    },
    liveVar: {
    },
    onceVar: {
      makeLRUCacheMap: cells[8].makeLRUCacheMap.set,
      makeNoteLogArgsArrayKit: cells[8].makeNoteLogArgsArrayKit.set,
    },
    importMeta: {},
  });
  functors[9]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
      observeImports(map, "./stringify-utils.js", 5);
      observeImports(map, "./types.js", 6);
      observeImports(map, "./internal-types.js", 7);
      observeImports(map, "./note-log-args.js", 8);
    },
    liveVar: {
    },
    onceVar: {
      unredactedDetails: cells[9].unredactedDetails.set,
      loggedErrorHandler: cells[9].loggedErrorHandler.set,
      makeAssert: cells[9].makeAssert.set,
      assert: cells[9].assert.set,
    },
    importMeta: {},
  });
  functors[10]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      isTypedArray: cells[10].isTypedArray.set,
      makeHardener: cells[10].makeHardener.set,
    },
    importMeta: {},
  });
  functors[11]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      constantProperties: cells[11].constantProperties.set,
      universalPropertyNames: cells[11].universalPropertyNames.set,
      initialGlobalPropertyNames: cells[11].initialGlobalPropertyNames.set,
      sharedGlobalPropertyNames: cells[11].sharedGlobalPropertyNames.set,
      uniqueGlobalPropertyNames: cells[11].uniqueGlobalPropertyNames.set,
      NativeErrors: cells[11].NativeErrors.set,
      FunctionInstance: cells[11].FunctionInstance.set,
      AsyncFunctionInstance: cells[11].AsyncFunctionInstance.set,
      isAccessorPermit: cells[11].isAccessorPermit.set,
      permitted: cells[11].permitted.set,
    },
    importMeta: {},
  });
  functors[12]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./permits.js", 11);
    },
    liveVar: {
    },
    onceVar: {
      makeIntrinsicsCollector: cells[12].makeIntrinsicsCollector.set,
      getGlobalIntrinsics: cells[12].getGlobalIntrinsics.set,
    },
    importMeta: {},
  });
  functors[13]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./permits.js", 11);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[13].default.set,
    },
    importMeta: {},
  });
  functors[14]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[14].default.set,
    },
    importMeta: {},
  });
  functors[15]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[15].default.set,
    },
    importMeta: {},
  });
  functors[16]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[16].default.set,
    },
    importMeta: {},
  });
  functors[17]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[17].default.set,
    },
    importMeta: {},
  });
  functors[18]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      minEnablements: cells[18].minEnablements.set,
      moderateEnablements: cells[18].moderateEnablements.set,
      severeEnablements: cells[18].severeEnablements.set,
    },
    importMeta: {},
  });
  functors[19]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./enablements.js", 18);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[19].default.set,
    },
    importMeta: {},
  });
  functors[20]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[20].default.set,
    },
    importMeta: {},
  });
  functors[21]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeEvalFunction: cells[21].makeEvalFunction.set,
    },
    importMeta: {},
  });
  functors[22]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      makeFunctionConstructor: cells[22].makeFunctionConstructor.set,
    },
    importMeta: {},
  });
  functors[23]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./make-eval-function.js", 21);
      observeImports(map, "./make-function-constructor.js", 22);
      observeImports(map, "./permits.js", 11);
    },
    liveVar: {
    },
    onceVar: {
      setGlobalObjectSymbolUnscopables: cells[23].setGlobalObjectSymbolUnscopables.set,
      setGlobalObjectConstantProperties: cells[23].setGlobalObjectConstantProperties.set,
      setGlobalObjectMutableProperties: cells[23].setGlobalObjectMutableProperties.set,
      setGlobalObjectEvaluators: cells[23].setGlobalObjectEvaluators.set,
    },
    importMeta: {},
  });
  functors[24]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      alwaysThrowHandler: cells[24].alwaysThrowHandler.set,
      strictScopeTerminatorHandler: cells[24].strictScopeTerminatorHandler.set,
      strictScopeTerminator: cells[24].strictScopeTerminator.set,
    },
    importMeta: {},
  });
  functors[25]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./strict-scope-terminator.js", 24);
    },
    liveVar: {
    },
    onceVar: {
      createSloppyGlobalsScopeTerminator: cells[25].createSloppyGlobalsScopeTerminator.set,
    },
    importMeta: {},
  });
  functors[26]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      makeEvalScopeKit: cells[26].makeEvalScopeKit.set,
    },
    importMeta: {},
  });
  functors[27]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      getSourceURL: cells[27].getSourceURL.set,
    },
    importMeta: {},
  });
  functors[28]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./get-source-url.js", 27);
    },
    liveVar: {
    },
    onceVar: {
      rejectHtmlComments: cells[28].rejectHtmlComments.set,
      evadeHtmlCommentTest: cells[28].evadeHtmlCommentTest.set,
      rejectImportExpressions: cells[28].rejectImportExpressions.set,
      evadeImportExpressionTest: cells[28].evadeImportExpressionTest.set,
      rejectSomeDirectEvalExpressions: cells[28].rejectSomeDirectEvalExpressions.set,
      mandatoryTransforms: cells[28].mandatoryTransforms.set,
      applyTransforms: cells[28].applyTransforms.set,
      transforms: cells[28].transforms.set,
    },
    importMeta: {},
  });
  functors[29]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      isValidIdentifierName: cells[29].isValidIdentifierName.set,
      getScopeConstants: cells[29].getScopeConstants.set,
    },
    importMeta: {},
  });
  functors[30]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./scope-constants.js", 29);
    },
    liveVar: {
    },
    onceVar: {
      makeEvaluate: cells[30].makeEvaluate.set,
    },
    importMeta: {},
  });
  functors[31]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./strict-scope-terminator.js", 24);
      observeImports(map, "./sloppy-globals-scope-terminator.js", 25);
      observeImports(map, "./eval-scope.js", 26);
      observeImports(map, "./transforms.js", 28);
      observeImports(map, "./make-evaluate.js", 30);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      makeSafeEvaluator: cells[31].makeSafeEvaluator.set,
    },
    importMeta: {},
  });
  functors[32]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      tameFunctionToString: cells[32].tameFunctionToString.set,
    },
    importMeta: {},
  });
  functors[33]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      tameDomains: cells[33].tameDomains.set,
    },
    importMeta: {},
  });
  functors[34]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
      observeImports(map, "./types.js", 6);
      observeImports(map, "./internal-types.js", 7);
    },
    liveVar: {
    },
    onceVar: {
      makeLoggingConsoleKit: cells[34].makeLoggingConsoleKit.set,
      makeCausalConsole: cells[34].makeCausalConsole.set,
      filterConsole: cells[34].filterConsole.set,
      consoleWhitelist: cells[34].consoleWhitelist.set,
    },
    importMeta: {},
  });
  functors[35]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      makeRejectionHandlers: cells[35].makeRejectionHandlers.set,
    },
    importMeta: {},
  });
  functors[36]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
      observeImports(map, "./assert.js", 9);
      observeImports(map, "./console.js", 34);
      observeImports(map, "./unhandled-rejection.js", 35);
      observeImports(map, "./types.js", 6);
      observeImports(map, "./internal-types.js", 7);
    },
    liveVar: {
    },
    onceVar: {
      tameConsole: cells[36].tameConsole.set,
    },
    importMeta: {},
  });
  functors[37]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      filterFileName: cells[37].filterFileName.set,
      shortenCallSiteString: cells[37].shortenCallSiteString.set,
      tameV8ErrorConstructor: cells[37].tameV8ErrorConstructor.set,
    },
    importMeta: {},
  });
  functors[38]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "../commons.js", 1);
      observeImports(map, "../permits.js", 11);
      observeImports(map, "./tame-v8-error-constructor.js", 37);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[38].default.set,
    },
    importMeta: {},
  });
  functors[39]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      makeAlias: cells[39].makeAlias.set,
      load: cells[39].load.set,
    },
    importMeta: {},
  });
  functors[40]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./module-load.js", 39);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
      deferExports: cells[40].deferExports.set,
      getDeferredExports: cells[40].getDeferredExports.set,
    },
    importMeta: {},
  });
  functors[41]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./transforms.js", 28);
      observeImports(map, "./make-safe-evaluator.js", 31);
    },
    liveVar: {
    },
    onceVar: {
      provideCompartmentEvaluator: cells[41].provideCompartmentEvaluator.set,
      compartmentEvaluate: cells[41].compartmentEvaluate.set,
    },
    importMeta: {},
  });
  functors[42]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./error/assert.js", 9);
      observeImports(map, "./module-proxy.js", 40);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./compartment-evaluate.js", 41);
    },
    liveVar: {
    },
    onceVar: {
      makeThirdPartyModuleInstance: cells[42].makeThirdPartyModuleInstance.set,
      makeModuleInstance: cells[42].makeModuleInstance.set,
    },
    importMeta: {},
  });
  functors[43]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./error/assert.js", 9);
      observeImports(map, "./module-instance.js", 42);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      link: cells[43].link.set,
      instantiate: cells[43].instantiate.set,
    },
    importMeta: {},
  });
  functors[44]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./global-object.js", 23);
      observeImports(map, "./permits.js", 11);
      observeImports(map, "./module-load.js", 39);
      observeImports(map, "./module-link.js", 43);
      observeImports(map, "./module-proxy.js", 40);
      observeImports(map, "./error/assert.js", 9);
      observeImports(map, "./compartment-evaluate.js", 41);
      observeImports(map, "./make-safe-evaluator.js", 31);
    },
    liveVar: {
    },
    onceVar: {
      InertCompartment: cells[44].InertCompartment.set,
      CompartmentPrototype: cells[44].CompartmentPrototype.set,
      makeCompartmentConstructor: cells[44].makeCompartmentConstructor.set,
    },
    importMeta: {},
  });
  functors[45]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./compartment.js", 44);
    },
    liveVar: {
    },
    onceVar: {
      getAnonymousIntrinsics: cells[45].getAnonymousIntrinsics.set,
    },
    importMeta: {},
  });
  functors[46]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      tameHarden: cells[46].tameHarden.set,
    },
    importMeta: {},
  });
  functors[47]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
    },
    liveVar: {
    },
    onceVar: {
      tameSymbolConstructor: cells[47].tameSymbolConstructor.set,
    },
    importMeta: {},
  });
  functors[48]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 4);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./make-hardener.js", 10);
      observeImports(map, "./intrinsics.js", 12);
      observeImports(map, "./permits-intrinsics.js", 13);
      observeImports(map, "./tame-function-constructors.js", 14);
      observeImports(map, "./tame-date-constructor.js", 15);
      observeImports(map, "./tame-math-object.js", 16);
      observeImports(map, "./tame-regexp-constructor.js", 17);
      observeImports(map, "./enable-property-overrides.js", 19);
      observeImports(map, "./tame-locale-methods.js", 20);
      observeImports(map, "./global-object.js", 23);
      observeImports(map, "./make-safe-evaluator.js", 31);
      observeImports(map, "./permits.js", 11);
      observeImports(map, "./tame-function-tostring.js", 32);
      observeImports(map, "./tame-domains.js", 33);
      observeImports(map, "./error/tame-console.js", 36);
      observeImports(map, "./error/tame-error-constructor.js", 38);
      observeImports(map, "./error/assert.js", 9);
      observeImports(map, "./get-anonymous-intrinsics.js", 45);
      observeImports(map, "./compartment.js", 44);
      observeImports(map, "./tame-harden.js", 46);
      observeImports(map, "./tame-symbol-constructor.js", 47);
    },
    liveVar: {
    },
    onceVar: {
      repairIntrinsics: cells[48].repairIntrinsics.set,
    },
    importMeta: {},
  });
  functors[49]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./assert-sloppy-mode.js", 2);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./lockdown.js", 48);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[50]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./compartment.js", 44);
      observeImports(map, "./tame-function-tostring.js", 32);
      observeImports(map, "./intrinsics.js", 12);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[51]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./commons.js", 1);
      observeImports(map, "./error/assert.js", 9);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[52]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/lockdown-shim.js", 49);
      observeImports(map, "./src/compartment-shim.js", 50);
      observeImports(map, "./src/assert-shim.js", 51);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[53]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/env-options", 4);
    },
    liveVar: {
    },
    onceVar: {
      trackTurns: cells[53].trackTurns.set,
    },
    importMeta: {},
  });
  functors[54]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      getMethodNames: cells[54].getMethodNames.set,
      localApplyFunction: cells[54].localApplyFunction.set,
      localApplyMethod: cells[54].localApplyMethod.set,
      localGet: cells[54].localGet.set,
    },
    importMeta: {},
  });
  functors[55]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makePostponedHandler: cells[55].makePostponedHandler.set,
    },
    importMeta: {},
  });
  functors[56]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./track-turns.js", 53);
      observeImports(map, "./local.js", 54);
      observeImports(map, "./postponed.js", 55);
    },
    liveVar: {
    },
    onceVar: {
      makeHandledPromise: cells[56].makeHandledPromise.set,
    },
    importMeta: {},
  });
  functors[57]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/handled-promise.js", 56);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[58]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      race: cells[58].memoRace.set,
    },
    importMeta: {},
  });
  functors[59]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/memo-race.js", 58);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[60]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[60].default.set,
    },
    importMeta: {},
  });
  functors[61]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "ses", 52);
      observeImports(map, "./post.js", 60);
    },
    liveVar: {
    },
    onceVar: {
      lockdown: cells[61].lockdown.set,
    },
    importMeta: {},
  });
  functors[62]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./pre.js", 61);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  wrapCjsFunctor(63)({imports: {}});
  wrapCjsFunctor(64)({imports: {"has-symbols/shams":63}});
  wrapCjsFunctor(65)({imports: {"./shams":63}});
  wrapCjsFunctor(66)({imports: {}});
  wrapCjsFunctor(67)({imports: {"./implementation":66}});
  wrapCjsFunctor(68)({imports: {"function-bind":67}});
  wrapCjsFunctor(69)({imports: {"has-symbols":65,"function-bind":67,"has":68}});
  wrapCjsFunctor(70)({imports: {"function-bind":67,"get-intrinsic":69}});
  wrapCjsFunctor(71)({imports: {"get-intrinsic":69,"./":70}});
  wrapCjsFunctor(72)({imports: {"has-tostringtag/shams":64,"call-bind/callBound":71}});
  wrapCjsFunctor(73)({imports: {"has-tostringtag/shams":64}});
  wrapCjsFunctor(74)({imports: {}});
  wrapCjsFunctor(75)({imports: {"is-callable":74}});
  wrapCjsFunctor(76)({imports: {}});
  wrapCjsFunctor(77)({imports: {"get-intrinsic":69}});
  wrapCjsFunctor(78)({imports: {"for-each":75,"available-typed-arrays":76,"call-bind/callBound":71,"has-tostringtag/shams":64,"gopd":77}});
  wrapCjsFunctor(79)({imports: {"for-each":75,"available-typed-arrays":76,"call-bind/callBound":71,"gopd":77,"has-tostringtag/shams":64,"is-typed-array":78}});
  wrapCjsFunctor(80)({imports: {"is-arguments":72,"is-generator-function":73,"which-typed-array":79,"is-typed-array":78}});
  wrapCjsFunctor(81)({imports: {}});
  wrapCjsFunctor(82)({imports: {}});
  wrapCjsFunctor(83)({imports: {"util":84,"./inherits_browser.js":82}});
  wrapCjsFunctor(84)({imports: {"./support/types":80,"./support/isBuffer":81,"inherits":83}});
  wrapCjsFunctor(85)({imports: {}});
  wrapCjsFunctor(86)({imports: {"util":84}});
  wrapCjsFunctor(87)({imports: {"./util.inspect":86}});
  wrapCjsFunctor(88)({imports: {"get-intrinsic":69,"call-bind/callBound":71,"object-inspect":87}});
  wrapCjsFunctor(89)({imports: {}});
  wrapCjsFunctor(90)({imports: {"./formats":89}});
  wrapCjsFunctor(91)({imports: {"side-channel":88,"./utils":90,"./formats":89}});
  wrapCjsFunctor(92)({imports: {"./utils":90}});
  wrapCjsFunctor(93)({imports: {"./stringify":91,"./parse":92,"./formats":89}});
  wrapCjsFunctor(94)({imports: {"punycode":85,"qs":93}});
  functors[95]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeReleasingExecutorKit: cells[95].makeReleasingExecutorKit.set,
    },
    importMeta: {},
  });
  functors[96]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      isPromise: cells[96].isPromise.set,
    },
    importMeta: {},
  });
  functors[97]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[98]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/promise-executor-kit.js", 95);
      observeImports(map, "./src/memo-race.js", 58);
      observeImports(map, "./src/is-promise.js", 96);
      observeImports(map, "./src/types.js", 97);
    },
    liveVar: {
    },
    onceVar: {
      makePromiseKit: cells[98].makePromiseKit.set,
      racePromises: cells[98].racePromises.set,
    },
    importMeta: {},
  });
  functors[99]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./track-turns.js", 53);
    },
    liveVar: {
    },
    onceVar: {
      default: cells[99].default.set,
    },
    importMeta: {},
  });
  functors[100]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[101]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./E.js", 99);
      observeImports(map, "./exports.js", 100);
    },
    liveVar: {
    },
    onceVar: {
      hp: cells[101].HandledPromise.set,
      E: cells[101].E.set,
    },
    importMeta: {},
  });
  functors[102]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      hasOwnPropertyOf: cells[102].hasOwnPropertyOf.set,
      isObject: cells[102].isObject.set,
      isTypedArray: cells[102].isTypedArray.set,
      PASS_STYLE: cells[102].PASS_STYLE.set,
      canBeMethod: cells[102].canBeMethod.set,
      assertChecker: cells[102].assertChecker.set,
      checkNormalProperty: cells[102].checkNormalProperty.set,
      getTag: cells[102].getTag.set,
      checkPassStyle: cells[102].checkPassStyle.set,
      checkTagRecord: cells[102].checkTagRecord.set,
      checkFunctionTagRecord: cells[102].checkFunctionTagRecord.set,
    },
    importMeta: {},
  });
  functors[103]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      assertIface: cells[103].assertIface.set,
      getInterfaceOf: cells[103].getInterfaceOf.set,
      RemotableHelper: cells[103].RemotableHelper.set,
    },
    importMeta: {},
  });
  functors[104]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
      observeImports(map, "./remotable.js", 103);
    },
    liveVar: {
    },
    onceVar: {
      Remotable: cells[104].Remotable.set,
      Far: cells[104].Far.set,
      ToFarFunction: cells[104].ToFarFunction.set,
    },
    importMeta: {},
  });
  functors[105]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./make-far.js", 104);
    },
    liveVar: {
    },
    onceVar: {
      mapIterable: cells[105].mapIterable.set,
      filterIterable: cells[105].filterIterable.set,
    },
    importMeta: {},
  });
  functors[106]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      getErrorConstructor: cells[106].getErrorConstructor.set,
      isErrorLike: cells[106].isErrorLike.set,
      ErrorHelper: cells[106].ErrorHelper.set,
      toPassableError: cells[106].toPassableError.set,
    },
    importMeta: {},
  });
  functors[107]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      isPassableSymbol: cells[107].isPassableSymbol.set,
      assertPassableSymbol: cells[107].assertPassableSymbol.set,
      nameForPassableSymbol: cells[107].nameForPassableSymbol.set,
      passableSymbolForName: cells[107].passableSymbolForName.set,
    },
    importMeta: {},
  });
  functors[108]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      CopyArrayHelper: cells[108].CopyArrayHelper.set,
    },
    importMeta: {},
  });
  functors[109]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      CopyRecordHelper: cells[109].CopyRecordHelper.set,
    },
    importMeta: {},
  });
  functors[110]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      TaggedHelper: cells[110].TaggedHelper.set,
    },
    importMeta: {},
  });
  functors[111]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/promise-kit", 98);
      observeImports(map, "./passStyle-helpers.js", 102);
    },
    liveVar: {
    },
    onceVar: {
      isSafePromise: cells[111].isSafePromise.set,
      assertSafePromise: cells[111].assertSafePromise.set,
    },
    importMeta: {},
  });
  functors[112]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/promise-kit", 98);
      observeImports(map, "./passStyle-helpers.js", 102);
      observeImports(map, "./copyArray.js", 108);
      observeImports(map, "./copyRecord.js", 109);
      observeImports(map, "./tagged.js", 110);
      observeImports(map, "./error.js", 106);
      observeImports(map, "./remotable.js", 103);
      observeImports(map, "./symbol.js", 107);
      observeImports(map, "./safe-promise.js", 111);
    },
    liveVar: {
    },
    onceVar: {
      passStyleOf: cells[112].passStyleOf.set,
      assertPassable: cells[112].assertPassable.set,
    },
    importMeta: {},
  });
  functors[113]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyle-helpers.js", 102);
      observeImports(map, "./passStyleOf.js", 112);
    },
    liveVar: {
    },
    onceVar: {
      makeTagged: cells[113].makeTagged.set,
    },
    importMeta: {},
  });
  functors[114]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./passStyleOf.js", 112);
    },
    liveVar: {
    },
    onceVar: {
      isCopyArray: cells[114].isCopyArray.set,
      isRecord: cells[114].isRecord.set,
      isRemotable: cells[114].isRemotable.set,
      assertCopyArray: cells[114].assertCopyArray.set,
      assertRecord: cells[114].assertRecord.set,
      assertRemotable: cells[114].assertRemotable.set,
    },
    importMeta: {},
  });
  functors[115]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[116]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/iter-helpers.js", 105);
      observeImports(map, "./src/passStyle-helpers.js", 102);
      observeImports(map, "./src/error.js", 106);
      observeImports(map, "./src/remotable.js", 103);
      observeImports(map, "./src/symbol.js", 107);
      observeImports(map, "./src/passStyleOf.js", 112);
      observeImports(map, "./src/makeTagged.js", 113);
      observeImports(map, "./src/make-far.js", 104);
      observeImports(map, "./src/typeGuards.js", 114);
      observeImports(map, "./src/types.js", 115);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[117]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/eventual-send", 101);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[118]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      isNat: cells[118].isNat.set,
      Nat: cells[118].Nat.set,
    },
    importMeta: {},
  });
  functors[119]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/eventual-send", 101);
      observeImports(map, "@endo/promise-kit", 98);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
      deeplyFulfilled: cells[119].deeplyFulfilled.set,
    },
    importMeta: {},
  });
  functors[120]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
      QCLASS: cells[120].QCLASS.set,
      makeEncodeToCapData: cells[120].makeEncodeToCapData.set,
      makeDecodeFromCapData: cells[120].makeDecodeFromCapData.set,
    },
    importMeta: {},
  });
  functors[121]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
      makeEncodeToSmallcaps: cells[121].makeEncodeToSmallcaps.set,
      makeDecodeFromSmallcaps: cells[121].makeDecodeFromSmallcaps.set,
    },
    importMeta: {},
  });
  functors[122]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/nat", 118);
      observeImports(map, "@endo/pass-style", 116);
      observeImports(map, "./encodeToCapData.js", 120);
      observeImports(map, "./encodeToSmallcaps.js", 121);
    },
    liveVar: {
    },
    onceVar: {
      makeMarshal: cells[122].makeMarshal.set,
    },
    importMeta: {},
  });
  functors[123]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./marshal.js", 122);
    },
    liveVar: {
    },
    onceVar: {
      stringify: cells[123].stringify.set,
      parse: cells[123].parse.set,
    },
    importMeta: {},
  });
  functors[124]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/nat", 118);
      observeImports(map, "@endo/pass-style", 116);
      observeImports(map, "./encodeToCapData.js", 120);
    },
    liveVar: {
    },
    onceVar: {
      decodeToJustin: cells[124].decodeToJustin.set,
    },
    importMeta: {},
  });
  functors[125]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
      recordNames: cells[125].recordNames.set,
      recordValues: cells[125].recordValues.set,
      zeroPad: cells[125].zeroPad.set,
      makeEncodePassable: cells[125].makeEncodePassable.set,
      makeDecodePassable: cells[125].makeDecodePassable.set,
      isEncodedRemotable: cells[125].isEncodedRemotable.set,
      passStylePrefixes: cells[125].passStylePrefixes.set,
    },
    importMeta: {},
  });
  functors[126]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/pass-style", 116);
      observeImports(map, "./encodePassable.js", 125);
    },
    liveVar: {
    },
    onceVar: {
      trivialComparator: cells[126].trivialComparator.set,
      getPassStyleCover: cells[126].getPassStyleCover.set,
      makeComparatorKit: cells[126].makeComparatorKit.set,
      comparatorMirrorImage: cells[126].comparatorMirrorImage.set,
      isRankSorted: cells[126].isRankSorted.set,
      assertRankSorted: cells[126].assertRankSorted.set,
      sortByRank: cells[126].sortByRank.set,
      getIndexCover: cells[126].getIndexCover.set,
      FullRankCover: cells[126].FullRankCover.set,
      coveredEntries: cells[126].coveredEntries.set,
      unionRankCovers: cells[126].unionRankCovers.set,
      intersectRankCovers: cells[126].intersectRankCovers.set,
      compareRank: cells[126].compareRank.set,
      compareAntiRank: cells[126].compareAntiRank.set,
      makeFullOrderComparatorKit: cells[126].makeFullOrderComparatorKit.set,
    },
    importMeta: {},
  });
  functors[127]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[128]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./src/deeplyFulfilled.js", 119);
      observeImports(map, "./src/encodeToCapData.js", 120);
      observeImports(map, "./src/marshal.js", 122);
      observeImports(map, "./src/marshal-stringify.js", 123);
      observeImports(map, "./src/marshal-justin.js", 124);
      observeImports(map, "./src/encodePassable.js", 125);
      observeImports(map, "./src/rankOrder.js", 126);
      observeImports(map, "./src/types.js", 127);
      observeImports(map, "@endo/pass-style", 116);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[129]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[130]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./types.js", 129);
    },
    liveVar: {
    },
    onceVar: {
      nearTrapImpl: cells[130].nearTrapImpl.set,
      makeTrap: cells[130].makeTrap.set,
    },
    importMeta: {},
  });
  functors[131]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/marshal", 128);
    },
    liveVar: {
    },
    onceVar: {
      makeFinalizingMap: cells[131].makeFinalizingMap.set,
    },
    importMeta: {},
  });
  functors[132]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/marshal", 128);
      observeImports(map, "@endo/eventual-send", 101);
      observeImports(map, "@endo/promise-kit", 98);
      observeImports(map, "./trap.js", 130);
      observeImports(map, "./types.js", 129);
      observeImports(map, "./finalize.js", 131);
    },
    liveVar: {
        E: cells[132].E.set,
  },
    onceVar: {
      makeCapTP: cells[132].makeCapTP.set,
    },
    importMeta: {},
  });
  functors[133]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/marshal", 128);
      observeImports(map, "./captp.js", 132);
      observeImports(map, "./trap.js", 130);
      observeImports(map, "./finalize.js", 131);
    },
    liveVar: {
        E: cells[133].E.set,
  },
    onceVar: {
      makeLoopback: cells[133].makeLoopback.set,
    },
    importMeta: {},
  });
  functors[134]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      MIN_DATA_BUFFER_LENGTH: cells[134].MIN_DATA_BUFFER_LENGTH.set,
      TRANSFER_OVERHEAD_LENGTH: cells[134].TRANSFER_OVERHEAD_LENGTH.set,
      MIN_TRANSFER_BUFFER_LENGTH: cells[134].MIN_TRANSFER_BUFFER_LENGTH.set,
      makeAtomicsTrapHost: cells[134].makeAtomicsTrapHost.set,
      makeAtomicsTrapGuest: cells[134].makeAtomicsTrapGuest.set,
    },
    importMeta: {},
  });
  functors[135]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/nat", 118);
      observeImports(map, "@endo/marshal", 128);
      observeImports(map, "./captp.js", 132);
      observeImports(map, "./loopback.js", 133);
      observeImports(map, "./atomics.js", 134);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[136]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/eventual-send", 101);
      observeImports(map, "@endo/promise-kit", 98);
    },
    liveVar: {
    },
    onceVar: {
      makeQueue: cells[136].makeQueue.set,
      makeStream: cells[136].makeStream.set,
      makePipe: cells[136].makePipe.set,
      pump: cells[136].pump.set,
      prime: cells[136].prime.set,
      mapReader: cells[136].mapReader.set,
      mapWriter: cells[136].mapWriter.set,
    },
    importMeta: {},
  });
  functors[137]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeNetstringReader: cells[137].makeNetstringReader.set,
      netstringReader: cells[137].netstringReader.set,
    },
    importMeta: {},
  });
  functors[138]({
    imports(entries) {
      const map = new Map(entries);
    },
    liveVar: {
    },
    onceVar: {
      makeNetstringWriter: cells[138].makeNetstringWriter.set,
      netstringWriter: cells[138].netstringWriter.set,
    },
    importMeta: {},
  });
  functors[139]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./reader.js", 137);
      observeImports(map, "./writer.js", 138);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });
  functors[140]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/captp", 135);
      observeImports(map, "@endo/stream", 136);
      observeImports(map, "@endo/netstring", 139);
    },
    liveVar: {
    },
    onceVar: {
      makeMessageCapTP: cells[140].makeMessageCapTP.set,
      messageToBytes: cells[140].messageToBytes.set,
      bytesToMessage: cells[140].bytesToMessage.set,
      makeNetstringCapTP: cells[140].makeNetstringCapTP.set,
    },
    importMeta: {},
  });
  functors[141]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/far", 117);
      observeImports(map, "./connection.js", 140);
    },
    liveVar: {
    },
    onceVar: {
      makeWorkerFacet: cells[141].makeWorkerFacet.set,
      main: cells[141].main.set,
    },
    importMeta: {},
  });
  functors[142]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "@endo/stream", 136);
    },
    liveVar: {
    },
    onceVar: {
      makeWebWorkerWriter: cells[142].makeWebWorkerWriter.set,
      makeWebWorkerReader: cells[142].makeWebWorkerReader.set,
    },
    importMeta: {},
  });
  functors[143]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./web-worker-util.js", 142);
    },
    liveVar: {
    },
    onceVar: {
      makePowers: cells[143].makePowers.set,
    },
    importMeta: {},
  });
  functors[144]({
    imports(entries) {
      const map = new Map(entries);
      observeImports(map, "./environment.js", 0);
      observeImports(map, "ses", 52);
      observeImports(map, "@endo/eventual-send/shim.js", 57);
      observeImports(map, "@endo/promise-kit/shim.js", 59);
      observeImports(map, "@endo/lockdown/commit.js", 62);
      observeImports(map, "fs", 84);
      observeImports(map, "url", 94);
      observeImports(map, "@endo/promise-kit", 98);
      observeImports(map, "../worker.js", 141);
      observeImports(map, "./worker-web-powers.js", 143);
    },
    liveVar: {
    },
    onceVar: {
    },
    importMeta: {},
  });

  return cells[cells.length - 1]['*'].get();
})();
