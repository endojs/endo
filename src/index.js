// The evaluate maker, which curries the makerOptions.
export const makeEvaluators = (makerOptions = {}) => {
  const makeEvaluator = isExpr => (source, endowments = {}, options = {}) => {
    const fullTransforms = [
      ...(options.transforms || []),
      ...(makerOptions.transforms || []),
    ];
    const fullEndowments = {
      ...(makerOptions.endowments || {}),
      ...endowments,
    };

    const endowmentState = fullTransforms.reduce(
      (es, transform) => (transform.endow ? transform.endow(es) : es),
      { endowments: fullEndowments },
    );

    const sourceState = fullTransforms.reduce(
      (ss, transform) => (transform.rewrite ? transform.rewrite(ss) : ss),
      { src: source },
    );

    // Generate the expression context, if necessary.
    const src = isExpr ? `(${sourceState.src}\n)` : sourceState.src;
    const names = Object.getOwnPropertyNames(endowmentState.endowments);

    // This function's first argument is the endowments.
    // The second argument is the source string to evaluate.
    // It is in strict mode so that `this` is undefined.
    //
    // The eval below is direct, so that we have access to the named endowments.
    const scopedEval = `(function() {
      'use strict';
      const { ${names.join(',')} } = arguments[0];
      return eval(arguments[1]);
    })`;

    // The eval below is indirect, so that we are only in the global scope.
    // eslint-disable-next-line no-eval
    return (1, eval)(scopedEval)(endowmentState.endowments, src);
  };

  return {
    evaluateProgram: makeEvaluator(false),
    evaluateExpr: makeEvaluator(true),
  };
};

// Export the default evaluators.
export const { evaluateExpr, evaluateProgram } = makeEvaluators();
