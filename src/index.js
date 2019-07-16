const HIDDEN_PREFIX = '$h\u200d_';
const HIDDEN_IMPORT = `${HIDDEN_PREFIX}import`;
const HIDDEN_SYMBOLS = [HIDDEN_IMPORT];

const makeModuleTransformer = (parser, traverse, generate) => ({
  endow(es) {
    // TODO: Add the hidden symbols needed.
    return es;
  },
  rewrite(ss) {
    // Parse the source.
    const parseFunc = ss.isExpr ? parser.parseExpression : parser.parse;
    const ast = (parseFunc || parser)(ss.src);

    const handler = {
      Identifier(path) {
        // Ensure the parse doesn't already include our required hidden symbols.
        const i = HIDDEN_SYMBOLS.indexOf(path.node.name);
        if (i >= 0) {
          throw path.buildCodeFrameError(
            `The ${HIDDEN_SYMBOLS[i]} identifier is reserved`,
          );
        }
      },
    };
    traverse(ast, handler, { noScope: ss.isExpr });

    // Produce the Program or Expression source code.
    const { code: src } = generate(ast, ss.src);
    // console.log(ss.isExpr, `generated`, src, `from`, ast);
    return { ...ss, src };
  },
});

export default makeModuleTransformer;
