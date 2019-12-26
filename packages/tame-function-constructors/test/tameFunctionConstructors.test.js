import test from "tape";
import sinon from "sinon";
import tameFunctionConstructors from "../src/main";
import sandboxFunctionConstructors from "./sandboxFunctionConstructors";

test("Function.prototype.constructor", t => {
  t.plan(4);

  const sandbox = sinon.createSandbox();
  sandboxFunctionConstructors(sandbox);
  tameFunctionConstructors();

  // eslint-disable-next-line no-new-func
  t.doesNotThrow(() => Function(""));

  // eslint-disable-next-line no-proto
  t.throws(() => Error.__proto__.constructor(""), TypeError);
  t.throws(() => Function.prototype.constructor(""), TypeError);

  // eslint-disable-next-line no-eval
  const proto = Object.getPrototypeOf((0, eval)("(function() {})"));
  t.throws(() => proto.constructor(""), TypeError);

  sandbox.restore();
});

test("AsyncFunction.constructor", t => {
  t.plan(1);

  const sandbox = sinon.createSandbox();
  sandboxFunctionConstructors(sandbox);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)("(async function() {})"));
    t.throws(() => proto.constructor(""), TypeError);
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith("Unexpected token")) {
      t.pass("not supported");
    } else {
      throw e;
    }
  }

  sandbox.restore();
});

test("GeneratorFunction.constructor", t => {
  t.plan(1);

  const sandbox = sinon.createSandbox();
  sandboxFunctionConstructors(sandbox);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)("(function* () {})"));
    t.throws(() => proto.constructor(""), TypeError);
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith("Unexpected token")) {
      t.pass("not supported");
    } else {
      throw e;
    }
  }

  sandbox.restore();
});

test("AsyncGeneratorFunction.constructor", t => {
  t.plan(1);

  const sandbox = sinon.createSandbox();
  sandboxFunctionConstructors(sandbox);
  tameFunctionConstructors();

  try {
    // eslint-disable-next-line no-eval
    const proto = Object.getPrototypeOf((0, eval)("(async function* () {})"));
    t.throws(() => proto.constructor(""), TypeError);
  } catch (e) {
    if (e instanceof SyntaxError && e.message.startsWith("Unexpected token")) {
      t.pass("not supported");
    } else {
      throw e;
    }
  }

  sandbox.restore();
});
