import tape from "tape";
import { parseRequires } from "../src/parse-requires.js";

const { test } = tape;

test("parse unique require calls", t => {
  t.plan(1);
  const code = `
    require("b"); // sorted later

    // require("bogus"); // not discovered

    function square(require) {
      require("shadowed"); // over-shadowed by argument
    }

    require("a");

    function c() {
      require("c"); // found despite inner scope
    }

    require("a"); // de-duplicated

    require( "d" ); // such space

    require("bogus", "bogus", "bogus");

    require("id\\""); // found, despite inner quote
  `;
  const requires = parseRequires(code);
  t.deepEqual(requires, ["a", "b", "c", "d", 'id"']);
});
