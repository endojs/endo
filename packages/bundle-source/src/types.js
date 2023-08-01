/**
 * @typedef {'getExport' | 'nestedEvaluate' | 'endoZipBase64'} ModuleFormat
 */

/**
 * @typedef {BundleSourceEndoZipBase64 & BundleSourceGetExport & BundleSourceNestedEvaluate} BundleSource
 */

/**
 * @callback BundleSourceEndoZipBase64
 * @param {string} startFilename - the filepath to start the bundling from
 * @param {ModuleFormatOrOptions<'endoZipBase64' | undefined>} moduleFormat
 * @param {object=} powers
 * @param {ReadFn=} powers.read
 * @param {CanonicalFn=} powers.canonical
 * @returns {Promise<{
 *  moduleFormat: 'endoZipBase64',
 *  endoZipBase64: string,
 *  endoZipBase64Sha512: string,
 * }>}
 */

/**
 * @callback BundleSourceGetExport
 * @param {string} startFilename - the filepath to start the bundling from
 * @param {ModuleFormatOrOptions<'getExport'>} moduleFormat
 * @param {object=} powers
 * @param {ReadFn=} powers.read
 * @param {CanonicalFn=} powers.canonical
 * @returns {Promise<{
 *  moduleFormat: 'getExport',
 *  source: string,
 *  sourceMap: string,
 * }>}
 */

/**
 * @callback BundleSourceNestedEvaluate
 * @param {string} startFilename - the filepath to start the bundling from
 * @param {ModuleFormatOrOptions<'nestedEvaluate'>} moduleFormat
 * @param {object=} powers
 * @param {ReadFn=} powers.read
 * @param {CanonicalFn=} powers.canonical
 * @returns {Promise<{
 *  moduleFormat: 'nestedEvaluate',
 *  source: string,
 *  sourceMap: string,
 * }>}
 */

/**
 * @template {ModuleFormat | undefined} T
 * @typedef {T | BundleOptions<T>} ModuleFormatOrOptions
 */

/**
 * @template {ModuleFormat | undefined} T
 * @typedef {object} BundleOptions
 * @property {T} format
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
