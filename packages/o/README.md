# O Petname System

O is a JavaScript petname system for objects.  Unlike global name systems, O is always used from a client's scope, and associates names that are private and meaningful to the user.  Petnames are much like your phone's contact database, etc. etc.

```js
O
O[1] = res(['chain','Wallet'])
O.IST = O.chain.Agoric.IST
O[2] = res(['brand','issuer'])
O.IST().amount('4023.99')
O[3] = res({ value: 4_023_990_000n, brand: [Alleged: IST Brand {}] })
O.Wallet().withdraw(await O[3])
O[4] = res([Alleged: IST Payment {}])
console.log("Here's the IST:", await O.IST)
Here's the IST: ['brand', 'issuer']
O[5] = res(undefined)
```
