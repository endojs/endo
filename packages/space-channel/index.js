// @ts-check

// The multiuser channel space family: the four channel-view bodies plus the
// shared channel/react/edit substrate they compose. Each body is a host entry
// (it applies `renderConfined` internally over the shared `#messages` DOM); the
// substrate (`channel-utils`) is also re-exported for the shell's share modal
// and channel header.

export { channelComponent } from './src/channel-component.js';
export { forumComponent } from './src/forum-component.js';
export { microblogComponent } from './src/microblog-component.js';
export { outlinerComponent } from './src/outliner-component.js';
export { createChannelState, createMessageMenu } from './src/channel-utils.js';
