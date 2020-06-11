import tape from "tape";
import { join } from "../src/node-module-specifier.js";

const { test } = tape;

const q = JSON.stringify;

[
  { via: "", rel: "./", res: "" },
  { via: "external", rel: "./main.js", res: "external/main.js" },
  {
    via: "external",
    rel: "./internal/main.js",
    res: "external/internal/main.js"
  },
  { via: "@org/lib", rel: "./lib/app.js", res: "@org/lib/lib/app.js" },
  { via: "external", rel: "./internal/../main.js", res: "external/main.js" }
].forEach(c => {
  test(`join(${q(c.via)}, ${q(c.rel)}) -> ${q(c.res)}`, t => {
    t.plan(1);
    const res = join(c.via, c.rel);
    t.equal(res, c.res);
    t.end();
  });
});

test("throws if the specifier is absolute", t => {
  t.throws(() => {
    join("", "/");
  }, /Module specifier "\/" must not start with "\/"/);
  t.end();
});

test("throws if the specifier is absolute", t => {
  t.throws(() => {
    join("from", "to");
  }, /Base module specifier "from" must be relative, being either "\." or starting with "\.\/"/);
  t.end();
});

test("throws if the referrer is relative", t => {
  t.throws(() => {
    join("./", "foo");
  }, /External module base "\.\/" must be absolute/);
  t.end();
});

test("throws if specifier reaches outside of base", t => {
  t.throws(() => {
    join("path/to/base", "./deeper/../..");
  }, /Module specifier "\.\/deeper\/\.\.\/.\." via referrer "path\/to\/base" must not refer to a module outside of the base/);
  t.end();
});
