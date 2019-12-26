import test from "tape";
import sinon from "sinon";
import sandboxLegacyAccessors from "./sandboxLegacyAccessors";

/* eslint-disable no-restricted-properties, no-underscore-dangle */

test("sandboxLegacyAccessors.js", t => {
  t.plan(8);

  const descs = Object.getOwnPropertyDescriptors(Object.prototype);

  const sandbox = sinon.createSandbox();
  sandboxLegacyAccessors(sandbox);

  t.notEqual(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.notEqual(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.notEqual(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.notEqual(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);

  sandbox.restore();

  t.equal(descs.__defineGetter__.value, Object.prototype.__defineGetter__);
  t.equal(descs.__defineSetter__.value, Object.prototype.__defineSetter__);
  t.equal(descs.__lookupGetter__.value, Object.prototype.__lookupGetter__);
  t.equal(descs.__lookupSetter__.value, Object.prototype.__lookupSetter__);
});

/* eslint-enable no-restricted-properties, no-underscore-dangle */
