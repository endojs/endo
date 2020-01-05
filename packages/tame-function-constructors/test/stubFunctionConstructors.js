/* eslint-disable no-proto, no-empty-function */

export default function stubFunctionConstructors(sinon) {
  function F() {}
  async function AF() {}
  function* G() {}
  async function* AG() {}

  sinon.stub(F.__proto__, 'constructor').callsFake(() => {});
  sinon.stub(AF.__proto__, 'constructor').callsFake(() => {});
  sinon.stub(G.__proto__, 'constructor').callsFake(() => {});
  sinon.stub(AG.__proto__, 'constructor').callsFake(() => {});
}

/* eslint-enable no-proto, no-empty-function */
