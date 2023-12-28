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
import { passStyleOf, Far, GET_METHOD_NAMES } from '@endo/pass-style';
import { M } from '@endo/patterns';
import { defendPrototype } from '../src/exo-tools.js';
import { makeSelf } from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/get-interface.js';

const { Fail, quote: q } = assert;
const { apply } = Reflect;
const { create, seal, freeze, defineProperty } = Object;

/**
 * @typedef {import('../src/exo-tools.js').FacetName} FacetName
 * @typedef {import('../src/exo-tools.js').Methods} Methods
 */

/**
 * @template [S = any]
 * @template {Methods} [M = any]
 * @typedef {import('../src/exo-tools.js').ClassContext} ClassContext
 */

/**
 * @template {Methods} M
 * @typedef {Farable<M & import('./get-interface.js').GetInterfaceGuard<M>>} Guarded
 */

const ExoEmptyI = M.interface('ExoEmpty', {});

const makeHardenedState = state =>
  harden(
    create(
      null,
      Object.fromEntries(
        Reflect.ownKeys(state).map(key => [
          key,
          {
            get() {
              return state[key];
            },
            set(value) {
              state[key] = value;
            },
          },
        ]),
      ),
    ),
  );
const dummyStateTarget = freeze({});

const makeState = () => {
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
 * @template {new (...args: any[]) => Methods} C constructor
 * @param {C} constructor
 * @returns {(...args: Parameters<C>) => Guarded<InstanceType<C>>}
 */
export const defineExoClassFromJSClass = constructor => {
  harden(constructor);
  /** @type {WeakMap<M,ClassContext<ReturnType<I>, M>>} */
  const contextMap = new WeakMap();
  const tag = constructor.name;
  const proto = defendPrototype(
    tag,
    self => /** @type {any} */ (contextMap.get(self)),
    constructor.prototype,
    true,
    constructor.implements,
  );
  let instanceCount = 0;

  const makeContext = () => {
    instanceCount += 1;
    const { state, sealer } = makeState();
    const self = makeSelf(proto, instanceCount);
    // It's safe to harden the state record
    /** @type {ClassContext<ReturnType<I>,M>} */
    const context = harden({ state, self });
    contextMap.set(self, context);
    return { context, sealer };
  };

  const makeInstance = {
    /**
     * @param  {Parameters<C>} args
     */
    // eslint-disable-next-line object-shorthand, func-names
    [tag]: function (...args) {
      const target = makeTarget();
      defineProperty(target, 'prototype', { value: constructor.prototype });
      const pending = { makeContext, sealer: null };
      pendingConstruct.set(target, pending);

      try {
        const context = Reflect.construct(constructor, args, target);
        pending.sealer ||
          Fail`Exo ${q(tag)} constructor did not call ExoBaseClass`;
        const state = pending.sealer();
        context || Fail`Exo ${q(tag)} constructor did not return a context`;
        const { self } = context;
        contextMap.get(self) === context ||
          Fail`Exo ${q(tag)} constructor did not return a valid context`;
        const newContext = harden({ state, self });
        contextMap.set(self, newContext);
        return self;
      } finally {
        pendingConstruct.delete(target);
      }
    },
  }[tag];
  defineProperty(makeInstance, 'prototype', { value: proto });

  return harden(makeInstance);
};
harden(defineExoClassFromJSClass);

class ExoBaseClass {
  static implements = ExoEmptyI;

  constructor() {
    const pending = pendingConstruct.get(new.target);
    pending ||
      Fail`Not constructed through Exo maker: ${q(
        (new.target || this.constructor || { name: 'Unknown' }).name,
      )}`;
    !pending.sealer || Fail`Already constructed`;

    const { context, sealer } = pending.makeContext();
    pending.sealer = sealer;
    // eslint-disable-next-line no-constructor-return
    return context;
  }
}

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
}
harden(ExoPoint);

const makeExoPoint = defineExoClassFromJSClass(ExoPoint);

const assertMethodNames = (t, obj, names) => {
  t.deepEqual(getMethodNames(obj), names);
  t.deepEqual(obj[GET_METHOD_NAMES](), names);
};

test('ExoPoint constructor', t => {
  t.throws(() => ExoPoint(1, 2));
  t.throws(() => new ExoPoint(1, 2));

  const makeFoo = defineExoClassFromJSClass(class Foo {});
  t.throws(() => makeFoo());
});

