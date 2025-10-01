# Rosetta Guide: Endo Patterns, Zod, and TypeScript

This guide collects idiomatic translations between [`@endo/patterns`](../..), [Zod](https://github.com/colinhacks/zod), and TypeScript type declarations. It is designed for humans and LLMs that need to understand how a data contract expressed in one system maps onto the others, what fidelity gaps exist, and which work-arounds are recommended.

The bundle is organised as follows:

- [`patterns-to-zod.md`](./patterns-to-zod.md) — start with an Endo Pattern and look up the closest Zod schema.
- [`zod-to-patterns.md`](./zod-to-patterns.md) — start with Zod and find the Endo Pattern (or guard) that delivers comparable runtime guarantees.
- [`patterns-to-typescript.md`](./patterns-to-typescript.md) — understand which static TypeScript declarations correspond to a given Pattern.
- [`typescript-to-patterns.md`](./typescript-to-patterns.md) — start from a TypeScript type and locate the appropriate Endo Pattern or guard.
- [`gaps-and-workarounds.md`](./gaps-and-workarounds.md) — catalogue of features that do not translate cleanly together with practical mitigations.
- [`examples/`](./examples) — executable snippets that the tests exercise to make sure the documentation stays in sync.

The examples demonstrate both successful and unsuccessful conversions. The tests in [`../../test/rosetta/examples.test.js`](../../test/rosetta/examples.test.js) exercise these snippets. They prove the conversions that work today and highlight the known mismatches when a translation is not possible.

> **Note:** Zod is an optional development dependency. Install it within this repository (`yarn workspace @endo/patterns add --dev zod`) before running the Rosetta tests locally.
