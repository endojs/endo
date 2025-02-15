// @ts-check
export const DEFAULT_MODULE_FORMAT = 'endoZipBase64';
export const SUPPORTED_FORMATS = [
  'getExport',
  'nestedEvaluate',
  'endoZipBase64',
  'endoScript',
];

/** @type {import('./types.js').BundleSource} */
// @ts-ignore cast
const bundleSource = async (
  startFilename,
  options = {},
  powers = undefined,
) => {
  await null;
  if (typeof options === 'string') {
    options = { format: options };
  }
  /** @type {{ format: import('./types.js').ModuleFormat }} */
  // @ts-expect-error cast (xxx params)
  const { format: moduleFormat = DEFAULT_MODULE_FORMAT } = options;

  switch (moduleFormat) {
    case 'endoZipBase64': {
      const { bundleZipBase64 } = await import('./zip-base64.js');
      return bundleZipBase64(startFilename, options, powers);
    }
    case 'getExport':
    case 'nestedEvaluate':
    case 'endoScript': {
      const { bundleScript } = await import('./script.js');
      return bundleScript(startFilename, moduleFormat, options, powers);
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

export default bundleSource;
