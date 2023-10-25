import { constants } from 'node:fs';

/**
 * @returns {import('node:fs').constants.F_OK}
 */
export function bambalam() {
  return constants.F_OK;
}
