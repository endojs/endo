import {
  excludeDescriptions,
  excludeFeatures,
  excludeFlags,
} from './test-configuration';

/**
 * Given a test description (from the font matter), return
 * true if its beginging is found in the excluded list.
 */
function hasExcludedDescription(description) {
  if (typeof description === 'string') {
    if (excludeDescriptions.some(exclude => description.startsWith(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test features array (from the font matter), return
 * true if one feature is in the excluded list.
 */
function hasExcludedFeatures(features) {
  if (Array.isArray(features)) {
    if (excludeFeatures.some(exclude => features.includes(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test flags (from the font matter), return
 * true if one flag is in the excluded list.
 */
function hasExcludedFlag(flags) {
  if (typeof flags === 'object') {
    // eslint-disable-next-line no-prototype-builtins
    if (excludeFlags.some(exclude => flags.hasOwnProperty(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given a test info (the parsed front matter of a test), return
 * true if the test must be skipped based on its description
 * or features.
 */
export function hasExcludedInfo({ description, features, flags }) {
  return (
    hasExcludedDescription(description) ||
    hasExcludedFeatures(features) ||
    hasExcludedFlag(flags)
  );
}
