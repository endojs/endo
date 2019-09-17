// This rewriter accepts a boxed transform-module because
// we need to tie the knot between make-importer and
// transform-module.
export const makeTransformRewriter = boxedTransformModule => {
  return (moduleSource, moduleId) => {
    const [{ rewrite }] = boxedTransformModule;
    const rs = rewrite({
      endowments: {},
      sourceType: 'module',
      src: moduleSource,
      url: moduleId,
    });
    return rs;
  };
};
