// @ts-check
/**
 * Based on the WobblyPoint inheritance examples in
 * https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/google-caja/caja-spec-2007-12-21.pdf
 * and
 * test-far-wobbly-point.js
 */

/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
/* eslint-disable-next-line import/order */
import { test } from './prepare-test-env-ava.js';

// eslint-disable-next-line import/order
import { getMethodNames } from '@endo/eventual-send/utils.js';
import {
  passStyleOf,
  Far,
  GET_METHOD_NAMES,
  PASS_STYLE,
} from '@endo/pass-style';
import { M } from '@endo/patterns';
import { defendPrototype } from '../src/exo-tools.js';
import { makeSelf } from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/get-interface.js';

const { Fail, quote: q } = assert;
const { apply, getPrototypeOf, setPrototypeOf, defineProperty } = Reflect;
const {
  create,
  seal,
  freeze,
  defineProperties,
  getOwnPropertyDescriptors,
  prototype: objectPrototype,
} = Object;

/**
 * @import { ContextProvider, ClassContext } from '../src/exo-tools.js';
 * @import { Guarded } from '../src/exo-makers.js';
 */

const ExoEmptyI = M.interface('ExoEmpty', {});

/**
 * @template {Record<string,any>} S
 * @param {S} state
 * @returns {S}
 */
const makeHardenedState = state =>
  harden(
    create(
      null,
      Object.fromEntries(
        Reflect.ownKeys(state).map(
          /** @param {keyof S} key */
          // @ts-expect-error ownKeys has bad typing
          key => [
            key,
            {
              get() {
                return state[key];
              },
              set(value) {
                state[key] = value;
              },
            },
          ],
        ),
      ),
    ),
  );

/** @type {Record<string, any>} */
const dummyStateTarget = freeze({});

const makeState = () => {
  /** @type {Record<string, any>} */
  const state = {};
  const stateProxy = new Proxy(dummyStateTarget, {
    get(target, prop, receiver) {
      return Reflect.get(state, prop);
    },
    set(target, prop, value, receiver) {
      return Reflect.set(state, prop, value);
    },
    deleteProperty(target, prop) {
      return Reflect.deleteProperty(state, prop);
    },
  });
  const sealer = () => {
    seal(state);
    return makeHardenedState(state);
  };
  return { state: stateProxy, sealer };
};

const pendingConstruct = new WeakMap();

const makeTarget = () =>
  function target() {
    Fail`Should not call the target`;
  };

/**
 * @template {[] | any[]} A
 * @template {object} C
 * @typedef {{(...args: A): C, new(...args: A): C}} CallableConstructor
 */

/**
 * @template {{new (...args: any[]): Record<PropertyKey, CallableFunction>; implements?: any}} T
 * @param {string} tag
 * @param {ContextProvider} contextProvider
 * @param {T} constructor
 */
const defendClassProto = (tag, contextProvider, constructor) => {
  const protoProto = defendPrototype(
    tag,
    contextProvider,
    create(constructor.prototype, {
      // Hide inherited GET_INTERFACE_GUARD
      // Not sure why defendPrototype uses it if it exists
      [GET_INTERFACE_GUARD]: { value: undefined },
      // Hide inherited GET_METHOD_NAMES
      // so it gets redefined
      [GET_METHOD_NAMES]: { value: undefined },
    }),
    true,
    constructor.implements,
  );

  const proto = create(
    getPrototypeOf(constructor.prototype),
    getOwnPropertyDescriptors(protoProto),
  );
  defineProperty(proto, Symbol.toStringTag, {
    value: protoProto[Symbol.toStringTag],
  });

  // do not harden here to let the caller define constructor
  return proto;
};

/**
 * @template {new (...args: any[]) => any} C constructor
 * @param {C} constructor
 * @returns {CallableConstructor<ConstructorParameters<C>, Guarded<InstanceType<C>>>}
 */
