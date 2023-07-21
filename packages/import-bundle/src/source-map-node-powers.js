import { whereEndoCache } from '@endo/where';

/**
 * @typedef {object} Process
 * @property {Record<string, string | undefined>} env
 * @property {string} platform
 */

/**
 * @param {object} powers
 * @param {typeof import('node:url')} powers.url
 * @param {typeof import('node:os')} powers.os
 * @param {Process} powers.process
 */
export const makeEndoSourceMapLocator = powers => {
  const { url, os, process } = powers;

  const home = os.userInfo().homedir;
  const cacheDirectory = whereEndoCache(process.platform, process.env, {
    home,
  });
  const cacheLocation = url.pathToFileURL(cacheDirectory);

  /**
   * @param {object} details
   * @param {string} details.sha512
   */
  const whereSourceMap = ({ sha512 }) => {
    const sha512Head = sha512.slice(0, 2);
    const sha512Tail = sha512.slice(2);
    return `${cacheLocation}/source-map/${sha512Head}/${sha512Tail}.map.json`;
  };

  return whereSourceMap;
};
