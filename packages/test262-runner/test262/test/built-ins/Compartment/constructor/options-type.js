/*---
description: 
flags: [onlyStrict]
features: [Compartment]
---*/

function check(options) {
	return function() {
		return (new Compartment(options)).toString();
	}
}

assert.sameValue((new Compartment()).toString(), "[object Compartment]", "no options");
assert.throws(TypeError, check(undefined), "undefined");
assert.throws(TypeError, check(null), "null");
assert.throws(TypeError, check(false), "boolean");
assert.throws(TypeError, check(0), "number");
assert.throws(TypeError, check(""), "string");
assert.throws(TypeError, check(Symbol()), "symbol");
assert.sameValue(check({})(), "[object Compartment]", "object");
assert.sameValue(check([])(), "[object Compartment]", "array");
