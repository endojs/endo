// @ts-check

// q, as in quote, for error messages.
const q = JSON.stringify;

/**
 * Advances a partial module specifier solution by following the path
 * components in the given problem.
 * The problem may not produce a path that escapes the solution, that is, the
 * problem may not traverse up from an empty solution.
 * `Solve` returns false if the problem attempts to escape.
 * Advanding a partial solution is the core of `resolve`, `join`, and
 * `relativize`, which have different invariants.
 *
 * @param {Array<string>} solution - fully resolved path components, including
 * any from a prior path resolution initially.
 * @param {Array<string>} problem - partially resolved path components, that
 * is, including '.' and '..' components.
 * @returns {boolean} whether the solver terminated early because of a
 * nonsensical attempt to traverse above the root directory.
 */
const solve = (solution, problem) => {
  for (const part of problem) {
    if (part === '.' || part === '') {
      // no-op
    } else if (part === '..') {
      if (solution.length === 0) {
        return false;
      }
      solution.pop();
    } else {
      solution.push(part);
    }
  }
  return true;
};

/**
 * `Resolve` computes the full module specifier for a given imported module specifier
 * relative to the referrer module specifier.
 * In Node.js compartments, the referrer must be an internal module specifier
 * in the context of a compartment, and all internal module specifiers begin
 * with a "." path component.
 * The referent may be either internal or external.
 * In Node.js, fully resolved paths are valid module specifiers, but these
 * paths that begin with / are disallowed as they could be used to defeat
 * compartment containment.
 *
 * @param {string} spec - a path to resolve.
 * @param {string} referrer - the fully resolved path of referrer module.
 * @returns {string} the fully resolved path.
 */
export const resolve = (spec, referrer) => {
  spec = String(spec || '');
  referrer = String(referrer || '');

  if (spec.startsWith('/')) {
    throw Error(`Module specifier ${q(spec)} must not begin with "/"`);
  }
  if (!referrer.startsWith('./')) {
    throw Error(`Module referrer ${q(referrer)} must begin with "./"`);
  }

  const specParts = spec.split('/');
  const solution = [];
  const problem = [];
  if (specParts[0] === '.' || specParts[0] === '..') {
    const referrerParts = referrer.split('/');
    problem.push(...referrerParts);
    problem.pop();
    solution.push('.');
  }
  problem.push(...specParts);

  if (!solve(solution, problem)) {
    throw Error(
      `Module specifier ${q(spec)} via referrer ${q(
        referrer,
      )} must not traverse behind an empty path`,
    );
  }

  return solution.join('/');
};

/**
 * To construct a module map from a node_modules package, inter-package linkage
 * requires connecting a full base module specifier like "dependency-package"
 * to the other package's full internal module specifier like "." or
 * "./utility", to form a local full module specifier like "dependency-package"
 * or "dependency-package/utility".
 * This type of join may assert that the base is absolute and the referrent is
 * relative.
 *
 * @param {string} base - the fully resolved path of a module.
 * @param {string} spec - the partially resolved path of another module.
 * @returns {string} the fully resolved path of the specified module.
 */
export const join = (base, spec) => {
  spec = String(spec || '');
  base = String(base || '');

  const specParts = spec.split('/');
  const baseParts = base.split('/');

  if (specParts.length > 1 && specParts[0] === '') {
    throw Error(`Module specifier ${q(spec)} must not start with "/"`);
  }
  if (baseParts[0] === '.' || baseParts[0] === '..') {
    throw Error(`External module specifier ${q(base)} must be absolute`);
  }
  if (specParts[0] !== '.') {
    throw Error(`Internal module specifier ${q(spec)} must be relative`);
  }

  const solution = [];
  if (!solve(solution, specParts)) {
    throw Error(
      `Module specifier ${q(spec)} via base ${q(
        base,
      )} must not refer to a module outside of the base`,
    );
  }

  return [base, ...solution].join('/');
};

/**
 * Relativize turns absolute identifiers into relative identifiers.
 * In package.json, internal module identifiers can be either relative or
 * absolute, but compartments backed by node_modules always use relative module
 * specifiers for internal linkage.
 *
 * @param {string} spec - a module specifier that of a local module, that might
 * be erroneously framed without an initial '.' path component.
 * @returns {string} the idempotent module specifier, ensured to begin with
 * '.'.
 */
export const relativize = spec => {
  spec = String(spec || '');

  const solution = [];
  if (!solve(solution, spec.split('/'))) {
    throw Error(
      `Module specifier ${q(spec)} must not traverse behind an empty path`,
    );
  }

  return ['.', ...solution].join('/');
};
