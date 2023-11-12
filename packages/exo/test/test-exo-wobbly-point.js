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
import { defineExoClass } from '../src/exo-makers.js';
import { GET_INTERFACE_GUARD } from '../src/get-interface.js';

const { Fail, quote: q } = assert;
const { apply } = Reflect;

const ExoEmptyI = M.interface('ExoEmpty', {});

class ExoBaseClass {
  constructor() {
    Fail`Turn Exo JS classes into Exo classes with defineExoClassFromJSClass: ${q(
      new.target.name,
    )}`;
  }

  static implements = ExoEmptyI;

  static init() {
    return harden({});
  }
}

const defineExoClassFromJSClass = klass =>
  defineExoClass(klass.name, klass.implements, klass.init, klass.prototype);
harden(defineExoClassFromJSClass);

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
  static init(x, y) {
    // Heap exos currently use the returned record directly, so
    // needs to not be frozen for `state.y` to be assignable.
    // TODO not true for other zones. May make heap zone more like
    // the others in treatment of `state`.
    return { x, y };
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

test('ExoPoint instances', t => {
  const pt = makeExoPoint(3, 5);
  t.is(passStyleOf(pt), 'remotable');
  t.false(pt instanceof ExoPoint);
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
  static init(x, y, getWobble) {
    return { ...super.init(x, y), getWobble };
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
