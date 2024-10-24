import { escapeRegExp } from '@endo/regexp-escape';

/**
 * @param {string} pattern a subpath pattern of asterisk-delimited literals
 * @param {string} pattern of respective replacements delimited by asterisks
 */
export const makeSubpathReplacer = (pattern, replacement) => {
  const patternParts = pattern.split('*');
  const replacementParts = replacement.split('*');
  const re = new RegExp(`^${patternParts.map(escapeRegExp).join('(.*)')}$`);
  return path => {
    if (patternParts.length !== replacementParts.length) {
      return null;
    }
    const match = re.exec(path);
    if (match === null) {
      return null;
    }
    let reconstruction = '';
    let i;
    for (i = 0; i < replacementParts.length - 1; i++) {
      reconstruction += replacementParts[i] + match[i + 1];
    }
    reconstruction += replacementParts[i];
    return reconstruction;
  };
};
