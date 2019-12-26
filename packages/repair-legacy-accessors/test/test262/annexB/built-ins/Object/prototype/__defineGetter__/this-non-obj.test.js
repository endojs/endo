// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-properties-of-the-object.prototype-object
description: Behavior when "this" value is not Object-coercible
info: |
    1. Let O be ? ToObject(this value).
---*/

import test from "tape";
import sinon from "sinon";
import repairLegacyAccessors from "../../../../../../../src/main";
import sandboxLegacyAccessors from "../../../../../../sandboxLegacyAccessors";

test("test262/annexB/built-ins/Object/prototype/__defineGetter__/this-non-obj.js", t => {
  t.plan(4);

  const sandbox = sinon.createSandbox();
  sandboxLegacyAccessors(sandbox);
  repairLegacyAccessors();

  // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
  const { __defineGetter__ } = Object.prototype;
  // eslint-disable-next-line func-names
  const noop = function() {};
  let toStringCount = 0;
  const key = {
    toString() {
      toStringCount += 1;
    }
  };

  t.equal(typeof __defineGetter__, "function");

  t.throws(() => {
    __defineGetter__.call(undefined, key, noop);
  }, TypeError);

  t.throws(() => {
    __defineGetter__.call(null, key, noop);
  }, TypeError);

  t.equal(toStringCount, 0);

  sandbox.restore();
});
