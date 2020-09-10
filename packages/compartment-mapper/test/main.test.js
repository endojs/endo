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

const fixture = new URL("node_modules/app/main.js", import.meta.url).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);

const endowments = {
  endowment: 42
};

const assertFixture = (t, namespace) => {
  const {
    avery,
    brooke,
    clarke,
    danny,
    builtin,
    endowed,
    typecommon,
    typemodule,
    typehybrid,
    typeparsers
  } = namespace;

  t.equal(avery, "Avery", "exports avery");
  t.equal(brooke, "Brooke", "exports brooke");
  t.equal(clarke, "Clarke", "exports clarke");
  t.equal(danny, "Danny", "exports danny");

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
  t.deepEqual(
    typeparsers,
    [42, 42, 42, 42],
    "parsers-specifying package carries exports"
  );
  t.equal(typehybrid, 42, "type=module and module= package carries exports");
};

const fixtureAssertionCount = 10;

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
  const { namespace } = await utility.import(endowments);
  // We pass the builtin module into the module map.
  modules = {
    builtin: namespace
  };
  t.end();
});

test("loadLocation", async t => {
  t.plan(fixtureAssertionCount);

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.import(endowments, modules);
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
  const { namespace } = await application.import(endowments, modules);
  assertFixture(t, namespace);
});

test("writeArchive / loadArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.equal(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "app.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "app.agar", fixture);
  const application = await loadArchive(fakeRead, "app.agar");
  const { namespace } = await application.import(endowments, modules);
  assertFixture(t, namespace);
});

test("writeArchive / importArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.equal(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "app.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "app.agar", fixture);
  const { namespace } = await importArchive(
    fakeRead,
    "app.agar",
    endowments,
    modules
  );
  assertFixture(t, namespace);
});
