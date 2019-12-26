export default function sandboxLegacyAccessors(sandbox) {
  sandbox.stub(Object.prototype, "__defineGetter__").callsFake(() => {});
  sandbox.stub(Object.prototype, "__defineSetter__").callsFake(() => {});
  sandbox.stub(Object.prototype, "__lookupGetter__").callsFake(() => {});
  sandbox.stub(Object.prototype, "__lookupSetter__").callsFake(() => {});
}
