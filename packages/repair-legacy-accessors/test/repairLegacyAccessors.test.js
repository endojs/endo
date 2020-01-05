import tap from "tap";
import sinon from "sinon";
import repairLegacyAccessors from "../src/main.js";

const { test } = tap;

/* eslint-disable no-restricted-properties, no-underscore-dangle, func-names */

function sandboxLegacyAccessors() {
  sinon.stub(Object.prototype, "__defineGetter__").callsFake(() => {});
  sinon.stub(Object.prototype, "__defineSetter__").callsFake(() => {});
  sinon.stub(Object.prototype, "__lookupGetter__").callsFake(() => {});
  sinon.stub(Object.prototype, "__lookupSetter__").callsFake(() => {});
}

test("sandboxLegacyAccessors - restore", t => {
  t.plan(8);

  const descs = Object.getOwnPropertyDescriptors(Object.prototype);

  sandboxLegacyAccessors();

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

test("repairAccessors - no multiple fix", t => {
  t.plan(1);

  sandboxLegacyAccessors();
  repairLegacyAccessors();

  const original = Object.prototype.__lookupGetter__;

  repairLegacyAccessors();

  t.equal(Object.prototype.__lookupGetter__, original);

  sinon.restore();
});

test("repairAccessors - force", specs => {
  specs.plan(4);

  sandboxLegacyAccessors();
  repairLegacyAccessors();

  const {
    create,
    prototype: {
      __defineGetter__,
      __defineSetter__,
      __lookupGetter__,
      __lookupSetter__
    }
  } = Object;

  specs.test("Object#__defineGetter__", t => {
    t.plan(9);

    t.equal(typeof __defineGetter__, "function");
    t.equal(__defineGetter__.length, 2);
    t.equal(__defineGetter__.name, "__defineGetter__");

    const object = {};
    t.equal(
      object.__defineGetter__("key", () => 42),
      undefined,
      "void"
    );
    t.equal(object.key, 42, "works");

    object.__defineSetter__("key", function() {
      this.foo = 43;
    });
    object.key = 44;
    t.ok(object.key === 42 && object.foo === 43, "works with setter");

    t.throws(
      () => object.__defineSetter__("foo", undefined),
      TypeError,
      "Throws on not function`"
    );

    t.throws(
      () => __defineGetter__.call(null, 1, () => {}),
      TypeError,
      "Throws on null as `this`"
    );
    t.throws(
      () => __defineGetter__.call(undefined, 1, () => {}),
      TypeError,
      "Throws on undefined as `this`"
    );
  });

  specs.test("Object#__defineSetter__", t => {
    t.plan(9);

    t.equal(typeof __defineSetter__, "function");
    t.equal(__defineSetter__.length, 2);
    t.equal(__defineSetter__.name, "__defineSetter__");

    const object = {};
    t.equal(
      object.__defineSetter__("key", function() {
        this.foo = 43;
      }),
      undefined,
      "void"
    );
    object.key = 44;
    t.equal(object.foo, 43, "works");

    object.__defineSetter__("key", function() {
      this.foo = 43;
    });
    object.__defineGetter__("key", () => 42);
    object.key = 44;
    t.ok(object.key === 42 && object.foo === 43, "works with getter");

    t.throws(
      () => object.__defineSetter__("foo", undefined),
      TypeError,
      "Throws on not function`"
    );

    t.throws(
      () => __defineSetter__.call(null, 1, () => {}),
      TypeError,
      "Throws on null as `this`"
    );
    t.throws(
      () => __defineSetter__.call(undefined, 1, () => {}),
      TypeError,
      "Throws on undefined as `this`"
    );
  });

  specs.test("Object#__lookupGetter__", t => {
    t.plan(14);

    t.equal(typeof __lookupGetter__, "function");
    t.equal(__lookupGetter__.length, 1);
    t.equal(__lookupGetter__.name, "__lookupGetter__");
    // assert.looksNative(__lookupGetter__);
    t.equal(
      Object.getOwnPropertyDescriptor(Object.prototype, "__lookupGetter__")
        .enumerable,
      false
    );
    t.equal({}.__lookupGetter__("key"), undefined, "empty object");
    t.equal({ key: 42 }.__lookupGetter__("key"), undefined, "data descriptor");

    const obj1 = {};
    function setter1() {}
    obj1.__defineGetter__("key", setter1);

    t.equal(obj1.__lookupGetter__("key"), setter1, "own getter");
    t.equal(create(obj1).__lookupGetter__("key"), setter1, "proto getter");
    t.equal(create(obj1).__lookupGetter__("foo"), undefined, "empty proto");

    const obj2 = {};
    function setter2() {}
    const symbol2 = Symbol("key");
    obj2.__defineGetter__(symbol2, setter2);

    t.equal(obj2.__lookupGetter__(symbol2), setter2, "own getter");
    t.equal(create(obj2).__lookupGetter__(symbol2), setter2, "proto getter");
    t.equal(
      create(obj2).__lookupGetter__(Symbol("foo")),
      undefined,
      "empty proto"
    );

    t.throws(
      () => __lookupGetter__.call(null, 1, () => {}),
      TypeError,
      "Throws on null as `this`"
    );
    t.throws(
      () => __lookupGetter__.call(undefined, 1, () => {}),
      TypeError,
      "Throws on undefined as `this`"
    );
  });

  specs.test("Object#__lookupSetter__", t => {
    t.plan(14);

    t.equal(typeof __lookupSetter__, "function");
    t.equal(__lookupSetter__.length, 1);
    t.equal(__lookupSetter__.name, "__lookupSetter__");
    // assert.looksNative(__lookupSetter__);
    t.equal(
      Object.getOwnPropertyDescriptor(Object.prototype, "__lookupSetter__")
        .enumerable,
      false
    );
    t.equal({}.__lookupSetter__("key"), undefined, "empty object");
    t.equal({ key: 42 }.__lookupSetter__("key"), undefined, "data descriptor");

    const obj1 = {};
    function setter1() {}
    obj1.__defineSetter__("key", setter1);

    t.equal(obj1.__lookupSetter__("key"), setter1, "own getter");
    t.equal(create(obj1).__lookupSetter__("key"), setter1, "proto getter");
    t.equal(create(obj1).__lookupSetter__("foo"), undefined, "empty proto");

    const obj2 = {};
    function setter2() {}
    const symbol2 = Symbol("key");
    obj2.__defineSetter__(symbol2, setter2);

    t.equal(obj2.__lookupSetter__(symbol2), setter2, "own getter");
    t.equal(create(obj2).__lookupSetter__(symbol2), setter2, "proto getter");
    t.equal(
      create(obj2).__lookupSetter__(Symbol("foo")),
      undefined,
      "empty proto"
    );

    t.throws(
      () => __lookupSetter__.call(null, 1, () => {}),
      TypeError,
      "Throws on null as `this`"
    );
    t.throws(
      () => __lookupSetter__.call(undefined, 1, () => {}),
      TypeError,
      "Throws on undefined as `this`"
    );
  });

  sinon.restore();
});

/* eslint-enable no-restricted-properties, no-underscore-dangle, func-names */
