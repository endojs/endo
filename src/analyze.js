export const makeTypeAnalyzer = typeMap => async resourceStream => {
  const { type } = resourceStream;
  const handler = typeMap[type];
  if (handler === undefined) {
    throw TypeError(`Type analyzer for '${type}' not specified`);
  }
  return handler(resourceStream);
};
