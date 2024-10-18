// XXX Omit from typecheck for TypeScript packages depending upon
// import-bundle.
// TODO https://github.com/endojs/endo/issues/1254
// @ts-nocheck
/* global globalThis */
/// <reference types="ses"/>

import { parseArchive } from '@endo/compartment-mapper/import-archive.js';
import { decodeBase64 } from '@endo/base64';
import { Fail } from '@endo/errors';
import { wrapInescapableCompartment } from './compartment-wrapper.js';

// importBundle takes the output of bundle-source, and returns a namespace
// object (with .default, and maybe other properties for named exports)

export async function importBundle(bundle, options = {}, powers = {}) {
  await null;
  const {
    bundleUrl = undefined,
    filePrefix,
    endowments: optEndowments = {},
    // transforms are indeed __shimTransforms__, intended to apply to both
    // evaluated programs and modules shimmed to programs.
    transforms = [],
    inescapableTransforms = [],
    inescapableGlobalProperties = {},
    __native__ = false,
    expectedSha512 = undefined,
  } = options;
  const {
    computeSha512 = undefined,
    computeSourceLocation = undefined,
    computeSourceMapLocation = undefined,
  } = powers;
  const endowments = {
    TextEncoder,
    TextDecoder,
    URL: globalThis.URL, // Absent only in XSnap
    Base64: globalThis.Base64, // Present only in XSnap
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    ...optEndowments,
  };

  let CompartmentToUse = Compartment;
  if (
    inescapableTransforms.length ||
    Object.keys(inescapableGlobalProperties).length
  ) {
    // @ts-expect-error TS2322 no match for the signature
    CompartmentToUse = wrapInescapableCompartment(
      Compartment,
      inescapableTransforms,
      inescapableGlobalProperties,
    );
  }

  let compartment;

  const { moduleFormat } = bundle;
  if (moduleFormat === 'endoZipBase64') {
    const { endoZipBase64 } = bundle;
    const bytes = decodeBase64(endoZipBase64);
    const archive = await parseArchive(bytes, bundleUrl, {
      computeSha512,
      expectedSha512,
      computeSourceLocation,
      computeSourceMapLocation,
    });
    // Call import by property to bypass SES censoring for dynamic import.
    // eslint-disable-next-line dot-notation
    const { namespace } = await archive['import']({
      globals: endowments,
      __shimTransforms__: transforms,
      __native__,
      // @ts-expect-error TS2740 missing properties from type
      Compartment: CompartmentToUse,
    });
    // namespace.default has the default export
    return namespace;
  }

  let { source } = bundle;
  const { sourceMap } = bundle;
  if (moduleFormat === 'getExport') {
    // The 'getExport' format is a string which defines a wrapper function
    // named `getExport()`. This function provides a `module` to the
    // linearized source file, executes that source, then returns
    // `module.exports`. To get the function object out of a program-mode
    // evaluation, we must wrap the function definition in parentheses
    // (making it an expression). We also want to append the `sourceMap`
    // comment so `evaluate` can attach useful debug information. Finally, to
    // extract the namespace object, we need to invoke this function.
    source = `(${source})\n${sourceMap || ''}`;
  } else if (moduleFormat === 'nestedEvaluate') {
    // The 'nestedEvaluate' format is similar, except the wrapper function
    // (now named `getExportWithNestedEvaluate`) wraps more than a single
    // linearized string. Each source module is processed (converting
    // `import` into `require`) and added to a table named `sourceBundle`.
    // Each module will be evaluated separately (so they can get distinct
    // sourceMap strings), using a mandatory endowment named
    // `nestedEvaluate`. The wrapper function should be called with
    // `filePrefix`, which will be used as the sourceMap for the top-level
    // module. The sourceMap name for other modules will be derived from
    // `filePrefix` and the relative import path of each module.
    endowments.nestedEvaluate = src => compartment.evaluate(src);
    source = `(${source})\n${sourceMap || ''}`;
  } else if (moduleFormat === 'endoScript') {
    // The 'endoScript' format is just a script.
  } else {
    Fail`unrecognized moduleFormat '${moduleFormat}'`;
  }

  compartment = new CompartmentToUse(endowments, {}, { transforms });
  harden(compartment.globalThis);
  const result = compartment.evaluate(source);
  if (moduleFormat === 'endoScript') {
    // The completion value of an 'endoScript' is the namespace.
    // This format does not curry the filePrefix.
    return result;
  } else {
    // The 'getExport' and 'nestedEvaluate' formats curry a filePrefix.
    const namespace = result(filePrefix);
    // namespace.default has the default export
    return namespace;
  }
}

/*
importBundle(bundle, { metering: { getMeter, meteringOptions } });
importBundle(bundle, { transforms: [ meterTransform ], lexicals: { getMeter } });
importBundle(bundle, { mandatoryTransforms: [ meterTransform ], mandatoryLexicals: { getMeter } });
 // then importBundle builds the Compartment wrapper

XS:

xs.setMeter();
xs.callWithMeter(meter, ns.dispatch);
xs.callWithKeeper(keeper, ns.dispatch); // keeper.getMeter() -> meter, then ns.dispatch()
// keeper.startCrank(metadata.tshirtsize)
//   // keeper sets meter to some fixed value
// initialMeter = keeper.getMeter()
// ns.dispatch() // drains initialMeter
// maybe: keeper.endCrank() ???



*/
