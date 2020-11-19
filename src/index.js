/* global harden Compartment */
import { parseArchive } from '@agoric/compartment-mapper';
import { decodeBase64 } from '@agoric/base64';
import { wrapInescapableCompartment } from './compartment-wrapper';

// importBundle takes the output of bundle-source, and returns a namespace
// object (with .default, and maybe other properties for named exports)

export async function importBundle(bundle, options = {}) {
  const {
    filePrefix,
    endowments: optEndowments = {},
    globalLexicals = {},
    // transforms are indeed __shimTransforms__, intended to apply to both
    // evaluated programs and modules shimmed to programs.
    transforms = [],
    inescapableTransforms = [],
    inescapableGlobalLexicals = {},
  } = options;
  const endowments = {
    TextEncoder,
    TextDecoder,
    ...optEndowments,
  };

  let CompartmentToUse = Compartment;
  if (
    inescapableTransforms.length ||
    Object.keys(inescapableGlobalLexicals).length
  ) {
    CompartmentToUse = wrapInescapableCompartment(
      Compartment,
      inescapableTransforms,
      inescapableGlobalLexicals,
    );
  }

  const { moduleFormat } = bundle;
  if (moduleFormat === 'endoZipBase64') {
    const { endoZipBase64 } = bundle;
    const bytes = decodeBase64(endoZipBase64);
    const archive = await parseArchive(bytes);
    // Call import by property to bypass SES censoring for dynamic import.
    // eslint-disable-next-line dot-notation
    const { namespace } = await archive['import']({
      globals: endowments,
      __shimTransforms__: transforms,
      Compartment: CompartmentToUse,
    });
    // namespace.default has the default export
    return namespace;
  }

  let c;
  const { source, sourceMap } = bundle;
  if (moduleFormat === 'getExport') {
    // The 'getExport' format is a string which defines a wrapper function
    // named `getExport()`. This function provides a `module` to the
    // linearized source file, executes that source, then returns
    // `module.exports`. To get the function object out of a program-mode
    // evaluation, we must wrap the function definition in parentheses
    // (making it an expression). We also want to append the `sourceMap`
    // comment so `evaluate` can attach useful debug information. Finally, to
    // extract the namespace object, we need to invoke this function.
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
    endowments.nestedEvaluate = src => c.evaluate(src);
  } else {
    throw Error(`unrecognized moduleFormat '${moduleFormat}'`);
  }

  c = new CompartmentToUse(endowments, {}, { globalLexicals, transforms });
  harden(c.globalThis);
  const actualSource = `(${source})\n${sourceMap || ''}`;
  const namespace = c.evaluate(actualSource)(filePrefix);
  // namespace.default has the default export
  return namespace;
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
