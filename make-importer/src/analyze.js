export const makeTypeAnalyzer = typeMap => resourceStream =>
  new Promise(resolve => {
    const { type } = resourceStream;
    const handler = typeMap[type];
    if (handler === undefined) {
      throw TypeError(`Type analyzer for '${type}' not specified`);
    }
    resolve(handler(resourceStream));
  });
