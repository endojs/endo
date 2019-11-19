export const makeSuffixLocator = (suffix = '.js') => {
  return async scopedRef => {
    // This constructor throws on anything but absolute URLs.
    // TODO: Ensure this is powerless, or inline string-manipulation code.
    const url = new URL(scopedRef);
    let path = url.pathname;

    // Translate trailing slash to an index reference.
    if (path.endsWith('/')) {
      path = `${path}index`;
    }

    // Translate missing suffix to have one.
    if (!path.endsWith(suffix)) {
      path = `${path}${suffix}`;
    }

    const { href } = new URL(path, url);
    return href;
  };
};
