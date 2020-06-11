import tape from "tape";
import { relativize } from "../src/node-module-specifier.js";

const { test } = tape;

const q = JSON.stringify;

[
  { spec: "index.js", rel: "./index.js" },
  { spec: "./index.js", rel: "./index.js" }
].forEach(c => {
  test(`relativize(${q(c.spec)}) -> ${q(c.rel)}`, t => {
    t.plan(1);
    const rel = relativize(c.spec);
    t.equal(rel, c.rel);
    t.end();
  });
});
