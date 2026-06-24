// @ts-check

// The multiuser channel space family: the four channel-view bodies plus the
// shared channel/react/edit substrate they compose. Each body is a host entry
// (it applies `renderConfined` internally over the shared `#messages` DOM); the
// substrate (`channel-utils`) is also re-exported for the shell's share modal
// and channel header.

export { channelComponent } from './src/channel-component.js';
export { forumComponent } from './src/forum-component.js';
export { microblogComponent } from './src/microblog-component.js';
export { createChannelState, createMessageMenu } from './src/channel-utils.js';

// The channel header bar (members / invite / attenuator overlays + the heat-map
// canvas viz, `heat-simulation.js`) — a channel-specific view that moved out of
// the host shell into the channel package.
export { createChannelHeader } from './src/channel-header.js';

// Phase-0 outliner-confinement spike: the confined structure root and the
// host-side editable-line island. Pure structure (`OutlinerRoot`) is the
// confined half; `makeEditableLine` is host code the controller re-parents into
// the tree's anchor slots.
export { OutlinerRoot } from './src/outliner/outliner-root.js';
export { makeEditableLine } from './src/outliner/editable-line.js';
