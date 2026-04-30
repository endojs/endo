// @ts-nocheck
/**
 * Schema-typed RPC end-to-end.
 *
 * Demonstrates the full path: a method registered with `methodCodecs`
 * routes its request and response through the schema runtime instead of
 * the default JSON-over-bytes payload codec. The two peers exchange
 * Cap'n Proto-typed structs on the wire, the layout matches what `capnpc`
 * would produce, and the user-visible API at the call site is unchanged.
 */
import test from '@endo/ses-ava/test.js';
import { makeExo } from '@endo/exo';
import {
  E,
  makeLoopback,
  loadSchema,
  makeInterfaceRegistry,
} from '../src/index.js';

const SERVICE_ID = 0xa1b2c3d4e5f60707n;

const SCHEMA_SRC = `
@0xfeedfacefeedface;

struct GreetReq @0xc0ffee0000000001 {
  name @0 :Text;
  loud @1 :Bool;
}

struct GreetResp @0xc0ffee0000000002 {
  greeting @0 :Text;
  charCount @1 :UInt32;
}

struct SumReq @0xc0ffee0000000010 {
  values @0 :List(Int32);
}

struct SumResp @0xc0ffee0000000011 {
  total @0 :Int64;
}
`;

test('schema-typed RPC: request and response flow through the schema runtime', async t => {
  const schema = loadSchema(SCHEMA_SRC);

  const greetCodec = {
    request: {
      // The wire protocol passes a single positional struct argument as
      // `args[0]`; we encode that as a GreetReq.
      encode: args => schema.encode('GreetReq', args[0]),
      decode: bytes => [schema.decode('GreetReq', bytes)],
    },
    response: {
      encode: value => schema.encode('GreetResp', value),
      decode: bytes => schema.decode('GreetResp', bytes),
    },
  };
  const sumCodec = {
    request: {
      encode: args => schema.encode('SumReq', args[0]),
      decode: bytes => [schema.decode('SumReq', bytes)],
    },
    response: {
      encode: value => schema.encode('SumResp', value),
      decode: bytes => schema.decode('SumResp', bytes),
    },
  };

  const service = makeExo('service', undefined, {
    greet(req) {
      const word = req.loud ? 'HELLO' : 'hello';
      const greeting = `${word}, ${req.name}!`;
      return { greeting, charCount: greeting.length };
    },
    sum(req) {
      let total = 0n;
      for (const v of req.values) total += BigInt(v);
      return { total };
    },
  });

  const { near, far, registerInterface } = makeLoopback({
    farBootstrap: service,
  });
  registerInterface({
    id: SERVICE_ID,
    methods: { greet: 0, sum: 1 },
    methodCodecs: { greet: greetCodec, sum: sumCodec },
  });

  const remote = near.getBootstrap();
  const greeting = await E(remote).greet({ name: 'world', loud: false });
  t.deepEqual(greeting, { greeting: 'hello, world!', charCount: 13 });

  const greetingLoud = await E(remote).greet({ name: 'world', loud: true });
  t.deepEqual(greetingLoud, { greeting: 'HELLO, world!', charCount: 13 });

  const sum = await E(remote).sum({ values: [1, 2, 3, 4, 5] });
  t.is(sum.total, 15n);

  // Sanity: the far peer is still alive (it answered all four calls above).
  t.truthy(far);
});

