/**
 * @typedef {'getExport' | 'nestedEvaluate' | 'endoZipBase64'} ModuleFormat
 */

/**
 * @callback BundleSource
 * @param {string} startFilename - the filepath to start the bundling from
 * @param {ModuleFormat=} moduleFormat
 * @param {Object=} powers
 * @param {ReadFn=} powers.read
 * @param {CanonicalFn=} powers.canonical
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
