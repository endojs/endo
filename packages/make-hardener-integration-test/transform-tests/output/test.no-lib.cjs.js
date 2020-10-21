'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var test = _interopDefault(require('tape'));
var makeHardener = _interopDefault(require('@agoric/make-hardener'));

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
