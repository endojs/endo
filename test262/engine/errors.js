import { excludeErrors } from './test-configuration';

export function isExcludedError(errorObject) {
  const error = `${errorObject}`;
  if (excludeErrors.some(exclude => error.startsWith(exclude))) {
    return true;
  }

  return false;
}
