const ntypeof = specimen => (specimen === null ? 'null' : typeof specimen);

export const localApplyFunction = (t, args) => {
  const { details: X, quote: q } = assert;
  assert.typeof(
    t,
    'function',
    X`Cannot invoke target as a function; typeof target is ${q(ntypeof(t))}`,
    TypeError,
  );
  return t(...args);
};

export const localApplyMethod = (t, method, args) => {
  const { details: X, quote: q } = assert;
  if (method === undefined || method === null) {
    // Base case; bottom out to apply functions.
    return localApplyFunction(t, args);
  }
  if (t === undefined || t === null) {
    assert.fail(
      X`Cannot deliver ${q(method)} to target; typeof target is ${q(
        ntypeof(t),
      )}`,
      TypeError,
    );
  }
  const fn = t[method];
  if (fn === undefined) {
    // Reflect.ownKeys only works on objects, so we use the keys of the
    // ownPropertyDescriptors object.
    const skeys = Reflect.ownKeys(Object.getOwnPropertyDescriptors(t))
      .map(k => String(k))
      .sort();
    assert.fail(
      X`target has no method ${q(method)}, has ${q(skeys)}`,
      TypeError,
    );
  }
  const ftype = ntypeof(fn);
  assert.typeof(
    fn,
    'function',
    X`invoked method ${q(method)} is not a function; it is a ${q(ftype)}`,
    TypeError,
  );
  return fn.apply(t, args);
};

export const localGet = (t, key) => t[key];
