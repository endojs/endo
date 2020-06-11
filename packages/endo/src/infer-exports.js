import { join, relativize } from "./node-module-specifier.js";

const { entries, fromEntries } = Object;

// q, as in quote, for quoting strings in error messages;
const q = JSON.stringify;

function* interpretBrowserExports(name, exports) {
  if (typeof exports === "string") {
    yield [name, relativize(exports)];
    return;
  }
  if (Object(exports) !== exports) {
    throw new Error(
      `Cannot interpret package.json browser property for package ${name}, must be string or object, got ${exports}`
    );
  }
  for (const [key, value] of entries(exports)) {
    yield [join(name, key), relativize(value)];
  }
}

function* interpretExports(name, exports, tags) {
  if (typeof exports === "string") {
    yield [name, relativize(exports)];
    return;
  }
  if (Object(exports) !== exports) {
    throw new Error(
      `Cannot interpret package.json exports property for package ${name}, must be string or object, got ${exports}`
    );
  }
  for (const [key, value] of entries(exports)) {
    if (key.startsWith("./") || key === ".") {
      yield* interpretExports(join(name, key), value, tags);
    } else if (tags.has(key)) {
      yield* interpretExports(name, value, tags);
    }
  }
}

export function* inferExportsEntries(
  { name, type, main, module, browser, exports },
  tags
) {
  // TODO support commonjs type packages.
  if (type !== "module") {
    throw new Error(
      `Endo currently only supports packages with "type": "module" in package.json, got ${q(
        type
      )} in package ${q(name)}`
    );
  }
  // From lowest to highest precedence, such that later entries override former
  // entries.
  if (main !== undefined) {
    yield [name, relativize(main)];
  }
  if (module !== undefined && tags.has("import")) {
    yield [name, relativize(module)];
  }
  if (browser !== undefined && tags.has("browser")) {
    yield* interpretBrowserExports(name, browser);
  }
  if (exports !== undefined) {
    yield* interpretExports(name, exports, tags);
  }
  // TODO Otherwise, glob 'files' for all '.js', '.cjs', and '.mjs' entry
  // modules, taking care to exclude node_modules.
}

// inferExports reads a package.json (package descriptor) an constructs a map
// of all the modules that package exports.
// The keys are the module specifiers for the module map of any package that
// depends upon this one, like `semver` for the main module of the `semver`
// package.
// The values are the corresponding module specifiers in the dependency
// package's module map, like `./index.js`.
//
// TODO When a package does not supply the `exports` property, this function
// needs to infer that all JavaScript modules in the package are exported.
// Most packages will need this.
// This function can remain synchronous if we pre-populate a file manifest for
// every package.
// That manifest will also prove useful for resolving aliases, like the
// implicit index.js modules within a package.
export const inferExports = (descriptor, tags) =>
  fromEntries(inferExportsEntries(descriptor, tags));
