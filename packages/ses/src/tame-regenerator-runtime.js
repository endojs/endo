import {
  defineProperty,
  iteratorPrototype,
  iteratorSymbol,
} from './commons.js';
import { accessor, permitted } from './permits.js';

export const tameRegeneratorRuntime = () => {
  const iter = iteratorPrototype[iteratorSymbol];
  permitted['%IteratorPrototype%']['@@iterator'] = accessor;
  defineProperty(iteratorPrototype, iteratorSymbol, {
    configurable: true,
    get: () => iter,
    set: () => true,
  });
};
