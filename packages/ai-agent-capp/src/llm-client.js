import { harden } from '@endo/harden';

const parseCompletion = (json) => {
  const choice = json.choices?.[0];
  if (!choice) {
    throw new Error('No choices in LLM response');
  }
  const { message = {} } = choice;
  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));
  return harden({
    content: message.content || '',
    toolCalls,
    finishReason: choice.finish_reason,
    usage: json.usage,
  });
};

const parseStreamChunk = (line) => {
  if (!line.startsWith('data: ')) {
    return null;
  }
  const data = line.slice(6).trim();
  if (data === '[DONE]') {
    return null;
  }
  const json = JSON.parse(data);
  const choice = json.choices?.[0];
  if (!choice) {
    return null;
  }
  const { delta = {} } = choice;
  const toolCallDeltas = (delta.tool_calls || []).map((tc) => ({
    index: tc.index,
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments || '',
  }));
  return harden({
    content: delta.content || '',
    toolCallDeltas,
    finishReason: choice.finish_reason,
  });
};

export const makeLLMClient = (endpointURL, apiCredential) => {
  const buildHeaders = () => {
    const headers = { 'Content-Type': 'application/json' };
    if (apiCredential) {
      headers.Authorization = `Bearer ${apiCredential}`;
    }
    return headers;
  };

  const buildBody = (messages, options = {}) => {
    const {
      model = 'gpt-3.5-turbo',
      temperature,
      maxTokens,
      tools,
      toolChoice,
      stream = false,
    } = options;
    const body = { model, messages, stream };
    if (temperature !== undefined) {
      body.temperature = temperature;
    }
    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens;
    }
    if (tools !== undefined) {
      body.tools = tools;
    }
    if (toolChoice !== undefined) {
      body.tool_choice = toolChoice;
    }
    return body;
  };

  const doRequest = async (messages, options) => {
    const response = await fetch(`${endpointURL}/chat/completions`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(buildBody(messages, options)),
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${errorBody}`);
    }
    return response;
  };

  const chat = async (messages, options = {}) => {
    const response = await doRequest(messages, options);
    const json = await response.json();
    return parseCompletion(json);
  };

  const chatStream = async (messages, options = {}) => {
    const response = await doRequest(messages, { ...options, stream: true });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    return harden({
      [Symbol.asyncIterator]() {
        return harden({
          async next() {
            while (true) {
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                  continue;
                }
                const chunk = parseStreamChunk(trimmed);
                if (chunk !== null) {
                  return { value: chunk, done: false };
                }
              }
              const { done, value } = await reader.read();
              if (done) {
                return { value: undefined, done: true };
              }
              buffer += decoder.decode(value, { stream: true });
            }
          },
        });
      },
    });
  };

  return harden({ chat, chatStream });
};
