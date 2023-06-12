import './pre-unsafe-fast.js';

for (let i = 0; i < 10_000_000_000; i += 1) {
  if (i % 100_000_000 === 0) {
    console.log('iG', i / 1_000_000_000);
  }
  const x = {};
  Promise.resolve(x);
}
