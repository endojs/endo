/* eslint-disable no-proto, no-empty-function */

export default function sandboxFunctionConstructors(sandbox) {
  function F() {}
  async function AF() {}
  function* G() {}
  async function* AG() {}

  sandbox.stub(F.__proto__, "constructor").callsFake(() => {});
  sandbox.stub(AF.__proto__, "constructor").callsFake(() => {});
  sandbox.stub(G.__proto__, "constructor").callsFake(() => {});
  sandbox.stub(AG.__proto__, "constructor").callsFake(() => {});
}

/* eslint-enable no-proto, no-empty-function */
