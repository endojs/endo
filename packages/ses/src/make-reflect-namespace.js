import {
  defineProperties,
  defineProperty,
  objectPrototype,
  Proxy,
} from './commons.js';
import { permitted, ReflectWithMetadata, StandardReflect } from './permits.js';

/**
 * tameReflectMetadata()
 * A tamed version of the native Reflect namespace which accepts reflect-metadata methods
 *
 * @param {import('../types').RepairOptions['reflectMetadataTaming']} reflectMetadataTaming
 * @param {((object: object) => void) | undefined} skipHarden
 */
export const tameReflectMetadata = (reflectMetadataTaming, skipHarden) => {
  const ReflectSpec =
    reflectMetadataTaming === 'none' ? StandardReflect : ReflectWithMetadata;
  permitted['%InitialReflect%'] = ReflectSpec;
  permitted.Reflect = ReflectSpec;

  if (reflectMetadataTaming !== 'mutable-per-global') {
    permitted['%SharedReflect%'] = ReflectWithMetadata;
  }

  if (reflectMetadataTaming === 'none') {
    return {
      Reflect: Reflect,
      '%InitialReflect%': Reflect,
      '%SharedReflect%': Reflect,
    };
  } else if (reflectMetadataTaming === 'unsafe-keep-and-inherit') {
    return {
      Reflect: Reflect,
      '%InitialReflect%': Reflect,
      '%SharedReflect%': Reflect,
    };
  } else {
    const InitialReflect = makeReflectNamespace();
    if (!skipHarden)
      assert.Fail`lockdown(): option reflectMetadataTaming mutable-per-global is not supported when a native harden exists.`;
    else skipHarden(InitialReflect);
    return {
      Reflect: InitialReflect,
      '%InitialReflect%': InitialReflect,
    };
  }
};

const reflectMetadataSymbol = Symbol.for('@reflect-metadata:registry');
/** @type {ProxyHandler<typeof Reflect> & {__proto__: any}} */
const handlers = {
  __proto__: null,
  deleteProperty: (target, prop) => {
    if (isReflectMetadataProp(prop))
      return Reflect.deleteProperty(target, prop);
    if (isNativeReflectProp(prop)) return false;
    return true;
  },
  isExtensible: () => true,
  preventExtensions: () => false,
  getPrototypeOf: () => objectPrototype,
  setPrototypeOf: (_target, proto) => proto === objectPrototype,
  defineProperty: (target, prop, attribute) => {
    if (isReflectMetadataProp(prop) || isNativeReflectProp(prop))
      return Reflect.defineProperty(target, prop, attribute);
    return false;
  },
  set: (target, prop, value, receiver) => {
    if (isReflectMetadataProp(prop))
      return Reflect.set(target, prop, value, receiver);
    return false;
  },
};
const makeReflectNamespace = () => {
  const underlyingReflect = {};
  defineProperties(underlyingReflect, {
    apply: { value: Reflect.apply },
    construct: { value: Reflect.construct },
    defineProperty: { value: Reflect.defineProperty },
    deleteProperty: { value: Reflect.deleteProperty },
    get: { value: Reflect.get },
    getOwnPropertyDescriptor: {
      value: Reflect.getOwnPropertyDescriptor,
    },
    getPrototypeOf: { value: Reflect.getPrototypeOf },
    has: { value: Reflect.has },
    isExtensible: { value: Reflect.isExtensible },
    ownKeys: { value: Reflect.ownKeys },
    preventExtensions: { value: Reflect.preventExtensions },
    set: { value: Reflect.set },
    setPrototypeOf: { value: Reflect.setPrototypeOf },
    [Symbol.toStringTag]: { value: 'Object' },
  });
  return new Proxy(underlyingReflect, handlers);
};

function isReflectMetadataProp(prop) {
  switch (prop) {
    case 'decorate':
    case 'metadata':
    case 'defineMetadata':
    case 'hasMetadata':
    case 'hasOwnMetadata':
    case 'getMetadata':
    case 'getOwnMetadata':
    case 'getMetadataKeys':
    case 'getOwnMetadataKeys':
    case 'deleteMetadata':
    case reflectMetadataSymbol:
      return true;
    default:
      return false;
  }
}
function isNativeReflectProp(prop) {
  switch (prop) {
    case 'apply':
    case 'construct':
    case 'defineProperty':
    case 'deleteProperty':
    case 'get':
    case 'getOwnPropertyDescriptor':
    case 'getPrototypeOf':
    case 'has':
    case 'isExtensible':
    case 'ownKeys':
    case 'preventExtensions':
    case 'set':
    case 'setPrototypeOf':
    case Symbol.toStringTag:
      return true;
    default:
      return false;
  }
}

export const setGlobalObjectReflectNamespace = globalObject => {
  defineProperty(globalObject, 'Reflect', {
    configurable: true,
    writable: true,
    value: makeReflectNamespace(),
  });
};
