// import "./ses-lockdown.js";
import "ses";
import fs from "fs";
import tape from "tape";
import {
  loadLocation,
  importLocation,
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
  const { avery, brooke, builtin, endowed, typecommon, typemodule } = namespace;
  t.equal(avery, "Avery", "exports avery");
  t.equal(brooke, "Brooke", "exports brooke");
  t.equal(builtin, "builtin", "exports builtin");
  t.equal(endowed, endowments.endowment, "exports endowment");
  t.deepEqual(
    typecommon,
    [42, 42, 42, 42],
    "type=common package carries exports"
  );
  t.deepEqual(
    typemodule,
    [42, 42, 42, 42],
    "type=module package carries exports"
  );
};

const fixtureAssertionCount = 6;

// The "create builtin" test prepares a builtin module namespace object that
// gets threaded into all subsequent tests to satisfy the "builtin" module
// dependency of the application package.

const builtinLocation = new URL(
  "node_modules/builtin/builtin.js",
  import.meta.url
).toString();

let modules;

test("create builtin", async t => {
  const utility = await loadLocation(read, builtinLocation);
  const { namespace } = await utility.execute(endowments);
  // We pass the builtin module into the module map.
  // We also pass a copy as "avery" to ensure that the real "avery" module
  // overshadows the builtin.
  modules = {
    builtin: namespace,
    avery: namespace
  };
  t.end();
});

test("loadLocation", async t => {
  t.plan(fixtureAssertionCount);

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.execute(endowments, modules);
  assertFixture(t, namespace);
});

test("importLocation", async t => {
  t.plan(fixtureAssertionCount);

  const { namespace } = await importLocation(
    read,
    fixture,
    endowments,
    modules
  );
  assertFixture(t, namespace);
});

test("makeArchive / parseArchive", async t => {
  t.plan(fixtureAssertionCount);

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive);
  const { namespace } = await application.execute(endowments, modules);
  assertFixture(t, namespace);
});

test("writeArchive / loadArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.equal(path, "danny.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "danny.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "danny.agar", fixture);
  const application = await loadArchive(fakeRead, "danny.agar");
  const { namespace } = await application.execute(endowments, modules);
  assertFixture(t, namespace);
});

test("writeArchive / importArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.equal(path, "danny.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "danny.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "danny.agar", fixture);
  const { namespace } = await importArchive(
    fakeRead,
    "danny.agar",
    endowments,
    modules
  );
  assertFixture(t, namespace);
});
