import makeDefaultEvaluateOptions from '@agoric/default-evaluate-options';

// The evaluate maker, which curries the makerOptions.
export const makeEvaluators = (makerOptions = {}) => {
  // Evaluate any shims, globally!
  // eslint-disable-next-line no-eval
  (makerOptions.shims || []).forEach(shim => (1, eval)(shim));

  const makeEvaluator = sourceType => (
    source,
    endowments = {},
    options = {},
  ) => {
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
      { sourceType, src: source },
    );

    // Work around Babel appending semicolons.
    const maybeSource = sourceState.src;
    const actualSource =
      maybeSource.endsWith(';') && !source.endsWith(';')
        ? maybeSource.slice(0, -1)
        : maybeSource;

    // Generate the expression context, if necessary.
    const src =
      sourceType === 'expression' ? `(${actualSource}\n)` : actualSource;

    // console.error(`have rewritten`, src);
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
    evaluateProgram: makeEvaluator('program'),
    evaluateExpr: makeEvaluator('expression'),
  };
};

// Export the default evaluators.
const defaultEvaluateOptions = makeDefaultEvaluateOptions();
const { evaluateExpr, evaluateProgram } = makeEvaluators(
  defaultEvaluateOptions,
);
export { defaultEvaluateOptions, evaluateExpr, evaluateProgram };
export default evaluateExpr;
