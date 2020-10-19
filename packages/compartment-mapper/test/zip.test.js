import tape from "tape";
import "../src/zip/types.js";
import { ZipWriter } from "../src/zip/writer.js";
import { ZipReader } from "../src/zip/reader.js";

const { test } = tape;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

test("zip round trip", async t => {
  t.plan(3);

  const expectedDate = new Date(1970, 1);

  const writer = new ZipWriter();
  writer.write("hello/hello.txt", textEncoder.encode("Hello, World!\n"), {
    mode: 0o600,
    date: expectedDate
  });

  const reader = new ZipReader(writer.data);
  const text = textDecoder.decode(reader.read("hello/hello.txt"));
  const { mode, date } = reader.stat("hello/hello.txt");

  t.equal(text, "Hello, World!\n", "text should match");
  t.equal(mode, 0o100600, "mode should match");
  t.equal(
    date.getUTCMilliseconds(),
    expectedDate.getUTCMilliseconds(),
    "date should match"
  );
});
