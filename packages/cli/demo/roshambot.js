// @ts-check
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { E } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

export const make = async powers => {
  const server = await E(powers).request(
    'HOST',
    'A roshambo server',
    'roshambo',
  );

  E(powers).send('HOST', ['Roshambot online!'], [], []).catch(console.error);

  const games = new Map();

  (async () => {
    for await (const message of makeRefIterator(E(powers).followMessages())) {
      console.log(message);
      const { number, type } = message;
      E(powers).dismiss(number);

      if (type === 'package') {
        const { strings, ids, from: subjectId } = message;
        const text = strings.join(' ');
        const match = /\b(rock|paper|scissors)\b/.exec(text);
        if (match !== null) {
          const [_, verb] = match;
          if (ids.length !== 1) {
            continue;
          }
          const [objectId] = ids;
          const gameKey = [subjectId, objectId].sort().join(';');
          console.log('game', gameKey, verb);
          let game = games.get(gameKey);
          if (game === undefined) {
            game = E(server).attack(verb);
            games.set(gameKey, game);
            await E(powers).write(['attacker'], subjectId);
            await E(powers).write(['defender'], objectId);
            await E(powers)
              .send(
                'attacker',
                ['You attack ', ` with ${verb}.`],
                ['defender'],
                ['defender'],
              )
              .catch(console.error);
            await E(powers)
              .send(
                'defender',
                ['', ` attacks with ${verb}.`],
                ['attacker'],
                ['attacker'],
              )
              .catch(console.error);
          } else {
            const result = await E(server).defend(verb);
            games.delete(gameKey);
            await E(powers).write(['defender'], subjectId);
            await E(powers).write(['attacker'], objectId);
            await E(powers)
              .send(
                'defender',
                ['You defend against ', ` with ${verb}.`],
                ['attacker'],
                ['attacker'],
              )
              .catch(console.error);
            await E(powers)
              .send(
                'attacker',
                ['', ` defends with ${verb}.`],
                ['defender'],
                ['defender'],
              )
              .catch(console.error);
          }
        }
      }
    }
  })().catch(console.error);
};