test('schema-typed RPC: anonymous union and capability field round-trip', async t => {
  const schema = loadSchema(`
@0xc0debabec0debabe;

interface Sink @0xfade0000ffff0001 {}

struct Op @0xfade0000ffff0010 {
  union {
    add @0 :UInt32;
    sub @1 :UInt32;
    reset @2 :Void;
  }
}

struct Job @0xfade0000ffff0011 {
  label @0 :Text;
  op @1 :Op;
  sink @2 :Sink;
}

struct JobResult @0xfade0000ffff0012 {
  acknowledged @0 :Bool;
}
`);

  const jobCodec = {
    request: {
      encode: (args, ctx) => schema.encodePayload('Job', args[0], ctx),
      decode: (bytes, capTable, ctx) => [
        schema.decodePayload('Job', { contentBytes: bytes, capTable }, ctx),
      ],
    },
    response: {
      encode: value => schema.encode('JobResult', value),
      decode: bytes => schema.decode('JobResult', bytes),
    },
  };

  /** Calls observed on the sink, recorded by the test sink Exo. */
  const observed = [];
  const sink = makeExo('sink', undefined, {
    notify(line) {
      observed.push(line);
    },
  });

  const service = makeExo('service', undefined, {
    async submit(job) {
      // Switch on the active union member.
      let line;
      if (job.op.which === 'add') line = `${job.label}: +${job.op.add}`;
      else if (job.op.which === 'sub') line = `${job.label}: -${job.op.sub}`;
      else if (job.op.which === 'reset') line = `${job.label}: reset`;
      else line = `${job.label}: ?`;
      await E(job.sink).notify(line);
      return { acknowledged: true };
    },
  });

  const { near, registerInterface } = makeLoopback({ farBootstrap: service });
  registerInterface({
    id: 0xa1b2c3d4e5f60808n,
    methods: { submit: 0, notify: 1 },
    methodCodecs: { submit: jobCodec },
  });
  const remote = near.getBootstrap();

  // Hoist each await to its own statement so the @jessie.js
  // no-nested-await rule sees a clean top-level await per call.
  const r1 = await E(remote).submit({
    label: 'a',
    op: { add: 5 },
    sink,
  });
  t.deepEqual(r1, { acknowledged: true });
  const r2 = await E(remote).submit({
    label: 'b',
    op: { sub: 3 },
    sink,
  });
  t.deepEqual(r2, { acknowledged: true });
  const r3 = await E(remote).submit({
    label: 'c',
    op: { reset: null },
    sink,
  });
  t.deepEqual(r3, { acknowledged: true });

  t.deepEqual(observed, ['a: +5', 'b: -3', 'c: reset']);
});

test('schema.registerInterface auto-derives methods + codecs from .capnp', async t => {
  const SCHEMA = `@0xfeed1111feed2222;
interface Greeter @0xa1a1a1a1a1a1a1a1 {
  greet @0 (name :Text, loud :Bool) -> (greeting :Text, charCount :UInt32);
  add @1 (lhs :Int32, rhs :Int32) -> (sum :Int32);
}`;
  const schema = loadSchema(SCHEMA);

  const greeter = makeExo('greeter', undefined, {
    greet({ name, loud }) {
      const word = loud ? 'HELLO' : 'hello';
      const greeting = `${word}, ${name}!`;
      return { greeting, charCount: greeting.length };
    },
    add({ lhs, rhs }) {
      return { sum: lhs + rhs };
    },
  });

  const registry = makeInterfaceRegistry();
  schema.registerInterface(registry, 'Greeter');
  const { near } = makeLoopback({
    farBootstrap: greeter,
    interfaceRegistry: registry,
  });
  const remote = near.getBootstrap();

  const quiet = await E(remote).greet({ name: 'world', loud: false });
  t.deepEqual(quiet, { greeting: 'hello, world!', charCount: 13 });

  const loud = await E(remote).greet({ name: 'world', loud: true });
  t.deepEqual(loud, { greeting: 'HELLO, world!', charCount: 13 });

  const sum = await E(remote).add({ lhs: 17, rhs: 25 });
  t.deepEqual(sum, { sum: 42 });
});

test('schema.registerInterface: capability-typed params survive auto-codec', async t => {
  const SCHEMA = `@0xfeed3333feed4444;
interface Sink @0xb0b0b0b0b0b00001 {}
interface Service @0xa1a1a1a1a1a1a1a2 {
  submit @0 (label :Text, sink :Sink) -> (acked :Bool);
}`;
  const schema = loadSchema(SCHEMA);

  const observed = [];
  const sinkExo = makeExo('sink', undefined, {
    notify(line) {
      observed.push(line);
    },
  });
  const svc = makeExo('svc', undefined, {
    async submit({ label, sink }) {
      await E(sink).notify(label);
      return { acked: true };
    },
  });

  const registry = makeInterfaceRegistry();
  schema.registerInterface(registry, 'Service');
  // Sink doesn't appear in the schema's `methods` slot of any param/result,
  // so its method ordinals must be registered separately. (A future
  // iteration could let users register Sink via schema too even though it
  // declares no methods of its own.)
  registry.register({
    id: 0xb0b0b0b0b0b00001n,
    methods: { notify: 0 },
  });

  const { near } = makeLoopback({
    farBootstrap: svc,
    interfaceRegistry: registry,
  });
  const remote = near.getBootstrap();
  const r = await E(remote).submit({ label: 'hi', sink: sinkExo });
  t.deepEqual(r, { acked: true });
  t.deepEqual(observed, ['hi']);
});
