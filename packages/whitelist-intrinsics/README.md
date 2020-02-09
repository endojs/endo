# Whitelist Intrinsics

## Overview

This module removes all non-whitelisted properties found by recursively and reflectively walking own property chains.

The prototype properties are type checked.

In addition, it verifies that the `prototype`, `__proto__`, and `constructor` properties do point to their whitelisted values.

Typically, this module will not be used directly, but via the [lockdown-shim] which handles all necessary repairs and taming in SES.

## Differences with the Caja implementation

Several improvements were made to reduce the complexity of the whitelisting 
algorithm and improve the accuracy and maintainability of the whitelist.

1. The indicators "maybeAccessor" and "\*" are replace with more explicit mapping. This memoved the implicit recursive structure.

2. Instead, the `prototype`, `__proto__`, and `constructor` must be specified and point to top level entries in the map. For example, `Object.__proto__` leads to `FunctionPrototype` which is a top level entry in the map.

3. The whitelist defines all prototypoe properties `\*Prototype` as top level entries. This creates a much more maintainable two level map, which is closer to how the languare is spefified.

4. The indicator `true` has been removed. Instead, the map value must the name of a primitive for type-checking (for example, `Error.stackTraceLimit` leads to 'number'), the name of an intrinsic (for example, `ErrorPrototype.constructor` leads to 'Error'), or a internal constant (for example, `eval` leads to `fn` which is an alias for `FunctionInstance`, a record that whitelist all properties on allows on such instance).

5. In debug mode, all removed properties are listed to the console.
