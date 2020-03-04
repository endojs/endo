import tap from 'tap';
import sinon from 'sinon';
import stubLegacyAccessors from './stub-legacy-accessors.js';

const { test } = tap;

/* eslint-disable no-restricted-properties, no-underscore-dangle */

test('stubLegacyAccessors - restore', t => {
  t.plan(8);

  const descs = Object.getOwnPropertyDescriptors(Object.prototype);

  stubLegacyAccessors(sinon);

  t.notEqual(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.notEqual(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.notEqual(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.notEqual(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);

  sinon.restore();

  t.equal(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.equal(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.equal(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.equal(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);
});

/* eslint-enable no-restricted-properties, no-underscore-dangle */
