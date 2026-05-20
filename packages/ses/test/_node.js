// Pure path-arithmetic resolveNode used by node.test.js.
// Hosted in packages/ses/test/ because the test itself does not reach
// down to @endo/module-source. The larger _node.js in @endo/ses-test
// adds makeNodeImporter and related helpers that do.

const q = JSON.stringify;

const isRelative = spec =>
  spec.startsWith('./') ||
  spec.startsWith('../') ||
  spec === '.' ||
  spec === '..';

export const resolveNode = (spec, referrer) => {
  spec = String(spec || '');
  referrer = String(referrer || '');

  if (spec.startsWith('/')) {
    throw TypeError(`Module specifier ${q(spec)} must not begin with "/"`);
  }
  if (!referrer.startsWith('./')) {
    throw TypeError(`Module referrer ${q(referrer)} must begin with "./"`);
  }

  const parts = [];
  const path = [];
  if (isRelative(spec)) {
    path.push(...referrer.split('/'));
    path.pop();
    parts.push('.');
  }
  path.push(...spec.split('/'));

  for (const part of path) {
    if (part === '.' || part === '') {
      // no-op
    } else if (part === '..') {
      if (path.length === 0) {
        throw TypeError(
          `Module specifier ${q(spec)} via referrer ${q(
            referrer,
          )} must not traverse behind an empty path`,
        );
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
};
