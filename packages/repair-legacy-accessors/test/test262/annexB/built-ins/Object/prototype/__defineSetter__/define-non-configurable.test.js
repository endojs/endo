// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-properties-of-the-object.prototype-object
description: Behavior when property exists and is not configurable
info: |
    [...]
    5. Perform ? DefinePropertyOrThrow(O, key, desc).
---*/

import test from "tape";
import sinon from "sinon";
import repairLegacyAccessors from "../../../../../../../src/main";
import sandboxLegacyAccessors from "../../../../../../sandboxLegacyAccessors";

test("test262/annexB/built-ins/Object/prototype/__defineSetter__/define-non-configurable.js", t => {
  t.plan(2);

  const sandbox = sinon.createSandbox();
  sandboxLegacyAccessors(sandbox);
  repairLegacyAccessors();

  // eslint-disable-next-line func-names
  const noop = function() {};
  const subject = Object.defineProperty({}, "attr", {
    value: 1,
    configurable: false
  });

  // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
  t.equal(typeof Object.prototype.__defineSetter__, "function");

  t.throws(() => {
    // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
    subject.__defineSetter__("attr", noop);
  }, TypeError);

  sandbox.restore();
});
