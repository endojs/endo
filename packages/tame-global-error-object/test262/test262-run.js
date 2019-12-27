import path from "path";
// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from "@agoric/test262-runner";
import tameGlobalErrorObject from "../src/main";

test262Runner({
  testRootPath: path.join(__dirname, "./test"),
  excludePaths: [

  ],
  excludeDescriptions: [],
  excludeFeatures: [
    "cross-realm" // TODO: Evaluator does not create realms.
  ],
  excludeFlags: [
    "noStrict" // TODO: Evaluator does not support sloppy mode.
  ],
  excludeErrors: [],
  sourceTextCorrections: [],
  captureGlobalObjectNames: ["Error"],
  async test(testInfo, harness, { applyCorrections }) {
    const contents = applyCorrections(testInfo.contents);
    tameGlobalErrorObject();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${contents}`);
  }
});
