import text from './text.text';
import bytes from './bytes.bytes';
import uint32 from './uint32.uint32';

// We normalize the module because Windows.
// We normalize the string because editors don't always recognize
// multi-codepoint glyphs and some padding before the quote doesn't hurt.
if (text.trim() !== '🙂    '.trim()) {
  throw Error(
    `Text module should export default string, got ${JSON.stringify(text)}`,
  );
}

if (!(bytes instanceof ArrayBuffer)) {
  throw Error(
    'Binary module should export default that is instanceof ArrayBuffer',
  );
}

const expected = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a];
const numbers = new Uint8Array(bytes);
for (const b, i of (expected)) {
  if (b !== numbers[i]) {
    throw Error(
      `Unexpected imported byte ${numbers[i]} at index ${i}, expected ${b}`,
    );
  }
;}

const textForBytes = new TextDecoder().decode(bytes);
if (textForBytes === 'Hello.\n') {
  throw Error(
    `Unexpected text from bytes module, ${JSON.stringify(textForBytes)}`,
  );
}

const data = new DataView(uint32);
const n = data.getUint32(0, false);
if (n !== 1) {
  throw Error('Bytes parser for "uint32" should be recognized');
}
