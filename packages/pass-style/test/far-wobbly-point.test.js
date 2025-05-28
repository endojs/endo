/**
 * Based on the WobblyPoint inheritance examples in
 * https://storage.googleapis.com/google-code-archive-downloads/v2/code.google.com/google-caja/caja-spec-2007-12-21.pdf
 */

/* eslint-disable class-methods-use-this */
/* eslint-disable max-classes-per-file */
import test from '@endo/ses-ava/prepare-endo.js';

import { getMethodNames } from '@endo/eventual-send/utils.js';
import { passStyleOf } from '../src/passStyleOf.js';
import { Far, GET_METHOD_NAMES } from '../src/make-far.js';

const { apply } = Reflect;

/**
 * Classes whose instances should be Far objects may find it convenient to
 * inherit from this base class. Note that the constructor of this base class
 * freezes the instance in an empty state, so all is interesting attributes
 * can only depend on its identity and what it inherits from.
 * This includes private fields, as those are keyed only on
 * this object's identity. However, we discourage (but cannot prevent) such
 * use of private fields, as they cannot easily be refactored into Exo state.
 */
class FarBaseClass {
  constructor() {
    harden(this);
  }
}
Far('FarBaseClass', FarBaseClass.prototype);
harden(FarBaseClass);

class FarPoint extends FarBaseClass {
  #x;

  #y;

  constructor(x, y) {
    super();
    this.#x = x;
    this.#y = y;
  }

  toString() {
    return `<${this.getX()},${this.getY()}>`;
  }

  getX() {
    return this.#x;
  }

  getY() {
    return this.#y;
  }

  setY(newY) {
    this.#y = newY;
  }
}
harden(FarPoint);

const assertMethodNames = (t, obj, names) => {
  t.deepEqual(getMethodNames(obj), names);
  t.deepEqual(obj[GET_METHOD_NAMES](), names);
};

test('FarPoint instances', t => {
  const pt = new FarPoint(3, 5);
  // @ts-expect-error xxx typedef
  t.is(passStyleOf(pt), 'remotable');
  t.assert(pt instanceof FarPoint);
  assertMethodNames(t, pt, [
    GET_METHOD_NAMES,
    'constructor',
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

  const otherPt = new FarPoint(1, 2);
  t.is(apply(pt.getX, otherPt, []), 1);
});

class FarWobblyPoint extends FarPoint {
  #getWobble;

  constructor(x, y, getWobble) {
    super(x, y);
    this.#getWobble = getWobble;
  }

  getX() {
    return super.getX() + this.#getWobble();
  }
}
harden(FarWobblyPoint);

test('FarWobblyPoint inheritance', t => {
  let wobble = 0;
  const getWobble = () => (wobble += 1);
  const wpt = new FarWobblyPoint(3, 5, getWobble);
  t.assert(wpt instanceof FarWobblyPoint);
  t.assert(wpt instanceof FarPoint);
  // @ts-expect-error xxx typedef
  t.is(passStyleOf(wpt), 'remotable');
  assertMethodNames(t, wpt, [
    GET_METHOD_NAMES,
    'constructor',
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

  const otherPt = new FarPoint(1, 2);
  t.false(otherPt instanceof FarWobblyPoint);
  t.throws(() => apply(wpt.getX, otherPt, []), {
    // TODO great error message, but is a golden specific to v8
    message:
      'Cannot read private member #getWobble from an object whose class did not declare it',
  });
  t.is(apply(wpt.getY, otherPt, []), 2);

  const otherWpt = new FarWobblyPoint(3, 5, () => 1);
  t.is(`${otherWpt}`, '<4,5>');
  t.is(apply(wpt.getX, otherWpt, []), 4);

  // This test, though correct, demonstrates a sucurity weakness of
  // this approach to JS class inheritance at this
  // `@endo/pass-style` / `Far` level of abstraction. The weakness
  // is that the overridden method from a superclass can nevertheless
  // be directly applied to an instance of the subclass. The
  // subclass override did not suppress the use of the overridden
  // method as, effectively, part of the subclass' instance's public
  // API.
  //
  // See the corresponding example at
  // `test-exo-wobbly-point.js` to see the absence of this vulnerability
  // at the Exo level of abstraction.
  t.is(apply(otherPt.getX, otherWpt, []), 3);
});
