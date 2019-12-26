// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-properties-of-the-object.prototype-object
description: Behavior when getter is not callable
info: |
    [...]
    2. If IsCallable(getter) is false, throw a TypeError exception.
features: [Symbol]
---*/

import test from "tape";
import sinon from "sinon";
import repairLegacyAccessors from "../../../../../../../src/main";
import sandboxLegacyAccessors from "../../../../../../sandboxLegacyAccessors";

test("test262/annexB/built-ins/Object/prototype/__defineGetter__/getter-non-callable.js", t => {
  t.plan(7);

  const sandbox = sinon.createSandbox();
  sandboxLegacyAccessors(sandbox);
  repairLegacyAccessors();

  const subject = {};
  const symbol = Symbol("");
  let toStringCount = 0;
  const key = {
    toString() {
      toStringCount += 1;
    }
  };

  // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
  t.equal(typeof Object.prototype.__defineGetter__, "function");

  t.throws(
    () => {
      // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
      subject.__defineGetter__(key, "");
    },
    TypeError,
    "string"
  );

  t.throws(
    () => {
      // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
      subject.__defineGetter__(key, 23);
    },
    TypeError,
    "number"
  );

  t.throws(
    () => {
      // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
      subject.__defineGetter__(key, true);
    },
    TypeError,
    "boolean"
  );

  t.throws(
    () => {
      // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
      subject.__defineGetter__(key, symbol);
    },
    TypeError,
    "symbol"
  );

  t.throws(
    () => {
      // eslint-disable-next-line no-restricted-properties, no-underscore-dangle
      subject.__defineGetter__(key, {});
    },
    TypeError,
    "object"
  );

  t.equal(toStringCount, 0);

  sandbox.restore();
});
