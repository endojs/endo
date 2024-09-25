/* global E registerClass */

const makeChatRoom = registerClass('ChatRoom', `${() => {
  const interfaceGuards = undefined;
  const initFn = () => harden({ messages: [], subscribers: [] });
  const callSubscribers = ({ subscribers, messages }) => {
    subscribers.forEach(subscriber => E.callOnly(subscriber).didUpdate(messages));
  };
  const methods = {
    addSubscriber (subscriber) {
      this.state.subscribers.push(subscriber);
    },
    addMessageUser (text) {
      this.state.messages = [...this.state.messages, { content: text, role: 'user' }];
      callSubscribers(this.state);
    },
    addMessageAgent (text) {
      this.state.messages = [...this.state.messages, { content: text, role: 'agent' }];
      callSubscribers(this.state);
    },
    getMessages () {
      return this.state.messages;
    },
  };
  return { interfaceGuards, initFn, methods };
}}`);

const chatRoom = makeChatRoom();
return chatRoom;