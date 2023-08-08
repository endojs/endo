// @ts-check
export {};

/**
 * @typedef {'endoZipBase64' | 'nestedEvaluate' | 'getExport'} ModuleFormat
 */

/**
 * @typedef { &
 *  BundleSourceSimple &
 *  BundleSourceWithFormat &
 *  BundleSourceWithOptions &
 *  BundleSourceFallback} BundleSource
 */

/**
 * @template {ModuleFormat} T
 * @typedef {T extends 'endoZipBase64' ? {
 *   moduleFormat: 'endoZipBase64',
 *   endoZipBase64: string,
 *   endoZipBase64Sha512: string,
 * } : T extends 'getExport' | 'nestedEvaluate' ? {
 *   moduleFormat: T,
 *   source: string,
 *   sourceMap: string,
 * } : never} BundleSourceResult
 */

/**
 * @typedef {<T extends 'endoZipBase64'>(
 *  startFilename: string,
 * ) => Promise<BundleSourceResult<T>>} BundleSourceSimple
 */

/**
 * @typedef {<T extends ModuleFormat = 'endoZipBase64'>(
 *  startFilename: string,
 *  format: T,
 *  powers?: { read?: ReadFn; canonical?: CanonicalFn },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceWithFormat
 */

/**
 * @typedef {<T extends ModuleFormat = 'endoZipBase64'>(
 *  startFilename: string,
 *  bundleOptions: BundleOptions<T>,
 *  powers?: { read?: ReadFn; canonical?: CanonicalFn },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceWithOptions
 */

/**
 * @typedef {<T extends ModuleFormat = 'endoZipBase64'>(
 *   startFilename: string,
 *   formatOrOptions?: T | BundleOptions<T>,
 *   powers?: { read?: ReadFn; canonical?: CanonicalFn },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceFallback
 */

/**
 * @template {ModuleFormat} T
 * @typedef {object} BundleOptions
 * @property {T} [format]
 * @property {boolean} [dev] - development mode, for test bundles that need
 * access to devDependencies of the entry package.
 */

/**
 * @callback ReadFn
 * @param {string} location
 * @returns {Promise<Uint8Array>} bytes
 */

/**
 * Returns a canonical URL for a given URL, following redirects or symbolic
 * links if any exist along the path.
 * Must return the given logical location if the real location does not exist.
 *
 * @callback CanonicalFn
 * @param {string} location
 * @returns {Promise<string>} canonical location
 */
