import parser from "@babel/parser";
import traverse from "@babel/traverse";

/* parseRequires
 * Analyzes a CommonJS module's obvious static shallow dependencies, returning
 * an array of every module specifier that the module requires with a string
 * literal.
 *
 * Does not differentiate conditional dependencies, which will likely cause
 * errors in the loading phase. For example, `if (isNode) { require('fs') }`
 * will reveal an unconditional dependency on a possibly unloadable `fs`
 * module, even though the module has a contingency when that module is not
 * available.
 *
 * Does not discover dynamic dependencies, which will likely cause errors in
 * the module execution phase.
 * For example, `require(path)` will not be discovered by this parser, the
 * module will successfully load, but will likely be unable to synchronously
 * require the module with the given path.
 *
 * @typedef ImportSpecifier string
 * @param {string} source
 * @param {string} location
 * @return {Array<ImportSpecifier>}
 */
export const parseRequires = (source, location, packageLocation) => {
  try {
    const ast = parser.parse(source);
    const required = new Set();
    traverse.default(ast, {
      CallExpression(path) {
        const { node, scope } = path;
        const { callee, arguments: args } = node;
        if (callee.name !== "require") {
          return;
        }
        // We do not recognize `require()` or `require("id", true)`.
        if (args.length !== 1) {
          return;
        }
        // We only consider the form `require("id")`, not `require(expression)`.
        const [specifier] = args;
        if (specifier.type !== "StringLiteral") {
          return;
        }
        // The existence of a require variable in any parent scope indicates that
        // this is not a free-variable use of the term `require`, so it does not
        // likely refer to the module's given `require`.
        if (scope.hasBinding("require")) {
          return;
        }
        required.add(specifier.value);
      }
    });
    return Array.from(required).sort();
  } catch (error) {
    if (/import/.exec(error.message) !== null) {
      throw new Error(
        `Cannot parse CommonJS module at ${location}, consider adding "type": "module" to package.json in ${packageLocation}: ${error}`
      );
    }
    throw new Error(`Cannot parse CommonJS module at ${location}: ${error}`);
  }
};
