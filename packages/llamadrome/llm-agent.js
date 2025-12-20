import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { E } from '@endo/eventual-send';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

import { Ollama } from 'ollama';

const LlamadromeInterface = M.interface('Llamadrome', {
  help: M.call().returns(M.string()),
});

export const make = powers => {
  const ollama = new Ollama({
    ...(process.env.OLLAMA_HOST && {
      host: process.env.OLLAMA_HOST,
    }),
    headers: {
      ...(process.env.OLLAMA_API_KEY && {
        Authorization: 'Bearer ' + process.env.OLLAMA_API_KEY,
      }),
    },
  });

  const transcript = [
    {
      role: 'system',
      content: `\
I am a JavaScript interpreter and only recognize answers that
are valid JavaScript programs without any wrapper or envelope.
The completion value of a JavaScript program is the last expression evaluated.
The console is for debugging and the user will not see anything printed
to the console unless they attach a debugger.

The JavaScript programs that you propose can make use of the "powers" provided
in lexical scope.
The powers are an "eventual reference", meaning that it is a reference
to a remote object whose methods all produce promises for answers.
Transmissible values include number (floating point), bigint (integers), booleans,
strings (which must be strictly UTF-8 encoded and may not have unpaired surrogates),
Uint8Arrays, arrays of transmissible values, objects where the keys are all
strings and values are transmissible, promises, and further eventual
references.
We sometimes call eventual references capabilities, object capabilities, or ocaps.
All of the methods of an object capability have string names (also strict UTF-8).

To call a method of a capability (or: send a message), we use the E operator.
To call "foo" of "powers" we would say "E(powers).foo()" and that
would produce a promise for the response.
If the response is expected to be fulfilled with another reference,
we can immediately send a message to the response with "E(response).bar()".

By convention, a reference may implement "help", which is expected to
return a string describing the ways you can use the object.

If you were to call E(powers).help(), it would tell you that the powers
object has a method "concatByteArrays" that accepts two byte arrays
and produces a promise for the concatenated pair of byte arrays.

It would tell you that E(powers).request(description, petName) will ask the
user for the described value and capture it for future reference with the
option of the given "petname" (a name that is significant only to you).
`,
    },
  ];

  (async () => {
    const selfId = await E(powers).identify('SELF');
    await E(powers).send('HOST', ['Llamadrome ready for work.'], [], []);
    for await (const message of makeRefIterator(E(powers).followMessages())) {
      const {
        date,
        from: fromId,
        to: toId,
        strings,
        names,
        ids,
        dismissed,
        dismisser,
        number,
      } = message;

      if (fromId === selfId) {
        continue;
      }

      console.log({ message });

      transcript.push({
        role: 'user',
        content: strings
          .map((fragment, i) => {
            if (i < names.length) {
              return `${fragment} @${names[i]}`;
            } else {
              return fragment;
            }
          })
          .join(' '),
      });

      console.log(JSON.stringify({ transcript }));

      const response = await ollama.chat({
        model: 'qwen3',
        messages: transcript,
        // stream: false
      });

      console.log(JSON.stringify({ response }));

      const { choices, message } = response;
      if (message) {
        const { content, thinking } = message;
        await E(agent).send('HOST', [`thinking: ${thinking}`], [], []);
        await E(agent).send('HOST', [content], [], []);
      }
      for (const choice of choices) {
        const { content, thinking } = choice;
        await E(agent).send('HOST', [`thinking: ${thinking}`], [], []);
        await E(agent).send('HOST', [content], [], []);
      }
    }
  })();

  return makeExo('Llamadrome', LlamadromeInterface, {
    help() {
      return `\
`;
    },
  });
};
