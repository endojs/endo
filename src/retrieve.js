// TODO: Make protoHandlers a Map, to avoid attacker-controlled keys.
export const makeProtocolRetriever = protoHandlers => {
  return async moduleId => {
    const url = new URL(moduleId);
    const bareProtocol = url.protocol.slice(0, -1);
    const handler = protoHandlers.get(bareProtocol);
    if (handler === undefined) {
      throw TypeError(`Protocol retriever for ${url.protocol} not specified`);
    }
    return handler(url);
  };
};
