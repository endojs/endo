import test from 'ava';
import sinon from 'sinon';
import stubLegacyAccessors from './stub-legacy-accessors.js';

/* eslint-disable no-restricted-properties, no-underscore-dangle */

test('stubLegacyAccessors - restore', t => {
  t.plan(8);

  const descs = Object.getOwnPropertyDescriptors(Object.prototype);

  stubLegacyAccessors(sinon);

  t.not(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.not(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.not(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.not(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);

  sinon.restore();

  t.is(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.is(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.is(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.is(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);
});

/* eslint-enable no-restricted-properties, no-underscore-dangle */
