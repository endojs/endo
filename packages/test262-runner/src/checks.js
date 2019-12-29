/**
 * Given the relative path to a test, return true if the test must
 * be skiped because it contains a blacklisted path segment. We use
 * the relative path to avoid a false positive on the root path.
 */
export function hasExcludedPath({ excludePaths = [] }, filePath) {
  if (typeof filePath === 'string') {
    if (excludePaths.some(exclude => filePath.includes(exclude))) {
      return true;
    }
  }
  return false;
}

/**
 * Given an error instance, return true if the test must
 * be skiped because it contains a whtielisted error message.
 */
export function isExcludedError({ excludeErrors = [] }, errorObject) {
  const error = `${errorObject}`;
  if (excludeErrors.some(exclude => error.startsWith(exclude))) {
    return true;
  }

  return false;
}

/**
 * Given a test description (from the font matter), return
 * true if its beginging is found in the excluded list.
 */
function hasExcludedDescription({ excludeDescriptions = [] }, description) {
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
function hasExcludedFeatures({ excludeFeatures = [] }, features) {
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
function hasExcludedFlag({ excludeFlags = [] }, flags) {
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
export function hasExcludedInfo(options, { description, features, flags }) {
  return (
    hasExcludedDescription(options, description) ||
    hasExcludedFeatures(options, features) ||
    hasExcludedFlag(options, flags)
  );
}
