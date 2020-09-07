import { parseRequires } from "./parse-requires.js";
import { parseExtension } from "./extension.js";
import * as json from "./json.js";

const { entries, freeze, fromEntries } = Object;

// q, as in quote, for enquoting strings in error messages.
const q = JSON.stringify;

// TODO: parsers should accept bytes and perhaps even content-type for
// verification.

export const parseMjs = (source, _specifier, location, _packageLocation) => {
  return {
    parser: "mjs",
    record: new StaticModuleRecord(source, location)
  };
};

export const parseCjs = (source, _specifier, location, packageLocation) => {
  if (typeof source !== "string") {
    throw new TypeError(
      `Cannot create CommonJS static module record, module source must be a string, got ${source}`
    );
  }
  if (typeof location !== "string") {
    throw new TypeError(
      `Cannot create CommonJS static module record, module location must be a string, got ${location}`
    );
  }

  const imports = parseRequires(source, location, packageLocation);
  const execute = (exports, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`
    );

    let moduleExports = exports;

    const module = freeze({
      get exports() {
        return moduleExports;
      },
      set exports(namespace) {
        moduleExports = namespace;
        exports.default = namespace;
      }
    });

    const require = freeze(importSpecifier => {
      const namespace = compartment.importNow(resolvedImports[importSpecifier]);
      if (namespace.default !== undefined) {
        return namespace.default;
      }
      return namespace;
    });

    functor(
      require,
      exports,
      module,
      location, // __filename
      new URL("./", location).toString() // __dirname
    );
  };
  return {
    parser: "cjs",
    record: freeze({ imports, execute })
  };
};

export const parseJson = (source, _specifier, location, _packageLocation) => {
  const imports = freeze([]);
  const execute = exports => {
    exports.default = json.parse(source, location);
  };
  return {
    parser: "json",
    record: freeze({ imports, execute })
  };
};

export const makeExtensionParser = (extensions, types) => {
  return (source, specifier, location, packageLocation) => {
    let extension;
    if (Object(types) === types && hasOwnProperty.call(types, specifier)) {
      extension = types[specifier];
    } else {
      extension = parseExtension(location);
    }
    if (!hasOwnProperty.call(extensions, extension)) {
      throw new Error(
        `Cannot parse module ${specifier} at ${location}, no parser configured for that extension`
      );
    }
    const parse = extensions[extension];
    return parse(source, specifier, location, packageLocation);
  };
};

export const parserForLanguage = {
  mjs: parseMjs,
  cjs: parseCjs,
  json: parseJson
};

export const mapParsers = (parsers, types) => {
  const parserForExtension = [];
  const errors = [];
  for (const [extension, language] of entries(parsers)) {
    if (hasOwnProperty.call(parserForLanguage, language)) {
      const parser = parserForLanguage[language];
      parserForExtension.push([extension, parser]);
    } else {
      errors.push(`${q(language)} for extension ${q(extension)}`);
    }
  }
  if (errors.length > 0) {
    throw new Error(`No parser available for language: ${errors.join(", ")}`);
  }
  return makeExtensionParser(fromEntries(parserForExtension), types);
};
