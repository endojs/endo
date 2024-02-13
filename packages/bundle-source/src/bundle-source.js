// @ts-check
const DEFAULT_MODULE_FORMAT = 'endoZipBase64';
const SUPPORTED_FORMATS = ['getExport', 'nestedEvaluate', 'endoZipBase64'];

/**
 * @type {import('./types').BundleSourceGeneral}
 */
const bundleSource = async (
  startFilename,
  options = {},
  powers = undefined,
) => {
  await null;
  if (typeof options === 'string') {
    options = { format: options };
  }
  const { format: moduleFormat = DEFAULT_MODULE_FORMAT } = options;

  switch (moduleFormat) {
    case 'endoZipBase64': {
      const { bundleZipBase64 } = await import('./zip-base64.js');
      return bundleZipBase64(startFilename, options, powers);
    }
    case 'getExport': {
      const { bundleNestedEvaluateAndGetExports } = await import(
        './nested-evaluate-and-get-exports.js'
      );
      return bundleNestedEvaluateAndGetExports(
        startFilename,
        moduleFormat,
        powers,
      );
    }
    case 'nestedEvaluate': {
      const { bundleNestedEvaluateAndGetExports } = await import(
        './nested-evaluate-and-get-exports.js'
      );
      return bundleNestedEvaluateAndGetExports(
        startFilename,
        moduleFormat,
        powers,
      );
    }
    default:
      if (!SUPPORTED_FORMATS.includes(moduleFormat)) {
        throw Error(`moduleFormat ${moduleFormat} is not supported`);
      }
      throw Error(
        `moduleFormat ${moduleFormat} is not implemented but is in ${SUPPORTED_FORMATS}`,
      );
  }
};

export default /** @satisfies {import('./types').BundleSource} */ (
  bundleSource
);
