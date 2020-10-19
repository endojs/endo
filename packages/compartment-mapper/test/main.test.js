// import "./ses-lockdown.js";
import "ses";
import fs from "fs";
import test from "ava";
import {
  loadLocation,
  importLocation,
  makeArchive,
  writeArchive,
  parseArchive,
  loadArchive,
  importArchive
} from "../src/main.js";

const fixture = new URL("node_modules/app/main.js", import.meta.url).toString();

const read = async location => fs.promises.readFile(new URL(location).pathname);

const globals = {
  globalProperty: 42,
  globalLexical: "global" // should be overshadowed
};

const globalLexicals = {
  globalLexical: "globalLexical"
};

const assertFixture = (t, namespace) => {
  const {
    avery,
    brooke,
    clarke,
    danny,
    builtin,
    receivedGlobalProperty,
    receivedGlobalLexical,
    typecommon,
    typemodule,
    typehybrid,
    typeparsers
  } = namespace;

  t.is(avery, "Avery", "exports avery");
  t.is(brooke, "Brooke", "exports brooke");
  t.is(clarke, "Clarke", "exports clarke");
  t.is(danny, "Danny", "exports danny");

  t.is(builtin, "builtin", "exports builtin");

  t.is(receivedGlobalProperty, globals.globalProperty, "exports global");
  t.is(
    receivedGlobalLexical,
    globalLexicals.globalLexical,
    "exports global lexical"
  );
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
  t.is(typehybrid, 42, "type=module and module= package carries exports");
};

const fixtureAssertionCount = 11;

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
  const { namespace } = await utility.import({ globals });
  // We pass the builtin module into the module map.
  modules = {
    builtin: namespace
  };
  t.pass("done");
});

test("loadLocation", async t => {
  t.plan(fixtureAssertionCount);

  const application = await loadLocation(read, fixture);
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});

test("importLocation", async t => {
  t.plan(fixtureAssertionCount);

  const { namespace } = await importLocation(read, fixture, {
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});

test("makeArchive / parseArchive", async t => {
  t.plan(fixtureAssertionCount);

  const archive = await makeArchive(read, fixture);
  const application = await parseArchive(archive);
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});

test("writeArchive / loadArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.is(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.is(path, "app.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "app.agar", fixture);
  const application = await loadArchive(fakeRead, "app.agar");
  const { namespace } = await application.import({
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});

test("writeArchive / importArchive", async t => {
  t.plan(fixtureAssertionCount + 2);

  // Single file slot.
  let archive;
  const fakeRead = async path => {
    t.is(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.is(path, "app.agar");
    archive = content;
  };

  await writeArchive(fakeWrite, read, "app.agar", fixture);
  const { namespace } = await importArchive(fakeRead, "app.agar", {
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});
