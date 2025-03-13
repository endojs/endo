const getTime = () => Date.now() * 1_000_000;

async function benchmark(name, t, fn, expedtedTime, iterations = 10000) {
  await null;
  const start = getTime();
  for (let i = 0; i < iterations; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await fn();
  }
  const end = getTime();
  const avgTime = (end - start) / iterations;

  console.log(`${name} | Average time: ${avgTime}ns`);
  t.assert(
    avgTime < Number(expedtedTime),
    `Expected ${avgTime} to be less than ${expedtedTime}`,
  );
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw Error(message);
}

function truthy(value, message = 'Expected a truthy value') {
  if (!value) throw Error(message);
}

async function test(name, fn) {
  await null;
  try {
    console.log('Running test: ', name);
    await fn({ assert, truthy });
    console.log(`✅ Passed`);
  } catch (err) {
    console.log(`❌ Failed: ${err.message}`);
  }
}

export { benchmark, test };
