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
const archiveFixture = new URL("app.agar", import.meta.url).toString();

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
    builtin,
    receivedGlobalProperty,
    receivedGlobalLexical,
  } = namespace;

  t.equal(avery, "Avery", "exports avery");
  t.equal(brooke, "Brooke", "exports brooke");
  t.equal(clarke, "Clarke", "exports clarke");

  t.equal(builtin, "builtin", "exports builtin");

  t.equal(receivedGlobalProperty, globals.globalProperty, "exports global");
  t.equal(
    receivedGlobalLexical,
    globalLexicals.globalLexical,
    "exports global lexical"
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
  const { namespace } = await utility.import({ globals });
  // We pass the builtin module into the module map.
  modules = {
    builtin: namespace
  };
  t.end();
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

test("makeArchive / parseArchive with a prefix", async t => {
  t.plan(fixtureAssertionCount);

  // Zip files support an arbitrary length prefix.
  const archive = await makeArchive(read, fixture);
  const prefixArchive = new Uint8Array(archive.length + 10);
  prefixArchive.set(archive, 10);

  const application = await parseArchive(prefixArchive);
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
    t.equal(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "app.agar");
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
    t.equal(path, "app.agar");
    return archive;
  };
  const fakeWrite = async (path, content) => {
    t.equal(path, "app.agar");
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

test("importArchive", async t => {
  t.plan(fixtureAssertionCount);

  const { namespace } = await importArchive(read, archiveFixture, {
    globals,
    globalLexicals,
    modules,
    Compartment
  });
  assertFixture(t, namespace);
});
