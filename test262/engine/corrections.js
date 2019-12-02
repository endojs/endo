import { sourceTextCorrections } from './configuration';

export function applyCorrection(src) {
  for (const correction of sourceTextCorrections) {
    src = src.replace(...correction);
  }
  return src;
}
