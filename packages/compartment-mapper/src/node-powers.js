// @ts-check

/**
 * @param {typeof import('fs')} fs
 * @returns {ReadPowers}
 */
export const makeNodeReadPowers = fs => {
  /**
   * @param {string} location
   */
  const read = async location =>
    fs.promises.readFile(new URL(location).pathname);

  /**
   * @param {string} location
   */
  const canonical = async location => {
    try {
      if (location.endsWith('/')) {
        const realPath = await fs.promises.realpath(
          new URL(location).pathname.replace(/\/$/, ''),
        );
        return new URL(`${realPath}/`, location).toString();
      } else {
        const realPath = await fs.promises.realpath(new URL(location).pathname);
        return new URL(realPath, location).toString();
      }
    } catch {
      return location;
    }
  };

  return { read, canonical };
};

/**
 * @param {typeof import('fs')} fs
 * @returns {WritePowers}
 */
export const makeNodeWritePowers = fs => {
  /**
   * @param {string} location
   * @param {Uint8Array} data
   */
  const write = async (location, data) =>
    fs.promises.writeFile(new URL(location).pathname, data);

  return { write };
};
