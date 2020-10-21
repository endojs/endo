import test from 'tape';
import makeHardener from '@agoric/make-hardener';

test("sanity", t => {
  t.plan(3);

  const harden = makeHardener();
  const p = {};
  const o = { p };

  // Harden the "fringe" of object literals.
  harden({ Object, Function });

  const q = harden(o);

  t.ok(o === q);
  t.ok(Object.isFrozen(o));
  t.ok(Object.isFrozen(p));
});
