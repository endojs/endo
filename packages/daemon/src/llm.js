import { E, Far } from '@endo/far';


export const make = (powers) => {
  let apiKey = null
  return Far('ChatGPT', {
    _getInterface () {
      return [
        ['askAi', ['string']],
      ]
    },
    async askAi (query) {
      console.log('asking', query, apiKey)
      const response = await queryAi(powers, apiKey, query)
      return response
    },
    async setApiKey (_apiKey) {
      console.log('setting apiKey', _apiKey)
      apiKey = _apiKey
    },
  });

}

async function queryAi (powers, openAiKey, query) {
  console.log('Calling GPT3')
  const url = 'https://api.openai.com/v1/completions';
  const json = await E(powers).fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      'model': 'text-davinci-003',
      'prompt': query,
      // 'max_tokens': 5,
      // 'temperature': 1,
      // 'top_p': 1,
      // 'n': 1,
      // 'stream': false,
      // 'logprobs': null,
      // 'stop': '\n'
    }),
  });
  // const json = await res.json();
  const { choices } = json;
  const [choice] = choices;
  const { text } = choice;
  return text;
}