import { excludeErrors } from './configuration';

export function isExcludedError(errorObject) {
  const error = `${errorObject}`;
  if (excludeErrors.some(exclude => error.includes(exclude))) {
    return true;
  }

  return false;
}
