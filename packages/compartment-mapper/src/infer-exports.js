import { join, relativize } from "./node-module-specifier.js";

const { entries, fromEntries } = Object;

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

// Given an unpacked `package.json`, generate a series of `[name, target]`
// pairs to represent what this package exports. `name` is what the
// caller/importer asked for (for example, the `ses` in `import { stuff } from
// 'ses'`, or the `ses/deeper` in `import { stuff } from 'ses/deeper'`).
// `target` is the path relative to the imported package's root: frequently
// `./index.js` or `./src/index.js` or (for a deep import) `./src/deeper.js`.
// There may be multiple pairs for a single `name`, but they will be yielded in
// ascending priority order, and the caller should use the last one that exists.
export function* inferExportsEntries(
  { name, main, module, browser, exports },
  tags,
  types
) {
  // From lowest to highest precedence, such that later entries override former
  // entries.
  if (main !== undefined) {
    yield [name, relativize(main)];
  }
  if (module !== undefined && tags.has("import")) {
    // In this one case, the key "module" has carried a hint that the
    // referenced module is an ECMASCript module, and that hint is necessary to
    // override whatever type might be inferred from the module specifier
    // extension.
    const spec = relativize(module);
    types[spec] = "mjs";
    yield [name, spec];
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

// inferExports reads a package.json (package descriptor) and constructs a map
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
export const inferExports = (descriptor, tags, types) =>
  fromEntries(inferExportsEntries(descriptor, tags, types));
