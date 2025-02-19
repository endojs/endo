import '@endo/init';
import { passStyleOf } from '@endo/pass-style';
import { test, benchmark } from '../src/benchmark.js';

async function runBenchmark() {
  await test('Benchmark', async t => {
    await benchmark(
      'Empty object',
      t,
      async () => {
        passStyleOf(harden({}));
      },
      10000,
    );
  });

  await test('Another Benchmark', async t => {
    await benchmark(
      'Alphabets object',
      t,
      async () => {
        passStyleOf(
          harden({
            a: 12,
            b: 13,
            c: 14,
            d: 15,
            e: 16,
            f: 17,
            g: 18,
            h: 19,
            i: 20,
            j: 21,
            k: 22,
            l: 23,
            m: 24,
            n: 25,
            o: 26,
            p: 27,
            q: 28,
            r: 29,
            s: 30,
            t: 31,
            u: 32,
            v: 33,
            w: 34,
            x: 35,
            y: 36,
            z: 37,
          }),
        );
      },
      100000,
    );
  });
}

runBenchmark();
