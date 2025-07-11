import {
  defineProperty,
  iteratorPrototype,
  iteratorSymbol,
  hasOwn,
} from './commons.js';

export const tameRegeneratorRuntime = () => {
  const iter = iteratorPrototype[iteratorSymbol];
  defineProperty(iteratorPrototype, iteratorSymbol, {
    configurable: true,
    get() {
      return iter;
    },
    set(value) {
      // ignore the assignment on IteratorPrototype
      if (this === iteratorPrototype) return;
      if (hasOwn(this, iteratorSymbol)) {
        this[iteratorSymbol] = value;
      }
      defineProperty(this, iteratorSymbol, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    },
  });
};
