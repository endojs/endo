// q, as in quote, for error messages.
const q = JSON.stringify;

const isRelative = spec =>
  spec.startsWith("./") ||
  spec.startsWith("../") ||
  spec === "." ||
  spec === "..";

const normalize = (parts, path) => {
  for (const part of path) {
    if (part === "." || part === "") {
      // no-op
    } else if (part === "..") {
      if (parts.length === 0) {
        return undefined;
      }
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts;
};

export const resolve = (spec, referrer) => {
  spec = String(spec || "");
  referrer = String(referrer || "");

  if (spec.startsWith("/")) {
    throw new Error(`Module specifier ${q(spec)} must not begin with "/"`);
  }
  if (!referrer.startsWith("./")) {
    throw new Error(`Module referrer ${q(referrer)} must begin with "./"`);
  }

  let parts = [];
  const path = [];
  if (isRelative(spec)) {
    path.push(...referrer.split("/"));
    path.pop();
    parts.push(".");
  }
  path.push(...spec.split("/"));

  parts = normalize(parts, path);
  if (parts === undefined) {
    throw new Error(
      `Module specifier ${q(spec)} via referrer ${q(
        referrer
      )} must not traverse behind an empty path`
    );
  }

  return parts.join("/");
};

// To construct a module map from a node_modules package,
// inter-package linkage requires connecting a full base module specifier like
// "dependency-package" to the other package's full internal module specifier
// like "." or "./utility", to form a local full module specifier like
// "dependency-package" or "dependency-package/utility".
// This type of join may assert that the base is absolute and the referrent is
// relative.
export const join = (base, spec) => {
  spec = String(spec || "");
  base = String(base || "");

  if (spec.startsWith("/")) {
    throw new Error(`Module specifier ${q(spec)} must not start with "/"`);
  }
  if (base.startsWith("./") || base === ".") {
    throw new Error(
      `External module base ${q(
        base
      )} must be absolute, must not be "." nor begin with "./"`
    );
  }
  if (!spec.startsWith("./") && spec !== ".") {
    throw new Error(
      `Base module specifier ${q(
        base
      )} must be relative, being either "." or starting with "./"`
    );
  }

  const parts = normalize([], spec.split("/"));
  if (parts === undefined) {
    throw new Error(
      `Module specifier ${q(spec)} via referrer ${q(
        base
      )} must not refer to a module outside of the base`
    );
  }

  return [base, ...parts].join("/");
};

// Relativize turns absolute identifiers into relative identifiers.
// In package.json, internal module identifiers can be either relative or
// absolute, but Endo compartments backed by node_modules always use relative
// module specifiers for internal linkage.
export const relativize = spec => {
  spec = String(spec || "");

  const parts = normalize([], spec.split("/"));
  if (parts === undefined) {
    throw Error(
      `Module specifier ${q(spec)} must not traverse behind an empty path`
    );
  }

  return [".", ...parts].join("/");
};
