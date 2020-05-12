/* global Compartment, lockdown */
import test from "tape";

import "ses";

test("sanity", t => {
  t.equal(lockdown(), true, "lockdown runs successfully");
  const c = new Compartment();
  t.equal(c.evaluate("123"), 123, "simple evaluate succeeds");
  t.equal(
    c.evaluate("abc", { endowments: { abc: 456 } }),
    456,
    "endowment succeeds"
  );
  t.end();
});
