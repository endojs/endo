export const DEFAULT_READFILE = path => {
  throw TypeError(`Reading files like ${path} not implemented`);
};

export const makeFetchRetriever = (fetch, readFile = DEFAULT_READFILE) => {
  return async moduleId => {
    const url = new URL(moduleId);
    if (url.protocol === 'file:') {
      return readFile(url.pathname);
    }
    const resp = await fetch(url.href);
    if (!resp.ok) {
      throw Error(`fetching ${url.href}: ${resp.status} ${resp.statusText}`);
    }
    return resp.text();
  };
};