export const defineExoClassFromJSClass = constructor => {
  harden(constructor);
  /** @typedef {InstanceType<C>} M */
  /** @typedef {ClassContext<Record<string,any>, M>} Context */
  /** @type {WeakMap<M,Context>} */
  const contextMap = new WeakMap();
  const tag = constructor.name;
  const proto = defendClassProto(
    tag,
    self => /** @type {any} */ (contextMap.get(self)),
    constructor,
  );

  let instanceCount = 0;

  const makeContext = registerHooks => {
    instanceCount += 1;
    const { state, sealer } = makeState();
    const self = makeSelf(proto, instanceCount);
    // It's safe to harden the state record
    /** @type {Context} */
    const context = harden({ state, self });
    contextMap.set(self, context);
    for (const hook of registerHooks) {
      hook(null, context);
    }
    return { context, sealer };
  };

  const registerContext = (finalContext, initContext) => {
    if (finalContext) {
      contextMap.delete(initContext) || Fail`initContext didn't exist`;
    }
    const context = finalContext || initContext;
    !contextMap.has(context) || Fail`context already registered`;
    contextMap.set(context, context);
  };

  /**
   * @param  {ConstructorParameters<C>} args
   */
  const makeInstance = function (...args) {
    if (new.target && new.target !== makeInstance) {
      const pending = pendingConstruct.get(new.target);

      pending || Fail`Not constructing an Exo class`;
      pending.registerHooks.push(registerContext);

      return Reflect.construct(constructor, args, new.target);
    }
    const target = makeTarget();
    const pending = {
      makeContext,
      registerHooks: [registerContext],
      sealer: /** @type {ReturnType<typeof makeContext>['sealer'] | null} */ (
        null
      ),
    };
    pendingConstruct.set(target, pending);

    try {
      /** @type {Context} */
      const context = Reflect.construct(constructor, args, target);
      if (!pending.sealer) {
        throw Fail`Exo ${q(tag)} constructor did not call ExoBaseClass`;
      }
      const state = pending.sealer();
      context || Fail`Exo ${q(tag)} constructor did not return a context`;
      const { self } = context;
      (contextMap.get(self) === context && self !== context) ||
        Fail`Exo ${q(tag)} constructor did not return a valid context`;
      const newContext = harden({ state, self });
      contextMap.set(self, newContext);
      for (const hook of pending.registerHooks) {
        hook(newContext, context);
      }
      return self;
    } finally {
      pendingConstruct.delete(target);
    }
  };
  setPrototypeOf(makeInstance, getPrototypeOf(constructor));
  defineProperty(makeInstance, 'prototype', {
    value: proto,
    configurable: false,
    writable: false,
  });
  const originalConstructorProps = getOwnPropertyDescriptors(constructor);
  delete originalConstructorProps.prototype;
  defineProperties(makeInstance, originalConstructorProps);

  // TODO: fidelity wants a constructor, but real constructor
  // is a capability leak
  // defineProperty(proto, 'constructor', { value: makeInstance });

  // @ts-expect-error CallableConstructor
  return harden(makeInstance);
};
harden(defineExoClassFromJSClass);

/**
 * @template {any} [M=any]
 * @template {Record<string, any>} [S=Record<string,any>]
 */
class ExoBaseClass {
  static implements = ExoEmptyI;

  //  To partially help TypeScript for now
  // Has no impact on actual runtime

  /** @type {S} */
  state;

  /** @type {M} */
  self;

  constructor() {
    const pending = pendingConstruct.get(new.target);
    pending ||
      Fail`Not constructed through Exo maker: ${q(
        (new.target || this.constructor || { name: 'Unknown' }).name,
      )}`;
    !pending.sealer || Fail`Already constructed`;

    const { context, sealer } = pending.makeContext(pending.registerHooks);
    pending.sealer = sealer;
    // eslint-disable-next-line no-constructor-return
    return context;
  }
}

setPrototypeOf(
  ExoBaseClass.prototype,
  create(objectPrototype, {
    [PASS_STYLE]: { value: 'remotable' },
    [Symbol.toStringTag]: { value: 'Remotable' },
  }),
);
harden(ExoBaseClass);

const ExoPointI = M.interface('ExoPoint', {
  toString: M.call().returns(M.string()),
  getX: M.call().returns(M.gte(0)),
  getY: M.call().returns(M.number()),
  setY: M.call(M.number()).returns(),
});

class ExoAbstractPoint extends ExoBaseClass {
  static implements = ExoPointI;

  toString() {
    const { self } = this;
    return `<${self.getX()},${self.getY()}>`;
  }
}

test('cannot make abstract class concrete', t => {
  t.throws(() => defineExoClassFromJSClass(ExoAbstractPoint), {
    message:
      'methods ["getX","getY","setY"] not implemented by "ExoAbstractPoint"',
  });
});

// Would look a lot nicer with a class decorator
const ExoPoint = defineExoClassFromJSClass(
  class ExoPoint extends ExoAbstractPoint {
    constructor(x, y) {
      super();
      this.state.x = x;
      this.state.y = y;
    }

    getX() {
      const {
        state: { x },
      } = this;
      return x;
    }

    getY() {
      const {
        state: { y },
      } = this;
      return y;
    }

    setY(newY) {
      const { state } = this;
      state.y = newY;
    }
  },
);

const assertMethodNames = (t, obj, names) => {
  t.deepEqual(getMethodNames(obj), names);
  t.deepEqual(obj[GET_METHOD_NAMES](), names);
};

test('defineExoClassFromJSClass requires ExoBaseClass', t => {
  const Foo = defineExoClassFromJSClass(class Foo {});
  t.throws(() => Foo());
  t.throws(() => new Foo());
});

/**
 *
 * @param {import('ava').ExecutionContext} t
 * @param {InstanceType<typeof ExoPoint>} pt
 * @param {{x: number, y:number}} values
 */
