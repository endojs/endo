// @ts-check
export const DEFAULT_MODULE_FORMAT = 'endoZipBase64';
export const SUPPORTED_FORMATS = [
  'getExport',
  'nestedEvaluate',
  'endoZipBase64',
  'endoScript',
];

/** @import {BundleOptions, BundleSource, ModuleFormat} from './types.js' */

/**
 * @param {string} startFilename
 * @param {ModuleFormat | BundleOptions<ModuleFormat>} [options]
 * @param {object} [powers]
 */
const bundleSourceImpl = async (
  startFilename,
  options = {},
  powers = undefined,
) => {
  await null;
  const bundleOptions =
    typeof options === 'string' ? { format: options } : options;
  const moduleFormat = bundleOptions.format || DEFAULT_MODULE_FORMAT;

  switch (moduleFormat) {
    case 'endoZipBase64': {
      const { bundleZipBase64 } = await import('./zip-base64.js');
      return bundleZipBase64(startFilename, bundleOptions, powers);
    }
    case 'getExport':
    case 'nestedEvaluate':
    case 'endoScript': {
      const { bundleScript } = await import('./script.js');
      return bundleScript(startFilename, moduleFormat, bundleOptions, powers);
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

const bundleSource = /** @type {BundleSource} */ (bundleSourceImpl);

export default bundleSource;
