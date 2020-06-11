import "./ses-lockdown.js";
import fs from "fs";
import tape from "tape";
import {
  loadPath,
  importPath,
  makeArchive,
  writeArchive,
  parseArchive,
  loadArchive,
  importArchive
} from "../src/main.js";

const { test } = tape;

const fixture = new URL(
  "node_modules/danny/main.js",
  import.meta.url
).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);

const endowments = {
  endowment: 42
};

const assertFixture = (t, namespace) => {
  const { avery, brooke, endowed } = namespace;
  t.equal(avery, "Avery");
  t.equal(brooke, "Brooke");
  t.equal(endowed, endowments.endowment);
};

const fixtureAssertionCount = 3;

test("loadPath", async t => {
  t.plan(fixtureAssertionCount);

  const application = await loadPath(read, fixture);
  const { namespace } = await application.execute(endowments);
  assertFixture(t, namespace);
});

test("importPath", async t => {
  t.plan(fixtureAssertionCount);

  const { namespace } = await importPath(read, fixture, endowments);
  assertFixture(t, namespace);
});

test("makeArchive / parseArchive", async t => {
  t.plan(fixtureAssertionCount);

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive);
  const { namespace } = await application.execute(endowments);
  assertFixture(t, namespace);
});

test("writeArchive / loadArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.assert(path, "danny.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.assert(path, "danny.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "danny.agar", fixture);
  const application = await loadArchive(fakeRead, fixture, endowments);
  const { namespace } = await application.execute(endowments);
  assertFixture(t, namespace);
});

test("writeArchive / importArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.assert(path, "danny.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.assert(path, "danny.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "danny.agar", fixture);
  const { namespace } = await importArchive(fakeRead, fixture, endowments);
  assertFixture(t, namespace);
});
