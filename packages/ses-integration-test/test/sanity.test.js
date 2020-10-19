import test from "tape";

import "ses";

test("sanity", t => {
  t.is(lockdown(), true, "lockdown runs successfully");
  const c = new Compartment({ abc: 456 });
  t.is(c.evaluate("123"), 123, "simple evaluate succeeds");
  t.is(c.evaluate("abc"), 456, "endowment succeeds");
});
