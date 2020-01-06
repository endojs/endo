export default function stubLegacyAccessors(sinon) {
  sinon.stub(Object.prototype, '__defineGetter__').callsFake(() => {});
  sinon.stub(Object.prototype, '__defineSetter__').callsFake(() => {});
  sinon.stub(Object.prototype, '__lookupGetter__').callsFake(() => {});
  sinon.stub(Object.prototype, '__lookupSetter__').callsFake(() => {});
}
