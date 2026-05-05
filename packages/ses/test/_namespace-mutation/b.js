import * as foo from './a.cjs';

const result = {
  before: foo.x,
  isFrozen: Object.isFrozen(foo),
  isExtensible: Object.isExtensible(foo),
  descriptor: Object.getOwnPropertyDescriptor(foo, 'x'),
};

try {
  foo.x = 'bar';
  result.assignThrew = false;
  result.afterAssign = foo.x;
} catch (e) {
  result.assignThrew = true;
  result.assignErrorName = e.name;
}

result.reflectSetReturn = Reflect.set(foo, 'x', 'bar');
result.afterReflectSet = foo.x;

export { result };
