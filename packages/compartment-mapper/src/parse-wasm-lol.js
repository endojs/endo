/* eslint-disable no-undef */
// @dont-ts-check

const { freeze } = Object;

/** @type {import('./types.js').ParseFn} */
export const parseWasm = (
  bytes,
  _specifier,
  _location,
  _packageLocation,
) => {
  const wasmModule = new WebAssembly.Module(bytes);

  const exports = WebAssembly.Module.exports(wasmModule).map(entry => entry.name);
  const imports = WebAssembly.Module.imports(wasmModule).map(entry => entry.name);
  process._rawDebug('>>', exports)

  /**
   * @param {Object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, _compartment, _resolvedImports) => {
    // I know I should put this inside compartment.evaluate but I didn't want to go through the trouble of passing the
    // wasmModule and WebAssembly reference down yet.

    // endo imports may not be trivially matching with wasm imports, but what do I know
    // const importObject = {
    //   imports: resolvedImports
    //   }
    // };
    // const moduleInstance = new WebAssembly.Instance(wasmModule, importObject)
    const moduleInstance = new WebAssembly.Instance(wasmModule);
    Object.entries(moduleInstance).forEach(([name, value]) => {
      moduleEnvironmentRecord[name] = value;
    });
  };

  return {
    parser: 'wasm',
    bytes,
    record: freeze({ imports, exports, reexports: [], execute }),
  };
};
