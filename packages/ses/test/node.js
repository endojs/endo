// Module node.js provides resolve and locate hooks that follow a subset of
// Node.js module semantics.

import { makeStaticRetriever, makeImporter } from './import-commons.js';

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

export const makeLocator = root => {
  if (!root.endsWith('/')) {
    root += '/';
  }
  return spec => {
    if (!isRelative(spec)) {
      throw TypeError(`Cannot locate module ${q(spec)}.`);
    }
    return new URL(spec, root).toString();
  };
};

const wrapImporterWithMeta = (importer, meta) => async specifier => {
  const moduleRecord = await importer(specifier);
  return { record: moduleRecord, meta };
};

// makeNodeImporter conveniently curries makeImporter with a Node.js style
// locator and static file retriever.
export const makeNodeImporter = sources => (
  compartmentLocation,
  options = {},
) => {
  const locate = makeLocator(compartmentLocation);
  const retrieve = makeStaticRetriever(sources);
  if (options.meta) {
    return wrapImporterWithMeta(makeImporter(locate, retrieve), options.meta);
  }
  return makeImporter(locate, retrieve);
};
