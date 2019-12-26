// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-properties-of-the-object.prototype-object
description: Behavior when property does not exist
info: |
    [...]
    3. Let desc be PropertyDescriptor{[[Get]]: getter, [[Enumerable]]: true,
       [[Configurable]]: true}.
    4. Let key be ? ToPropertyKey(P).
    5. Perform ? DefinePropertyOrThrow(O, key, desc).
    6. Return undefined.
includes: [propertyHelper.js]
---*/

import test from "tape";
import sinon from "sinon";
import repairLegacyAccessors from "../../../../../../../src/main";
import sandboxLegacyAccessors from "../../../../../../sandboxLegacyAccessors";

test("test262/annexB/built-ins/Object/prototype/__defineGetter__/define-new.js", t => {
  t.plan(6);

  const sandbox = sinon.createSandbox();
  sandboxLegacyAccessors(sandbox);
  repairLegacyAccessors();

  const subject = {};
  // eslint-disable-next-line func-names
  const get = function() {};

  // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
  const result = subject.__defineGetter__("stringAcsr", get);

  const desc = Object.getOwnPropertyDescriptor(subject, "stringAcsr");

  t.equal(desc.enumerable, true, "descriptor should be enumerable");
  t.equal(desc.configurable, true, "descriptor should be configurable");

  t.equal(desc.get, get, "descriptor `get` method");
  t.equal(desc.set, undefined, "descriptor `set` method");
  t.equal(desc.value, undefined, "descriptor `value` property");

  t.equal(result, undefined, "method return value");

  sandbox.restore();
});
