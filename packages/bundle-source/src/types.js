// @ts-check
export {};

/**
 * @typedef {'endoZipBase64' | 'endoScript' | 'nestedEvaluate' | 'getExport'} ModuleFormat
 */

// The order of these intersections matters, insofar as Typescript treats the
// last one as the "most generic" version of the overloads.
/**
 * @typedef { &
 *  BundleSourceSimple &
 *  BundleSourceWithFormat &
 *  BundleSourceWithOptions &
 *  BundleSourceGeneral} BundleSource
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
 * } : T extends 'endoScript' ? {
 *   moduleFormat: T,
 *   source: string,
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
 *  powers?: { read?: ReadFn; canonical?: CanonicalFn, externals?: string[] },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceWithFormat
 */

/**
 * @typedef {<T extends ModuleFormat = 'endoZipBase64'>(
 *  startFilename: string,
 *  bundleOptions: BundleOptions<T>,
 *  powers?: { read?: ReadFn; canonical?: CanonicalFn, externals?: string[] },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceWithOptions
 */

/**
 * @typedef {<T extends ModuleFormat = 'endoZipBase64'>(
 *   startFilename: string,
 *   formatOrOptions?: T | BundleOptions<T>,
 *   powers?: { read?: ReadFn; canonical?: CanonicalFn, externals?: string[] },
 * ) => Promise<BundleSourceResult<T>>} BundleSourceGeneral
 */

/**
 * @template {ModuleFormat} T
 * @typedef {object} BundleOptions
 * @property {T} [format]
 * @property {boolean} [dev] - development mode, for test bundles that need
 * access to devDependencies of the entry package.
 * @property {boolean} [noTransforms] - when true, generates a bundle with the
 * original sources instead of SES-shim specific ESM and CJS. This may become
 * default in a future major version.
 * @property {string[]} [conditions] - conditions for package.json conditional
 * exports and imports.
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
