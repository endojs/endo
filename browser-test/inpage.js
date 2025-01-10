console.log('start');
lockdown();
console.log('[pass]: lockdown');
(new Compartment()).evaluate('1+1');
console.log('[pass]: compartment');