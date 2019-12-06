export const makeProtocolRetriever = protoHandlers => {
  const protoMap = new Map(Object.entries(protoHandlers));
  return absoluteSpecifier =>
    new Promise(resolve => {
      const url = new URL(absoluteSpecifier);
      const { protocol } = url;
      const handler = protoMap.get(protocol);
      if (handler === undefined) {
        throw TypeError(
          `Protocol retriever for ${absoluteSpecifier} not specified`,
        );
      }
      resolve(handler(url));
    });
};
