/* global Compartment */
import test from "tape";

import * as SES from "ses";

test("sanity", t => {
  t.equal(SES.lockdown(), true, "lockdown runs successfully");
  const c = new Compartment();
  t.equal(c.evaluate("123"), 123, "simple evaluate succeeds");
  t.equal(
    c.evaluate("abc", { endowments: { abc: 456 } }),
    456,
    "endowment succeeds"
  );
  t.end();
});
