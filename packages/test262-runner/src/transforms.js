export function applyCorrections({ sourceTextCorrections = [] }, src) {
  for (const correction of sourceTextCorrections) {
    src = src.replace(...correction);
  }
  return src;
}
