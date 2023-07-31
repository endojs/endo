/**
 * @typedef {'getExport' | 'nestedEvaluate' | 'endoZipBase64'} ModuleFormat
 */

/**
 * @callback BundleSource
 * @param {string} startFilename - the filepath to start the bundling from
 * @param {(ModuleFormat | BundleOptions)=} moduleFormat
 * @param {object=} powers
 * @param {ReadFn=} powers.read
 * @param {CanonicalFn=} powers.canonical
 * @returns {Promise<{
 *   endoZipBase64?: string,
 *   moduleFormat: ModuleFormat;
 *   source?: string,
 *   sourceMap?: string,
 * }>}
 */

/**
 * @typedef {object} BundleOptions
 * @property {ModuleFormat} [format]
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
