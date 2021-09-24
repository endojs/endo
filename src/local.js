const q = JSON.stringify;

const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

export const localApplyFunction = (t, args) => {
  if (!(t instanceof Function)) {
    const ftype = ntypeof(t);
    throw TypeError(
      `Cannot invoke target as a function; typeof target is ${q(ftype)}`,
    );
  }
  return t(...args);
};

export const localApplyMethod = (t, method, args) => {
  if (method === undefined || method === null) {
    return localApplyFunction(t, args);
  }
  if (t === undefined || t === null) {
    const ftype = ntypeof(t);
    throw TypeError(
      `Cannot deliver ${q(method)} to target; typeof target is ${q(ftype)}`,
    );
  }
  const fn = t[method];
  if (!(fn instanceof Function)) {
    const ftype = ntypeof(fn);
    if (ftype === 'undefined') {
      const names = Object.getOwnPropertyNames(t).sort();
      throw TypeError(`target has no method ${q(method)}, has ${q(names)}`);
    }
    throw TypeError(
      `invoked method ${q(method)} is not a function; it is a ${q(ftype)}`,
    );
  }
  return fn.apply(t, args);
};

export const localGet = (t, key) => t[key];