test('ExoPoint instances', t => {
  const pt = makeExoPoint(3, 5);
  t.is(passStyleOf(pt), 'remotable');
  t.false(pt instanceof ExoPoint);
  t.true(pt instanceof makeExoPoint);
  assertMethodNames(t, pt, [
    GET_INTERFACE_GUARD,
    GET_METHOD_NAMES,
    'getX',
    'getY',
    'setY',
    'toString',
  ]);
  t.is(pt.getX(), 3);
  t.is(pt.getY(), 5);
  t.is(`${pt}`, '<3,5>');
  pt.setY(6);
  t.is(`${pt}`, '<3,6>');

  const otherPt = makeExoPoint(1, 2);
  t.is(apply(pt.getX, otherPt, []), 1);

  const negPt = makeExoPoint(-3, 5);
  t.throws(() => negPt.getX(), {
    message: 'In "getX" method of (ExoPoint): result: -3 - Must be >= 0',
  });
  // `self` calls are guarded
  t.throws(() => `${negPt}`, {
    message: 'In "getX" method of (ExoPoint): result: -3 - Must be >= 0',
  });
});

class ExoWobblyPoint extends ExoPoint {
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
}
harden(ExoWobblyPoint);

const makeExoWobblyPoint = defineExoClassFromJSClass(ExoWobblyPoint);

test('FarWobblyPoint inheritance', t => {
  let wobble = 0;
  // For heap classes currently, there is no reason to make `getWobble` passable.
  // But other zones insist on at least passability, and TODO we may eventually
  // make the heap zone act like this as well.
  const getWobble = Far('getW', () => (wobble += 1));
  const wpt = makeExoWobblyPoint(3, 5, getWobble);
  t.false(wpt instanceof ExoWobblyPoint);
  t.false(wpt instanceof ExoPoint);
  t.is(passStyleOf(wpt), 'remotable');
  assertMethodNames(t, wpt, [
    GET_INTERFACE_GUARD,
    GET_METHOD_NAMES,
    'getX',
    'getY',
    'setY',
    'toString',
  ]);
  t.is(`${wpt}`, '<4,5>');
  t.is(`${wpt}`, '<5,5>');
  t.is(`${wpt}`, '<6,5>');
  wpt.setY(6);
  t.is(`${wpt}`, '<7,6>');

  const otherPt = makeExoPoint(1, 2);
  t.false(otherPt instanceof ExoWobblyPoint);
  t.throws(() => apply(wpt.getX, otherPt, []), {
    message:
      '"In \\"getX\\" method of (ExoWobblyPoint)" may only be applied to a valid instance: "[Alleged: ExoPoint]"',
  });
  t.throws(() => apply(wpt.getY, otherPt, []), {
    message:
      '"In \\"getY\\" method of (ExoWobblyPoint)" may only be applied to a valid instance: "[Alleged: ExoPoint]"',
  });

  const otherWpt = makeExoWobblyPoint(3, 5, () => 1);
  t.is(`${otherWpt}`, '<4,5>');
  t.is(apply(wpt.getX, otherWpt, []), 4);

  // This error behavior shows the absence of the security vulnerability
  // explained at the corresponding example in `test-far-wobbly-point.js`
  // for the `@endo/pass-style` / `Far` level of abstraction. At the exo level
  // of abstraction, a raw-method subclass overriding an inherited superclass
  // method denies that method to clients of instances of the subclass.
  // At the same time, this overridden method remains available within
  // the overriding subclass via unguarded `super` calls.
  t.throws(() => apply(otherPt.getX, otherWpt, []), {
    message:
      '"In \\"getX\\" method of (ExoPoint)" may only be applied to a valid instance: "[Alleged: ExoWobblyPoint]"',
  });

  const negWpt1 = makeExoWobblyPoint(-3, 5, () => 4);
  t.is(negWpt1.getX(), 1);
  // `super` calls are direct, bypassing guards and sharing context
  t.is(`${negWpt1}`, '<1,5>');

  const negWpt2 = makeExoWobblyPoint(1, 5, () => -4);
  t.throws(() => `${negWpt2}`, {
    // `self` calls are guarded
    message: 'In "getX" method of (ExoWobblyPoint): result: -3 - Must be >= 0',
  });
});
