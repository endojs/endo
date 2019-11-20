// Preserves that returned locations begin with root
// followed by slash-separated path elements.
export const makeRootedResolver = root => {
  const rootSlash = root.endsWith('/') ? root : `${root}/`;
  return (spec, referrer) => {
    spec = `${spec}`;
    referrer = `${referrer}`;

    if (!referrer.startsWith(rootSlash)) {
      throw TypeError(
        `Referrer ${referrer} cannot be outside of root ${rootSlash}`,
      );
    }

    // If spec is root-relative, take it from the root.
    const rooted = spec.startsWith('/');
    const relative =
      spec.startsWith('./') ||
      spec.startsWith('../') ||
      spec === '.' ||
      spec === '..';
    if (!rooted && !relative) {
      // Not rooted or relative.
      throw TypeError(`Only rooted or relative paths allowed, not ${spec}`);
    }

    const specEls = [];
    if (!rooted) {
      const relReferrer = referrer.slice(rootSlash.length);
      const lastSlash = relReferrer.lastIndexOf('/');
      if (lastSlash >= 0) {
        // Not rooted, so prepend the referrer's dirname to the elements.
        specEls.push(...relReferrer.slice(0, lastSlash).split('/'));
      }
    }
    // Append the specifier elements.
    specEls.push(...(rooted ? spec.slice(1) : spec).split('/'));

    // Find the subpath elements.
    const appendEls = [];
    let trailingDots = false;
    for (let i = 0; i < specEls.length; i += 1) {
      if (specEls[i] === '.' || specEls[i] === '') {
        // Do nothing.
        trailingDots = true;
      } else if (specEls[i] === '..') {
        // Navigate up in the appended elements, if possible.
        if (appendEls.length === 0) {
          throw TypeError(
            `Specifier ${spec} cannot navigate above root ${rootSlash}`,
          );
        }
        appendEls.pop();
        trailingDots = true;
      } else {
        // Navigate down according to the specifier.
        appendEls.push(specEls[i]);
        trailingDots = false;
      }
    }

    if (trailingDots) {
      // If there are any appendEls, ensure they end with a slash.
      appendEls.push('');
    }
    return rootSlash + appendEls.join('/');
  };
};
