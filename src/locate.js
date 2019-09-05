export const makeSuffixLocator = (suffix = '.js') => {
  return async scopedRef => {
    // This constructor throws on anything but absolute URLs.
    const url = new URL(scopedRef);

    // Translate trailing slash to an index reference.
    const path = url.pathname.endsWith('/')
      ? `${url.pathname}index`
      : url.pathname;

    // Translate missing suffix to have one.
    const sfxPath = path.endsWith(suffix) ? path : `${path}${suffix}`;

    const { href } = new URL(sfxPath, url);
    return href;
  };
};
