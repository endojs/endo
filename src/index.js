/* global harden Compartment */

// importBundle takes the output of bundle-source, and returns a namespace
// object (with .default, and maybe other properties for named exports)

export async function importBundle(bundle, options = {}) {
  const {
    filePrefix,
    endowments: optEndowments = {},
    ...compartmentOptions
  } = options;
  const endowments = { ...optEndowments };
  const { source, sourceMap, moduleFormat } = bundle;
  let c;
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
  c = new Compartment(endowments, {}, compartmentOptions);
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
