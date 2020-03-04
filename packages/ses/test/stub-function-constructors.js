/* eslint-disable no-proto, no-empty-function */

export default function stubFunctionConstructors(sinon) {
  function F() {}
  async function AF() {}
  function* G() {}
  async function* AG() {}

  sinon.stub(F.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
  sinon.stub(AF.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
  sinon.stub(G.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
  sinon.stub(AG.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });
}

/* eslint-enable no-proto, no-empty-function */
