export const makeProtocolRetriever = protoHandlers => {
  return async absoluteSpecifier => {
    const url = new URL(absoluteSpecifier);
    const protocol = url.protocol;
    const handler = protoHandlers[protocol];
    if (handler === undefined) {
      throw TypeError(`Protocol retriever for ${absoluteSpecifier} not specified`);
    }
    return handler(url);
  };
};
