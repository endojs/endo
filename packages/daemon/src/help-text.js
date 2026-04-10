// @ts-check

/**
 * Help documentation for Endo daemon interfaces.
 *
 * Each help object maps method names to documentation strings.
 * The special key '' (empty string) provides an overview of the interface.
 *
 * Documentation is loaded from help.md using the helpdown scanner.
 */

import { readHelpTextFileSync } from './helpdown.js';

/**
 * @typedef {Record<string, string>} HelpText
 */

const helpMap = readHelpTextFileSync(new URL('./help.md', import.meta.url));

/** @type {HelpText} */
export const directoryHelp = helpMap.get('EndoDirectory') || {};

/** @type {HelpText} */
export const mailHelp = helpMap.get('Mail Operations') || {};

/** @type {HelpText} */
export const guestHelp = helpMap.get('EndoGuest') || {};

/** @type {HelpText} */
export const hostHelp = helpMap.get('EndoHost') || {};

/** @type {HelpText} */
export const blobHelp = helpMap.get('EndoReadable') || {};

/** @type {HelpText} */
export const endoHelp = helpMap.get('Endo Bootstrap') || {};

/** @type {HelpText} */
export const readableTreeHelp = helpMap.get('ReadableTree') || {};

/** @type {HelpText} */
export const mountHelp = helpMap.get('EndoMount') || {};

/** @type {HelpText} */
export const mountFileHelp = helpMap.get('EndoMountFile') || {};

/**
 * Create a help function that looks up documentation.
 *
 * @param {HelpText} helpText - The help text object
 * @param {HelpText[]} [fallbacks] - Additional help texts to search
 * @returns {(methodName?: string) => string}
 */
export const makeHelp = (helpText, fallbacks = []) => {
  /**
   * @param {string} [methodName]
   * @returns {string}
   */
  const help = (methodName = '') => {
    if (methodName in helpText) {
      return helpText[methodName];
    }
    for (const fallback of fallbacks) {
      if (methodName in fallback) {
        return fallback[methodName];
      }
    }
    if (methodName === '') {
      return 'No documentation available for this interface.';
    }
    return `No documentation available for method "${methodName}".`;
  };
  return help;
};

harden(directoryHelp);
harden(mailHelp);
harden(guestHelp);
harden(hostHelp);
harden(blobHelp);
harden(readableTreeHelp);
harden(mountHelp);
harden(mountFileHelp);
harden(endoHelp);
harden(makeHelp);
