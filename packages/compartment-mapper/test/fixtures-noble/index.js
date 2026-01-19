const { sha256 } = require('@noble/hashes/sha2');

// Example data to hash
const textData = new TextEncoder().encode('Hello, world!');

// SHA256 hashing
const hash256 = sha256(textData);
console.log('SHA256:', hash256);
