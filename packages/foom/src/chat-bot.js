/* global firstTime, defineJsClass, E */

defineJsClass(
  class ChatBot {
    init({
      apiKey = null,
      history = [],
      model = 'gpt-4o',
      systemPrompt = '',
      responseFormat,
    } = {}) {
      return harden({
        apiKey,
        history,
        model,
        systemPrompt,
        tools: {},
        responseFormat,
      });
    }
    setApiKey(key) {
      this.state.apiKey = key;
    }
    setSystemPrompt(prompt) {
      this.state.systemPrompt = prompt;
    }
    setResponseFormat(format) {
      this.state.responseFormat = format;
    }
    async addTool(toolName, tool) {
      this.state.tools = harden({ ...this.state.tools, [toolName]: tool });
    }
    removeTool(toolName) {
      delete this.state.tools[toolName];
    }
    getHistory() {
      return this.state.history;
    }
    clearHistory() {
      this.state.history = harden([]);
    }
    async sendMessage(messageContent) {
      await this.self.submitMessage({ role: 'user', content: messageContent });
      const lastMessage = this.state.history[this.state.history.length - 1];
      return lastMessage.content;
    }
    async callTool(toolCall) {
      const {
        id: toolCallId,
        function: { name: toolName, arguments: toolArgsString },
      } = toolCall;
      const tool = this.state.tools[toolName];
      const compartment = new Compartment();
      const args = compartment.evaluate(`(${toolArgsString})`);
      console.log(`Calling tool ${toolName} with args:`, args);
      const resultString = await E(tool).activate(args);
      await this.self.submitMessage({
        role: 'tool',
        content: resultString,
        name: toolName,
        tool_call_id: toolCallId,
      });
    }
    async submitMessage(message) {
      // if (!this.state.apiKey) {
      //   throw new Error(
      //     'API key is not set. Use setApiKey() to provide your OpenAI API key.',
      //   );
      // }

      // Add user's message to the conversation history
      this.state.history = harden([...this.state.history, message]);
      const promptHistory = [
        { role: 'system', content: this.state.systemPrompt },
        ...this.state.history,
      ];

      const toolsPayload = [];
      await Promise.all(
        Object.entries(this.state.tools).map(async ([toolName, tool]) => {
          const toolData = await E(tool).getConfig();
          const toolDescription = {
            type: 'function',
            // strict: true,
            function: {
              name: toolName,
              description: toolData.description,
              parameters: {
                type: 'object',
                properties: toolData.arguments,
              },
              required: toolData.requiredArguments,
              additionalProperties: toolData.additionalProperties,
              $schema: 'http://json-schema.org/draft-07/schema',
            },
          };
          toolsPayload.push(toolDescription);
        }),
      );

      // Prepare the API request payload
      const payload = {
        model: this.state.model,
        messages: promptHistory,
        tools: toolsPayload.length > 0 ? toolsPayload : undefined,
        response_format: this.state.responseFormat,
      };

      // Make the API request to OpenAI
      const response = await fetch(
        // 'https://api.openai.com/v1/chat/completions',
        'http://127.0.0.1:1234/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // Authorization: `Bearer ${this.state.apiKey}`,
          },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        // console.dir({ response }, { depth: null });
        const body = await response.text();
        console.error(body);
        throw new Error(`API request failed with status ${response.status}`);
      }

      const data = await response.json();
      // console.dir({ choices: data.choices }, { depth: null })

      // Get assistant's reply and add it to the conversation history
      for (const choice of data.choices) {
        const messageEntry = {
          role: choice.message.role,
          // content: choice.message.content,
        };
        if (choice.message.content) {
          messageEntry.content = choice.message.content;
        }
        if (choice.message.tool_calls) {
          messageEntry.tool_calls = choice.message.tool_calls;
        }
        this.state.history = harden([...this.state.history, messageEntry]);
        // call tools
        if (messageEntry.tool_calls) {
          await Promise.all(
            messageEntry.tool_calls.map(toolCall =>
              this.self.callTool(toolCall),
            ),
          );
        }
      }
    }
  },
);