const assertPoint = (t, pt, values) => {
  t.is(passStyleOf(pt), 'remotable');
  t.true(pt instanceof ExoPoint);
  t.true(pt instanceof ExoAbstractPoint);
  t.true(pt instanceof ExoBaseClass);
  assertMethodNames(t, pt, [
    GET_INTERFACE_GUARD,
    GET_METHOD_NAMES,
    'constructor',
    'getX',
    'getY',
    'setY',
    'toString',
  ]);
  t.is(pt.getX(), values.x);
  t.is(pt.getY(), values.y);
  t.is(`${pt}`, `<${values.x},${values.y}>`);
  pt.setY(values.y + 1);
  t.is(`${pt}`, `<${values.x},${values.y + 1}>`);
};

test('ExoPoint instances', t => {
  const pt = ExoPoint(3, 5);
  assertPoint(t, pt, { x: 3, y: 5 });

  const newPt = new ExoPoint(1, 2);
  assertPoint(t, newPt, { x: 1, y: 2 });

  t.is(apply(pt.getX, newPt, []), 1);

  const negPt = ExoPoint(-3, 5);
  t.throws(() => negPt.getX(), {
    message: 'In "getX" method of (ExoPoint): result: -3 - Must be >= 0',
  });
  // `self` calls are guarded
  t.throws(() => `${negPt}`, {
    message: 'In "getX" method of (ExoPoint): result: -3 - Must be >= 0',
  });
});

class ExoAbstractWobblyPoint extends ExoPoint {
  // TODO: "abstract" methods end up on the prototype chain
  // as-is, non-guarded and without brand checks.
  // An attacker could define an exo that extends from this
  // prototype and call it through super.
  toString() {
    return super.toString();
  }
}

const ExoWobblyPoint = defineExoClassFromJSClass(
  class ExoWobblyPoint extends ExoAbstractWobblyPoint {
    constructor(x, y, getWobble) {
      super(x, y);
      this.state.getWobble = getWobble;
    }

    getX() {
      const {
        state: { getWobble },
      } = this;
      return super.getX() + getWobble();
    }
  },
);

test('ExoAbstractWobblyPoint constructor', t => {
  // @ts-expect-error
  t.throws(() => ExoAbstractWobblyPoint(1, 2));
  t.throws(() => new ExoAbstractWobblyPoint(1, 2));
});

test('FarWobblyPoint inheritance', t => {
  let wobble = 0;
  // For heap classes currently, there is no reason to make `getWobble` passable.
  // But other zones insist on at least passability, and TODO we may eventually
  // make the heap zone act like this as well.
  const getWobble = Far('getW', () => (wobble += 1));
  const wpt = ExoWobblyPoint(3, 5, getWobble);
  assertPoint(t, wpt, {
    get x() {
      return 3 + wobble;
    },
    y: 5,
  });
  t.true(wpt instanceof ExoWobblyPoint);
  t.true(wpt instanceof ExoAbstractWobblyPoint);

  const newWpt = new ExoWobblyPoint(3, 5, () => 1);
  assertPoint(t, newWpt, { x: 4, y: 5 });
  t.true(newWpt instanceof ExoWobblyPoint);
  t.true(wpt instanceof ExoAbstractWobblyPoint);

  const pt = ExoPoint(1, 2);
  t.false(pt instanceof ExoWobblyPoint);
  t.throws(() => apply(wpt.getX, pt, []), {
    message:
      '"In \\"getX\\" method of (ExoWobblyPoint)" may only be applied to a valid instance: "[Alleged: ExoPoint]"',
  });
  t.throws(() => apply(wpt.getY, pt, []), {
    message:
      '"In \\"getY\\" method of (ExoWobblyPoint)" may only be applied to a valid instance: "[Alleged: ExoPoint]"',
  });

  t.is(apply(wpt.getX, newWpt, []), 4);

  // This error behavior shows the absence of the security vulnerability
  // explained at the corresponding example in `test-far-wobbly-point.js`
  // for the `@endo/pass-style` / `Far` level of abstraction. At the exo level
  // of abstraction, a raw-method subclass overriding an inherited superclass
  // method denies that method to clients of instances of the subclass.
  // At the same time, this overridden method remains available within
  // the overriding subclass via unguarded `super` calls.
  t.throws(() => apply(pt.getX, newWpt, []), {
    message:
      '"In \\"getX\\" method of (ExoPoint)" may only be applied to a valid instance: "[Alleged: ExoWobblyPoint]"',
  });

  const negWpt1 = ExoWobblyPoint(-3, 5, () => 4);
  // t.is(negWpt1.getX(), 1);
  // TODO?: `super` calls are direct, bypassing guards and sharing context
  // t.is(`${negWpt1}`, '<1,5>');

  const negWpt2 = ExoWobblyPoint(1, 5, () => -4);
  t.throws(() => `${negWpt2}`, {
    // `self` calls are guarded
    message: 'In "getX" method of (ExoWobblyPoint): result: -3 - Must be >= 0',
  });
});
