import { lockdown } from 'ses';

lockdown({
  // noTameError: true, // enable if needed, for better debugging
  noTameMath: true, // bundle-source -> rollup uses Math.random
});

process.on('unhandledRejection', (error, _p) => {
  console.log('unhandled rejection, boo');
  console.log('error is', error.toString());
  return true;
});
