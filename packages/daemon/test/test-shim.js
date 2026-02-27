// Adds a property to Reflect, which is only possible between
// repairIntrinsics() and hardenIntrinsics(). After harden, Reflect
// is frozen and this assignment would throw TypeError.
Reflect.testShimExecuted = true;
