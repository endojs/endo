# ... defineProperty silently failed ... (SES_DEFINE_PROPERTY_FAILED_SILENTLY)

According to the
[official specification](https://tc39.es/ecma262/#sec-object.defineproperty)
of `Object.defineProperty`, it either succeeds, returning its first argument,
or it fails, throwing a `TypeError`. However, this behavior turned out not
to be compatible with the web, so there is a proposal (need link) to carve
out a narrow exception for this one particular incompatibility.

## The Underlying Problem. Read only if interested.

The problem is that, after `defineProperty` reports that it has successfully
make a property non-configurable, little about it can still change. For example,
the property cannot later disappear. However, on the browser specifically,
the `window` object has a dual identity: The so-called "Window Proxy Object"
(which is not actually a proxy) and the "Global Window Object" (which is
not actually a global object).

Only the Window Proxy Object is accessible to
JavaScript code. The Global Window Object is a specification fiction used to
explain the browser's peculiar behavior. The "global" properties that are
aliased to a global scope are explained as "actually" being properties of
the Global Window Object. The Window Proxy Object forwards all internal
operations, including `[[DefineProperty]]`, to its *current* Global Window
Object. If that browser frame is navigated, for example by clicking a link
in that frame's document, the Window Proxy Object remains the same, but
forwards to a distinct Global Window Object associated with the post-navigation
realm and global scope. Code evaluated in the pre-navigation realm and global
scope continues to alias its global variable to the fictional properties
of the fictional old Global Window Object, which are no longer the properties
of any visible object.

The problem then arises only on the browser, and only when the first argument
to `Object.defineProperty` is a Window Proxy Objects. In this circumstance,
what is the following code supposed to do:

```js
Object.defineProperty(window, 'foo', { value: 8, configurable: false });
```

Note that `window` above is a browser Window Proxy Object.
If this call were to succeed, it would obligate the Window Proxy Object to carry
around this `foo` property forever, even after being navigated. *But that is
not what browsers do on navigation.* Since browsers are unwilling to
live up to the implied stability commitment, they must not make the implied
stability commitment in the first place. The clean solution would be for the
call above to fail by throwing a `TypeError`, which the official spec allows.
But Mozilla tried this and found that some library was broken by that throwing
behavior. But if instead the `defineProperty` call were to silently fail,
still not setting the property, then this particular library would still work.
This silent failure did not seem to bother anything else.

# The Carve Out

So the proposal is to allow `defineProperty` *only on a browser and only when
operating on a window object* to report failure by returning `false` rather
than throwing.

Needless to say, this silent failure is a security hazard, because it allows
code to proceed on paths assuming success even though the property in question
has not been set. To avoid this hazard, the SES `commons.js` module exports
a better behaved `defineProperty` function that wraps the original. It normally
acts *exactly* like `Object.defineProperty`. But when `Object.defineProperty`
reports failure by returning `false` (or indeed anything but its first
argument), then the exported `defineProperty` instead throws a `TypeError` such
as
```
TypeError: Please report that the original defineProperty silently failed to set "foo". (SES_DEFINE_PROPERTY_FAILED_SILENTLY)
```
