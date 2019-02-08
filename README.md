# Nat

At a basic level, `Nat` ensures that a number is within the natural, safe integers (0, 1, 2... to 2 \*\* 53 - 1). If not, `Nat` throws a RangeError.

You can think of `Nat()` as a type enforcement.

## How to use

`Nat()` can be used to enforce desired properties on account balances.

For instance, in a deposit scenario, you would want to validate the amount to be deposited before proceeding:

```
deposit: function(amount) {
  amount = Nat(amount);
  ...
}
```

We also want to use `Nat()` before using values internally:

```
Nat(ledger.get(purse));
```

Any expressions dealing with monetary amounts should protected with `Nat()`:

```
Nat(myOldBal + amount);
const srcNewBal = Nat(srcOldBal - amount);
```

## Non-monetary usage

Deadlines or block numbers should be wrapped with `Nat()` before using:

```
deadline = Nat(deadline);
```

Indexes can be wrapped with `Nat()`:

```
const index = Nat(data.index);
```

Nat can be used even if cases where it is not strictly necessary, for extra protection against human error.

## Bounds

By excluding 2^53, we have the nice invariant that if

`Nat(a)`,  
`Nat(b)`,  
`Nat(a+b)`,

are all true, then `(a+b)` is an accurate sum of a and b.

## History

Nat comes from the Google Caja project, which tested whether a number was a primitive integer within the range of continguously representable non-negative integers.

For more, see the [discussion at TC39](https://github.com/rwaldron/tc39-notes/blob/master/es6/2013-07/july-25.md#59-semantics-and-bounds-of-numberisinteger-and-numbermax_integer)
