import tape from "tape";
import { parseExtension } from "../src/extension.js";

const { test } = tape;

const q = JSON.stringify;

[
  {
    location: "https://example.com/",
    extension: ""
  },
  {
    location: "https://example.com/.",
    extension: ""
  },
  {
    location: "https://example.com/.bashrc",
    extension: "bashrc"
  },
  {
    location: "https://example.com/foo.js",
    extension: "js"
  },
  {
    location: "https://example.com/foo.tar.gz",
    extension: "gz"
  }
].forEach(c => {
  test(`parseExtension(${q(c.location)}) -> ${q(c.extension)}`, t => {
    t.plan(1);
    const extension = parseExtension(c.location);
    t.equal(
      extension,
      c.extension,
      `parseExtension(${q(c.location)}) === ${q(c.extension)}`
    );
    t.end();
  });
});
