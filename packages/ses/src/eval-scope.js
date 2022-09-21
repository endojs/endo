import { FERAL_EVAL, create, freeze } from './commons.js';

export const createEvalScope = () => {
  const evalScope = create(null);
  const oneTimeEvalProperties = freeze({
    eval: {
      get() {
        delete evalScope.eval;
        return FERAL_EVAL;
      },
      enumerable: false,
      configurable: true,
    },
  });

  return {
    evalScope,
    oneTimeEvalProperties,
  };
};
