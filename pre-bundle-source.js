// pre-bundle-source.js - initialization to use @agoric/bundle-source
import '@agoric/lockdown';

// TODO Remove babel-standalone preinitialization
// https://github.com/endojs/endo/issues/768
import '@agoric/babel-standalone';

export * from '@agoric/lockdown';
