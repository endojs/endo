import {
  defineProperty,
  iteratorPrototype,
  iteratorSymbol,
  objectHasOwnProperty,
} from './commons.js';
import { accessor, permitted } from './permits.js';

export const tameRegeneratorRuntime = () => {
  const iter = iteratorPrototype[iteratorSymbol];
  permitted['%IteratorPrototype%']['@@iterator'] = accessor;
  defineProperty(iteratorPrototype, iteratorSymbol, {
    configurable: true,
    get: () => iter,
    set(value) {
      // ignore the assignment on IteratorPrototype
      if (this === iteratorPrototype) return true;
      if (objectHasOwnProperty(this, iteratorSymbol)) {
        this[iteratorSymbol] = value;
        return true;
      }
      defineProperty(this, iteratorSymbol, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return true;
    },
  });
};
