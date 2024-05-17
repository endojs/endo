// @ts-check
import { makeExo } from '@endo/exo';
import { makePromiseKit } from '@endo/promise-kit';
import { E } from '@endo/eventual-send';
import { M } from '@endo/patterns';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
import { makeRefIterator } from '@endo/daemon/ref-reader.js';

/** @typedef {'rock' | 'paper' | 'scissors'} Choice */
const ChoiceShape = M.or('rock', 'paper', 'scissors');
/** @typedef {'draw' | 'attacker' | 'defender'} Winner */
const WinnerShape = M.or('draw', 'attacker', 'defender');
/** @typedef {{winner: Winner, why: string}} Result */
const ResultShape = harden({
  winner: WinnerShape,
  why: M.string(),
});

const GameInterface = M.interface('RockPaperScissorsGame', {
  defend: M.callWhen(ChoiceShape).returns(ResultShape),
  result: M.callWhen().returns(ResultShape),
});

const ServerInterface = M.interface('RoshamboServerInterface', {
  attack: M.call(ChoiceShape).returns(M.remotable('RockPaperScissorsGame')),
  subscribe: M.call().returns(M.remotable('RoshamboResultIterator')),
});

const draw = null;

/** @typedef { null | false | string } Verb */
/** @type {Record<Choice, Record<Choice, Verb>>} */
const defeats = {
  rock: { rock: draw, paper: false, scissors: 'crushes' },
  paper: { rock: 'covers', paper: draw, scissors: false },
  scissors: { rock: false, paper: 'cuts', scissors: draw },
};

/**
 * @param {Choice} attackerChoice
 * @param {Choice} defenderChoice
 * @returns {Result}
 */
export const score = (attackerChoice, defenderChoice) => {
  if (attackerChoice === defenderChoice)
    return {
      winner: 'draw',
      why: `${attackerChoice} on ${defenderChoice} is a draw`,
    };
  const attackVerb = defeats[attackerChoice][defenderChoice];
  const brev = defeats[defenderChoice][attackerChoice];
  return harden(
    typeof attackVerb === 'string'
      ? {
          winner: 'attacker',
          why: `${attackerChoice} ${attackVerb} ${defenderChoice}`,
        }
      : {
          winner: 'defender',
          why: `${defenderChoice} ${brev} ${attackerChoice}`,
        },
  );
};

export const make = () => {
  const gamesTopic = makeChangeTopic();
  return makeExo('RoshamboServer', ServerInterface, {
    /** @param {Choice} attackerChoice */
    attack: attackerChoice => {
      /** @type {import('@endo/promise-kit').PromiseKit<Result>} */
      const { promise: resultPromise, resolve: resolveResult } =
        makePromiseKit();
      gamesTopic.publisher.next(resultPromise);
      return makeExo('RoshamboGame', GameInterface, {
        /** @param {Choice} defenderChoice */
        defend: defenderChoice => {
          // The first call to defend wins the race to resolve the result.
          resolveResult(score(attackerChoice, defenderChoice));
          // And every subsequent call observes the same result.
          return resultPromise;
        },
        result: () => resultPromise,
      });
    },
    subscribe: () => makeIteratorRef(gamesTopic.subscribe()),
  });
};
